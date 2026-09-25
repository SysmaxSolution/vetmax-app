// Limpa Storage: apaga arquivos das 15 clínicas removidas (por clinic_id no path).
// TRAVA: nunca toca nas 3 Animais. DRY-RUN por padrão; STORAGE_EXECUTE=1 apaga.
import { createRequire } from 'module'
import { readFileSync } from 'node:fs'
const require = createRequire('C:/SysMax/package.json')
const dotenv = require('dotenv'); dotenv.config({ path: 'C:/SysMax/.env.local' })
const { createClient } = require('@supabase/supabase-js')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const KEEP = new Set([
  '3c6d06ad-17ce-4811-a7df-6092bd3fb8c6',
  '2b7a90c3-fb5a-40d3-bc1a-e3f78e0756f4',
  '7be4d7bb-0f70-453c-bf4f-fe37bf24a9fb',
])
const removed = JSON.parse(readFileSync('C:/SysMax/backup-prod-offboard/_clinics_removidas.json', 'utf8'))
const REMOVED = new Set(removed.map(c => c.id))
for (const k of KEEP) if (REMOVED.has(k)) { console.error('!! id Animais na lista de remoção — abortando'); process.exit(2) }
console.log('clinic_ids a limpar no Storage:', REMOVED.size)
const EXECUTE = process.env.STORAGE_EXECUTE === '1'

async function listAll(bucket, prefix) {
  // retorna todos os caminhos de ARQUIVO sob prefix (recursivo)
  const files = []
  let offset = 0
  while (true) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) { console.log(`  ! list ${bucket}/${prefix}: ${error.message.slice(0,40)}`); break }
    if (!data || data.length === 0) break
    for (const it of data) {
      const p = prefix ? `${prefix}/${it.name}` : it.name
      if (it.id) files.push(p)            // arquivo
      else files.push(...await listAll(bucket, p)) // pasta -> recursao
    }
    if (data.length < 1000) break
    offset += 1000
  }
  return files
}

const { data: buckets } = await db.storage.listBuckets()
let grandFiles = 0
for (const b of buckets) {
  const { data: top } = await db.storage.from(b.name).list('', { limit: 1000 })
  if (!top) continue
  // primeiro segmento (pasta) OU prefixo do nome do arquivo = clinic_id
  const targets = top.filter(it => {
    const seg = it.name
    // pasta cujo nome é um clinic_id removido, OU arquivo cujo nome começa com clinic_id removido
    if (!it.id && REMOVED.has(seg)) return true
    if (it.id) { const pref = seg.split(/[._-]/)[0]; return REMOVED.has(seg.slice(0,36)) || REMOVED.has(pref) }
    return false
  })
  let bucketFiles = []
  for (const t of targets) {
    if (t.id) bucketFiles.push(t.name)               // arquivo top-level
    else bucketFiles.push(...await listAll(b.name, t.name)) // pasta clinic_id
  }
  if (bucketFiles.length) {
    console.log(`  • ${b.name}: ${bucketFiles.length} arquivos de clínicas removidas`)
    grandFiles += bucketFiles.length
    if (EXECUTE) {
      for (let i = 0; i < bucketFiles.length; i += 500) {
        const { error } = await db.storage.from(b.name).remove(bucketFiles.slice(i, i + 500))
        if (error) console.log(`    ! remove: ${error.message.slice(0,40)}`)
      }
      console.log(`    -> apagados`)
    }
  }
}
console.log(`\n${EXECUTE ? 'APAGADOS' : 'DRY-RUN — a apagar'}: ${grandFiles} arquivos órfãos`)
