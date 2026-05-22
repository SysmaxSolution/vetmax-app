// Backfill: para cada usuário não-admin/não-sysmax sem row em user_module_access
// para um módulo ATIVO da clínica, insere com enabled=true. Mantém comportamento
// atual (acesso permitido) ao mesmo tempo em que migramos para default restritivo.
//
// Rodado uma única vez antes de virar a regra de default restritivo no código.

import { config } from 'dotenv'
import pg from 'pg'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
config({ path: path.join(__dirname, '..', '.env.local') })

const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

// Antes
const before = await client.query('SELECT COUNT(*)::int AS n FROM user_module_access')
console.log(`Rows ANTES do backfill: ${before.rows[0].n}`)

const sql = `
INSERT INTO public.user_module_access (clinic_id, user_id, module_name, enabled)
SELECT p.clinic_id, p.id, m.module_name, true
FROM public.profiles p
JOIN public.clinics c ON c.id = p.clinic_id
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(c.active_modules, '[]'::jsonb)) AS m(module_name)
WHERE p.role <> 'admin'
  AND COALESCE(p.is_sysmax, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM public.user_module_access uma
    WHERE uma.user_id = p.id
      AND uma.clinic_id = p.clinic_id
      AND uma.module_name = m.module_name
  )
ON CONFLICT (clinic_id, user_id, module_name) DO NOTHING
RETURNING user_id, module_name
`
const r = await client.query(sql)
console.log(`Rows inseridas: ${r.rowCount}`)

const after = await client.query('SELECT COUNT(*)::int AS n FROM user_module_access')
console.log(`Rows DEPOIS: ${after.rows[0].n}`)

await client.end()
