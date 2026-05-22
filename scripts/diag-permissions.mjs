// Diagnóstico de permissões — confirma estado real de active_modules da clínica
// e user_module_permissions de um usuário específico.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(__dirname, '..', '.env.local') })

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(SUPA_URL, SVC, { auth: { persistSession: false } })

const EMAIL = 'levipmarques@gmail.com'

const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 500 })
const u = users.find(x => x.email?.toLowerCase() === EMAIL.toLowerCase())
if (!u) { console.log('user not found'); process.exit(0) }

const { data: profile } = await admin.from('profiles')
  .select('id, clinic_id, full_name, role')
  .eq('id', u.id).single()

console.log('PROFILE:', profile)

const { data: clinic } = await admin.from('clinics')
  .select('id, name, active_modules')
  .eq('id', profile.clinic_id).single()

console.log('\nCLINIC active_modules:', clinic.active_modules)

const { data: perms } = await admin.from('user_module_access')
  .select('module_name, enabled')
  .eq('user_id', u.id)
  .eq('clinic_id', profile.clinic_id)
  .order('module_name')

console.log('\nUSER MODULE ACCESS (user_module_access table):')
if (!perms || perms.length === 0) {
  console.log('  (NENHUMA — usuário herda todos os active_modules)')
} else {
  for (const p of perms) {
    console.log(`  ${p.module_name}: ${p.enabled ? 'ALLOWED' : 'DENIED'}`)
  }
}

// Simula o cálculo que o dashboard/layout.tsx faz
const userDisabled = new Set((perms ?? []).filter(p => p.enabled === false).map(p => p.module_name))
const computedActive = (clinic.active_modules ?? []).filter(m => !userDisabled.has(m))

console.log('\nCOMPUTED activeModules para esse usuário:', computedActive)
