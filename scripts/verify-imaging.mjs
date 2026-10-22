// Verificação E2E do fluxo de imagem (nível DB+Storage+URL pública).
// Uso: node scripts/verify-imaging.mjs https://<deploy-url>
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })

const BASE = process.argv[2]
if (!BASE) { console.error('Informe a URL base do deploy.'); process.exit(1) }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(url, key, { auth: { persistSession: false } })

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

// 1) clínica + paciente
const { data: pat } = await admin.from('patients').select('id, name, clinic_id').is('deleted_at', null).limit(1).single()
if (!pat) { console.error('Nenhum paciente no dev.'); process.exit(1) }
console.log('Paciente:', pat.name, '| clinic:', pat.clinic_id)

// 2) estudo
const { data: study, error: sErr } = await admin.from('imaging_studies').insert({
  clinic_id: pat.clinic_id, patient_id: pat.id, modality: 'radiografia',
  title: '[VERIFY] Tórax teste', referring_vet_name: 'Dr. Teste Solicitante',
  referring_vet_email: 'verify@example.com', referring_vet_crmv: 'SP-00000',
}).select('id').single()
if (sErr) { console.error('Erro criar estudo:', sErr.message); process.exit(1) }
console.log('Estudo:', study.id)

// 3) upload imagem
const path = `${pat.clinic_id}/${study.id}/${Date.now()}_verify.png`
const up = await admin.storage.from('imaging-files').upload(path, PNG, { contentType: 'image/png', upsert: false })
if (up.error) { console.error('Erro upload:', up.error.message); process.exit(1) }
await admin.from('imaging_files').insert({ clinic_id: pat.clinic_id, study_id: study.id, storage_path: path, file_name: 'verify.png', content_type: 'image/png', kind: 'image', size_bytes: PNG.length })
await admin.from('imaging_studies').update({ status: 'images_ready', images_uploaded_at: new Date().toISOString() }).eq('id', study.id)
console.log('Imagem enviada + status images_ready')

// 4) share link
const token = 'img_' + randomBytes(24).toString('hex')
await admin.from('imaging_share_links').insert({ clinic_id: pat.clinic_id, study_id: study.id, token, audience: 'referring_vet', recipient_email: 'verify@example.com', expires_at: new Date(Date.now()+30*864e5).toISOString() })
const publicUrl = `${BASE}/public/laudo/${token}`
console.log('URL pública:', publicUrl)

// 5) fetch da página pública
const res = await fetch(publicUrl, { headers: { 'user-agent': 'verify-script' } })
const html = await res.text()
const okStatus = res.status === 200
const hasPet = html.includes(pat.name)
const hasImg = html.includes('Imagens') || html.includes('img_') || html.includes('object-contain')
console.log('HTTP', res.status, '| contém nome do pet:', hasPet, '| render de imagens:', hasImg)

if (okStatus && hasPet) {
  console.log('\n✅ E2E OK — a página pública do vet solicitante renderizou o estudo.')
} else {
  console.log('\n❌ E2E FALHOU — verifique o deploy.')
  console.log(html.slice(0, 500))
}

console.log('\n(Dados de teste marcados com [VERIFY] permanecem no dev para inspeção manual.)')
