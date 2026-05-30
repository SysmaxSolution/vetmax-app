// Smoke do omnisearch novo (formato agrupado): bate direto no Supabase com
// as mesmas queries da action para validar que nada está sintaticamente
// quebrado em prod (ex.: coluna inexistente, FK errada).
//
// Rodar: node -r dotenv/config scripts/smoke-omnisearch.mjs dotenv_config_path=.env.local

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('faltam env vars'); process.exit(1) }
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

const { data: clinics } = await admin.from('clinics').select('id').limit(1)
const clinicId = clinics[0].id
const q = 'a'  // string genérica para puxar algo
const pat = `%${q}%`

const results = await Promise.all([
  ['patients',     admin.from('patients').select('id, name, tutors(name)').eq('clinic_id', clinicId).ilike('name', pat).limit(3)],
  ['tutors',       admin.from('tutors').select('id, name, phone').eq('clinic_id', clinicId).ilike('name', pat).limit(3)],
  ['consultations', admin.from('consultations').select('id, status, patients(name), tutors(name)').eq('clinic_id', clinicId).ilike('patients.name', pat).not('patients','is',null).limit(3)],
  ['hospitalizations', admin.from('hospitalizations').select('id, status, created_at, patients(name)').eq('clinic_id', clinicId).ilike('patients.name', pat).not('patients','is',null).limit(3)],
  ['exam_requests', admin.from('exam_requests').select('id, status, exam_type, requested_at, patients(name)').eq('clinic_id', clinicId).or(`exam_type.ilike.${pat}`).limit(3)],
  ['whatsapp_conversations', admin.from('whatsapp_conversations').select('id, tutor_name, tutor_phone, status').eq('clinic_id', clinicId).or(`tutor_name.ilike.${pat}`).limit(3)],
  ['whatsapp_messages', admin.from('whatsapp_messages').select('id, content, conversation_id').eq('clinic_id', clinicId).ilike('content', pat).limit(3)],
])

let allOk = true
for (const [name, p] of results) {
  const r = await p
  if (r.error) { console.error(`❌ ${name}: ${r.error.message}`); allOk = false }
  else        { console.log(`✅ ${name}: ${(r.data ?? []).length} hits`) }
}

process.exit(allOk ? 0 : 1)
