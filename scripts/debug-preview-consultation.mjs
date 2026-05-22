// Reproduz a query de previewConsultationInsurance contra o banco real
// para ver se há erros 400 silenciosos.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const SERVICE_KEY  = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// Pega uma invoice pendente real
const { data: invoices, error: invErr } = await supabase
  .from('invoices')
  .select('id, consultation_id, patient_id, clinic_id, status')
  .eq('status', 'pending')
  .limit(3)

console.log('invoices pendentes encontradas:', invoices?.length ?? 0)
if (invErr) console.error('erro:', invErr)
if (!invoices || invoices.length === 0) {
  console.log('Nenhuma invoice pendente — testando com qualquer uma')
  const { data: any } = await supabase.from('invoices').select('id, consultation_id, patient_id, clinic_id').limit(1)
  if (!any || any.length === 0) { console.log('Sem invoices no banco. Saindo.'); process.exit(0) }
  invoices.push(any[0])
}

for (const inv of invoices) {
  console.log(`\n▶ Invoice ${inv.id} · consultation=${inv.consultation_id} · patient=${inv.patient_id}`)

  // 1) consulta
  const { data: consult, error: cerr } = await supabase
    .from('consultations')
    .select('id, patient_id')
    .eq('id', inv.consultation_id)
    .maybeSingle()
  console.log(`  consultations.select → ${cerr ? '✗ ' + cerr.message : '✓ ' + (consult ? 'achou' : 'vazio')}`)

  // 2) invoice_items via inner join (igual à query da action)
  const { data: items, error: ierr } = await supabase
    .from('invoice_items')
    .select('id, description, external_procedure_name, quantity, total_price, invoices!inner(consultation_id)')
    .eq('invoices.consultation_id', inv.consultation_id)
  console.log(`  invoice_items.select → ${ierr ? '✗ ' + ierr.message : '✓ ' + (items?.length ?? 0) + ' itens'}`)

  // 3) pet_insurance
  if (consult?.patient_id) {
    const { data: ins, error: insErr } = await supabase
      .from('pet_insurance')
      .select('id, plan_type, enrollment_date, created_at, provider_id, insurance_providers(name)')
      .eq('clinic_id', inv.clinic_id)
      .eq('patient_id', consult.patient_id)
      .eq('coverage_status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    console.log(`  pet_insurance.select → ${insErr ? '✗ ' + insErr.message : '✓ ' + (ins ? 'tem convênio' : 'sem convênio')}`)
  }
}
