import { config } from 'dotenv'
import pg from 'pg'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(__dirname, '..', '.env.local') })

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

console.log('=== RLS enabled? ===')
const rls = await client.query(`
  SELECT relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
  FROM pg_class WHERE relname = 'user_module_access'
`)
console.log(rls.rows[0])

console.log('\n=== Policies on user_module_access ===')
const policies = await client.query(`
  SELECT policyname, cmd, permissive, qual, with_check
  FROM pg_policies WHERE schemaname='public' AND tablename='user_module_access'
`)
for (const p of policies.rows) {
  console.log(`  [${p.cmd}] ${p.policyname}`)
  console.log(`    USING: ${p.qual}`)
  if (p.with_check) console.log(`    WITH CHECK: ${p.with_check}`)
}

// Simula o que o proxy faz: lê a row do Levi com a sessão do Levi
// (usando role anônima + JWT do Levi). Não temos JWT do Levi, mas
// podemos simular setting JWT claims via SET LOCAL request.jwt.claims
const LEVI = 'fea86663-aeaa-44c4-8bd1-34bcaffe2478'
console.log('\n=== Simulando leitura como user Levi (RLS aplicado) ===')
await client.query("BEGIN")
await client.query("SET LOCAL role authenticated")
await client.query(`SET LOCAL "request.jwt.claims" TO '{"sub":"${LEVI}","role":"authenticated"}'`)
const r = await client.query(`
  SELECT module_name, enabled FROM user_module_access
  WHERE user_id = $1 AND module_name = 'consultation'
`, [LEVI])
console.log(`  Rows visíveis: ${r.rows.length}`, r.rows[0] ?? '(nenhuma)')
await client.query("ROLLBACK")

await client.end()
