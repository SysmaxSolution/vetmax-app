// Anexa um DICOM de amostra ao estudo de imagem [DEMO] do Tutu (kind='dicom'),
// liberado ao tutor, para testar o visualizador inline.
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

const __d = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__d, '../.env.local') })
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const PET = 'd704720e-d550-4247-b727-bc4c3541e315'

const { data: study } = await admin.from('imaging_studies')
  .select('id, clinic_id, released_to_tutor_at').eq('patient_id', PET).ilike('title', '%[DEMO]%').maybeSingle()
if (!study) { console.error('estudo [DEMO] não encontrado'); process.exit(1) }
const C = study.clinic_id

const { count } = await admin.from('imaging_files').select('id', { count:'exact', head:true }).eq('study_id', study.id).eq('kind','dicom')
if (count) { console.log('DICOM já anexado.'); process.exit(0) }

const bytes = readFileSync(resolve(__d, 'sample.dcm'))
const path = `${C}/${study.id}/${Date.now()}_sample.dcm`
const up = await admin.storage.from('imaging-files').upload(path, bytes, { contentType:'application/dicom' })
if (up.error) { console.error('upload:', up.error.message); process.exit(1) }
await admin.from('imaging_files').insert({ clinic_id:C, study_id:study.id, storage_path:path, file_name:'tomografia.dcm', content_type:'application/dicom', kind:'dicom', size_bytes:bytes.length })
if (!study.released_to_tutor_at) await admin.from('imaging_studies').update({ released_to_tutor_at:new Date().toISOString() }).eq('id', study.id)
console.log('✓ DICOM anexado ao estudo', study.id)
