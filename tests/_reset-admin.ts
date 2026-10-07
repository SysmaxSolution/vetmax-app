import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const { createAdminClient } = await import('./helpers/supabase-test-client')
  const admin = createAdminClient()
  const email = 'admin@clinica-alfa.test'
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 })
  const u = (list?.users ?? []).find(x => x.email === email)
  if (!u) { console.log('usuário não encontrado'); process.exit(1) }
  const { error } = await admin.auth.admin.updateUserById(u.id, { password: 'TestPassword@123', email_confirm: true })
  console.log('reset senha:', error?.message || 'OK', '| id:', u.id)
}
main().then(() => process.exit(0)).catch(e => { console.error(e?.message || e); process.exit(1) })
