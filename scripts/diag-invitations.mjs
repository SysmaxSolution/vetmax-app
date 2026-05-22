// Diagnóstico do fluxo de convite — confirma estado real no banco.
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
config({ path: new URL('../.env.local', import.meta.url).pathname.replace(/^\//, '') })

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(SUPA_URL, SVC, { auth: { persistSession: false } })

const EMAILS = ['enzo.bartolo@outlook.com', 'levipmarques@gmail.com', 'laismarques.mv@gmail.com']

console.log('=== auth.users ===')
const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 200 })
for (const e of EMAILS) {
  const u = users.find(u => u.email?.toLowerCase() === e.toLowerCase())
  if (u) {
    console.log(`  ${e}: id=${u.id} confirmed_at=${u.email_confirmed_at ?? 'NULL'} created_at=${u.created_at} last_sign_in=${u.last_sign_in_at ?? 'NULL'}`)
  } else {
    console.log(`  ${e}: NÃO EXISTE em auth.users`)
  }
}

console.log('\n=== profiles ===')
for (const e of EMAILS) {
  const u = users.find(u => u.email?.toLowerCase() === e.toLowerCase())
  if (!u) continue
  const { data: p } = await admin.from('profiles').select('id, clinic_id, full_name, role').eq('id', u.id).maybeSingle()
  console.log(`  ${e}: ${p ? JSON.stringify(p) : 'SEM PROFILE'}`)
}

console.log('\n=== invitations (todas para esses emails) ===')
for (const e of [EMAILS[0], EMAILS[1]]) {
  const { data: invs } = await admin.from('invitations')
    .select('id, clinic_id, email, role, token, accepted_at, expires_at, created_at, invited_by')
    .eq('email', e)
    .order('created_at', { ascending: false })
  console.log(`\n  Convites para ${e}:`)
  if (!invs?.length) console.log('    (nenhum)')
  for (const i of invs ?? []) {
    const expired = new Date(i.expires_at) < new Date()
    console.log(`    - id=${i.id.slice(0,8)} clinic=${i.clinic_id.slice(0,8)} role=${i.role}`)
    console.log(`      token=${i.token}`)
    console.log(`      created=${i.created_at}`)
    console.log(`      expires=${i.expires_at} ${expired ? '[EXPIRADO]' : '[VIGENTE]'}`)
    console.log(`      accepted_at=${i.accepted_at ?? 'NULL'}`)
  }
}

console.log('\n=== clinic AlmaVet ===')
const { data: clinic } = await admin.from('clinics').select('id, name, user_limit').ilike('name', '%alma%').maybeSingle()
console.log(`  ${JSON.stringify(clinic)}`)

if (clinic) {
  const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('clinic_id', clinic.id)
  console.log(`  Usuários ativos: ${count}/${clinic.user_limit ?? '?'}`)
}
