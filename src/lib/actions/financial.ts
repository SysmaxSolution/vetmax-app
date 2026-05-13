'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// ─── Types base (G-09) ────────────────────────────────────────────────────────

export type EntryType   = 'receivable' | 'payable'
export type EntryStatus = 'pending' | 'paid' | 'cancelled'

export interface FinancialEntry {
  id:             string
  clinic_id:      string
  type:           EntryType
  description:    string
  amount:         number
  due_date:       string
  payment_date:   string | null
  status:         EntryStatus
  payment_method: string | null
  tutor_id:       string | null
  patient_id:     string | null
  category:       string | null
  notes:          string | null
  created_by:     string | null
  created_at:     string
  updated_at:     string
  tutor_name:     string | null
  patient_name:   string | null
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
  type:            EntryType
  description:     string
  amount:          number
  due_date:        string
  payment_method?: string
  tutor_id?:       string
  patient_id?:     string
  category?:       string
  notes?:          string
}

// ─── Types G-10 ───────────────────────────────────────────────────────────────

export interface BankAccount {
  id:         string
  clinic_id:  string
  name:       string
  bank_name:  string | null
  bank_code:  string | null
  ispb:       string | null
  agency:     string | null
  account:    string | null
  pix_key:    string | null
  is_default: boolean
  balance:    number
  created_at: string
}

export interface CreateBankAccountData {
  name:       string
  bank_name?: string
  bank_code?: string
  ispb?:      string
  agency?:    string
  account?:   string
  pix_key?:   string
  is_default?: boolean
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
      clinic_id:      clinicId,
      type:           data.type,
      description:    data.description.trim(),
      amount:         data.amount,
      due_date:       data.due_date,
      payment_method: data.payment_method || null,
      tutor_id:       data.tutor_id       || null,
      patient_id:     data.patient_id     || null,
      category:       data.category       || null,
      notes:          data.notes          || null,
      created_by:     user.id,
      status:         'pending',
    })
    .select('*, tutors(name), patients(name)')
    .single()

  if (error) return { error: 'Erro ao criar título: ' + error.message }
  return mapEntry(entry)
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
    .select('*, tutors(name), patients(name)')
    .eq('clinic_id', clinicId)
    .eq('type', filters.type)
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
  return (data ?? []).map(mapEntry)
}

// ─── updateEntry ──────────────────────────────────────────────────────────────

export async function updateEntry(
  id: string,
  data: Partial<CreateEntryData>
): Promise<{ error?: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const updates: Record<string, unknown> = {}
  if (data.description !== undefined) updates.description = data.description.trim()
  if (data.amount       !== undefined) updates.amount      = data.amount
  if (data.due_date     !== undefined) updates.due_date    = data.due_date
  if (data.payment_method !== undefined) updates.payment_method = data.payment_method || null
  if (data.tutor_id     !== undefined) updates.tutor_id    = data.tutor_id    || null
  if (data.patient_id   !== undefined) updates.patient_id  = data.patient_id  || null
  if (data.category     !== undefined) updates.category    = data.category    || null
  if (data.notes        !== undefined) updates.notes       = data.notes       || null

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

export async function deleteEntry(id: string): Promise<{ error?: string }> {
  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('financial_entries')
    .delete()
    .eq('id', id)
    .eq('clinic_id', clinicId)

  if (error) return { error: 'Erro ao excluir título: ' + error.message }
  return {}
}

// ─── baixarTitulo ─────────────────────────────────────────────────────────────

export async function baixarTitulo(
  id: string,
  data: { payment_date: string; payment_method: string; amount?: number }
): Promise<{ error?: string }> {
  if (!data.payment_date)   return { error: 'Data de recebimento obrigatória.' }
  if (!data.payment_method) return { error: 'Modalidade de recebimento obrigatória.' }

  const clinicId = await getClinicId()
  if (!clinicId) return { error: 'Não autenticado.' }

  const updates: Record<string, unknown> = {
    status:         'paid',
    payment_date:   data.payment_date,
    payment_method: data.payment_method,
  }
  if (data.amount && data.amount > 0) updates.amount = data.amount

  const admin = createAdminClient()
  const { error } = await admin
    .from('financial_entries')
    .update(updates)
    .eq('id', id)
    .eq('clinic_id', clinicId)
    .eq('status', 'pending')

  if (error) return { error: 'Erro ao baixar título: ' + error.message }
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
    .select('id, clinic_id, name, bank_name, bank_code, ispb, agency, account, pix_key, is_default, balance, created_at')
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
      clinic_id:  clinicId,
      name:       data.name.trim(),
      bank_name:  data.bank_name  || null,
      bank_code:  data.bank_code  || null,
      ispb:       data.ispb       || null,
      agency:     data.agency     || null,
      account:    data.account    || null,
      pix_key:    data.pix_key    || null,
      is_default: data.is_default ?? false,
    })
    .select('id, clinic_id, name, bank_name, bank_code, ispb, agency, account, pix_key, is_default, balance, created_at')
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
  if (data.name       !== undefined) updates.name       = data.name?.trim()
  if (data.bank_name  !== undefined) updates.bank_name  = data.bank_name  || null
  if (data.bank_code  !== undefined) updates.bank_code  = data.bank_code  || null
  if (data.ispb       !== undefined) updates.ispb       = data.ispb       || null
  if (data.agency     !== undefined) updates.agency     = data.agency     || null
  if (data.account    !== undefined) updates.account    = data.account    || null
  if (data.pix_key    !== undefined) updates.pix_key    = data.pix_key    || null
  if (data.is_default !== undefined) updates.is_default = data.is_default

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

  // Busca saldo inicial: soma créditos - débitos anteriores ao período
  const { data: prevData } = await admin
    .from('bank_statements')
    .select('amount, type')
    .eq('clinic_id', clinicId)
    .eq('bank_account_id', filters.bank_account_id)
    .lt('date', filters.start_date)

  const saldo_inicial = (prevData ?? []).reduce((acc, s) => {
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

function mapEntry(raw: Record<string, unknown>): FinancialEntry {
  const tutors   = raw.tutors   as { name: string } | null
  const patients = raw.patients as { name: string } | null
  return {
    id:             raw.id             as string,
    clinic_id:      raw.clinic_id      as string,
    type:           raw.type           as EntryType,
    description:    raw.description    as string,
    amount:         Number(raw.amount),
    due_date:       raw.due_date       as string,
    payment_date:   (raw.payment_date  as string | null) ?? null,
    status:         raw.status         as EntryStatus,
    payment_method: (raw.payment_method as string | null) ?? null,
    tutor_id:       (raw.tutor_id      as string | null) ?? null,
    patient_id:     (raw.patient_id    as string | null) ?? null,
    category:       (raw.category      as string | null) ?? null,
    notes:          (raw.notes         as string | null) ?? null,
    created_by:     (raw.created_by    as string | null) ?? null,
    created_at:     raw.created_at     as string,
    updated_at:     raw.updated_at     as string,
    tutor_name:     tutors?.name       ?? null,
    patient_name:   patients?.name     ?? null,
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
