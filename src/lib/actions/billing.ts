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

  // Fonte primária do faturamento (Refator 2026-05-25): consultation_services
  // (n:n com snapshot de price/name no momento da seleção). clinic_catalog
  // permanece apenas como fallback de medicações que vieram de
  // applied_medications sem vínculo direto com stock_item.
  const [consultResult, servicesResult, catalogResult] = await Promise.all([
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
      .from('consultation_services')
      .select('id, stock_item_id, name_snapshot, price_snapshot, quantity, added_at_stage, stock_items ( category )')
      .eq('clinic_id', profile.clinic_id)
      .eq('consultation_id', consultationId)
      .is('cancelled_at', null)
      .order('created_at', { ascending: true }),
    admin
      .from('clinic_catalog')
      .select('item_type, name, price')
      .eq('clinic_id', profile.clinic_id)
      .eq('is_active', true),
  ])

  if (consultResult.error || !consultResult.data) return { error: 'Consulta não encontrada.' }

  const consultation = consultResult.data
  const services     = servicesResult.data ?? []
  const catalog      = catalogResult.data ?? []

  const patient = consultation.patients as any
  const tutor   = patient?.tutors as any
  if (!patient?.id || !tutor?.id) return { error: 'Paciente ou tutor não encontrado.' }

  // Guard de encerramento: sem serviços ativos a fatura iria zerada para o
  // Caixa Central. Decisão do PO: nunca permitir alta zerada.
  if (services.length === 0) {
    return {
      error: 'Nenhum serviço lançado nesta consulta. Adicione ao menos um serviço antes de encerrar o atendimento.',
    }
  }

  // Mapping stock_items.category → invoice_items.item_type (enum legacy).
  function categoryToItemType(category?: string | null): ItemType {
    if (category === 'exam') return 'exam'
    if (category === 'medication' || category === 'controlled_medication') return 'medication'
    if (category === 'vet_service' || category === 'service') return 'consultation'
    return 'other'
  }

  // Itens da fatura: 1 linha por consultation_services ativo.
  const items: Array<{
    item_type:   ItemType
    description: string
    quantity:    number
    unit_price:  number
    total_price: number
  }> = services.map((s: any) => {
    const cat   = (Array.isArray(s.stock_items) ? s.stock_items[0]?.category : s.stock_items?.category) as string | undefined
    const qty   = Number(s.quantity ?? 1)
    const unit  = Number(s.price_snapshot ?? 0)
    return {
      item_type:   categoryToItemType(cat),
      description: s.name_snapshot as string,
      quantity:    qty,
      unit_price:  unit,
      total_price: unit * qty,
    }
  })

  // Medicações aplicadas — caminho LEGADO mantido para retrocompat.
  // Quando a clínica usa hospitalization_prescriptions com stock_item_id
  // (Bloco 4 do scheduler), as medicações já caem em consultation_services
  // ou stock_movements direto. applied_medications continua coberto enquanto
  // o módulo de prescrição clínica do consultório não for migrado.
  const { data: medications } = await admin
    .from('applied_medications')
    .select('medication_name, dosage, route')
    .eq('consultation_id', consultationId)
    .eq('clinic_id', profile.clinic_id)

  for (const med of medications ?? []) {
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
  let finalItems = (items ?? []) as InvoiceItem[]

  // Fallback: invoice_items vazio mas há consultation_services ativos com preço.
  // Reidrata invoice_items a partir do snapshot — corrige invoices criadas antes
  // do refator de consultation_services ou que perderam seus items por algum bug.
  const itemsSubtotal = finalItems.reduce((s, it) => s + (Number(it.unit_price) * Number(it.quantity)), 0)
  if ((finalItems.length === 0 || itemsSubtotal < 0.005) && inv.consultation_id && Number(inv.subtotal) > 0.005) {
    const admin = createAdminClient()
    const { data: services } = await admin
      .from('consultation_services')
      .select('id, name_snapshot, price_snapshot, quantity, stock_items ( category )')
      .eq('clinic_id', profile.clinic_id)
      .eq('consultation_id', inv.consultation_id)
      .is('cancelled_at', null)
      .order('created_at', { ascending: true })

    if (services && services.length > 0) {
      type SvcRow = {
        id: string
        name_snapshot: string
        price_snapshot: number | string
        quantity: number | string
        stock_items?: { category?: string } | { category?: string }[] | null
      }
      const rows = (services as unknown as SvcRow[]).map(s => {
        const catSource = Array.isArray(s.stock_items) ? s.stock_items[0]?.category : s.stock_items?.category
        const cat = typeof catSource === 'string' ? catSource : 'service'
        const itemType: InvoiceItem['item_type'] =
          cat === 'exam' ? 'exam' :
          cat === 'medication' || cat === 'controlled_medication' ? 'medication' :
          cat === 'vet_service' || cat === 'service' ? 'consultation' :
          'other'
        const unit = Number(s.price_snapshot ?? 0)
        const qty  = Number(s.quantity ?? 1)
        return {
          invoice_id:  invoiceId,
          item_type:   itemType,
          description: s.name_snapshot,
          quantity:    qty,
          unit_price:  unit,
          total_price: unit * qty,
        }
      })

      const { data: inserted } = await admin
        .from('invoice_items')
        .insert(rows)
        .select('id, invoice_id, item_type, description, quantity, unit_price, total_price, created_at')

      if (inserted && inserted.length > 0) {
        finalItems = inserted as InvoiceItem[]
      }
    }
  }

  return {
    ...inv,
    patient: inv.patients ?? { name: '—', species: '' },
    tutor:   inv.tutors   ?? { name: '—', phone: '' },
    items:   finalItems,
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
    /**
     * Quando o método é cartão (credit/debit), obrigatório para conciliação
     * com a maquininha. Persistido em invoices.card_*.
     */
    card_details?: {
      acquirer:      string
      nsu:           string
      authorization: string
    }
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

  // ─── Snapshot do estado anterior (para rollback) ──────────────────────────
  const { data: currentInv } = await adminClient
    .from('invoices')
    .select('paid_amount, discount, total_amount, status, payment_method, paid_at')
    .eq('id', invoiceId)
    .single()
  const snapshot = {
    paid_amount:    Number((currentInv as { paid_amount?: number })?.paid_amount ?? 0),
    discount:       Number((currentInv as { discount?: number })?.discount ?? 0),
    total_amount:   Number((currentInv as { total_amount?: number })?.total_amount ?? 0),
    status:         (currentInv as { status?: string })?.status ?? 'pending',
    payment_method: (currentInv as { payment_method?: string | null })?.payment_method ?? null,
    paid_at:        (currentInv as { paid_at?: string | null })?.paid_at ?? null,
  }

  // ─── Reconcilia paid_amount com a REALIDADE das duplicatas existentes ────
  // paid_amount = soma das duplicatas paid com source='cashier' (entradas
  // efetivas de caixa). NÃO inclui is_clinic_discount (ajuste contábil).
  const { data: existingPaidEntries } = await adminClient
    .from('financial_entries')
    .select('amount')
    .eq('clinic_id', profile.clinic_id)
    .eq('invoice_id', invoiceId)
    .eq('status', 'paid')
    .eq('source', 'cashier')
    .eq('is_clinic_discount', false)
  const existingPaidAmount = (existingPaidEntries ?? []).reduce((s, e) => s + Number((e as { amount: number }).amount), 0)

  // ─── Cálculo do split desta operação ──────────────────────────────────────
  const insuranceDiscount = Math.max(0, payload.insurance_split?.clinic_discount ?? 0)
  const baseDiscount      = Math.max(0, payload.discount)
  const discount          = Math.min(baseDiscount + insuranceDiscount, subtotal)
  const total_amount      = Math.max(0, subtotal - discount)

  // Saldo ANTES desta baixa
  const balanceBefore = Math.max(0, total_amount - existingPaidAmount)
  // Quanto cai no caixa AGORA. Limitado ao saldo restante.
  const amount_received = Math.max(0, Math.min(payload.amount_received ?? balanceBefore, balanceBefore))

  const newPaidAmount = existingPaidAmount + amount_received
  const isFullyPaid = newPaidAmount >= total_amount - 0.01
  const newStatus: 'paid_partial' | 'paid' = isFullyPaid ? 'paid' : 'paid_partial'

  // ─── Update invoice ───────────────────────────────────────────────────────
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
      ...(payload.card_details ? {
        card_acquirer:      payload.card_details.acquirer.trim(),
        card_nsu:           payload.card_details.nsu.trim(),
        card_authorization: payload.card_details.authorization.trim(),
      } : {}),
    })
    .eq('id', invoiceId)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao processar pagamento: ' + error.message }

  // ─── Cria duplicata PAID desta baixa (apenas se houver entrada caixa) ────
  // IDs criados nesta operação — usados para rollback se RPC falhar.
  const createdEntryIds: string[] = []
  if (amount_received > 0.01) {
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
    if (paidEntry?.id) createdEntryIds.push(paidEntry.id)
  }

  // ─── PENDING / SPLIT: regra única — sem duplicação ────────────────────────
  // Quando há insurance_split, o pending do saldo restante É o pending Petlove
  // (source='petlove_open'). Não criar pending source='cashier' em paralelo.
  // Quando NÃO há split, o pending fica source='cashier'.
  const balanceAfter = Math.max(0, total_amount - newPaidAmount)
  const inv2 = invoice as { patient_id?: string; tutor_id?: string; patients?: { name?: string }; tutors?: { name?: string } }

  if (payload.insurance_split && payload.insurance_split.receivable_amount > 0) {
    // Apaga pending cashier antigo (caso tenha sobrado de uma chamada anterior
    // sem split) — agora o saldo é coberto pelo pending petlove.
    await adminClient
      .from('financial_entries')
      .delete()
      .eq('clinic_id', profile.clinic_id)
      .eq('invoice_id', invoiceId)
      .eq('status', 'pending')
      .eq('source', 'cashier')

    // Apaga pending petlove anterior (se houver) e recria com o saldo correto
    await adminClient
      .from('financial_entries')
      .delete()
      .eq('clinic_id', profile.clinic_id)
      .eq('invoice_id', invoiceId)
      .eq('status', 'pending')
      .eq('source', 'petlove_open')

    if (balanceAfter > 0.01) {
      const split = payload.insurance_split
      const dueDate = split.due_date ?? (() => {
        const d = new Date()
        const nextMonth = d.getMonth() === 11 ? 0 : d.getMonth() + 1
        const nextYear  = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear()
        const lastDay = new Date(nextYear, nextMonth + 1, 0).getDate()
        const day = Math.min(30, lastDay)
        return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      })()
      const description = `Petlove (em aberto) · ${split.procedure_pattern ?? 'Procedimento'} · ${inv2.patients?.name ?? '?'} (${inv2.tutors?.name ?? '?'})`
      const { data: pen } = await adminClient
        .from('financial_entries')
        .insert({
          clinic_id:          profile.clinic_id,
          type:               'receivable',
          description,
          amount:             balanceAfter,
          due_date:           dueDate,
          payment_date:       null,
          status:             'pending',
          source:             'petlove_open',
          category:           'Convênios · Petlove (em aberto)',
          tutor_id:           inv2.tutor_id ?? null,
          patient_id:         inv2.patient_id ?? null,
          invoice_id:         invoiceId,
          settlement_bank_id: null,
          notes:              `Saldo a receber Petlove · invoice ${invoiceId}. Baixado quando a remessa fechada do período chegar.`,
          created_by:         user.id,
        })
        .select('id')
        .maybeSingle()
      if (pen?.id) createdEntryIds.push(pen.id)
    }

    // ─── Desconto Convênio (is_clinic_discount=true): idempotente ──────────
    // Garante que existe APENAS UM entry de desconto para a invoice, no valor
    // atual do clinic_discount.
    const { data: existingDiscount } = await adminClient
      .from('financial_entries')
      .select('id, amount')
      .eq('clinic_id', profile.clinic_id)
      .eq('invoice_id', invoiceId)
      .eq('is_clinic_discount', true)
      .maybeSingle()

    if (payload.insurance_split.clinic_discount > 0.01) {
      if (existingDiscount) {
        await adminClient
          .from('financial_entries')
          .update({ amount: payload.insurance_split.clinic_discount, updated_at: new Date().toISOString() })
          .eq('id', existingDiscount.id)
      } else {
        const { data: disc } = await adminClient
          .from('financial_entries')
          .insert({
            clinic_id:          profile.clinic_id,
            type:               'receivable',
            description:        `Desconto Convênio · ${payload.insurance_split.procedure_pattern ?? 'Procedimento'} · ${inv2.patients?.name ?? '?'}`,
            amount:             payload.insurance_split.clinic_discount,
            due_date:           new Date().toISOString().slice(0, 10),
            payment_date:       new Date().toISOString().slice(0, 10),
            status:             'paid',
            source:             'manual',
            category:            'Ajuste · Desconto Convênio',
            tutor_id:           inv2.tutor_id ?? null,
            patient_id:         inv2.patient_id ?? null,
            invoice_id:         invoiceId,
            is_clinic_discount: true,
            notes:              `Diferença entre preço particular (${subtotal.toFixed(2)}) e total recebido pelo plano (${total_amount.toFixed(2)}).`,
            created_by:         user.id,
          })
          .select('id')
          .maybeSingle()
        if (disc?.id) createdEntryIds.push(disc.id)
      }
    } else if (existingDiscount) {
      // Cobertura removida — apaga o entry de desconto antigo
      await adminClient.from('financial_entries').delete().eq('id', existingDiscount.id)
    }
  } else {
    // SEM split: pending normal source='cashier'. Apaga pending petlove caso
    // tenha sido criado em chamada anterior com split.
    await adminClient
      .from('financial_entries')
      .delete()
      .eq('clinic_id', profile.clinic_id)
      .eq('invoice_id', invoiceId)
      .eq('status', 'pending')
      .eq('source', 'petlove_open')

    // Apaga entry de desconto convênio caso tenha sido criado em chamada anterior
    await adminClient
      .from('financial_entries')
      .delete()
      .eq('clinic_id', profile.clinic_id)
      .eq('invoice_id', invoiceId)
      .eq('is_clinic_discount', true)

    const { data: existingPending } = await adminClient
      .from('financial_entries')
      .select('id')
      .eq('clinic_id', profile.clinic_id)
      .eq('invoice_id', invoiceId)
      .eq('status', 'pending')
      .eq('source', 'cashier')
      .maybeSingle()

    if (balanceAfter > 0.01) {
      if (existingPending) {
        await adminClient
          .from('financial_entries')
          .update({ amount: balanceAfter, updated_at: new Date().toISOString() })
          .eq('id', existingPending.id)
      } else {
        const { data: pen } = await adminClient
          .from('financial_entries')
          .insert({
            clinic_id:   profile.clinic_id,
            type:        'receivable',
            description: `Saldo invoice ${invoiceId.slice(0,8)} · ${inv2.patients?.name ?? '—'}`,
            amount:      balanceAfter,
            due_date:    new Date().toISOString().slice(0, 10),
            status:      'pending',
            source:      'cashier',
            category:    'Saldo a receber',
            tutor_id:    inv2.tutor_id ?? null,
            patient_id:  inv2.patient_id ?? null,
            invoice_id:  invoiceId,
            notes:       `Saldo após baixa parcial — total ${total_amount.toFixed(2)}, recebido ${newPaidAmount.toFixed(2)}`,
            created_by:  user.id,
          })
          .select('id')
          .maybeSingle()
        if (pen?.id) createdEntryIds.push(pen.id)
      }
    } else if (existingPending) {
      await adminClient.from('financial_entries').delete().eq('id', existingPending.id)
    }
  }

  // Registrar recebimento no caixa central via RPC
  // Nota: p_session_id foi removido na migration 0128 — não passar
  const inv = invoice as any
  const patientName = inv.patients?.name ?? null
  const tutorName   = inv.tutors?.name   ?? null

  // Só registra no caixa central se houver dinheiro/PIX/cartão entrando AGORA.
  // central_cashier rejeita amount=0 pela constraint amount_not_zero — quando
  // a operação é puramente contábil (split convênio com tutor já pago em outra
  // baixa), pulamos o RPC.
  if (amount_received > 0.01) {
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
      console.error('[billing] rpc_record_invoice_payment error:', rpcErr.message)
      // ROLLBACK ATÔMICO: restaura invoice + apaga TODAS as entries criadas
      // nesta chamada (por id, não por timestamp — evita race condition).
      await supabase
        .from('invoices')
        .update({
          status:         snapshot.status,
          paid_at:        snapshot.paid_at,
          payment_method: snapshot.payment_method,
          paid_amount:    snapshot.paid_amount,
          discount:       snapshot.discount,
          total_amount:   snapshot.total_amount,
          updated_at:     new Date().toISOString(),
        })
        .eq('id', invoiceId)
        .eq('clinic_id', profile.clinic_id)
      if (createdEntryIds.length > 0) {
        await adminClient.from('financial_entries').delete().in('id', createdEntryIds)
      }
      return { error: 'Erro ao registrar no caixa: ' + rpcErr.message + '. Pagamento revertido, tente novamente.' }
    }
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

  // (As entries do split convênio agora são criadas/atualizadas ANTES do RPC,
  // no bloco principal de duplicatas — idempotente e sem leak.)

  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/reception/checkout')
  revalidatePath('/dashboard/financial')
  return { success: true }
}

// ─── processSplitPayment (split em múltiplos métodos) ─────────────────────────
//
// Quando o caixa recebe uma fatura em mais de uma forma (ex.: parte cartão +
// parte pix), chama a RPC rpc_record_split_payment que faz tudo atomicamente:
//   - cria N invoice_payment_splits
//   - cria N financial_entries paid (uma por método)
//   - cria N central_cashier recorded
//   - atualiza invoice.paid_amount + status
//
// Cada split contém os dados de cartão quando aplicável (NSU/liberação/cartão).

export interface PaymentSplitInput {
  amount:              number
  payment_method:      'pix' | 'credit' | 'debit' | 'cash' | 'voucher' | 'convenio' | 'transfer' | 'other'
  payment_card_id?:    string | null
  installments?:       number
  card_acquirer?:      string | null
  card_brand?:         string | null
  card_nsu?:           string | null
  card_authorization?: string | null
  transaction_date?:   string | null
}

export async function processSplitPayment(
  invoiceId: string,
  splits:    PaymentSplitInput[],
  options?:  { effective_date?: string; discount?: number }
): Promise<{ success: true; status: string; paid_amount: number; total_amount: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  if (splits.length === 0) return { error: 'Informe ao menos um pagamento.' }

  const admin = createAdminClient()

  // Carrega dados básicos da invoice para preencher labels do caixa
  const { data: inv } = await admin
    .from('invoices')
    .select(`
      id, status, total_amount, paid_amount, discount, consultation_id,
      patients ( name ),
      tutors   ( name ),
      consultations ( vet_id, profiles!vet_id ( full_name ) )
    `)
    .eq('id', invoiceId)
    .eq('clinic_id', profile.clinic_id)
    .single()
  if (!inv) return { error: 'Fatura não encontrada.' }
  if (inv.status === 'cancelled' || inv.status === 'paid') {
    return { error: 'Fatura já está fechada ou cancelada.' }
  }

  const patientName = (inv as any).patients?.name ?? null
  const tutorName   = (inv as any).tutors?.name   ?? null

  // Aplica desconto extra se informado
  if (options?.discount && options.discount > 0) {
    const newTotal = Math.max(0, Number(inv.total_amount) - options.discount)
    const newDiscount = Number(inv.discount ?? 0) + options.discount
    await admin
      .from('invoices')
      .update({ discount: newDiscount, total_amount: newTotal, updated_at: new Date().toISOString() })
      .eq('id', invoiceId)
  }

  const { data, error } = await supabase.rpc('rpc_record_split_payment', {
    p_clinic_id:      profile.clinic_id,
    p_invoice_id:     invoiceId,
    p_recorded_by:    user.id,
    p_patient_name:   patientName,
    p_tutor_name:     tutorName,
    p_splits:         splits.map(s => ({
      amount:             s.amount,
      payment_method:     s.payment_method,
      payment_card_id:    s.payment_card_id ?? null,
      installments:       s.installments ?? 1,
      card_acquirer:      s.card_acquirer ?? null,
      card_brand:         s.card_brand ?? null,
      card_nsu:           s.card_nsu ?? null,
      card_authorization: s.card_authorization ?? null,
      transaction_date:   s.transaction_date ?? null,
    })),
    p_effective_date: options?.effective_date ?? null,
  })

  if (error) return { error: `Erro ao processar pagamento: ${error.message}` }

  const result = data as { paid_amount: number; total_amount: number; status: string }

  // Comissão (fire-and-forget)
  const consultations = (inv as any).consultations
  const vetId   = consultations?.vet_id ?? null
  const vetName = consultations?.profiles?.full_name ?? null
  if (vetId && Number(result.total_amount) > 0) {
    import('./commissions').then(({ processAmountCommission }) => {
      processAmountCommission({
        clinic_id:         profile.clinic_id,
        professional_id:   vetId,
        professional_name: vetName ?? 'Veterinário',
        amount:            Number(result.total_amount),
        description:       `Comissão Consulta — ${patientName ?? 'Paciente'}, Data: ${new Date().toISOString().split('T')[0]} - Profissional: ${vetName ?? 'Veterinário'}`,
        date:              new Date().toISOString().split('T')[0],
        item_types:        ['all', 'service'],
      }).catch(() => {})
    })
  }

  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/reception/checkout')
  revalidatePath('/dashboard/financial')
  return {
    success:      true,
    status:       result.status,
    paid_amount:  Number(result.paid_amount),
    total_amount: Number(result.total_amount),
  }
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
