import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(__dirname, '..', '.env.local') })

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

console.log('=== user_module_access (todas rows) ===')
const a = await admin.from('user_module_access').select('*').limit(20)
console.log('  count:', a.data?.length ?? 0, 'error:', a.error?.message ?? 'none')
if (a.data?.length) for (const r of a.data) console.log('  ', r)

console.log('\n=== user_module_permissions (todas rows) ===')
const p = await admin.from('user_module_permissions').select('*').limit(20)
console.log('  count:', p.data?.length ?? 0, 'error:', p.error?.message ?? 'none')
if (p.data?.length) for (const r of p.data) console.log('  ', r)

// Buscar especificamente do Levi
const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 500 })
const levi = users.find(u => u.email?.toLowerCase() === 'levipmarques@gmail.com')
console.log('\n=== Levi rows em ambas as tabelas ===')
console.log('  user_module_access:',
  (await admin.from('user_module_access').select('*').eq('user_id', levi.id)).data)
console.log('  user_module_permissions:',
  (await admin.from('user_module_permissions').select('*').eq('user_id', levi.id)).data)
