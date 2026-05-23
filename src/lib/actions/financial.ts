'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// ─── Types base (G-09) ────────────────────────────────────────────────────────

export type EntryType   = 'receivable' | 'payable'
export type EntryStatus = 'pending' | 'paid' | 'cancelled'
export type EntrySource = 'manual' | 'cashier' | 'petlove' | 'petlove_indicacao' | 'petlove_open' | 'commission'

export interface FinancialEntry {
  id:                   string
  clinic_id:            string
  type:                 EntryType
  description:          string
  amount:               number
  discount:             number
  interest:             number
  due_date:             string
  issue_date:           string | null
  payment_date:         string | null
  status:               EntryStatus
  payment_method:       string | null
  tutor_id:             string | null
  patient_id:           string | null
  category:             string | null
  notes:                string | null
  created_by:           string | null
  created_at:           string
  updated_at:           string
  // campos novos
  document_number:      string | null
  professional_id:      string | null
  chart_of_accounts_id: string | null
  settlement_bank_id:   string | null
  // joins
  tutor_name:           string | null
  patient_name:         string | null
  professional_name:    string | null
  chart_account_label:  string | null
  settlement_bank_name: string | null
  // meta
  source:               EntrySource
  cashier_entry_id:     string | null
  cashier_outflow_id:   string | null
  // vínculo com invoice mestre (duplicatas) + flag de ajuste contábil
  invoice_id:           string | null
  is_clinic_discount:   boolean
}

export interface FinancialSummary {
  toReceiveMonth:      number
  overdue:             number
  paidMonth:           number
  toReceiveMonthCount: number
  overdueCount:        number
  paidMonthCount:      number
}

export interface ListEntriesFilters {
  type:       EntryType
  status?:    EntryStatus | 'all'
  search?:    string
  due_from?:  string
  due_to?:    string
  paid_from?: string
  paid_to?:   string
}

export interface CreateEntryData {
  type:                 EntryType
  description:          string
  amount:               number
  due_date:             string
  issue_date?:          string | null
  discount?:            number
  payment_method?:      string
  tutor_id?:            string
  patient_id?:          string
  category?:            string
  notes?:               string
  professional_id?:     string
  chart_of_accounts_id?: string
}

export interface BaixarTituloData {
  payment_date:        string
  payment_method:      string
  settlement_bank_id?: string
  interest?:           number
  discount?:           number
  /**
   * Quanto efetivamente entra no caixa AGORA. Quando omitido (ou >= netAmount),
   * baixa integral. Quando menor, baixa parcial: o entry pai é reduzido para
   * (netAmount - amount_received) e fica pending; um entry filho paid é criado
   * com amount_received.
   */
  amount_received?:    number
}

// ─── Types G-10 ───────────────────────────────────────────────────────────────

export interface BankAccount {
  id:              string
  clinic_id:       string
  name:            string
  bank_name:       string | null
  bank_code:       string | null
  ispb:            string | null
  agency:          string | null
  account:         string | null
  pix_key:         string | null
  is_default:      boolean
  balance:         number
  initial_balance: number
  created_at:      string
}

export interface CreateBankAccountData {
  name:            string
  bank_name?:      string
  bank_code?:      string
  ispb?:           string
  agency?:         string
  account?:        string
  pix_key?:        string
  is_default?:     boolean
  initial_balance?: number
}

export interface ChartOfAccount {
  id:        string
  clinic_id: string
  code:      string
  name:      string
  type:      'receita' | 'despesa' | 'ativo' | 'passivo'
  parent_id: string | null
  is_system: boolean
  is_active: boolean
  created_at: string
}

export interface CreateChartOfAccountData {
  code:      string
  name:      string
  type:      'receita' | 'despesa' | 'ativo' | 'passivo'
  parent_id?: string
}

export interface CreditCard {
  id:               string
  clinic_id:        string
  name:             string
  administrator:    string | null
  brand:            'visa' | 'master' | 'elo' | 'amex' | 'hipercard' | 'other'
  type:             'credit' | 'debit' | 'both'
  installments_max: number
  fee_percent:      number
  days_to_receive:  number
  is_active:        boolean
  created_at:       string
}

export interface CreateCreditCardData {
  name:             string
  administrator?:   string
  brand:            CreditCard['brand']
  type:             CreditCard['type']
  installments_max: number
  fee_percent:      number
  days_to_receive:  number
}

export interface Employee {
  id:            string
  clinic_id:     string
  user_id:       string | null
  name:          string
  role:          string
  email:         string | null
  phone:         string | null
  cpf:           string | null
  address:       Record<string, string> | null
  hire_date:     string | null
  salary:        number | null
  pix_key:       string | null
  vacation_days: number
  is_active:     boolean
  created_at:    string
  updated_at:    string
}

export interface CreateEmployeeData {
  name:           string
  role:           string
  email?:         string
  phone?:         string
  cpf?:           string
  address?:       Record<string, string>
  hire_date?:     string
  salary?:        number
  pix_key?:       string
  vacation_days?: number
  user_id?:       string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getClinicIdAndRole(): Promise<{ clinicId: string; role: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!data?.clinic_id) return null
  return { clinicId: data.clinic_id, role: data.role }
}

async function getClinicId(): Promise<string | null> {
  const r = await getClinicIdAndRole()
  return r?.clinicId ?? null
}

async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// ─── createEntry ──────────────────────────────────────────────────────────────

export async function createEntry(
  data: CreateEntryData
): Promise<FinancialEntry | { error: string }> {
  const user = await getAuthUser()
  if (!user) return { error: 'Não autenticado.' }
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Clínica não encontrada.' }

  if (!data.description?.trim()) return { error: 'Descrição obrigatória.' }
  if (!data.amount || data.amount <= 0) return { error: 'Valor deve ser positivo.' }
  if (!data.due_date) return { error: 'Data de vencimento obrigatória.' }

  const admin = createAdminClient()
  const { data: entry, error } = await admin
    .from('financial_entries')
    .insert({
      clinic_id:            clinicId,
      type:                 data.type,
      description:          data.description.trim(),
      amount:               data.amount,
      discount:             data.discount ?? 0,
      due_date:             data.due_date,
      issue_date:           data.issue_date ?? null,
      payment_method:       data.payment_method       || null,
      tutor_id:             data.tutor_id             || null,
      patient_id:           data.patient_id           || null,
      category:             data.category             || null,
      notes:                data.notes                || null,
      professional_id:      data.professional_id      || null,
      chart_of_accounts_id: data.chart_of_accounts_id || null,
      created_by:           user.id,
      status:               'pending',
      // document_number e professional_id preenchidos pelo trigger trg_fe_defaults
    })
    .select(ENTRY_SELECT)
    .single()

  if (error) return { error: 'Erro ao criar título: ' + error.message }
  return mapEntry(entry as unknown as Record<string, unknown>)
}

// ─── listEntries ──────────────────────────────────────────────────────────────

export async function listEntries(
  filters: ListEntriesFilters
): Promise<FinancialEntry[] | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  let query = admin
    .from('financial_entries')
    .select(ENTRY_SELECT)
    .eq('clinic_id', clinicId)
    .eq('type', filters.type)
    // Oculta entries de ajuste contábil (descontos de convênio aplicados via
    // split do caixa). Aparecem no histórico da invoice via InvoiceDuplicatasList,
    // mas NÃO devem poluir a lista de A Receber/A Pagar.
    .eq('is_clinic_discount', false)
    .order('due_date', { ascending: true })
    .order('created_at', { ascending: false })

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  }
  if (filters.search?.trim()) {
    query = query.ilike('description', `%${filters.search.trim()}%`)
  }
  if (filters.due_from) query = query.gte('due_date', filters.due_from)
  if (filters.due_to)   query = query.lte('due_date', filters.due_to)
  if (filters.paid_from) query = query.gte('payment_date', filters.paid_from)
  if (filters.paid_to)   query = query.lte('payment_date', filters.paid_to)

  const { data, error } = await query.limit(500)
  if (error) return { error: 'Erro ao buscar títulos: ' + error.message }
  return (data ?? []).map(row => mapEntry(row as unknown as Record<string, unknown>))
}

// ─── getEntryContext ─────────────────────────────────────────────────────────
// Retorna informações contextuais sobre um entry para a UI exibir mensagens
// inteligentes (ex.: "Aguardando repasse Petlove — tutor pagou R$ X em DD/MM").
//
// Para entries vinculados a uma invoice (invoice_id), retorna:
//   • outras duplicatas paid (source='cashier', não is_clinic_discount) com
//     valor e data — representam quanto o tutor já desembolsou
//   • clinic_discount entry da invoice — desconto contábil oferecido ao plano
//   • total_amount e paid_amount atuais da invoice

export interface EntryContext {
  entry_id:           string
  source:             EntrySource
  is_clinic_discount: boolean
  invoice_id:         string | null
  /** Outras baixas (paid) da mesma invoice — quanto o tutor já desembolsou. */
  paid_in_cashier: Array<{
    id:             string
    amount:         number
    payment_date:   string
    payment_method: string | null
  }>
  /** Desconto contábil oferecido ao plano (se aplicável). */
  clinic_discount?: { amount: number; description: string }
  /** Estado da invoice mestre. */
  invoice?: {
    id:           string
    subtotal:     number
    total_amount: number
    paid_amount:  number
    discount:     number
    status:       string
  }
  /** Mensagem pronta para exibir como aviso na UI. */
  message?:           string
  /** Tipo de confirmação sugerido ao baixar este entry. */
  confirm_kind?:      'petlove_repass' | 'standard'
}

export async function getEntryContext(entryId: string): Promise<EntryContext | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }
  const admin = createAdminClient()

  const { data: entry } = await admin
    .from('financial_entries')
    .select('id, invoice_id, source, is_clinic_discount, amount')
    .eq('clinic_id', clinicId)
    .eq('id', entryId)
    .maybeSingle()
  if (!entry) return { error: 'Lançamento não encontrado.' }

  const result: EntryContext = {
    entry_id:           entry.id,
    source:             entry.source as EntrySource,
    is_clinic_discount: Boolean(entry.is_clinic_discount),
    invoice_id:         entry.invoice_id ?? null,
    paid_in_cashier:    [],
    confirm_kind:       entry.source === 'petlove_open' ? 'petlove_repass' : 'standard',
  }

  if (!entry.invoice_id) {
    return result
  }

  // Carrega outras duplicatas paid (caixa) + invoice mestre + entry de desconto
  const { data: invoice } = await admin
    .from('invoices')
    .select('id, subtotal, total_amount, paid_amount, discount, status')
    .eq('id', entry.invoice_id)
    .maybeSingle()

  if (invoice) {
    result.invoice = {
      id:           invoice.id,
      subtotal:     Number((invoice as { subtotal: number }).subtotal),
      total_amount: Number((invoice as { total_amount: number }).total_amount),
      paid_amount:  Number((invoice as { paid_amount: number }).paid_amount ?? 0),
      discount:     Number((invoice as { discount: number }).discount ?? 0),
      status:       (invoice as { status: string }).status,
    }
  }

  const { data: paidEntries } = await admin
    .from('financial_entries')
    .select('id, amount, payment_date, payment_method')
    .eq('clinic_id', clinicId)
    .eq('invoice_id', entry.invoice_id)
    .eq('status', 'paid')
    .eq('source', 'cashier')
    .eq('is_clinic_discount', false)
    .order('payment_date', { ascending: true })

  result.paid_in_cashier = (paidEntries ?? []).map(e => ({
    id:             (e as { id: string }).id,
    amount:         Number((e as { amount: number }).amount),
    payment_date:   (e as { payment_date: string }).payment_date,
    payment_method: (e as { payment_method: string | null }).payment_method,
  }))

  const { data: discountEntry } = await admin
    .from('financial_entries')
    .select('amount, description')
    .eq('clinic_id', clinicId)
    .eq('invoice_id', entry.invoice_id)
    .eq('is_clinic_discount', true)
    .maybeSingle()
  if (discountEntry) {
    result.clinic_discount = {
      amount:      Number((discountEntry as { amount: number }).amount),
      description: (discountEntry as { description: string }).description,
    }
  }

  // Monta mensagem pronta para o aviso na UI
  if (entry.source === 'petlove_open' && entry.is_clinic_discount === false) {
    const totalPaidInCashier = result.paid_in_cashier.reduce((s, p) => s + p.amount, 0)
    const lastPaid = result.paid_in_cashier[result.paid_in_cashier.length - 1]
    const dateBR = lastPaid ? lastPaid.payment_date.split('-').reverse().join('/') : null
    const ticketNum = entry.invoice_id.slice(0, 8).toUpperCase()
    result.message = totalPaidInCashier > 0
      ? `Aguardando repasse da PetLove · #${ticketNum} · Tutor já pagou R$ ${totalPaidInCashier.toFixed(2).replace('.', ',')} em ${dateBR}`
      : `Aguardando repasse da PetLove · #${ticketNum}`
  }

  return result
}

// ─── updateEntry ──────────────────────────────────────────────────────────────

export async function updateEntry(
  id: string,
  data: Partial<CreateEntryData>
): Promise<{ error?: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const updates: Record<string, unknown> = {}
  if (data.description          !== undefined) updates.description          = data.description.trim()
  if (data.amount               !== undefined) updates.amount               = data.amount
  if (data.discount             !== undefined) updates.discount             = data.discount ?? 0
  if (data.due_date             !== undefined) updates.due_date             = data.due_date
  if (data.issue_date           !== undefined) updates.issue_date           = data.issue_date           || null
  if (data.payment_method       !== undefined) updates.payment_method       = data.payment_method       || null
  if (data.tutor_id             !== undefined) updates.tutor_id             = data.tutor_id             || null
  if (data.patient_id           !== undefined) updates.patient_id           = data.patient_id           || null
  if (data.category             !== undefined) updates.category             = data.category             || null
  if (data.notes                !== undefined) updates.notes                = data.notes                || null
  if (data.professional_id      !== undefined) updates.professional_id      = data.professional_id      || null
  if (data.chart_of_accounts_id !== undefined) updates.chart_of_accounts_id = data.chart_of_accounts_id || null

  const admin = createAdminClient()
  const { error } = await admin
    .from('financial_entries')
    .update(updates)
    .eq('id', id)
    .eq('clinic_id', clinicId)

  if (error) return { error: 'Erro ao atualizar título: ' + error.message }
  return {}
}

// ─── deleteEntry ──────────────────────────────────────────────────────────────

export async function deleteEntry(
  id: string
): Promise<{ error?: string; requires_reversal?: true }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()

  const { data: entry } = await admin
    .from('financial_entries')
    .select('status')
    .eq('id', id)
    .eq('clinic_id', clinicId)
    .single()

  if (entry?.status === 'paid') {
    return { error: 'Título baixado. Faça o estorno antes de excluir.', requires_reversal: true }
  }

  const { error } = await admin
    .from('financial_entries')
    .delete()
    .eq('id', id)
    .eq('clinic_id', clinicId)

  if (error) return { error: 'Erro ao excluir título: ' + error.message }
  return {}
}

// REC-2026-000001 → #000001  |  null → s/nº
function fmtDocRef(docNumber: string | null): string {
  if (!docNumber) return 's/nº'
  const seq = docNumber.split('-').pop()
  return seq ? `#${seq}` : docNumber
}

// ─── reverseFinancialEntry ────────────────────────────────────────────────────

export async function reverseFinancialEntry(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    const user = await getAuthUser()
    if (!user) return { error: 'Não autenticado.' }
    const clinicId = await getClinicId()
    if (!clinicId) return { error: 'Clínica não encontrada.' }

    const admin = createAdminClient()

    const { data: entry } = await admin
      .from('financial_entries')
      .select('id, status, source, cashier_entry_id, settlement_bank_id, payment_date, amount, discount, interest, document_number')
      .eq('id', id)
      .eq('clinic_id', clinicId)
      .single()

    if (!entry) return { error: 'Título não encontrado.' }
    if (entry.status !== 'paid') return { error: 'Apenas títulos baixados podem ser estornados.' }

    const isCashierLinked = entry.source === 'cashier' && entry.cashier_entry_id
    const prevBankId      = (entry as unknown as Record<string, unknown>).settlement_bank_id as string | null
    const prevPayDate     = (entry as unknown as Record<string, unknown>).payment_date as string | null
    const entryAmount     = Number((entry as unknown as Record<string, unknown>).amount ?? 0)
    const entryDiscount   = Number((entry as unknown as Record<string, unknown>).discount ?? 0)
    const entryInterest   = Number((entry as unknown as Record<string, unknown>).interest ?? 0)
    const docNumber       = (entry as unknown as Record<string, unknown>).document_number as string | null

    const { error: updErr } = await admin
      .from('financial_entries')
      .update({
        status:             'pending',
        payment_date:       null,
        payment_method:     null,
        settlement_bank_id: null,
        interest:           0,
        updated_at:         new Date().toISOString(),
      })
      .eq('id', id)
      .eq('clinic_id', clinicId)

    if (updErr) return { error: 'Erro ao estornar título: ' + updErr.message }

    // Lança débito no extrato bancário (estorno do crédito original)
    if (prevBankId && prevPayDate) {
      const netAmount = entryAmount - entryDiscount + entryInterest
      await admin
        .from('bank_statements')
        .insert({
          clinic_id:          clinicId,
          bank_account_id:    prevBankId,
          date:               prevPayDate,
          amount:             netAmount,
          description:        `Estorno ${fmtDocRef(docNumber)}`,
          type:               'debit',
          reconciled_entry_id: id,
        })
    }

    // Reverte o lançamento no Caixa quando origem é cashier
    if (isCashierLinked) {
      await admin
        .from('central_cashier')
        .update({
          status:          'reversed',
          reversed_at:     new Date().toISOString(),
          reversed_by:     user.id,
          reversal_reason: 'Estorno via módulo Financeiro',
        })
        .eq('id', entry.cashier_entry_id)
        .neq('status', 'reversed')
    }

    return { success: true }
  } catch {
    return { error: 'Erro inesperado ao estornar.' }
  }
}

// ─── baixarTitulo ─────────────────────────────────────────────────────────────

export async function baixarTitulo(
  id: string,
  data: BaixarTituloData
): Promise<{ error?: string }> {
  if (!data.payment_date)   return { error: 'Data de recebimento obrigatória.' }
  if (!data.payment_method) return { error: 'Modalidade de recebimento obrigatória.' }

  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()

  // Lê o título completo (precisamos de mais campos para criar entry filho)
  const { data: current } = await admin
    .from('financial_entries')
    .select('amount, discount, document_number, type, description, tutor_id, patient_id, category, invoice_id, source, due_date, professional_id, chart_of_accounts_id, created_by, is_clinic_discount')
    .eq('id', id)
    .eq('clinic_id', clinicId)
    .eq('status', 'pending')
    .single()

  if (!current) return { error: 'Título não encontrado ou já baixado.' }
  const cur = current as Record<string, unknown>

  const baseAmount    = Number(cur.amount ?? 0)
  const baseDiscount  = data.discount !== undefined ? data.discount : Number(cur.discount ?? 0)
  const baseInterest  = data.interest ?? 0
  const netAmount     = baseAmount - baseDiscount + baseInterest
  const docNumber     = cur.document_number as string | null

  // Limita amount_received ao netAmount (segurança)
  const amountReceived = data.amount_received !== undefined
    ? Math.max(0, Math.min(data.amount_received, netAmount))
    : netAmount

  const isPartial = amountReceived < netAmount - 0.01

  if (isPartial) {
    // BAIXA PARCIAL: cria entry filho paid com amount_received + reduz entry
    // pai para o saldo restante (continua pending).
    const restante = netAmount - amountReceived

    // 1) Reduz o entry pai (continua pending)
    const { error: updErr } = await admin
      .from('financial_entries')
      .update({
        amount:        restante + baseDiscount - baseInterest, // mantém netAmount = restante após discount/interest
        notes:         `Saldo após baixa parcial · original ${netAmount.toFixed(2)} · recebido ${amountReceived.toFixed(2)}`,
      })
      .eq('id', id)
      .eq('clinic_id', clinicId)
    if (updErr) return { error: 'Erro ao atualizar saldo do título: ' + updErr.message }

    // 2) Cria entry filho paid com a baixa
    await admin
      .from('financial_entries')
      .insert({
        clinic_id:          clinicId,
        type:               cur.type as string,
        description:        `${cur.description} · baixa parcial`,
        amount:             amountReceived,
        discount:           0,
        interest:           0,
        due_date:           data.payment_date,
        payment_date:       data.payment_date,
        status:             'paid',
        source:             'cashier',
        category:           cur.category as string | null,
        tutor_id:           cur.tutor_id as string | null,
        patient_id:         cur.patient_id as string | null,
        invoice_id:         cur.invoice_id as string | null,
        professional_id:    cur.professional_id as string | null,
        chart_of_accounts_id: cur.chart_of_accounts_id as string | null,
        payment_method:     data.payment_method,
        settlement_bank_id: data.settlement_bank_id || null,
        notes:              `Baixa parcial de ${id}`,
        created_by:         cur.created_by as string | null,
      })

    // Lança crédito no extrato pelo valor parcial
    if (data.settlement_bank_id) {
      await admin
        .from('bank_statements')
        .insert({
          clinic_id:           clinicId,
          bank_account_id:     data.settlement_bank_id,
          date:                data.payment_date,
          amount:              amountReceived,
          description:         `Recebimento parcial ${fmtDocRef(docNumber)}`,
          type:                'credit',
          reconciled_entry_id: id,
        })
    }

    return {}
  }

  // BAIXA INTEGRAL: comportamento original
  const updates: Record<string, unknown> = {
    status:             'paid',
    payment_date:       data.payment_date,
    payment_method:     data.payment_method,
    settlement_bank_id: data.settlement_bank_id || null,
    interest:           baseInterest,
    discount:           baseDiscount,
  }

  const { error } = await admin
    .from('financial_entries')
    .update(updates)
    .eq('id', id)
    .eq('clinic_id', clinicId)
    .eq('status', 'pending')

  if (error) return { error: 'Erro ao baixar título: ' + error.message }

  // Lança crédito no extrato bancário
  if (data.settlement_bank_id) {
    await admin
      .from('bank_statements')
      .insert({
        clinic_id:           clinicId,
        bank_account_id:     data.settlement_bank_id,
        date:                data.payment_date,
        amount:              netAmount,
        description:         `Recebimento ${fmtDocRef(docNumber)}`,
        type:                'credit',
        reconciled_entry_id: id,
      })
  }

  return {}
}

// ─── getFinancialSummary ──────────────────────────────────────────────────────

export async function getFinancialSummary(
  type: EntryType
): Promise<FinancialSummary | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const now = new Date()
  const today        = toDateStr(now)
  const startOfMonth = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1))
  const endOfMonth   = toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0))

  const admin = createAdminClient()

  const [pendingRes, paidRes] = await Promise.all([
    admin
      .from('financial_entries')
      .select('amount, due_date')
      .eq('clinic_id', clinicId)
      .eq('type', type)
      .eq('status', 'pending'),
    admin
      .from('financial_entries')
      .select('amount, payment_date')
      .eq('clinic_id', clinicId)
      .eq('type', type)
      .eq('status', 'paid')
      .gte('payment_date', startOfMonth)
      .lte('payment_date', endOfMonth),
  ])

  const pending = pendingRes.data ?? []
  const paid    = paidRes.data    ?? []

  const toReceiveMonth = pending.filter(e => e.due_date >= today && e.due_date <= endOfMonth)
  const overdue        = pending.filter(e => e.due_date < today)
  const paidMonth      = paid

  return {
    toReceiveMonth:      sum(toReceiveMonth),
    toReceiveMonthCount: toReceiveMonth.length,
    overdue:             sum(overdue),
    overdueCount:        overdue.length,
    paidMonth:           sum(paidMonth),
    paidMonthCount:      paidMonth.length,
  }
}

// ─── listPaymentMethods ───────────────────────────────────────────────────────

export async function listPaymentMethods(): Promise<{ id: string; name: string; type: string }[]> {
  const clinicId = await getClinicId()
  if (!clinicId) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('payment_methods')
    .select('id, name, type')
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
    .order('name')
  return data ?? []
}

// ─── BankAccounts (G-10) ──────────────────────────────────────────────────────

export async function listBankAccounts(): Promise<BankAccount[] | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('bank_accounts')
    .select('id, clinic_id, name, bank_name, bank_code, ispb, agency, account, pix_key, is_default, balance, initial_balance, created_at')
    .eq('clinic_id', clinicId)
    .order('is_default', { ascending: false })
    .order('name')

  if (error) return { error: 'Erro ao buscar contas: ' + error.message }
  return (data ?? []) as BankAccount[]
}

export async function createBankAccount(
  data: CreateBankAccountData
): Promise<BankAccount | { error: string }> {
  if (!data.name?.trim()) return { error: 'Nome obrigatório.' }
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('bank_accounts')
    .insert({
      clinic_id:       clinicId,
      name:            data.name.trim(),
      bank_name:       data.bank_name       || null,
      bank_code:       data.bank_code       || null,
      ispb:            data.ispb            || null,
      agency:          data.agency          || null,
      account:         data.account         || null,
      pix_key:         data.pix_key         || null,
      is_default:      data.is_default      ?? false,
      initial_balance: data.initial_balance ?? 0,
    })
    .select('id, clinic_id, name, bank_name, bank_code, ispb, agency, account, pix_key, is_default, balance, initial_balance, created_at')
    .single()

  if (error) return { error: 'Erro ao criar conta: ' + error.message }
  return row as BankAccount
}

export async function updateBankAccount(
  id: string,
  data: Partial<CreateBankAccountData>
): Promise<{ error?: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const updates: Record<string, unknown> = {}
  if (data.name            !== undefined) updates.name            = data.name?.trim()
  if (data.bank_name       !== undefined) updates.bank_name       = data.bank_name       || null
  if (data.bank_code       !== undefined) updates.bank_code       = data.bank_code       || null
  if (data.ispb            !== undefined) updates.ispb            = data.ispb            || null
  if (data.agency          !== undefined) updates.agency          = data.agency          || null
  if (data.account         !== undefined) updates.account         = data.account         || null
  if (data.pix_key         !== undefined) updates.pix_key         = data.pix_key         || null
  if (data.is_default      !== undefined) updates.is_default      = data.is_default
  if (data.initial_balance !== undefined) updates.initial_balance = data.initial_balance ?? 0

  const admin = createAdminClient()
  const { error } = await admin
    .from('bank_accounts')
    .update(updates)
    .eq('id', id)
    .eq('clinic_id', clinicId)

  if (error) return { error: 'Erro ao atualizar conta: ' + error.message }
  return {}
}

export async function deleteBankAccount(id: string): Promise<{ error?: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('bank_accounts')
    .delete()
    .eq('id', id)
    .eq('clinic_id', clinicId)

  if (error) return { error: 'Erro ao excluir conta: ' + error.message }
  return {}
}

// ─── ChartOfAccounts (G-10) ───────────────────────────────────────────────────

export async function listChartOfAccounts(): Promise<ChartOfAccount[] | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('chart_of_accounts')
    .select('id, clinic_id, code, name, type, parent_id, is_system, is_active, created_at')
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
    .order('code')

  if (error) return { error: 'Erro ao buscar plano de contas: ' + error.message }
  return (data ?? []) as ChartOfAccount[]
}

export async function createChartOfAccount(
  data: CreateChartOfAccountData
): Promise<ChartOfAccount | { error: string }> {
  if (!data.code?.trim()) return { error: 'Código obrigatório.' }
  if (!data.name?.trim()) return { error: 'Nome obrigatório.' }

  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('chart_of_accounts')
    .insert({
      clinic_id: clinicId,
      code:      data.code.trim(),
      name:      data.name.trim(),
      type:      data.type,
      parent_id: data.parent_id || null,
      is_system: false,
    })
    .select('id, clinic_id, code, name, type, parent_id, is_system, is_active, created_at')
    .single()

  if (error) return { error: 'Erro ao criar conta: ' + error.message }
  return row as ChartOfAccount
}

export async function deleteChartOfAccount(id: string): Promise<{ error?: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  // Verifica se é conta do sistema
  const { data: acc } = await admin
    .from('chart_of_accounts')
    .select('is_system')
    .eq('id', id)
    .eq('clinic_id', clinicId)
    .single()

  if (acc?.is_system) return { error: 'Não é possível excluir contas do sistema.' }

  const { error } = await admin
    .from('chart_of_accounts')
    .update({ is_active: false })
    .eq('id', id)
    .eq('clinic_id', clinicId)

  if (error) return { error: 'Erro ao desativar conta: ' + error.message }
  return {}
}

// ─── CreditCards (G-10) ───────────────────────────────────────────────────────

export async function listCreditCards(): Promise<CreditCard[] | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('credit_cards')
    .select('id, clinic_id, name, administrator, brand, type, installments_max, fee_percent, days_to_receive, is_active, created_at')
    .eq('clinic_id', clinicId)
    .order('name')

  if (error) return { error: 'Erro ao buscar cartões: ' + error.message }
  return (data ?? []) as CreditCard[]
}

export async function createCreditCard(
  data: CreateCreditCardData
): Promise<CreditCard | { error: string }> {
  if (!data.name?.trim()) return { error: 'Nome obrigatório.' }
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('credit_cards')
    .insert({
      clinic_id:        clinicId,
      name:             data.name.trim(),
      administrator:    data.administrator || null,
      brand:            data.brand,
      type:             data.type,
      installments_max: data.installments_max,
      fee_percent:      data.fee_percent,
      days_to_receive:  data.days_to_receive,
    })
    .select('id, clinic_id, name, administrator, brand, type, installments_max, fee_percent, days_to_receive, is_active, created_at')
    .single()

  if (error) return { error: 'Erro ao criar cartão: ' + error.message }
  return row as CreditCard
}

export async function updateCreditCard(
  id: string,
  data: Partial<CreateCreditCardData>
): Promise<{ error?: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const updates: Record<string, unknown> = {}
  if (data.name             !== undefined) updates.name             = data.name?.trim()
  if (data.administrator    !== undefined) updates.administrator    = data.administrator || null
  if (data.brand            !== undefined) updates.brand            = data.brand
  if (data.type             !== undefined) updates.type             = data.type
  if (data.installments_max !== undefined) updates.installments_max = data.installments_max
  if (data.fee_percent      !== undefined) updates.fee_percent      = data.fee_percent
  if (data.days_to_receive  !== undefined) updates.days_to_receive  = data.days_to_receive

  const admin = createAdminClient()
  const { error } = await admin
    .from('credit_cards')
    .update(updates)
    .eq('id', id)
    .eq('clinic_id', clinicId)

  if (error) return { error: 'Erro ao atualizar cartão: ' + error.message }
  return {}
}

export async function deleteCreditCard(id: string): Promise<{ error?: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('credit_cards')
    .delete()
    .eq('id', id)
    .eq('clinic_id', clinicId)

  if (error) return { error: 'Erro ao excluir cartão: ' + error.message }
  return {}
}

// ─── Employees (G-10) ─────────────────────────────────────────────────────────

export async function listEmployees(inclueSalary = false): Promise<Employee[] | { error: string }> {
  const ctx = await getClinicIdAndRole()
  if (!ctx) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const cols = inclueSalary && ctx.role === 'admin'
    ? 'id, clinic_id, user_id, name, role, email, phone, cpf, address, hire_date, salary, pix_key, vacation_days, is_active, created_at, updated_at'
    : 'id, clinic_id, user_id, name, role, email, phone, cpf, address, hire_date, pix_key, vacation_days, is_active, created_at, updated_at'

  const { data, error } = await admin
    .from('employees')
    .select(cols)
    .eq('clinic_id', ctx.clinicId)
    .order('name')

  if (error) return { error: 'Erro ao buscar funcionários: ' + error.message }
  return (data ?? []) as unknown as Employee[]
}

export async function createEmployee(
  data: CreateEmployeeData
): Promise<Employee | { error: string }> {
  if (!data.name?.trim()) return { error: 'Nome obrigatório.' }
  const ctx = await getClinicIdAndRole()
  if (!ctx) return { error: 'Não autenticado.' }
  if (ctx.role !== 'admin') return { error: 'Apenas administradores podem criar funcionários.' }

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('employees')
    .insert({
      clinic_id:     ctx.clinicId,
      user_id:       data.user_id    || null,
      name:          data.name.trim(),
      role:          data.role       || 'other',
      email:         data.email      || null,
      phone:         data.phone      || null,
      cpf:           data.cpf        || null,
      address:       data.address    || null,
      hire_date:     data.hire_date  || null,
      salary:        data.salary     ?? null,
      pix_key:       data.pix_key    || null,
      vacation_days: data.vacation_days ?? 30,
    })
    .select('id, clinic_id, user_id, name, role, email, phone, cpf, address, hire_date, salary, pix_key, vacation_days, is_active, created_at, updated_at')
    .single()

  if (error) return { error: 'Erro ao criar funcionário: ' + error.message }
  return row as Employee
}

export async function updateEmployee(
  id: string,
  data: Partial<CreateEmployeeData>
): Promise<{ error?: string }> {
  const ctx = await getClinicIdAndRole()
  if (!ctx) return { error: 'Não autenticado.' }
  if (ctx.role !== 'admin') return { error: 'Apenas administradores podem editar funcionários.' }

  const updates: Record<string, unknown> = {}
  if (data.name          !== undefined) updates.name          = data.name?.trim()
  if (data.role          !== undefined) updates.role          = data.role
  if (data.email         !== undefined) updates.email         = data.email         || null
  if (data.phone         !== undefined) updates.phone         = data.phone         || null
  if (data.cpf           !== undefined) updates.cpf           = data.cpf           || null
  if (data.address       !== undefined) updates.address       = data.address       || null
  if (data.hire_date     !== undefined) updates.hire_date     = data.hire_date     || null
  if (data.salary        !== undefined) updates.salary        = data.salary        ?? null
  if (data.pix_key       !== undefined) updates.pix_key       = data.pix_key       || null
  if (data.vacation_days !== undefined) updates.vacation_days = data.vacation_days
  if (data.user_id       !== undefined) updates.user_id       = data.user_id       || null

  const admin = createAdminClient()
  const { error } = await admin
    .from('employees')
    .update(updates)
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)

  if (error) return { error: 'Erro ao atualizar funcionário: ' + error.message }
  return {}
}

export async function deleteEmployee(id: string): Promise<{ error?: string }> {
  const ctx = await getClinicIdAndRole()
  if (!ctx) return { error: 'Não autenticado.' }
  if (ctx.role !== 'admin') return { error: 'Apenas administradores podem excluir funcionários.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('employees')
    .update({ is_active: false })
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)

  if (error) return { error: 'Erro ao desativar funcionário: ' + error.message }
  return {}
}

export async function importEmployeesFromProfiles(): Promise<{ imported: number; error?: string }> {
  const ctx = await getClinicIdAndRole()
  if (!ctx) return { error: 'Não autenticado.', imported: 0 }
  if (ctx.role !== 'admin') return { error: 'Permissão negada.', imported: 0 }

  const admin = createAdminClient()
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, role, email, phone')
    .eq('clinic_id', ctx.clinicId)
    .eq('is_sysmax', false)
    .eq('is_active', true)

  if (!profiles?.length) return { imported: 0 }

  let imported = 0
  for (const p of profiles) {
    const { error } = await admin
      .from('employees')
      .insert({
        clinic_id: ctx.clinicId,
        user_id:   p.id,
        name:      p.full_name || 'Sem nome',
        role:      p.role      || 'other',
        email:     p.email     || null,
        phone:     p.phone     || null,
      })
      .select('id')
      .single()
    if (!error) imported++
  }

  return { imported }
}

// ─── listClinicProfiles ───────────────────────────────────────────────────────

export async function listClinicProfiles(): Promise<{ id: string; full_name: string; role: string }[]> {
  const clinicId = await getClinicId()
  if (!clinicId) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id, full_name, role')
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
    .order('full_name')
  return (data ?? []) as { id: string; full_name: string; role: string }[]
}

// ─── G-11: Types ─────────────────────────────────────────────────────────────

export interface BankStatement {
  id:                  string
  clinic_id:           string
  bank_account_id:     string
  external_id:         string | null
  date:                string
  amount:              number
  description:         string
  type:                'credit' | 'debit'
  reconciled_entry_id: string | null
  import_batch_id:     string
  imported_at:         string
}

export interface ReconciliationBatch {
  id:              string
  clinic_id:       string
  bank_account_id: string
  source:          string
  imported_at:     string
  total_records:   number
  matched_count:   number
  status:          'pending' | 'completed'
}

export interface ExtratoFilters {
  bank_account_id: string
  start_date:      string
  end_date:        string
}

export interface ExtratoResult {
  statements:    BankStatement[]
  saldo_inicial: number
  total_entradas: number
  total_saidas:   number
  saldo_final:    number
}

export interface MatchedPair {
  statement: BankStatement
  entry:     FinancialEntry
}

export interface AutoMatchResult {
  matched:              MatchedPair[]
  unmatched_imported:   BankStatement[]
  unmatched_entries:    FinancialEntry[]
}

export interface ImportStatementsData {
  bank_account_id: string
  source:          string
  statements:      Array<{
    external_id?:  string
    date:          string
    amount:        number
    description:   string
    type:          'credit' | 'debit'
  }>
}

// ─── G-11: getExtrato ─────────────────────────────────────────────────────────

export async function getExtrato(
  filters: ExtratoFilters
): Promise<ExtratoResult | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }
  if (!filters.bank_account_id) return { error: 'Conta bancária obrigatória.' }
  if (!filters.start_date || !filters.end_date) return { error: 'Período obrigatório.' }

  const admin = createAdminClient()

  // Busca lançamentos no período
  const { data, error } = await admin
    .from('bank_statements')
    .select('id, clinic_id, bank_account_id, external_id, date, amount, description, type, reconciled_entry_id, import_batch_id, imported_at')
    .eq('clinic_id', clinicId)
    .eq('bank_account_id', filters.bank_account_id)
    .gte('date', filters.start_date)
    .lte('date', filters.end_date)
    .order('date', { ascending: true })
    .order('imported_at', { ascending: true })

  if (error) return { error: 'Erro ao buscar extrato: ' + error.message }

  const statements = (data ?? []) as BankStatement[]
  const total_entradas = statements.filter(s => s.type === 'credit').reduce((acc, s) => acc + s.amount, 0)
  const total_saidas   = statements.filter(s => s.type === 'debit').reduce((acc, s) => acc + s.amount, 0)

  // Busca initial_balance + created_at do banco para aplicar a regra correta:
  //   - Se start_date < created_at do banco: banco não existia → saldo_inicial = 0
  //   - Se start_date >= created_at: aplica initial_balance + statements anteriores
  // Isso garante que meses anteriores à criação do banco não herdam o saldo inicial.
  const [prevRes, bankRes] = await Promise.all([
    admin
      .from('bank_statements')
      .select('amount, type')
      .eq('clinic_id', clinicId)
      .eq('bank_account_id', filters.bank_account_id)
      .lt('date', filters.start_date),
    admin
      .from('bank_accounts')
      .select('initial_balance, created_at')
      .eq('id', filters.bank_account_id)
      .eq('clinic_id', clinicId)
      .single(),
  ])

  // created_at é timestamptz; extrai só a parte de data (YYYY-MM-DD)
  const bankCreatedDate = bankRes.data?.created_at
    ? new Date(bankRes.data.created_at).toISOString().slice(0, 10)
    : null

  const periodStartsBeforeBankExisted = bankCreatedDate !== null && filters.start_date < bankCreatedDate

  const baseBalance  = periodStartsBeforeBankExisted ? 0 : Number(bankRes.data?.initial_balance ?? 0)
  const saldo_inicial = baseBalance + (prevRes.data ?? []).reduce((acc, s) => {
    return acc + (s.type === 'credit' ? Number(s.amount) : -Number(s.amount))
  }, 0)

  return {
    statements,
    saldo_inicial,
    total_entradas,
    total_saidas,
    saldo_final: saldo_inicial + total_entradas - total_saidas,
  }
}

// ─── G-11: importStatements ───────────────────────────────────────────────────

export async function importStatements(
  data: ImportStatementsData
): Promise<ReconciliationBatch | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }
  if (!data.bank_account_id) return { error: 'Conta bancária obrigatória.' }
  if (!data.statements?.length) return { error: 'Nenhum lançamento para importar.' }

  const admin = createAdminClient()
  const batchId = crypto.randomUUID()

  // Cria o batch
  const { data: batch, error: batchError } = await admin
    .from('reconciliation_batches')
    .insert({
      clinic_id:       clinicId,
      bank_account_id: data.bank_account_id,
      source:          data.source,
      total_records:   data.statements.length,
      matched_count:   0,
      status:          'pending',
    })
    .select('id, clinic_id, bank_account_id, source, imported_at, total_records, matched_count, status')
    .single()

  if (batchError) return { error: 'Erro ao criar lote: ' + batchError.message }

  // Insere os lançamentos
  const rows = data.statements.map(s => ({
    clinic_id:       clinicId,
    bank_account_id: data.bank_account_id,
    external_id:     s.external_id || null,
    date:            s.date,
    amount:          Math.abs(s.amount),
    description:     s.description || '',
    type:            s.type,
    import_batch_id: batch.id,
  }))

  const { error: insertError } = await admin
    .from('bank_statements')
    .insert(rows)

  if (insertError) return { error: 'Erro ao inserir lançamentos: ' + insertError.message }

  return batch as ReconciliationBatch
}

// ─── G-11: reconcileStatements (matching manual) ──────────────────────────────

export async function reconcileStatements(
  statementId: string,
  entryId: string
): Promise<{ error?: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('bank_statements')
    .update({ reconciled_entry_id: entryId })
    .eq('id', statementId)
    .eq('clinic_id', clinicId)

  if (error) return { error: 'Erro ao conciliar: ' + error.message }
  return {}
}

// ─── G-11: listBatches ────────────────────────────────────────────────────────

export async function listBatches(
  bank_account_id?: string
): Promise<ReconciliationBatch[] | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  let query = admin
    .from('reconciliation_batches')
    .select('id, clinic_id, bank_account_id, source, imported_at, total_records, matched_count, status')
    .eq('clinic_id', clinicId)
    .order('imported_at', { ascending: false })

  if (bank_account_id) query = query.eq('bank_account_id', bank_account_id)

  const { data, error } = await query.limit(50)
  if (error) return { error: 'Erro ao buscar lotes: ' + error.message }
  return (data ?? []) as ReconciliationBatch[]
}

// ─── G-11: listBatchStatements ────────────────────────────────────────────────

export async function listBatchStatements(
  batch_id: string
): Promise<BankStatement[] | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('bank_statements')
    .select('id, clinic_id, bank_account_id, external_id, date, amount, description, type, reconciled_entry_id, import_batch_id, imported_at')
    .eq('clinic_id', clinicId)
    .eq('import_batch_id', batch_id)
    .order('date', { ascending: true })

  if (error) return { error: 'Erro ao buscar lançamentos: ' + error.message }
  return (data ?? []) as BankStatement[]
}

// ─── G-11: getBBStatement (mock — plugar API real do BB Developer) ────────────

export async function getBBStatement(params: {
  account_id: string
  start_date: string
  end_date:   string
}): Promise<BankStatement[] | { error: string }> {
  // TODO: Substituir pelo client real da API BB Developer
  // Endpoint real: https://api.sandbox.bb.com.br/extrato/v2/conta-corrente
  // Autenticação: OAuth2 client_credentials com BB_CLIENT_ID e BB_CLIENT_SECRET
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  // Dados mocados simulando retorno da API do Banco do Brasil
  const mockStatements: BankStatement[] = [
    {
      id:                  crypto.randomUUID(),
      clinic_id:           clinicId,
      bank_account_id:     params.account_id,
      external_id:         'BB-2026-001',
      date:                params.start_date,
      amount:              1500.00,
      description:         'PIX RECEBIDO - TUTOR JOAO SILVA',
      type:                'credit',
      reconciled_entry_id: null,
      import_batch_id:     'mock-batch',
      imported_at:         new Date().toISOString(),
    },
    {
      id:                  crypto.randomUUID(),
      clinic_id:           clinicId,
      bank_account_id:     params.account_id,
      external_id:         'BB-2026-002',
      date:                params.start_date,
      amount:              350.00,
      description:         'DEB AUTO - FORNECEDOR VETERINARIO',
      type:                'debit',
      reconciled_entry_id: null,
      import_batch_id:     'mock-batch',
      imported_at:         new Date().toISOString(),
    },
  ]

  return mockStatements
}

// ─── G-11: autoMatch ─────────────────────────────────────────────────────────

export async function autoMatchStatements(
  batchId:        string,
  entryType:      EntryType
): Promise<AutoMatchResult | { error: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const [statementsRes, entriesRes] = await Promise.all([
    listBatchStatements(batchId),
    listEntries({ type: entryType, status: 'pending' }),
  ])

  if ('error' in statementsRes) return statementsRes
  if ('error' in entriesRes)    return entriesRes

  const result = autoMatch(statementsRes, entriesRes)
  return result
}

// ─── Private helpers ──────────────────────────────────────────────────────────

const ENTRY_SELECT = [
  '*',
  'tutors(name)',
  'patients(name)',
  'professional:profiles!professional_id(full_name)',
  'chart_account:chart_of_accounts!chart_of_accounts_id(code, name)',
  'settlement_bank:bank_accounts!settlement_bank_id(name)',
].join(', ')

function mapEntry(raw: Record<string, unknown>): FinancialEntry {
  const tutors       = raw.tutors          as { name: string }             | null
  const patients     = raw.patients        as { name: string }             | null
  const professional = raw.professional    as { full_name: string }        | null
  const chartAcc     = raw.chart_account   as { code: string; name: string } | null
  const settleBank   = raw.settlement_bank as { name: string }             | null
  return {
    id:                   raw.id                   as string,
    clinic_id:            raw.clinic_id            as string,
    type:                 raw.type                 as EntryType,
    description:          raw.description          as string,
    amount:               Number(raw.amount),
    discount:             Number(raw.discount ?? 0),
    interest:             Number(raw.interest ?? 0),
    due_date:             raw.due_date             as string,
    issue_date:           (raw.issue_date          as string | null) ?? null,
    payment_date:         (raw.payment_date        as string | null) ?? null,
    status:               raw.status               as EntryStatus,
    payment_method:       (raw.payment_method      as string | null) ?? null,
    tutor_id:             (raw.tutor_id            as string | null) ?? null,
    patient_id:           (raw.patient_id          as string | null) ?? null,
    category:             (raw.category            as string | null) ?? null,
    notes:                (raw.notes               as string | null) ?? null,
    created_by:           (raw.created_by          as string | null) ?? null,
    created_at:           raw.created_at           as string,
    updated_at:           raw.updated_at           as string,
    document_number:      (raw.document_number     as string | null) ?? null,
    professional_id:      (raw.professional_id     as string | null) ?? null,
    chart_of_accounts_id: (raw.chart_of_accounts_id as string | null) ?? null,
    settlement_bank_id:   (raw.settlement_bank_id  as string | null) ?? null,
    tutor_name:           tutors?.name             ?? null,
    patient_name:         patients?.name           ?? null,
    professional_name:    professional?.full_name  ?? null,
    chart_account_label:  chartAcc ? `${chartAcc.code} — ${chartAcc.name}` : null,
    settlement_bank_name: settleBank?.name         ?? null,
    source:               (raw.source              as EntrySource) ?? 'manual',
    cashier_entry_id:     (raw.cashier_entry_id    as string | null) ?? null,
    cashier_outflow_id:   (raw.cashier_outflow_id  as string | null) ?? null,
    invoice_id:           (raw.invoice_id          as string | null) ?? null,
    is_clinic_discount:   Boolean(raw.is_clinic_discount),
  }
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function sum(rows: { amount?: unknown }[]): number {
  return rows.reduce((acc, r) => acc + Number(r.amount ?? 0), 0)
}

// ─── G-11: autoMatch engine (pure function, tolerância ±2 dias) ──────────────

function autoMatch(
  imported: BankStatement[],
  entries:  FinancialEntry[]
): AutoMatchResult {
  const matched:            MatchedPair[]  = []
  const usedStatementIds  = new Set<string>()
  const usedEntryIds      = new Set<string>()

  for (const stmt of imported) {
    if (usedStatementIds.has(stmt.id)) continue

    const stmtDate = new Date(stmt.date)

    for (const entry of entries) {
      if (usedEntryIds.has(entry.id)) continue

      // Tolerância de valor: diferença < 0.01
      const amountMatch = Math.abs(entry.amount - stmt.amount) < 0.01

      // Tolerância de data: ±2 dias usando due_date ou payment_date
      const entryDateStr = entry.payment_date ?? entry.due_date
      const entryDate    = new Date(entryDateStr)
      const diffDays     = Math.abs((stmtDate.getTime() - entryDate.getTime()) / 86_400_000)
      const dateMatch    = diffDays <= 2

      if (amountMatch && dateMatch) {
        matched.push({ statement: stmt, entry })
        usedStatementIds.add(stmt.id)
        usedEntryIds.add(entry.id)
        break
      }
    }
  }

  const unmatched_imported = imported.filter(s => !usedStatementIds.has(s.id))
  const unmatched_entries  = entries.filter(e  => !usedEntryIds.has(e.id))

  return { matched, unmatched_imported, unmatched_entries }
}
