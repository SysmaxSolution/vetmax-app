// BACKUP LOCAL (somente leitura) das clínicas a remover, em JSONL por tabela.
// Nenhuma escrita no banco. Uso: node _prod-export.mjs
import { createRequire } from 'module'
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
const require = createRequire('C:/SysMax/package.json')
const dotenv = require('dotenv'); dotenv.config({ path: 'C:/SysMax/.env.local' })
const { createClient } = require('@supabase/supabase-js')
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
const db = createClient(url, key, { auth: { persistSession: false } })

const OUT = 'C:/SysMax/backup-prod-offboard'
mkdirSync(OUT, { recursive: true })

// clínicas a remover = todas menos as 3 Animais
const { data: clinics } = await db.from('clinics').select('id, name')
const keepRe = /^animais/i
const dropIds = clinics.filter(c => !keepRe.test(c.name.trim())).map(c => c.id)
writeFileSync(`${OUT}/_clinics_removidas.json`, JSON.stringify(clinics.filter(c => !keepRe.test(c.name.trim())), null, 2))
console.log('clínicas a remover:', dropIds.length)

// lista de tabelas com clinic_id (via OpenAPI)
const spec = await (await fetch(url + '/rest/v1/', { headers: { apikey: key, Authorization: 'Bearer ' + key } })).json()
const defs = spec.definitions || spec.components?.schemas || {}
let tables = Object.keys(defs).filter(t => Object.keys(defs[t].properties || {}).includes('clinic_id'))
tables = tables.filter(t => !t.startsWith('v_') && !t.startsWith('_bkp')) // pula views/backups

let grand = 0, done = 0
for (const t of tables) {
  const file = `${OUT}/${t}.jsonl`
  let from = 0, total = 0
  writeFileSync(file, '')
  while (true) {
    const { data, error } = await db.from(t).select('*').in('clinic_id', dropIds).range(from, from + 999)
    if (error) { console.log(`  ! ${t}: ${error.message.slice(0,40)}`); break }
    if (!data || data.length === 0) break
    appendFileSync(file, data.map(r => JSON.stringify(r)).join('\n') + '\n')
    total += data.length
    if (data.length < 1000) break
    from += 1000
  }
  grand += total; done++
  if (total > 0) console.log(`  ✓ ${t}: ${total}`)
}
console.log(`\nBACKUP OK — ${done} tabelas, ${grand} linhas em ${OUT}`)
