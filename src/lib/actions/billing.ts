'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type InvoiceStatus  = 'pending' | 'paid' | 'cancelled'
export type PaymentMethod  = 'pix' | 'credit' | 'debit' | 'cash'
export type ItemType       = 'consultation' | 'medication' | 'exam' | 'other'

export interface InvoiceItem {
  id:          string
  invoice_id:  string
  item_type:   ItemType
  description: string
  quantity:    number
  unit_price:  number
  total_price: number
  created_at:  string
}

export interface Invoice {
  id:              string
  clinic_id:       string
  consultation_id: string
  patient_id:      string
  tutor_id:        string
  subtotal:        number
  discount:        number
  total_amount:    number
  status:          InvoiceStatus
  payment_method:  PaymentMethod | null
  paid_at:         string | null
  created_at:      string
}

export interface InvoiceWithDetails extends Invoice {
  patient: { name: string; species: string }
  tutor:   { name: string; phone: string }
  items:   InvoiceItem[]
}

// ─── Helper: normaliza nome para matching ─────────────────────────────────────

function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

// ─── Gerar Fatura (chamada automática ao dar alta) ────────────────────────────

export async function generateInvoice(
  consultationId: string
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const admin = createAdminClient()

  // Idempotente: se já existe fatura, retorna o ID
  const { data: existing } = await admin
    .from('invoices')
    .select('id')
    .eq('consultation_id', consultationId)
    .maybeSingle()
  if (existing) return { id: existing.id }

  // Buscar consulta com paciente e tutor + catálogo de preços em paralelo
  const [consultResult, catalogResult] = await Promise.all([
    admin
      .from('consultations')
      .select(`
        id, visit_reason,
        patients ( id, name, species,
          tutors ( id, name, phone )
        )
      `)
      .eq('id', consultationId)
      .single(),
    admin
      .from('clinic_catalog')
      .select('item_type, name, price')
      .eq('clinic_id', profile.clinic_id)
      .eq('is_active', true),
  ])

  if (consultResult.error || !consultResult.data) return { error: 'Consulta não encontrada.' }

  const consultation = consultResult.data
  const catalog      = catalogResult.data ?? []

  const patient = consultation.patients as any
  const tutor   = patient?.tutors as any
  if (!patient?.id || !tutor?.id) return { error: 'Paciente ou tutor não encontrado.' }

  // Preço da consulta — primeiro item do catálogo com item_type='consultation'
  const catalogConsult = catalog.find(c => c.item_type === 'consultation')
  const priceConsult   = catalogConsult?.price ?? 0

  // Buscar medicações aplicadas
  const { data: medications } = await admin
    .from('applied_medications')
    .select('medication_name, dosage, route')
    .eq('consultation_id', consultationId)
    .eq('clinic_id', profile.clinic_id)

  // Montar itens da fatura
  const items: Array<{
    item_type:   ItemType
    description: string
    quantity:    number
    unit_price:  number
    total_price: number
  }> = [
    {
      item_type:   'consultation',
      description: catalogConsult?.name ?? 'Consulta Veterinária',
      quantity:    1,
      unit_price:  priceConsult,
      total_price: priceConsult,
    },
  ]

  for (const med of medications ?? []) {
    // Buscar no catálogo pelo nome (case-insensitive, sem acentos)
    const medKey     = normalizeName(med.medication_name)
    const catalogMed = catalog.find(
      c => c.item_type === 'medication' && normalizeName(c.name) === medKey
    )
    const priceMed = catalogMed?.price ?? 0

    const desc = [med.medication_name, med.dosage, med.route].filter(Boolean).join(' · ')
    items.push({
      item_type:   'medication',
      description: desc,
      quantity:    1,
      unit_price:  priceMed,
      total_price: priceMed,
    })
  }

  const subtotal     = items.reduce((sum, it) => sum + it.total_price, 0)
  const total_amount = subtotal

  // Criar fatura
  const { data: invoice, error: invErr } = await admin
    .from('invoices')
    .insert({
      clinic_id:       profile.clinic_id,
      consultation_id: consultationId,
      patient_id:      patient.id,
      tutor_id:        tutor.id,
      subtotal,
      discount:        0,
      total_amount,
      status:          'pending',
    })
    .select('id')
    .single()

  if (invErr || !invoice) return { error: 'Erro ao criar fatura: ' + (invErr?.message ?? '') }

  // Inserir itens
  await admin
    .from('invoice_items')
    .insert(items.map(it => ({ ...it, invoice_id: invoice.id })))

  // Cria entrada PENDENTE no Caixa Central (aparece antes do pagamento ser confirmado)
  if (total_amount > 0) {
    await admin
      .from('central_cashier')
      .insert({
        clinic_id:     profile.clinic_id,
        source_module: 'consultation',
        source_id:     invoice.id,
        amount:        total_amount,
        status:        'pending',
        reason:        `Consulta — ${patient.name}`,
        patient_name:  patient.name,
        tutor_name:    tutor?.name ?? null,
        recorded_by:   user.id,
      })
      // Idempotente: ignora se já existe para este invoice
      .select('id')
      .maybeSingle()
  }

  revalidatePath('/dashboard/reception/checkout')
  return { id: invoice.id }
}

// ─── Listar Faturas Pendentes ─────────────────────────────────────────────────

export async function getPendingInvoices(): Promise<InvoiceWithDetails[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data, error } = await supabase
    .from('invoices')
    .select(`
      id, clinic_id, consultation_id, patient_id, tutor_id,
      subtotal, discount, total_amount, status, payment_method, paid_at, created_at,
      patients ( name, species ),
      tutors ( name, phone )
    `)
    .eq('clinic_id', profile.clinic_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) return { error: 'Erro ao buscar faturas: ' + error.message }

  return (data ?? []).map((row: any) => ({
    ...row,
    patient: row.patients ?? { name: '—', species: '' },
    tutor:   row.tutors   ?? { name: '—', phone: '' },
    items:   [],
  })) as InvoiceWithDetails[]
}

// ─── Buscar Fatura com Itens (para o modal) ───────────────────────────────────

export async function getInvoiceWithItems(
  invoiceId: string
): Promise<InvoiceWithDetails | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select(`
      id, clinic_id, consultation_id, patient_id, tutor_id,
      subtotal, discount, total_amount, status, payment_method, paid_at, created_at,
      patients ( name, species ),
      tutors ( name, phone )
    `)
    .eq('id', invoiceId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (error || !invoice) return { error: 'Fatura não encontrada.' }

  const { data: items } = await supabase
    .from('invoice_items')
    .select('id, invoice_id, item_type, description, quantity, unit_price, total_price, created_at')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: true })

  const inv = invoice as any
  return {
    ...inv,
    patient: inv.patients ?? { name: '—', species: '' },
    tutor:   inv.tutors   ?? { name: '—', phone: '' },
    items:   (items ?? []) as InvoiceItem[],
  } as InvoiceWithDetails
}

// ─── Processar Pagamento ──────────────────────────────────────────────────────

export async function processPayment(
  invoiceId: string,
  payload: {
    payment_method:  PaymentMethod
    discount:        number
    item_prices?:    { id: string; unit_price: number }[]  // overrides editados no caixa
  }
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const adminClient = createAdminClient()

  // Buscar fatura com dados do paciente/tutor e vet da consulta para comissão
  const { data: invoice, error: fetchErr } = await supabase
    .from('invoices')
    .select(`
      id, subtotal, status, consultation_id,
      patients ( name ),
      tutors ( name ),
      consultations ( vet_id, profiles!vet_id ( full_name ) )
    `)
    .eq('id', invoiceId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (fetchErr || !invoice) return { error: 'Fatura não encontrada.' }
  if (invoice.status !== 'pending') return { error: 'Esta fatura já foi processada.' }

  // Se há overrides de preço, atualizar os itens e recalcular subtotal
  let subtotal = invoice.subtotal
  if (payload.item_prices && payload.item_prices.length > 0) {
    for (const override of payload.item_prices) {
      const price = Math.max(0, override.unit_price)
      await adminClient
        .from('invoice_items')
        .update({ unit_price: price, total_price: price })
        .eq('id', override.id)
        .eq('invoice_id', invoiceId)
    }
    // Recalcular subtotal a partir dos itens atualizados
    const { data: updatedItems } = await adminClient
      .from('invoice_items')
      .select('total_price')
      .eq('invoice_id', invoiceId)
    subtotal = (updatedItems ?? []).reduce((s, it) => s + (it.total_price ?? 0), 0)
    await adminClient
      .from('invoices')
      .update({ subtotal })
      .eq('id', invoiceId)
  }

  const discount     = Math.max(0, Math.min(payload.discount, subtotal))
  const total_amount = Math.max(0, subtotal - discount)

  const { error } = await supabase
    .from('invoices')
    .update({
      discount,
      total_amount,
      status:         'paid',
      payment_method: payload.payment_method,
      paid_at:        new Date().toISOString(),
      updated_at:     new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao processar pagamento: ' + error.message }

  // Registrar recebimento no caixa central via RPC
  // Nota: p_session_id foi removido na migration 0128 — não passar
  const inv = invoice as any
  const patientName = inv.patients?.name ?? null
  const tutorName   = inv.tutors?.name   ?? null

  const { error: rpcErr } = await supabase.rpc('rpc_record_invoice_payment', {
    p_clinic_id:      profile.clinic_id,
    p_invoice_id:     invoiceId,
    p_amount:         total_amount,
    p_payment_method: payload.payment_method,
    p_patient_name:   patientName,
    p_tutor_name:     tutorName,
    p_recorded_by:    user.id,
  })

  if (rpcErr) {
    // Rollback: a invoice não pode ficar 'paid' se o caixa não registrou o
    // recebimento — isso gera o bug "invoice fantasma" (paid sem caixa ativo),
    // invisível na aba Recebimentos e impossível de re-baixar.
    console.error('[billing] rpc_record_invoice_payment error:', rpcErr.message)
    await supabase
      .from('invoices')
      .update({
        status:         'pending',
        paid_at:        null,
        payment_method: null,
        updated_at:     new Date().toISOString(),
      })
      .eq('id', invoiceId)
      .eq('clinic_id', profile.clinic_id)
    return { error: 'Erro ao registrar no caixa: ' + rpcErr.message + '. Pagamento revertido, tente novamente.' }
  }

  // Comissão automática do veterinário (fire-and-forget)
  const invAny = invoice as any
  const vetId   = invAny.consultations?.vet_id ?? null
  const vetName = invAny.consultations?.profiles?.full_name ?? null
  if (vetId && total_amount > 0) {
    import('./commissions').then(({ processAmountCommission }) => {
      processAmountCommission({
        clinic_id:         profile.clinic_id,
        professional_id:   vetId,
        professional_name: vetName ?? 'Veterinário',
        amount:            total_amount,
        description:       `Comissão Consulta — ${invAny.patients?.name ?? 'Paciente'}, Data: ${new Date().toISOString().split('T')[0]} - Profissional: ${vetName ?? 'Veterinário'}`,
        date:              new Date().toISOString().split('T')[0],
        item_types:        ['all', 'service'],
      }).catch(() => {})
    })
  }

  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/reception/checkout')
  return { success: true }
}
