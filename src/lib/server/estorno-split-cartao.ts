// Estorno de um recebimento em CARTÃO registrado pela RPC rpc_record_split_payment
// (invoice_payment_splits + card_installments + títulos "A receber de cartão" +
// linha do caixa central), devolvendo o saldo à fatura.
//
// Existe porque reversePartialPayment (billing.ts) só trata baixa paga de
// fatura (entry 'paid'); o cartão gera parcelas PENDENTES em card_installments
// e nenhuma rotina as desfazia. É o caminho do estorno de venda na maquininha
// FinPet: pedido no sistema ou cancelamento confirmado pelo callback.
//
// Só servidor (admin client). Quem chama já conferiu clínica e permissão.

import type { SupabaseClient } from '@supabase/supabase-js'
import { mensagemErro } from '@/lib/errors'

export interface EstornoSplitParams {
  clinicId: string
  splitId:  string
  motivo:   string
  /** Quem pediu; null quando é o callback da operadora. */
  userId:   string | null
}

export async function estornarSplitDeCartao(
  admin: SupabaseClient,
  p: EstornoSplitParams,
): Promise<{ ok: true; invoice_status: string; remaining_balance: number } | { error: string }> {
  // 1. o split e a fatura
  const { data: split } = await admin
    .from('invoice_payment_splits')
    .select('id, invoice_id, financial_entry_id, amount, card_nsu, payment_method')
    .eq('id', p.splitId).eq('clinic_id', p.clinicId).maybeSingle()
  if (!split) return { error: 'Recebimento não encontrado (talvez já estornado).' }

  const { data: invoice } = await admin
    .from('invoices')
    .select('id, total_amount, paid_amount, status, patient_id, tutor_id')
    .eq('id', split.invoice_id as string).eq('clinic_id', p.clinicId).maybeSingle()
  if (!invoice) return { error: 'Fatura do recebimento não encontrada.' }
  if (invoice.status === 'cancelled') return { error: 'A fatura está cancelada.' }

  // 2. parcelas de cartão do split — parcela já liquidada/conciliada não se desfaz daqui
  const { data: parcelas } = await admin
    .from('card_installments')
    .select('id, status, pending_entry_id, settled_entry_id')
    .eq('clinic_id', p.clinicId).eq('split_id', p.splitId)
  const lista = (parcelas ?? []) as Array<{ id: string; status: string; pending_entry_id: string | null; settled_entry_id: string | null }>
  const travada = lista.find(x => x.status === 'settled' || x.status === 'reconciled')
  if (travada) {
    return { error: 'Uma das parcelas deste cartão já foi liquidada/conciliada. Desfaça a liquidação na tela de Cartões antes de estornar.' }
  }

  // 3. apaga parcelas e os títulos pendentes delas (ou a baixa paga, se não era cartão)
  const entradas = lista.map(x => x.pending_entry_id).filter((x): x is string => !!x)
  if (lista.length) {
    const { error: e1 } = await admin.from('card_installments').delete().eq('clinic_id', p.clinicId).eq('split_id', p.splitId)
    if (e1) return { error: 'Erro ao desfazer parcelas: ' + mensagemErro(e1, 'lib/server/estorno-split-cartao.ts') }
  }
  if (entradas.length) {
    const { error: e2 } = await admin.from('financial_entries').delete().eq('clinic_id', p.clinicId).in('id', entradas).eq('status', 'pending')
    if (e2) return { error: 'Erro ao desfazer títulos de cartão: ' + mensagemErro(e2, 'lib/server/estorno-split-cartao.ts') }
  } else if (split.financial_entry_id) {
    await admin.from('financial_entries').delete().eq('clinic_id', p.clinicId).eq('id', split.financial_entry_id as string).eq('status', 'paid')
  }
  const { error: e3 } = await admin.from('invoice_payment_splits').delete().eq('clinic_id', p.clinicId).eq('id', p.splitId)
  if (e3) return { error: 'Erro ao desfazer o recebimento: ' + mensagemErro(e3, 'lib/server/estorno-split-cartao.ts') }

  // 4. linha do caixa central → estornada (a que casa por fatura, valor e NSU)
  const amount = Number(split.amount)
  let qCx = admin.from('central_cashier').select('id')
    .eq('clinic_id', p.clinicId).eq('source_id', split.invoice_id as string).eq('status', 'recorded').eq('amount', amount)
  if (split.card_nsu) qCx = qCx.eq('card_nsu', split.card_nsu as string)
  const { data: cx } = await qCx.order('created_at', { ascending: false }).limit(1)
  const linhaCaixa = (cx ?? [])[0] as { id: string } | undefined
  if (linhaCaixa) {
    await admin.from('central_cashier').update({
      status: 'reversed', reversal_reason: p.motivo, reversed_at: new Date().toISOString(), reversed_by: p.userId,
    }).eq('clinic_id', p.clinicId).eq('id', linhaCaixa.id)
  }

  // 5. fatura volta a dever — e o saldo a receber do caixa volta a existir (um só)
  const newPaid    = Math.max(0, Number(invoice.paid_amount ?? 0) - amount)
  const newBalance = Math.max(0, Number(invoice.total_amount ?? 0) - newPaid)
  const newStatus  = newPaid > 0.01 ? 'paid_partial' : 'pending'
  await admin.from('invoices').update({
    paid_amount: newPaid, status: newStatus, paid_at: null, updated_at: new Date().toISOString(),
  }).eq('clinic_id', p.clinicId).eq('id', invoice.id)

  const { data: pend } = await admin.from('financial_entries').select('id')
    .eq('clinic_id', p.clinicId).eq('invoice_id', invoice.id).eq('status', 'pending').eq('source', 'cashier')
    .order('created_at', { ascending: true })
  const pendentes = (pend ?? []) as Array<{ id: string }>
  if (newBalance > 0.01) {
    if (pendentes.length) {
      await admin.from('financial_entries').update({ amount: newBalance, updated_at: new Date().toISOString() })
        .eq('clinic_id', p.clinicId).eq('id', pendentes[0].id)
      const extras = pendentes.slice(1).map(x => x.id)
      if (extras.length) await admin.from('financial_entries').delete().eq('clinic_id', p.clinicId).in('id', extras)
    } else {
      await admin.from('financial_entries').insert({
        clinic_id: p.clinicId, type: 'receivable',
        description: `Saldo a receber · fatura ${String(invoice.id).slice(0, 8)} (estorno de cartão)`,
        amount: newBalance, due_date: new Date().toISOString().slice(0, 10),
        status: 'pending', source: 'cashier', category: 'Recebimento de fatura',
        tutor_id: invoice.tutor_id ?? null, patient_id: invoice.patient_id ?? null,
        invoice_id: invoice.id, created_by: p.userId, notes: p.motivo,
      })
    }
  }

  return { ok: true, invoice_status: newStatus, remaining_balance: Math.round(newBalance * 100) / 100 }
}
