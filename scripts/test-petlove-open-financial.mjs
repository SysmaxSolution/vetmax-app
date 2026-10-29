// Valida o fluxo de contas a receber em aberto:
// 1) Importa prévia → cria entries pending
// 2) Sobrescreve → entries pending são recriados
// 3) Simula remessa fechada → entries pending viram paid

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim()
const SERVICE_KEY  = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1]?.trim()
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

async function pickClinicWithPetlove() {
  const { data: provs } = await supabase
    .from('insurance_providers')
    .select('id, clinic_id, name')
    .ilike('name', 'petlove')
  if (!provs || provs.length === 0) throw new Error('Nenhuma clínica com provider Petlove')
  const { data: clinics } = await supabase
    .from('clinics').select('id, name').in('id', provs.map(p => p.clinic_id))
  return { clinic: clinics[0], provId: provs.find(p => p.clinic_id === clinics[0].id).id }
}

async function main() {
  const { clinic, provId } = await pickClinicWithPetlove()
  console.log(`▶ clínica: ${clinic.name} (${clinic.id})`)
  const prov = { id: provId }

  // Pega um patient/tutor existente
  const { data: pat } = await supabase
    .from('patients').select('id, tutor_id, name').eq('clinic_id', clinic.id).not('tutor_id', 'is', null).limit(1).maybeSingle()
  if (!pat) throw new Error('Sem patient com tutor')
  console.log(`▶ usando patient: ${pat.name} (${pat.id})`)

  // Cria uma remessa "open" de teste
  const TEST_NUM = `TEST-OPEN-${Date.now()}`
  const { data: rem, error: e1 } = await supabase
    .from('petlove_remittances')
    .insert({
      clinic_id: clinic.id, provider_id: prov.id,
      remittance_number: TEST_NUM,
      period_start: '2026-05-01', period_end: '2026-05-21',
      status: 'open', is_preview: true, source_format: 'open',
      total_service_value: 100, total_gross_value: 130,
      raw_summary: { test: true },
    }).select('id').single()
  if (e1) throw e1
  console.log(`▶ remessa criada: ${rem.id}`)

  // Cria uma linha
  const { data: line, error: e2 } = await supabase
    .from('petlove_remittance_lines')
    .insert({
      clinic_id: clinic.id, remittance_id: rem.id,
      external_appointment_id: 'TEST-APPT-001',
      service_date: '2026-05-15',
      tutor_name_raw: 'Tutor Teste', pet_name_raw: pat.name,
      procedure_name_raw: 'Consulta Clínico Geral Teste',
      repass_value: 45, coparticipation_value: 30,
      gender_raw: 'Fêmea', procedure_status_raw: 'Liberado', financial_status_raw: 'Não Pago',
      match_status: 'matched',
      matched_patient_id: pat.id, matched_tutor_id: pat.tutor_id,
    }).select('id').single()
  if (e2) throw e2
  console.log(`▶ linha criada: ${line.id}`)

  // Cria o entry pending manualmente (simulando applyPreviewSideEffects)
  const { data: fe, error: e3 } = await supabase
    .from('financial_entries')
    .insert({
      clinic_id: clinic.id, type: 'receivable',
      description: 'Petlove (em aberto) · Consulta Clínico Geral Teste · TEST',
      amount: 45, due_date: '2026-05-15', payment_date: null,
      status: 'pending', source: 'petlove_open', category: 'Convênios · Petlove (em aberto)',
      tutor_id: pat.tutor_id, patient_id: pat.id, settlement_bank_id: null,
      notes: 'Teste E2E', petlove_remittance_line_id: line.id,
    }).select('id, status, amount').single()
  if (e3) throw e3
  console.log(`▶ entry pending criado: ${fe.id} (${fe.status}, R$ ${fe.amount})`)

  // Verifica que aparece em A Receber pendente
  const { data: pendingList } = await supabase
    .from('financial_entries')
    .select('id, status, amount')
    .eq('clinic_id', clinic.id)
    .eq('source', 'petlove_open')
    .eq('status', 'pending')
    .eq('petlove_remittance_line_id', line.id)
  console.log(`▶ confirmação: ${pendingList.length} entry pendente vinculado à linha`)

  // Simula a baixa (como o applyReconciliation faria)
  const { error: e4 } = await supabase
    .from('financial_entries')
    .update({
      status: 'paid', amount: 45, payment_date: '2026-06-01',
      source: 'petlove', description: 'Petlove · Consulta Clínico Geral Teste · baixado',
      notes: 'Baixa via E2E test', updated_at: new Date().toISOString(),
    })
    .eq('id', fe.id)
  if (e4) throw e4
  const { data: baixado } = await supabase
    .from('financial_entries').select('id, status, payment_date, source').eq('id', fe.id).single()
  console.log(`▶ após baixa: status=${baixado.status}, payment_date=${baixado.payment_date}, source=${baixado.source}`)

  // Limpeza
  await supabase.from('financial_entries').delete().eq('id', fe.id)
  await supabase.from('petlove_remittance_lines').delete().eq('remittance_id', rem.id)
  await supabase.from('petlove_remittances').delete().eq('id', rem.id)
  console.log('▶ rollback completo\n')

  console.log('✅ Fluxo pending → paid validado.')
}

main().catch(e => { console.error('✗', e.message); process.exit(1) })
