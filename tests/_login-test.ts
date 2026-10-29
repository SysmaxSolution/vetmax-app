import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supa = createClient(url, anon)
  const { data, error } = await supa.auth.signInWithPassword({ email: 'admin@clinica-alfa.test', password: 'TestPassword@123' })
  if (error) console.log('ERRO login:', error.status, JSON.stringify(error.message))
  else console.log('LOGIN OK, session?', !!data.session)
}
main().then(() => process.exit(0)).catch(e => { console.error(e?.message || e); process.exit(1) })
