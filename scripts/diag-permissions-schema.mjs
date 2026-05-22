import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(__dirname, '..', '.env.local') })

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Tenta listar primeiro row de cada tabela relacionada
for (const t of ['user_permissions_granular', 'user_module_access', 'user_module_permissions']) {
  const { data, error } = await admin.from(t).select('*').limit(1)
  if (error) console.log(`${t}: ERROR (${error.code}) ${error.message}`)
  else console.log(`${t}: ${data?.length ?? 0} sample row(s)`, data?.[0] ?? '')
}

// Pega schema via information_schema
const { data: cols } = await admin.rpc('exec_sql', { sql: `
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name IN ('user_permissions_granular','user_module_access','user_module_permissions')
  ORDER BY table_name, ordinal_position
` }).catch(() => ({ data: null }))
if (cols) {
  console.log('\nSCHEMAS:')
  for (const c of cols) console.log(`  ${c.table_name}.${c.column_name}: ${c.data_type}`)
}
