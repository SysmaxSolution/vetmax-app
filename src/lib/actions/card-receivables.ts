'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type CardInstallmentStatus = 'pending' | 'settled' | 'reconciled' | 'cancelled'

export interface CardInstallment {
  id:                       string
  clinic_id:                string
  split_id:                 string
  invoice_id:               string | null
  payment_card_id:          string | null
  installment_number:       number
  total_installments:       number
  payment_method:           'credit' | 'debit' | 'voucher'
  card_acquirer:            string | null
  card_brand:               string | null
  card_nsu:                 string | null
  card_authorization:       string | null
  gross_amount:             number
  fee_percent:              number
  fee_amount:               number
  net_amount:               number
  expected_settlement_date: string
  status:                   CardInstallmentStatus
  settled_at:               string | null
  settled_amount:           number | null
  bank_statement_ref:       string | null
  reconciled_at:            string | null
  notes:                    string | null
  created_at:               string
  /** Dados desnormalizados para listagem. */
  card_label?:              string | null
  patient_name?:            string | null
  tutor_name?:              string | null
}

async function getCtx(): Promise<{ clinic_id: string; user_id: string; role: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinic_id: profile.clinic_id, user_id: user.id, role: profile.role as string }
}

export interface CardInstallmentsFilter {
  status?:     CardInstallmentStatus | 'all'
  card_id?:    string
  from_date?:  string
  to_date?:    string
  acquirer?:   string
  method?:     'credit' | 'debit' | 'voucher'
}

export async function listCardInstallments(
  filter: CardInstallmentsFilter = {}
): Promise<CardInstallment[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  let q = admin
    .from('card_installments')
    .select(`
      *,
      credit_cards ( name ),
      invoices ( patients ( name ), tutors ( name ) )
    `)
    .eq('clinic_id', ctx.clinic_id)
    .order('expected_settlement_date', { ascending: true })

  if (filter.status && filter.status !== 'all') q = q.eq('status', filter.status)
  if (filter.card_id)  q = q.eq('payment_card_id', filter.card_id)
  if (filter.method)   q = q.eq('payment_method', filter.method)
  if (filter.acquirer) q = q.ilike('card_acquirer', `%${filter.acquirer}%`)
  if (filter.from_date) q = q.gte('expected_settlement_date', filter.from_date)
  if (filter.to_date)   q = q.lte('expected_settlement_date', filter.to_date)

  const { data, error } = await q.limit(500)
  if (error) return { error: error.message }

  return (data ?? []).map((row: any) => ({
    ...row,
    card_label:   row.credit_cards?.name ?? null,
    patient_name: row.invoices?.patients?.name ?? null,
    tutor_name:   row.invoices?.tutors?.name ?? null,
  })) as CardInstallment[]
}

export interface CardInstallmentsSummary {
  total_pending_gross:  number
  total_pending_net:    number
  total_settled_gross:  number
  total_settled_net:    number
  total_fees:           number
  count_pending:        number
  count_settled:        number
  /** Detalhamento por mês de previsão (apenas pendentes). */
  by_month:             { month: string; gross: number; net: number; count: number }[]
  /** Por administradora (apenas pendentes). */
  by_acquirer:          { acquirer: string; gross: number; count: number }[]
}

export async function getCardInstallmentsSummary(filter: {
  from_date?: string
  to_date?:   string
} = {}): Promise<CardInstallmentsSummary | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  let q = admin
    .from('card_installments')
    .select('status, gross_amount, net_amount, fee_amount, expected_settlement_date, card_acquirer')
    .eq('clinic_id', ctx.clinic_id)

  if (filter.from_date) q = q.gte('expected_settlement_date', filter.from_date)
  if (filter.to_date)   q = q.lte('expected_settlement_date', filter.to_date)

  const { data, error } = await q.limit(2000)
  if (error) return { error: error.message }

  const rows = data ?? []
  const pending = rows.filter(r => r.status === 'pending')
  const settled = rows.filter(r => r.status === 'settled' || r.status === 'reconciled')

  const byMonthMap = new Map<string, { gross: number; net: number; count: number }>()
  for (const r of pending) {
    const month = r.expected_settlement_date?.slice(0, 7) ?? 'sem-data'
    const cur = byMonthMap.get(month) ?? { gross: 0, net: 0, count: 0 }
    cur.gross += Number(r.gross_amount)
    cur.net   += Number(r.net_amount)
    cur.count += 1
    byMonthMap.set(month, cur)
  }

  const byAcqMap = new Map<string, { gross: number; count: number }>()
  for (const r of pending) {
    const acq = r.card_acquirer ?? 'sem-operadora'
    const cur = byAcqMap.get(acq) ?? { gross: 0, count: 0 }
    cur.gross += Number(r.gross_amount)
    cur.count += 1
    byAcqMap.set(acq, cur)
  }

  return {
    total_pending_gross:  pending.reduce((s, r) => s + Number(r.gross_amount), 0),
    total_pending_net:    pending.reduce((s, r) => s + Number(r.net_amount), 0),
    total_settled_gross:  settled.reduce((s, r) => s + Number(r.gross_amount), 0),
    total_settled_net:    settled.reduce((s, r) => s + Number(r.net_amount), 0),
    total_fees:           rows.reduce((s, r) => s + Number(r.fee_amount), 0),
    count_pending:        pending.length,
    count_settled:        settled.length,
    by_month:             [...byMonthMap.entries()].map(([month, v]) => ({ month, ...v })).sort((a, b) => a.month.localeCompare(b.month)),
    by_acquirer:          [...byAcqMap.entries()].map(([acquirer, v]) => ({ acquirer, ...v })).sort((a, b) => b.gross - a.gross),
  }
}

export async function settleCardInstallment(input: {
  installment_id:    string
  settled_amount?:   number
  bank_statement_ref?: string
  actual_fee?:       number
  settled_date?:     string
}): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const supabase = await createClient()
  const { error } = await supabase.rpc('rpc_settle_card_installment', {
    p_installment_id: input.installment_id,
    p_settled_by:     ctx.user_id,
    p_settled_amount: input.settled_amount ?? null,
    p_bank_ref:       input.bank_statement_ref ?? null,
    p_actual_fee:     input.actual_fee ?? null,
    p_settled_date:   input.settled_date ?? null,
  })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/financial')
  revalidatePath('/dashboard/financial/cards')
  return { success: true }
}

export async function settleCardInstallmentsBatch(
  ids: string[],
  opts?: { settled_date?: string; bank_statement_ref?: string }
): Promise<{ settled: number; failed: number; errors: string[] }> {
  let settled = 0, failed = 0
  const errors: string[] = []
  for (const id of ids) {
    const res = await settleCardInstallment({
      installment_id: id,
      settled_date:   opts?.settled_date,
      bank_statement_ref: opts?.bank_statement_ref,
    })
    if ('error' in res) {
      failed++
      errors.push(`${id.slice(0,8)}: ${res.error}`)
    } else {
      settled++
    }
  }
  revalidatePath('/dashboard/financial/cards')
  return { settled, failed, errors }
}

export async function cancelCardInstallment(
  id: string,
  reason: string
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!reason.trim()) return { error: 'Motivo obrigatório.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('rpc_cancel_card_installment', {
    p_installment_id: id,
    p_cancelled_by:   ctx.user_id,
    p_reason:         reason.trim(),
  })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/financial/cards')
  return { success: true }
}
