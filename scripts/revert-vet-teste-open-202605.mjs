// Reverte a remessa OPEN-202605 da Vet Teste que foi aprovada por engano.
// - Entries vinculados (paid → pending, source=petlove_open, sem banco/pagamento)
// - Entries retroativos sem link (criados pela aprovação) → DELETE
// - bank_statements vinculadas → DELETE
// - invoice_items conciliados → reverte para aguardando_repasse
// - patient_petlove_history de baixa → DELETE (mantém patient_created)
// - remessa: reconciled → open, reconciled_at=NULL
//
// Idempotente. Roda em transação manual: faz tudo, depois lê de volta.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = readFileSync('.env.local', 'utf8')
const SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)[1].trim()
const SERVICE_KEY  = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)[1].trim()
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const VET_TESTE = '06fd6aca-0f80-45ac-a552-220af5a242ae'
const REM_NUMBER = 'OPEN-202605'

async function main() {
  // 1) Localiza a remessa
  const { data: rem } = await supabase
    .from('petlove_remittances')
    .select('id, status, is_preview, source_format, remittance_number')
    .eq('clinic_id', VET_TESTE)
    .eq('remittance_number', REM_NUMBER)
    .maybeSingle()
  if (!rem) throw new Error(`Remessa ${REM_NUMBER} não encontrada`)
  console.log(`▶ Remessa: ${rem.id} · status=${rem.status} · is_preview=${rem.is_preview} · fmt=${rem.source_format}`)

  if (rem.status === 'open') {
    console.log('  já está em status=open. Verificando entries vinculados…')
  }

  // 2) Linhas da remessa
  const { data: lines } = await supabase
    .from('petlove_remittance_lines')
    .select('id, matched_invoice_item_id')
    .eq('clinic_id', VET_TESTE)
    .eq('remittance_id', rem.id)
  const lineIds = (lines ?? []).map(l => l.id)
  const itemIds = (lines ?? []).map(l => l.matched_invoice_item_id).filter(Boolean)
  console.log(`▶ ${lineIds.length} linhas · ${itemIds.length} invoice_items conciliados`)

  // 3) Entries linkados que foram baixados (paid) → voltar para pending
  const { data: linkedPaid } = await supabase
    .from('financial_entries')
    .select('id, amount, description, notes')
    .eq('clinic_id', VET_TESTE)
    .in('petlove_remittance_line_id', lineIds)
    .eq('status', 'paid')
  console.log(`▶ ${linkedPaid?.length ?? 0} entries vinculados em status=paid (serão revertidos para pending)`)

  let reverted = 0
  for (const e of linkedPaid ?? []) {
    const newDesc = e.description.replace(/^Petlove · /, 'Petlove (em aberto) · ').replace(' · baixado', '')
    const newNotes = (e.notes ?? '').replace(/\s*·\s*baixa de prévia em aberto.*/, '')
    const { error } = await supabase
      .from('financial_entries')
      .update({
        status: 'pending',
        source: 'petlove_open',
        payment_date: null,
        settlement_bank_id: null,
        description: newDesc,
        notes: newNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', e.id)
    if (error) console.error(`  ✗ ${e.id}: ${error.message}`)
    else reverted++
  }
  console.log(`  ✓ ${reverted} entries revertidos para pending`)

  // 4) bank_statements gerados por entries linkados → DELETE
  const linkedEntryIds = (linkedPaid ?? []).map(e => e.id)
  if (linkedEntryIds.length > 0) {
    const { count: bsCount } = await supabase
      .from('bank_statements')
      .delete({ count: 'exact' })
      .in('reconciled_entry_id', linkedEntryIds)
    console.log(`  ✓ ${bsCount ?? 0} bank_statements vinculadas removidas`)
  }

  // 5) Entries SEM link mas criados pela aprovação (notes ref. à remessa)
  const { data: unlinkedExtras } = await supabase
    .from('financial_entries')
    .select('id, amount, description')
    .eq('clinic_id', VET_TESTE)
    .in('source', ['petlove', 'petlove_indicacao'])
    .is('petlove_remittance_line_id', null)
    .ilike('notes', `%${REM_NUMBER}%`)
  console.log(`▶ ${unlinkedExtras?.length ?? 0} entries retroativos extras (serão apagados)`)
  if ((unlinkedExtras ?? []).length > 0) {
    const ids = unlinkedExtras.map(e => e.id)
    // bank_statements desses primeiro
    await supabase.from('bank_statements').delete().in('reconciled_entry_id', ids)
    const { count: delCount } = await supabase
      .from('financial_entries')
      .delete({ count: 'exact' })
      .in('id', ids)
    console.log(`  ✓ ${delCount ?? 0} entries extras removidos`)
  }

  // 6) invoice_items: reverte para aguardando_repasse
  if (itemIds.length > 0) {
    const { count: invCount } = await supabase
      .from('invoice_items')
      .update({
        insurance_status: 'aguardando_repasse',
        realized_value: null,
        coparticipation_value: null,
        reconciled_at: null,
        reconciled_by: null,
      }, { count: 'exact' })
      .in('id', itemIds)
      .eq('insurance_status', 'conciliado')
    console.log(`  ✓ ${invCount ?? 0} invoice_items revertidos para aguardando_repasse`)
  }

  // 7) patient_petlove_history de baixa criadas por essa remessa
  const { count: hCount } = await supabase
    .from('patient_petlove_history')
    .delete({ count: 'exact' })
    .eq('clinic_id', VET_TESTE)
    .eq('remittance_id', rem.id)
    .in('event_type', ['entry_created', 'entry_paid'])
  console.log(`  ✓ ${hCount ?? 0} eventos patient_petlove_history de baixa removidos`)

  // 8) Remessa: reconciled → open
  const { error: remUpdErr } = await supabase
    .from('petlove_remittances')
    .update({
      status: 'open',
      is_preview: true,
      source_format: 'open',
      reconciled_at: null,
      financial_entry_id: null,
      referral_financial_entry_id: null,
      bank_statement_id: null,
    })
    .eq('id', rem.id)
  if (remUpdErr) throw remUpdErr
  console.log(`  ✓ remessa ${REM_NUMBER}: reconciled → open`)

  // ─── Verificação ───
  console.log('\n═══ Verificação pós-reversão ═══')
  const { data: vCheck } = await supabase
    .from('petlove_remittances')
    .select('status, is_preview')
    .eq('id', rem.id)
    .single()
  console.log(`  remessa.status: ${vCheck.status} (is_preview=${vCheck.is_preview})`)

  const { data: pendingNow } = await supabase
    .from('financial_entries')
    .select('id, amount')
    .eq('clinic_id', VET_TESTE)
    .in('petlove_remittance_line_id', lineIds)
    .eq('status', 'pending')
    .eq('source', 'petlove_open')
  const totalPending = (pendingNow ?? []).reduce((a, e) => a + Number(e.amount), 0)
  console.log(`  entries pendentes vinculados: ${pendingNow?.length ?? 0} · R$ ${totalPending.toFixed(2)}`)

  console.log('\n✅ Reversão concluída.')
}

main().catch(e => { console.error('✗', e.message); process.exit(1) })
