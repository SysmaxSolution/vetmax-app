'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// ─── Types ────────────────────────────────────────────────────────────────────

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
  // joined
  tutor_name:     string | null
  patient_name:   string | null
}

export interface FinancialSummary {
  toReceiveMonth: number   // pending + due_date dentro do mês
  overdue:        number   // pending + due_date < hoje
  paidMonth:      number   // paid + payment_date no mês corrente
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
  type:           EntryType
  description:    string
  amount:         number
  due_date:       string
  payment_method?: string
  tutor_id?:      string
  patient_id?:    string
  category?:      string
  notes?:         string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getClinicId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('clinic_id').eq('id', user.id).single()
  return data?.clinic_id ?? null
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
    .select(`*, tutors(name), patients(name)`)
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
    .select(`*, tutors(name), patients(name)`)
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
