// Popula dados de demonstração para o pet Tutu (portal). Idempotente-ish: marca com [DEMO].
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes } from 'crypto'

const __d = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__d, '../.env.local') })
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const PET = 'd704720e-d550-4247-b727-bc4c3541e315'

const { data: pet } = await admin.from('patients').select('id, tutor_id, clinic_id, name').eq('id', PET).single()
const C = pet.clinic_id
console.log('Pet:', pet.name, '| clinic:', C)

// 1) Vacinas
try {
  const { count } = await admin.from('patient_vaccines').select('id', { count:'exact', head:true }).eq('patient_id', PET).ilike('vaccine_name', '%[DEMO]%')
  if (!count) {
    await admin.from('patient_vaccines').insert([
      { clinic_id:C, patient_id:PET, vaccine_name:'V10 (Déctupla) [DEMO]', date_administered:'2026-06-15', next_due_date:'2027-06-15', dose_number:3, dose_total:3, manufacturer:'Zoetis', lot_number:'ABC123' },
      { clinic_id:C, patient_id:PET, vaccine_name:'Antirrábica [DEMO]', date_administered:'2026-06-15', next_due_date:'2027-06-15', dose_number:1, manufacturer:'MSD', lot_number:'RAB998' },
    ])
    console.log('✓ vacinas')
  } else console.log('· vacinas já existem')
} catch(e){ console.log('✗ vacinas:', e.message) }

// 2) Consulta (para exames + receita)
let consId = null
try {
  const { data: c } = await admin.from('consultations').select('id').eq('patient_id', PET).order('created_at',{ascending:false}).limit(1).maybeSingle()
  consId = c?.id ?? null
  if (!consId) {
    const { data: nc, error } = await admin.from('consultations').insert({ clinic_id:C, patient_id:PET, tutor_id:pet.tutor_id, status:'completed' }).select('id').single()
    if (error) throw error
    consId = nc.id
    console.log('✓ consulta criada')
  } else console.log('· usando consulta existente')
} catch(e){ console.log('✗ consulta:', e.message) }

// 3) Exames liberados
if (consId) try {
  const { count } = await admin.from('exam_results').select('id',{count:'exact',head:true}).eq('consultation_id', consId).ilike('panel','%Hemograma [DEMO]%')
  if (!count) {
    await admin.from('exam_results').insert([
      { clinic_id:C, consultation_id:consId, panel:'Hemograma [DEMO]', analyte_name:'Hemácias', value_text:'6.8', unit:'milhões/µL', ref_text:'5.5 – 8.5', flag:'N', status:'released', released_at:new Date().toISOString() },
      { clinic_id:C, consultation_id:consId, panel:'Hemograma [DEMO]', analyte_name:'Hematócrito', value_text:'52', unit:'%', ref_text:'37 – 55', flag:'N', status:'released', released_at:new Date().toISOString() },
      { clinic_id:C, consultation_id:consId, panel:'Hemograma [DEMO]', analyte_name:'Leucócitos', value_text:'18500', unit:'/µL', ref_text:'6000 – 17000', flag:'H', status:'released', released_at:new Date().toISOString() },
      { clinic_id:C, consultation_id:consId, panel:'Bioquímico [DEMO]', analyte_name:'Creatinina', value_text:'1.1', unit:'mg/dL', ref_text:'0.5 – 1.5', flag:'N', status:'released', released_at:new Date().toISOString() },
      { clinic_id:C, consultation_id:consId, panel:'Bioquímico [DEMO]', analyte_name:'ALT (TGP)', value_text:'95', unit:'U/L', ref_text:'10 – 88', flag:'H', status:'released', released_at:new Date().toISOString() },
    ])
    console.log('✓ exames liberados')
  } else console.log('· exames já existem')
} catch(e){ console.log('✗ exames:', e.message) }

// 4) Receita assinada
if (consId) try {
  const { count } = await admin.from('prescriptions').select('id',{count:'exact',head:true}).eq('consultation_id', consId).ilike('medication','%[DEMO]%')
  if (!count) {
    await admin.from('prescriptions').insert({ clinic_id:C, consultation_id:consId, medication:'Amoxicilina + Clavulanato 250mg [DEMO]', dose:'1 comprimido a cada 12h por 10 dias', route_of_administration:'oral', vet_signed_at:new Date().toISOString() })
    console.log('✓ receita')
  } else console.log('· receita já existe')
} catch(e){ console.log('✗ receita:', e.message) }

// 5) Imagem liberada ao tutor
try {
  const { data: ex } = await admin.from('imaging_studies').select('id').eq('patient_id',PET).ilike('title','%[DEMO]%').maybeSingle()
  if (!ex) {
    const now = new Date().toISOString()
    const { data: st } = await admin.from('imaging_studies').insert({ clinic_id:C, patient_id:PET, modality:'radiografia', title:'Raio-X Tórax [DEMO]', status:'reported', images_uploaded_at:now, laudo_released_at:now, released_to_tutor_at:now }).select('id').single()
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64')
    const path = `${C}/${st.id}/${Date.now()}_demo.png`
    await admin.storage.from('imaging-files').upload(path, PNG, { contentType:'image/png' })
    await admin.from('imaging_files').insert({ clinic_id:C, study_id:st.id, storage_path:path, file_name:'torax.png', content_type:'image/png', kind:'image', size_bytes:PNG.length })
    await admin.from('imaging_share_links').insert({ clinic_id:C, study_id:st.id, token:'img_'+randomBytes(24).toString('hex'), audience:'tutor', expires_at:new Date(Date.now()+180*864e5).toISOString() })
    console.log('✓ imagem liberada ao tutor')
  } else console.log('· imagem já existe')
} catch(e){ console.log('✗ imagem:', e.message) }

console.log('\nDone.')
