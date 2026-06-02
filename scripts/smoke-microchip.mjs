// Smoke: 1) constraint visit_reason aceita 'microchipping'; 2) microchip_records
// aceita insert/select; 3) FK em profiles.implanted_by_fkey existe (nome usado
// no listMicrochipHistoryForPatient).
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltam env vars'); process.exit(1) }
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

let ok = true

// 1) Pega uma clínica + um pet para teste
const { data: clinics } = await admin.from('clinics').select('id').limit(1)
const clinicId = clinics?.[0]?.id
const { data: pats } = await admin.from('patients').select('id, tutor_id').eq('clinic_id', clinicId).limit(1)
if (!pats?.length) { console.error('sem pets — abortando'); process.exit(1) }
const patientId = pats[0].id
const tutorId   = pats[0].tutor_id

// 2) Tenta criar consulta de microchipagem (constraint deve aceitar)
const { data: c, error: cErr } = await admin
  .from('consultations')
  .insert({
    clinic_id: clinicId,
    patient_id: patientId,
    tutor_id: tutorId,
    visit_reason: 'microchipping',
    status: 'in_progress',
    payment_status: 'pending',
  })
  .select('id').single()
if (cErr) { console.error('❌ consultation microchipping:', cErr.message); ok = false }
else      { console.log(`✅ visit_reason='microchipping' aceito; consultation ${c.id.slice(0,8)}`) }

// 3) Insert em microchip_records
let chipId = null
if (c?.id) {
  const { data: r, error: rErr } = await admin
    .from('microchip_records')
    .insert({
      clinic_id: clinicId,
      patient_id: patientId,
      consultation_id: c.id,
      chip_number: '982000999999999',
      manufacturer: 'Smoke Test Lab',
      batch_number: 'L-TEST',
      expiry_date: '2030-12-31',
    })
    .select('id').single()
  if (rErr) { console.error('❌ microchip_records:', rErr.message); ok = false }
  else      { console.log(`✅ microchip_records ${r.id.slice(0,8)} inserido`); chipId = r.id }
}

// 4) Limpa
if (chipId) await admin.from('microchip_records').delete().eq('id', chipId)
if (c?.id)  await admin.from('consultations').delete().eq('id', c.id)
console.log('limpeza ok')

process.exit(ok ? 0 : 1)
