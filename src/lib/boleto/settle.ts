import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { logBoletoEvent } from '@/lib/boleto/events'

export interface PaidInfo {
  paidAt?: string | null      // data do pagamento (ISO)
  paidAmount?: number | null  // valor pago
  bankDetail?: string | null  // detalhamento do banco (para observações)
}

/**
 * Marca o boleto como PAGO e faz a BAIXA AUTOMÁTICA do título (financial_entries):
 * status=paid, data de pagamento, valor pago e observação com o detalhamento do
 * banco. Idempotente (não rebaixa um título já pago). Server-only.
 */
export async function settleBoletoPaid(
  find: { clinicId: string; boletoId?: string; nossoNumero?: string },
  info: PaidInfo = {},
): Promise<{ ok: true; entrySettled: boolean } | { error: string }> {
  const admin = createAdminClient()
  let q = admin.from('clinic_boletos').select('id, financial_entry_id, nosso_numero, valor, situacao').eq('clinic_id', find.clinicId)
  if (find.boletoId) q = q.eq('id', find.boletoId)
  else if (find.nossoNumero) q = q.eq('nosso_numero', find.nossoNumero)
  else return { error: 'Informe o boleto.' }
  const { data: b } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!b) return { error: 'Boleto não encontrado.' }

  const now = new Date().toISOString()
  const paidAt = info.paidAt ?? now
  await admin.from('clinic_boletos').update({ situacao: 'pago', updated_at: now }).eq('id', (b as any).id)

  let entrySettled = false
  const entryId = (b as any).financial_entry_id
  if (entryId) {
    const { data: fe } = await admin.from('financial_entries').select('id, status, notes, amount').eq('id', entryId).eq('clinic_id', find.clinicId).maybeSingle()
    if (fe && (fe as any).status !== 'paid') {
      const pago = info.paidAmount ?? (b as any).valor ?? (fe as any).amount
      const detalhe = `Baixa automática — boleto Sicoob (nosso nº ${(b as any).nosso_numero ?? '—'}) pago em ${paidAt.slice(0, 10).split('-').reverse().join('/')} · valor R$ ${Number(pago).toFixed(2)}.${info.bankDetail ? ' ' + info.bankDetail : ''}`
      const notes = [(fe as any).notes, detalhe].filter(Boolean).join('\n')
      const { error } = await admin.from('financial_entries').update({
        status: 'paid',
        payment_date: paidAt.slice(0, 10),
        payment_method: 'boleto',
        notes,
        updated_at: now,
      }).eq('id', entryId)
      entrySettled = !error
    }
  }
  await logBoletoEvent(admin, {
    clinicId: find.clinicId, boletoId: (b as any).id, eventType: 'pago', actorType: 'bank', actorName: 'Banco Sicoob',
    detail: `Pagamento confirmado pelo banco — ${entrySettled ? 'título baixado automaticamente' : 'título já estava baixado'}.`,
    situacao: 'pago', payload: info.bankDetail ?? null,
  })
  return { ok: true, entrySettled }
}
