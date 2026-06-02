'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { logAudit } from '@/lib/actions/audit'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface ServiceItem {
  id:            string
  name:          string
  category:      string
  unit:          string
  unit_price:    number
  sku:           string | null
  barcode:       string | null
  is_controlled: boolean
  is_service:    boolean
  quantity:      number
}

export type ConsultationStage = 'reception' | 'triage' | 'vet' | 'checkout'

export interface ConsultationServiceLine {
  id:              string
  consultation_id: string
  stock_item_id:   string
  name_snapshot:   string
  price_snapshot:  number
  quantity:        number
  added_at_stage:  ConsultationStage
  added_by:        string | null
  cancelled_at:    string | null
  cancelled_by:    string | null
  cancel_reason:   string | null
  created_at:      string
  // Split convênio (Item 5, 2026-06-02). Preenchidos quando o pet tem
  // convênio ativo no momento da inclusão OU quando o vet edita inline.
  // null = serviço particular OU pet sem convênio.
  insurance_total_snapshot: number | null
  copay_snapshot:           number | null
  repass_snapshot:          number | null
}

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function getClinicCtx(): Promise<{ clinicId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id, userId: user.id }
}

// ─── searchServices: catálogo dinâmico para a Recepção ──────────────────────

/**
 * Busca serviços (stock_items.is_service=TRUE) por nome/SKU/barcode.
 *
 * Substitui o seletor fixo de "motivo da visita" no Check-in. Retorna ATÉ
 * 20 resultados, ordenados por nome. Quando `query` < 2 chars, devolve os
 * 20 primeiros (browse mode).
 */
export async function searchServices(query: string): Promise<ServiceItem[] | { error: string }> {
  const ctx = await getClinicCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  let qb = admin
    .from('stock_items')
    .select('id, name, category, unit, unit_price, sku, barcode, is_controlled, is_service, quantity')
    .eq('clinic_id', ctx.clinicId)
    .eq('is_service', true)
    .order('name', { ascending: true })
    .limit(20)

  const trimmed = (query ?? '').trim()
  if (trimmed.length >= 2) {
    const pat = `%${trimmed}%`
    qb = qb.or(`name.ilike.${pat},sku.ilike.${pat},barcode.ilike.${pat}`)
  }

  const { data, error } = await qb
  if (error) return { error: error.message }
  return (data ?? []).map((row): ServiceItem => ({
    id:            row.id as string,
    name:          row.name as string,
    category:      row.category as string,
    unit:          row.unit as string,
    unit_price:    Number(row.unit_price ?? 0),
    sku:           (row.sku as string | null) ?? null,
    barcode:       (row.barcode as string | null) ?? null,
    is_controlled: Boolean(row.is_controlled),
    is_service:    Boolean(row.is_service),
    quantity:      Number(row.quantity ?? 0),
  }))
}

// ─── consultation_services CRUD ──────────────────────────────────────────────

export interface AddServicePayload {
  consultation_id: string
  stock_item_id:   string
  quantity?:       number
  /** Em qual etapa foi lançado (default 'reception'). */
  added_at_stage?: ConsultationStage
  /** Sobrescreve o snapshot — usado em ajustes manuais; default = preço atual do item. */
  price_override?: number | null
}

/**
 * Adiciona um serviço à consulta capturando snapshot de nome+preço atual do
 * stock_item. NÃO valida estoque (serviços têm quantity opcional).
 */
export async function addServiceToConsultation(
  payload: AddServicePayload,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getClinicCtx()
  if ('error' in ctx) return ctx

  if (!payload.consultation_id) return { error: 'consultation_id obrigatório.' }
  if (!payload.stock_item_id)   return { error: 'stock_item_id obrigatório.' }

  const admin = createAdminClient()

  // Snapshot do item: clinic_id + isolated
  const { data: item } = await admin
    .from('stock_items')
    .select('id, name, unit_price, clinic_id')
    .eq('id', payload.stock_item_id)
    .eq('clinic_id', ctx.clinicId)
    .single()
  if (!item) return { error: 'Item não encontrado na clínica.' }

  // Busca patient_id para resolver pricing com split convênio (Item 5, 2026-06-02).
  const { data: consult } = await admin
    .from('consultations')
    .select('patient_id')
    .eq('id', payload.consultation_id)
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle()

  // Resolve split copay/repass quando pet tem convênio. Sem convênio = particular puro.
  // Override manual (price_override) tem prioridade absoluta sobre tudo.
  let price: number
  let insurance_total_snapshot: number | null = null
  let copay_snapshot:           number | null = null
  let repass_snapshot:          number | null = null

  if (payload.price_override !== undefined && payload.price_override !== null) {
    price = payload.price_override
  } else if (consult?.patient_id) {
    const { resolveServicePricing } = await import('@/lib/actions/insurance-pricing')
    const pricing = await resolveServicePricing(consult.patient_id, payload.stock_item_id)
    if ('error' in pricing) {
      price = Number(item.unit_price ?? 0)
    } else if (pricing.insurance && pricing.insurance.source === 'custom') {
      // Split completo cadastrado: respeita o total do convênio
      price = pricing.insurance.total
      insurance_total_snapshot = pricing.insurance.total
      copay_snapshot           = pricing.insurance.copay
      repass_snapshot          = pricing.insurance.repass
    } else if (pricing.insurance && pricing.insurance.source === 'default') {
      // Default cadastrado no serviço, mas split não — total já vai com default,
      // copay/repass ficam null aguardando vet preencher no consultório
      price = pricing.insurance.total
      insurance_total_snapshot = pricing.insurance.total
    } else {
      // Sem split cadastrado: particular puro (fallback decidido pelo PO)
      price = pricing.unit_price
    }
  } else {
    price = Number(item.unit_price ?? 0)
  }

  const { data, error } = await admin
    .from('consultation_services')
    .insert({
      clinic_id:                ctx.clinicId,
      consultation_id:          payload.consultation_id,
      stock_item_id:            payload.stock_item_id,
      name_snapshot:            item.name as string,
      price_snapshot:           price,
      quantity:                 payload.quantity ?? 1,
      added_at_stage:           payload.added_at_stage ?? 'reception',
      added_by:                 ctx.userId,
      insurance_total_snapshot,
      copay_snapshot,
      repass_snapshot,
    })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao adicionar serviço: ' + error.message }

  // Auditoria CFMV — quem lançou o serviço, quando, com que preço/qty/stage.
  await logAudit({
    action:      'CONSULTATION_SERVICE_ADD',
    entity_type: 'consultations',
    entity_id:   payload.consultation_id,
    details: {
      service_line_id: data.id,
      stock_item_id:   payload.stock_item_id,
      name:            item.name,
      price_snapshot:  price,
      quantity:        payload.quantity ?? 1,
      added_at_stage:  payload.added_at_stage ?? 'reception',
    },
  })

  revalidatePath('/dashboard/reception')
  revalidatePath('/dashboard/vet')
  return { id: data.id as string }
}

/**
 * Cancela um service line (não deleta — preserva auditoria). Visível só
 * em queries que ignoram cancelled_at.
 */
export async function cancelConsultationService(
  serviceLineId: string,
  reason?: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()

  // Snapshot pré-cancelamento para incluir no audit_log (consultation_id +
  // dados do serviço cancelado).
  const { data: lineBefore } = await admin
    .from('consultation_services')
    .select('consultation_id, stock_item_id, name_snapshot, price_snapshot, quantity')
    .eq('id', serviceLineId)
    .eq('clinic_id', ctx.clinicId)
    .single()

  const { error } = await admin
    .from('consultation_services')
    .update({
      cancelled_at:  new Date().toISOString(),
      cancelled_by:  ctx.userId,
      cancel_reason: reason?.trim() || null,
    })
    .eq('id', serviceLineId)
    .eq('clinic_id', ctx.clinicId)
    .is('cancelled_at', null)   // não re-cancela

  if (error) return { error: error.message }

  if (lineBefore) {
    await logAudit({
      action:      'CONSULTATION_SERVICE_REMOVE',
      entity_type: 'consultations',
      entity_id:   lineBefore.consultation_id as string,
      details: {
        service_line_id: serviceLineId,
        stock_item_id:   lineBefore.stock_item_id,
        name:            lineBefore.name_snapshot,
        price_snapshot:  Number(lineBefore.price_snapshot ?? 0),
        quantity:        Number(lineBefore.quantity ?? 1),
        cancel_reason:   reason?.trim() || null,
      },
    })
  }

  revalidatePath('/dashboard/reception')
  revalidatePath('/dashboard/vet')
  return { success: true }
}

/**
 * Lista serviços ativos (não cancelados) de uma consulta.
 */
export async function listConsultationServices(
  consultationId: string,
): Promise<ConsultationServiceLine[] | { error: string }> {
  const ctx = await getClinicCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('consultation_services')
    .select('id, consultation_id, stock_item_id, name_snapshot, price_snapshot, quantity, added_at_stage, added_by, cancelled_at, cancelled_by, cancel_reason, created_at, insurance_total_snapshot, copay_snapshot, repass_snapshot')
    .eq('clinic_id', ctx.clinicId)
    .eq('consultation_id', consultationId)
    .order('created_at', { ascending: true })

  if (error) return { error: error.message }
  return (data ?? []).map((row): ConsultationServiceLine => ({
    id:              row.id as string,
    consultation_id: row.consultation_id as string,
    stock_item_id:   row.stock_item_id as string,
    name_snapshot:   row.name_snapshot as string,
    price_snapshot:  Number(row.price_snapshot ?? 0),
    quantity:        Number(row.quantity ?? 1),
    added_at_stage:  row.added_at_stage as ConsultationStage,
    added_by:        (row.added_by as string | null) ?? null,
    cancelled_at:    (row.cancelled_at as string | null) ?? null,
    cancelled_by:    (row.cancelled_by as string | null) ?? null,
    cancel_reason:   (row.cancel_reason as string | null) ?? null,
    created_at:      row.created_at as string,
    insurance_total_snapshot: row.insurance_total_snapshot === null || row.insurance_total_snapshot === undefined ? null : Number(row.insurance_total_snapshot),
    copay_snapshot:           row.copay_snapshot           === null || row.copay_snapshot           === undefined ? null : Number(row.copay_snapshot),
    repass_snapshot:          row.repass_snapshot          === null || row.repass_snapshot          === undefined ? null : Number(row.repass_snapshot),
  }))
}

/**
 * Verifica se a consulta tem ao menos um serviço ATIVO (não cancelado).
 * Usado pelo guard de "encerrar atendimento" — bloqueia alta quando vazio,
 * conforme decisão do PO (caixa central nunca pode receber consulta zerada).
 */
export async function hasActiveConsultationService(
  consultationId: string,
): Promise<{ has: boolean } | { error: string }> {
  const ctx = await getClinicCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { count, error } = await admin
    .from('consultation_services')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', ctx.clinicId)
    .eq('consultation_id', consultationId)
    .is('cancelled_at', null)

  if (error) return { error: error.message }
  return { has: (count ?? 0) > 0 }
}

/**
 * Soma total snapshot da consulta (preço atual * quantidade, somando linhas ativas).
 * Usado pelo Caixa Central para checkout.
 */
export async function getConsultationServicesTotal(
  consultationId: string,
): Promise<{ total: number; count: number } | { error: string }> {
  const lines = await listConsultationServices(consultationId)
  if ('error' in lines) return lines
  const active = lines.filter(l => l.cancelled_at === null)
  const total  = active.reduce((sum, l) => sum + l.price_snapshot * l.quantity, 0)
  return { total, count: active.length }
}

// ─── Cadastro rápido inline (Sprint 2026-05-30) ──────────────────────────────

/**
 * Cria um item (serviço ou produto) direto do fluxo da recepção e retorna
 * já no formato ServiceItem para que o caller possa adicioná-lo ao carrinho
 * sem refazer busca. Não cria lote FIFO de produto: nascem com saldo 0.
 *
 * Defaults pensados para o cenário recepcionista: is_service=true, category
 * 'vet_service', unit 'un'. PO pode trocar antes de salvar.
 */
export async function createQuickService(input: {
  name:        string
  unit_price:  number
  category?:   string
  unit?:       string
  is_service?: boolean
}): Promise<ServiceItem | { error: string }> {
  const ctx = await getClinicCtx()
  if ('error' in ctx) return ctx

  const name = (input.name ?? '').trim()
  if (!name)              return { error: 'Nome obrigatório.' }
  if (name.length < 2)    return { error: 'Nome muito curto.' }
  if (!Number.isFinite(input.unit_price) || input.unit_price < 0) {
    return { error: 'Preço inválido.' }
  }

  const isService = input.is_service ?? true
  const category  = input.category ?? (isService ? 'vet_service' : 'clinic_product')
  const unit      = (input.unit ?? 'un').trim() || 'un'

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('stock_items')
    .insert({
      clinic_id:    ctx.clinicId,
      name,
      category,
      unit,
      unit_price:   input.unit_price,
      quantity:     isService ? 0 : 0,
      min_quantity: 0,
      is_service:   isService,
      is_controlled: false,
    })
    .select('id, name, category, unit, unit_price, sku, barcode, is_controlled, is_service, quantity')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Já existe um item com esse nome.' }
    return { error: 'Erro ao cadastrar item: ' + error.message }
  }

  revalidatePath('/dashboard/pharmacy')
  revalidatePath('/dashboard/reception')

  return {
    id:            data.id as string,
    name:          data.name as string,
    category:      data.category as string,
    unit:          data.unit as string,
    unit_price:    Number(data.unit_price ?? 0),
    sku:           (data.sku as string | null) ?? null,
    barcode:       (data.barcode as string | null) ?? null,
    is_controlled: Boolean(data.is_controlled),
    is_service:    Boolean(data.is_service),
    quantity:      Number(data.quantity ?? 0),
  }
}
