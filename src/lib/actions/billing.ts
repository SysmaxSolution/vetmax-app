'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type InvoiceStatus  = 'pending' | 'paid_partial' | 'paid' | 'cancelled'
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
  paid_amount:     number
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
      subtotal, discount, total_amount, paid_amount, status, payment_method, paid_at, created_at,
      patients ( name, species ),
      tutors ( name, phone )
    `)
    .eq('clinic_id', profile.clinic_id)
    .in('status', ['pending', 'paid_partial'])
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
      subtotal, discount, total_amount, paid_amount, status, payment_method, paid_at, created_at,
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
    /**
     * Quanto efetivamente entrou no caixa AGORA. Quando omitido, é igual a
     * (subtotal - discount). Permite baixa parcial: o resto fica como
     * saldo pendente vinculado à invoice (campo separado).
     */
    amount_received?: number
    /**
     * Split do convênio: tutor paga parte, conveniada repassa o resto.
     * Quando presente:
     *   - clinic_discount é APLICADO como desconto adicional na invoice
     *     (representa o "desconto" que a clínica oferece ao plano)
     *   - receivable_amount cria um financial_entry pending de fonte
     *     receivable_source — depois baixado pela remessa fechada
     */
    insurance_split?: {
      receivable_amount: number
      receivable_source: 'petlove_open'
      clinic_discount:   number
      procedure_pattern?: string
      due_date?:          string
    }
  }
): Promise<{ success: true; pending_entry_id?: string } | { error: string }> {
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
      id, subtotal, status, consultation_id, patient_id, tutor_id,
      patients ( name ),
      tutors ( name ),
      consultations ( vet_id, profiles!vet_id ( full_name ) )
    `)
    .eq('id', invoiceId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (fetchErr || !invoice) return { error: 'Fatura não encontrada.' }
  if (invoice.status !== 'pending' && invoice.status !== 'paid_partial') {
    return { error: 'Esta fatura já foi processada ou cancelada.' }
  }

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

  // Carrega o estado atual da invoice (paid_amount, discount, total_amount,
  // entries existentes) — essencial para baixa parcial onde já houve baixas anteriores.
  const { data: currentInv } = await adminClient
    .from('invoices')
    .select('paid_amount, discount, total_amount')
    .eq('id', invoiceId)
    .single()
  const existingPaidAmount = Number((currentInv as { paid_amount?: number })?.paid_amount ?? 0)

  // Desconto base + desconto do convênio (se houver split aplicado).
  const insuranceDiscount = Math.max(0, payload.insurance_split?.clinic_discount ?? 0)
  const baseDiscount      = Math.max(0, payload.discount)
  const discount          = Math.min(baseDiscount + insuranceDiscount, subtotal)
  const total_amount      = Math.max(0, subtotal - discount)

  // Saldo a receber ANTES desta baixa (já considerando paid_amount anterior)
  const balanceBefore = Math.max(0, total_amount - existingPaidAmount)
  // Quanto cai no caixa AGORA. Limitado ao saldo restante.
  const amount_received = Math.max(0, Math.min(payload.amount_received ?? balanceBefore, balanceBefore))

  const newPaidAmount = existingPaidAmount + amount_received
  // Tolerância de centavo para comparações em ponto flutuante
  const isFullyPaid = newPaidAmount >= total_amount - 0.01
  const newStatus: 'paid_partial' | 'paid' = isFullyPaid ? 'paid' : 'paid_partial'

  const { error } = await supabase
    .from('invoices')
    .update({
      discount,
      total_amount,
      paid_amount:    newPaidAmount,
      status:         newStatus,
      payment_method: payload.payment_method,
      paid_at:        isFullyPaid ? new Date().toISOString() : null,
      updated_at:     new Date().toISOString(),
    })
    .eq('id', invoiceId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao processar pagamento: ' + error.message }

  // ─── Duplicata PAID: registra esta baixa como financial_entry ─────────────
  const { data: paidEntry } = await adminClient
    .from('financial_entries')
    .insert({
      clinic_id:      profile.clinic_id,
      type:           'receivable',
      description:    `Baixa invoice ${invoiceId.slice(0,8)} · ${(invoice as { patients?: { name?: string } }).patients?.name ?? '—'}`,
      amount:         amount_received,
      due_date:       new Date().toISOString().slice(0, 10),
      payment_date:   new Date().toISOString().slice(0, 10),
      status:         'paid',
      source:         'cashier',
      category:       'Recebimento de fatura',
      tutor_id:       (invoice as { tutor_id?: string }).tutor_id ?? null,
      patient_id:     (invoice as { patient_id?: string }).patient_id ?? null,
      invoice_id:     invoiceId,
      payment_method: payload.payment_method,
      notes:          `Pagamento parcial/integral · método ${payload.payment_method}`,
      created_by:     user.id,
    })
    .select('id')
    .maybeSingle()

  // ─── Duplicata PENDING: cria/atualiza o entry de saldo restante ───────────
  // Se ainda há saldo após essa baixa, mantém/atualiza um entry pending da
  // mesma invoice. Se a baixa quitou tudo, o pending anterior (se houver)
  // é zerado e marcado como liquidado.
  const balanceAfter = Math.max(0, total_amount - newPaidAmount)
  const { data: existingPending } = await adminClient
    .from('financial_entries')
    .select('id, amount')
    .eq('clinic_id', profile.clinic_id)
    .eq('invoice_id', invoiceId)
    .eq('status', 'pending')
    .eq('source', 'cashier')
    .maybeSingle()

  if (balanceAfter > 0.01) {
    if (existingPending) {
      // Reduz o pending existente para o novo saldo
      await adminClient
        .from('financial_entries')
        .update({ amount: balanceAfter, updated_at: new Date().toISOString() })
        .eq('id', existingPending.id)
    } else {
      // Cria pending para o saldo restante
      await adminClient
        .from('financial_entries')
        .insert({
          clinic_id:      profile.clinic_id,
          type:           'receivable',
          description:    `Saldo invoice ${invoiceId.slice(0,8)} · ${(invoice as { patients?: { name?: string } }).patients?.name ?? '—'}`,
          amount:         balanceAfter,
          due_date:       new Date().toISOString().slice(0, 10),
          status:         'pending',
          source:         'cashier',
          category:       'Saldo a receber',
          tutor_id:       (invoice as { tutor_id?: string }).tutor_id ?? null,
          patient_id:     (invoice as { patient_id?: string }).patient_id ?? null,
          invoice_id:     invoiceId,
          notes:          `Saldo após baixa parcial — total ${total_amount.toFixed(2)}, recebido ${newPaidAmount.toFixed(2)}`,
          created_by:     user.id,
        })
    }
  } else if (existingPending) {
    // Saldo zerou — apaga o pending residual
    await adminClient.from('financial_entries').delete().eq('id', existingPending.id)
  }

  // Registrar recebimento no caixa central via RPC
  // Nota: p_session_id foi removido na migration 0128 — não passar
  const inv = invoice as any
  const patientName = inv.patients?.name ?? null
  const tutorName   = inv.tutors?.name   ?? null

  const { error: rpcErr } = await supabase.rpc('rpc_record_invoice_payment', {
    p_clinic_id:      profile.clinic_id,
    p_invoice_id:     invoiceId,
    p_amount:         amount_received,
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

  // ─── Split do convênio: cria entry pending para o repasse Petlove ──────────
  // Será baixado automaticamente quando a remessa fechada for importada
  // (applyReconciliation casa por external_appointment_id + procedure).
  let pendingEntryId: string | undefined
  if (payload.insurance_split && payload.insurance_split.receivable_amount > 0) {
    const split = payload.insurance_split
    const inv2 = invoice as { consultation_id: string | null; patients?: { name?: string } | null; tutors?: { name?: string } | null }
    const patientNameNotes = inv2.patients?.name ?? '?'
    const tutorNameNotes   = inv2.tutors?.name   ?? '?'
    // Resolve patient_id e tutor_id via consultation
    let patientIdForEntry: string | null = null
    let tutorIdForEntry:   string | null = null
    if (inv2.consultation_id) {
      const { data: consult } = await adminClient
        .from('consultations')
        .select('patient_id, tutor_id')
        .eq('id', inv2.consultation_id)
        .maybeSingle()
      patientIdForEntry = (consult as { patient_id?: string })?.patient_id ?? null
      tutorIdForEntry   = (consult as { tutor_id?: string  })?.tutor_id   ?? null
    }
    const dueDate = split.due_date ?? (() => {
      // Próximo mês dia 30 (calendário Petlove)
      const d = new Date()
      const nextMonth = d.getMonth() === 11 ? 0 : d.getMonth() + 1
      const nextYear  = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear()
      const lastDay = new Date(nextYear, nextMonth + 1, 0).getDate()
      const day = Math.min(30, lastDay)
      return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    })()

    const description = `Petlove (em aberto) · ${split.procedure_pattern ?? 'Procedimento'} · ${patientNameNotes} (${tutorNameNotes}) · split caixa`
    const { data: fe } = await adminClient
      .from('financial_entries')
      .insert({
        clinic_id:          profile.clinic_id,
        type:               'receivable',
        description,
        amount:             split.receivable_amount,
        due_date:           dueDate,
        payment_date:       null,
        status:             'pending',
        source:             split.receivable_source,
        category:           'Convênios · Petlove (em aberto)',
        tutor_id:           tutorIdForEntry,
        patient_id:         patientIdForEntry,
        invoice_id:         invoiceId,
        settlement_bank_id: null,
        notes:              `Split do caixa · invoice ${invoiceId}. Será baixado quando a remessa fechada do período chegar.`,
        created_by:         user.id,
      })
      .select('id')
      .maybeSingle()
    pendingEntryId = fe?.id

    // Entry de "Desconto Convênio" — ajuste contábil que NÃO aparece como
    // duplicata de saldo a receber (is_clinic_discount=true). Documenta a
    // diferença entre o preço cheio e o que a clínica vai receber.
    if (split.clinic_discount > 0.01) {
      await adminClient
        .from('financial_entries')
        .insert({
          clinic_id:           profile.clinic_id,
          type:                'receivable',
          description:         `Desconto Convênio · ${split.procedure_pattern ?? 'Procedimento'} · ${patientNameNotes}`,
          amount:              split.clinic_discount,
          due_date:            new Date().toISOString().slice(0, 10),
          payment_date:        new Date().toISOString().slice(0, 10),
          status:              'paid',
          source:              'manual',
          category:            'Ajuste · Desconto Convênio',
          tutor_id:            tutorIdForEntry,
          patient_id:          patientIdForEntry,
          invoice_id:          invoiceId,
          is_clinic_discount:  true,
          notes:               `Diferença entre preço particular e total recebido pelo plano. Invoice ${invoiceId}.`,
          created_by:          user.id,
        })
    }
  }

  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/reception/checkout')
  revalidatePath('/dashboard/financial')
  return { success: true, pending_entry_id: pendingEntryId }
}

// ─── reversePartialPayment ────────────────────────────────────────────────────
//
// Estorna uma baixa específica (financial_entry paid). Soma o valor de volta
// no entry pending da mesma invoice (ou recria se foi consumido) e ajusta o
// invoice.paid_amount + status.
//
// Exemplo: invoice R$ 150 com baixa de R$ 30 (status=paid_partial).
//   reversePartialPayment(entry_id_da_baixa_30):
//     - apaga financial_entry paid(30)
//     - soma 30 no pending existente (que era 120 → vira 150)
//     - paid_amount: 30 → 0
//     - status: paid_partial → pending
// Volta a aparecer no caixa para recebimento.

export async function reversePartialPayment(
  entryId: string,
): Promise<{ success: true; invoice_status: string; remaining_balance: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  if (!['admin', 'owner', 'manager'].includes(profile.role)) {
    return { error: 'Apenas admin/gerente pode estornar pagamentos.' }
  }

  const adminClient = createAdminClient()

  // 1) Carrega a baixa
  const { data: entry, error: entryErr } = await adminClient
    .from('financial_entries')
    .select('id, invoice_id, amount, status, source, is_clinic_discount')
    .eq('id', entryId)
    .eq('clinic_id', profile.clinic_id)
    .single()
  if (entryErr || !entry) return { error: 'Lançamento não encontrado.' }
  if (entry.status !== 'paid') return { error: 'Apenas lançamentos pagos podem ser estornados.' }
  if (entry.is_clinic_discount) return { error: 'Descontos de convênio não podem ser estornados isoladamente — estorne a invoice completa.' }
  if (!entry.invoice_id) return { error: 'Lançamento sem vínculo de invoice — use o estorno tradicional.' }

  const amount = Number(entry.amount)

  // 2) Carrega a invoice
  const { data: invoice } = await adminClient
    .from('invoices')
    .select('id, total_amount, paid_amount, status, patient_id, tutor_id, patients(name)')
    .eq('id', entry.invoice_id)
    .eq('clinic_id', profile.clinic_id)
    .single()
  if (!invoice) return { error: 'Invoice não encontrada.' }

  // 3) Apaga a baixa
  const { error: delErr } = await adminClient
    .from('financial_entries')
    .delete()
    .eq('id', entryId)
  if (delErr) return { error: `Falha ao estornar: ${delErr.message}` }

  // 4) Soma o valor de volta no pending existente (ou cria)
  const { data: existingPending } = await adminClient
    .from('financial_entries')
    .select('id, amount')
    .eq('clinic_id', profile.clinic_id)
    .eq('invoice_id', entry.invoice_id)
    .eq('status', 'pending')
    .eq('source', 'cashier')
    .maybeSingle()

  const newPaidAmount = Math.max(0, Number((invoice as { paid_amount?: number }).paid_amount ?? 0) - amount)
  const newBalance    = Math.max(0, Number((invoice as { total_amount?: number }).total_amount ?? 0) - newPaidAmount)
  const newStatus: 'pending' | 'paid_partial' = newPaidAmount > 0.01 ? 'paid_partial' : 'pending'

  if (existingPending) {
    await adminClient
      .from('financial_entries')
      .update({ amount: Number(existingPending.amount) + amount, updated_at: new Date().toISOString() })
      .eq('id', existingPending.id)
  } else {
    const patName = ((invoice as { patients?: { name?: string } | { name?: string }[] }).patients)
    const pn = Array.isArray(patName) ? patName[0]?.name : patName?.name
    await adminClient
      .from('financial_entries')
      .insert({
        clinic_id:   profile.clinic_id,
        type:        'receivable',
        description: `Saldo invoice ${entry.invoice_id.slice(0,8)} · ${pn ?? '—'} (estornado)`,
        amount:      newBalance,
        due_date:    new Date().toISOString().slice(0, 10),
        status:      'pending',
        source:      'cashier',
        category:    'Saldo a receber',
        tutor_id:    (invoice as { tutor_id?: string }).tutor_id ?? null,
        patient_id:  (invoice as { patient_id?: string }).patient_id ?? null,
        invoice_id:  entry.invoice_id,
        notes:       `Estorno de baixa anterior. Saldo voltou ao recebimento.`,
        created_by:  user.id,
      })
  }

  // 5) Atualiza invoice
  await adminClient
    .from('invoices')
    .update({
      paid_amount: newPaidAmount,
      status:      newStatus,
      paid_at:     newStatus === 'pending' ? null : (invoice as { paid_at?: string | null }).paid_at ?? null,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', entry.invoice_id)
    .eq('clinic_id', profile.clinic_id)

  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/financial')
  return { success: true, invoice_status: newStatus, remaining_balance: newBalance }
}

// ─── listInvoiceDuplicatas ────────────────────────────────────────────────────
// Lista as duplicatas (financial_entries) vinculadas a uma invoice — usado para
// exibir histórico de baixas + saldo restante na UI.

export interface InvoiceDuplicata {
  id:                  string
  amount:              number
  status:              'pending' | 'paid' | 'cancelled'
  source:              string
  payment_method:      string | null
  payment_date:        string | null
  due_date:            string
  description:         string
  is_clinic_discount:  boolean
  created_at:          string
}

export async function listInvoiceDuplicatas(
  invoiceId: string,
): Promise<InvoiceDuplicata[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data, error } = await admin
    .from('financial_entries')
    .select('id, amount, status, source, payment_method, payment_date, due_date, description, is_clinic_discount, created_at')
    .eq('clinic_id', profile.clinic_id)
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: true })

  if (error) return { error: error.message }
  return (data ?? []) as InvoiceDuplicata[]
}
