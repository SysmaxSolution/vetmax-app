'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

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

  const price = payload.price_override !== undefined && payload.price_override !== null
    ? payload.price_override
    : Number(item.unit_price ?? 0)

  const { data, error } = await admin
    .from('consultation_services')
    .insert({
      clinic_id:       ctx.clinicId,
      consultation_id: payload.consultation_id,
      stock_item_id:   payload.stock_item_id,
      name_snapshot:   item.name as string,
      price_snapshot:  price,
      quantity:        payload.quantity ?? 1,
      added_at_stage:  payload.added_at_stage ?? 'reception',
      added_by:        ctx.userId,
    })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao adicionar serviço: ' + error.message }
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
    .select('id, consultation_id, stock_item_id, name_snapshot, price_snapshot, quantity, added_at_stage, added_by, cancelled_at, cancelled_by, cancel_reason, created_at')
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
