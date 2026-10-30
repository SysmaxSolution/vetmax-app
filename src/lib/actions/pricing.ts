'use server'

// Precificação (Sprint Animais, Fase 0, peças 0.10 e 0.11).
// - Até 5 TABELAS DE PREÇO nomeadas por clínica (price_tables, slot 1..5).
// - Preço de cada item em cada tabela (price_table_items).
// - Composição de preço por item (custo/imposto/margem) em stock_items.
// - Configurações: tabela padrão B2C + precedência (cliente x produto).
// Tabelas com RLS sem policy pública → acesso via service role.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

import { mensagemErro } from '@/lib/errors'
import type { PriceTable, PricingPrecedence, CompositionMode, MarginCalcType, PricingSettings, ItemTablePrice } from '@/types/pricing'

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' as const }
  return { clinic_id: profile.clinic_id as string, role: profile.role as string }
}

const CAN_MANAGE = ['admin', 'owner', 'manager']

// ─── TABELAS DE PREÇO ────────────────────────────────────────────────────────
export async function listPriceTables(): Promise<PriceTable[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('price_tables')
    .select('*')
    .eq('clinic_id', ctx.clinic_id)
    .order('slot', { ascending: true })
  if (error) return { error: `Erro ao listar tabelas de preço: ${mensagemErro(error, 'lib/actions/pricing.ts')}` }
  return (data ?? []) as PriceTable[]
}

export async function upsertPriceTable(input: {
  id?: string
  slot: number
  name: string
  is_active?: boolean
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!CAN_MANAGE.includes(ctx.role)) return { error: 'Sem permissão' }

  const name = input.name.trim()
  if (name.length < 2) return { error: 'Nome deve ter ao menos 2 caracteres' }
  if (input.slot < 1 || input.slot > 5) return { error: 'Slot inválido (1 a 5)' }

  const admin = createAdminClient()
  const payload = {
    clinic_id: ctx.clinic_id,
    slot: input.slot,
    name,
    is_active: input.is_active !== false,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { data, error } = await admin
      .from('price_tables')
      .update(payload)
      .eq('id', input.id)
      .eq('clinic_id', ctx.clinic_id)
      .select('id')
      .single()
    if (error) return { error: `Erro ao atualizar: ${mensagemErro(error, 'lib/actions/pricing.ts')}` }
    revalidatePath('/dashboard/registry')
    return { id: data.id as string }
  }

  const { data, error } = await admin
    .from('price_tables')
    .insert(payload)
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { error: `Já existe uma tabela no slot ${input.slot}` }
    return { error: `Erro ao criar: ${mensagemErro(error, 'lib/actions/pricing.ts')}` }
  }
  revalidatePath('/dashboard/registry')
  return { id: data.id as string }
}

// ─── CONFIGURAÇÕES DE PREÇO ──────────────────────────────────────────────────
export async function getPricingSettings(): Promise<PricingSettings | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pricing_settings')
    .select('*')
    .eq('clinic_id', ctx.clinic_id)
    .maybeSingle()
  if (error) return { error: `Erro ao carregar configurações: ${mensagemErro(error, 'lib/actions/pricing.ts')}` }
  // Default implícito se ainda não configurado
  return (data ?? {
    clinic_id: ctx.clinic_id,
    default_b2c_price_table_id: null,
    precedence: 'client' as PricingPrecedence,
    composition_mode: 'simple' as CompositionMode,
    margin_calc_type: 'margin' as MarginCalcType,
    updated_at: new Date(0).toISOString(),
  }) as PricingSettings
}

export async function savePricingSettings(input: {
  default_b2c_price_table_id: string | null
  precedence: PricingPrecedence
  composition_mode: CompositionMode
  margin_calc_type: MarginCalcType
}): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!CAN_MANAGE.includes(ctx.role)) return { error: 'Sem permissão' }
  if (!['client', 'product'].includes(input.precedence)) return { error: 'Precedência inválida' }
  if (!['simple', 'complete'].includes(input.composition_mode)) return { error: 'Modo de composição inválido' }
  if (!['margin', 'markup'].includes(input.margin_calc_type)) return { error: 'Tipo de cálculo inválido' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('pricing_settings')
    .upsert({
      clinic_id: ctx.clinic_id,
      default_b2c_price_table_id: input.default_b2c_price_table_id || null,
      precedence: input.precedence,
      composition_mode: input.composition_mode,
      margin_calc_type: input.margin_calc_type,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'clinic_id' })
  if (error) return { error: `Erro ao salvar: ${mensagemErro(error, 'lib/actions/pricing.ts')}` }
  revalidatePath('/dashboard/registry')
  revalidatePath('/dashboard/management')
  return { ok: true }
}

// Preço + margem de um item em cada tabela. Mapa price_table_id → {price, margin}.
export async function getItemPrices(
  stockItemId: string,
): Promise<Record<string, ItemTablePrice> | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('price_table_items')
    .select('price_table_id, price, margin_percent, urgent_price, valid_from')
    .eq('clinic_id', ctx.clinic_id)
    .eq('stock_item_id', stockItemId)
  if (error) return { error: `Erro ao carregar preços do item: ${mensagemErro(error, 'lib/actions/pricing.ts')}` }
  const map: Record<string, ItemTablePrice> = {}
  for (const row of (data ?? []) as unknown as { price_table_id: string; price: number; margin_percent: number | null; urgent_price: number | null; valid_from: string | null }[]) {
    map[row.price_table_id] = {
      price: Number(row.price),
      margin: row.margin_percent == null ? null : Number(row.margin_percent),
      urgent: row.urgent_price == null ? null : Number(row.urgent_price),
      valid_from: row.valid_from ?? null,
    }
  }
  return map
}

// Persiste preço + margem por tabela: upsert dos informados, delete dos zerados/vazios.
export async function setItemPrices(
  stockItemId: string,
  prices: { price_table_id: string; price: number | null; margin: number | null; urgent?: number | null; valid_from?: string | null }[],
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!CAN_MANAGE.includes(ctx.role)) return { error: 'Sem permissão' }
  const admin = createAdminClient()

  const toUpsert = prices
    .filter(p => p.price != null && !Number.isNaN(p.price) && Number(p.price) > 0)
    .map(p => ({
      clinic_id: ctx.clinic_id,
      price_table_id: p.price_table_id,
      stock_item_id: stockItemId,
      price: Number(p.price),
      margin_percent: p.margin != null && Number.isFinite(p.margin) ? Number(p.margin) : null,
      urgent_price: p.urgent != null && Number.isFinite(p.urgent) && Number(p.urgent) > 0 ? Number(p.urgent) : null,
      // Vigência: a informada ou hoje. O preço anterior vai para o histórico (trigger 0526).
      valid_from: p.valid_from && /^\d{4}-\d{2}-\d{2}$/.test(p.valid_from) ? p.valid_from : new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    }))
  const toDelete = prices
    .filter(p => p.price == null || Number.isNaN(p.price) || Number(p.price) <= 0)
    .map(p => p.price_table_id)

  if (toUpsert.length > 0) {
    const { error } = await admin
      .from('price_table_items')
      .upsert(toUpsert, { onConflict: 'price_table_id, stock_item_id' })
    if (error) return { error: `Erro ao salvar preços: ${mensagemErro(error, 'lib/actions/pricing.ts')}` }
  }
  if (toDelete.length > 0) {
    const { error } = await admin
      .from('price_table_items')
      .delete()
      .eq('clinic_id', ctx.clinic_id)
      .eq('stock_item_id', stockItemId)
      .in('price_table_id', toDelete)
    if (error) return { error: `Erro ao remover preços: ${mensagemErro(error, 'lib/actions/pricing.ts')}` }
  }
  return { ok: true }
}
