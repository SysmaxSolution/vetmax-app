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

export interface PriceTable {
  id: string
  clinic_id: string
  slot: number
  name: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export type PricingPrecedence = 'client' | 'product'

export interface PricingSettings {
  clinic_id: string
  default_b2c_price_table_id: string | null
  precedence: PricingPrecedence
  updated_at: string
}

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
  if (error) return { error: `Erro ao listar tabelas de preço: ${error.message}` }
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
    if (error) return { error: `Erro ao atualizar: ${error.message}` }
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
    return { error: `Erro ao criar: ${error.message}` }
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
  if (error) return { error: `Erro ao carregar configurações: ${error.message}` }
  // Default implícito se ainda não configurado
  return (data ?? {
    clinic_id: ctx.clinic_id,
    default_b2c_price_table_id: null,
    precedence: 'client' as PricingPrecedence,
    updated_at: new Date(0).toISOString(),
  }) as PricingSettings
}

export async function savePricingSettings(input: {
  default_b2c_price_table_id: string | null
  precedence: PricingPrecedence
}): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!CAN_MANAGE.includes(ctx.role)) return { error: 'Sem permissão' }
  if (!['client', 'product'].includes(input.precedence)) return { error: 'Precedência inválida' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('pricing_settings')
    .upsert({
      clinic_id: ctx.clinic_id,
      default_b2c_price_table_id: input.default_b2c_price_table_id || null,
      precedence: input.precedence,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'clinic_id' })
  if (error) return { error: `Erro ao salvar: ${error.message}` }
  revalidatePath('/dashboard/registry')
  return { ok: true }
}
