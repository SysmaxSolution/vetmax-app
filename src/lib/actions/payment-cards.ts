'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type CardType = 'credit' | 'debit' | 'voucher' | 'other'

/**
 * Modelo adapter exposto para o frontend. Internamente lê da tabela
 * `credit_cards` (existente em Financeiro > Cadastros > Cartões) mas
 * apresenta os campos com nomes mais descritivos e mapeia type='both'
 * para credit+debit conforme o contexto.
 */
export interface PaymentCard {
  id:               string
  clinic_id:        string
  label:            string       // mapeado de credit_cards.name
  acquirer:         string       // mapeado de credit_cards.administrator
  card_type:        CardType     // 'credit' | 'debit' | 'voucher' | 'other'
  brand:            string | null
  fee_percent:      number
  settlement_days:  number       // mapeado de credit_cards.days_to_receive
  max_installments: number       // mapeado de credit_cards.installments_max
  requires_nsu:     boolean      // mapeado de credit_cards.requires_nsu
  is_active:        boolean
  notes:            string | null
  created_at:       string
}

type Ctx = { clinic_id: string; user_id: string; role: string } | { error: string }

async function getCtx(): Promise<Ctx> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinic_id: profile.clinic_id, user_id: user.id, role: profile.role as string }
}

/**
 * Map de credit_cards row → PaymentCard. type='both' é replicado como dois
 * possíveis valores (decidido pelo filtro do caller).
 */
function mapCardRow(row: {
  id:               string
  clinic_id:        string
  name:             string
  administrator:    string | null
  brand:            string
  type:             'credit' | 'debit' | 'both'
  installments_max: number
  fee_percent:      number
  days_to_receive:  number
  requires_nsu?:    boolean
  is_active:        boolean
  created_at:       string
}, ctxType?: 'credit' | 'debit' | 'voucher'): PaymentCard {
  // Se o cartão é 'both', usa o tipo do contexto (quando filtrando) ou 'credit' por default.
  const card_type: CardType =
    row.type === 'both'
      ? (ctxType ?? 'credit')
      : (row.type as CardType)
  return {
    id:               row.id,
    clinic_id:        row.clinic_id,
    label:            row.name,
    acquirer:         row.administrator ?? '',
    card_type,
    brand:            row.brand ?? null,
    fee_percent:      Number(row.fee_percent ?? 0),
    settlement_days:  Number(row.days_to_receive ?? (card_type === 'debit' ? 1 : 30)),
    max_installments: Number(row.installments_max ?? 1),
    requires_nsu:     Boolean(row.requires_nsu ?? false),
    is_active:        Boolean(row.is_active),
    notes:            null,
    created_at:       row.created_at,
  }
}

export async function listPaymentCards(
  filter?: { card_type?: CardType; only_active?: boolean }
): Promise<PaymentCard[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const supabase = await createClient()
  let q = supabase
    .from('credit_cards')
    .select('id, clinic_id, name, administrator, brand, type, installments_max, fee_percent, days_to_receive, requires_nsu, is_active, created_at')
    .eq('clinic_id', ctx.clinic_id)

  if (filter?.only_active !== false) q = q.eq('is_active', true)

  // Filtro por tipo: 'credit' inclui rows com type='credit' OR type='both'.
  // 'debit'  inclui rows com type='debit'  OR type='both'.
  // 'voucher' não existe em credit_cards — retornamos vazio nesse caso.
  if (filter?.card_type === 'credit') {
    q = q.in('type', ['credit', 'both'])
  } else if (filter?.card_type === 'debit') {
    q = q.in('type', ['debit', 'both'])
  } else if (filter?.card_type === 'voucher') {
    return []
  }

  const { data, error } = await q.order('name', { ascending: true })
  if (error) return { error: error.message }
  return (data ?? []).map(row => mapCardRow(row as any, filter?.card_type === 'debit' ? 'debit' : 'credit'))
}

/**
 * Atalho de cadastro inline durante o fluxo de pagamento. Cria um registro
 * em credit_cards. Para gestão completa, usar Financeiro > Cadastros > Cartões.
 */
export async function createPaymentCard(input: {
  label:            string
  acquirer:         string
  card_type:        CardType
  brand?:           string | null
  fee_percent?:     number
  settlement_days?: number
  max_installments?: number
  notes?:           string | null
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!['admin','owner','manager','accountant','receptionist'].includes(ctx.role)) {
    return { error: 'Sem permissão para cadastrar cartão.' }
  }
  if (!input.label.trim()) {
    return { error: 'Apelido é obrigatório.' }
  }

  // Mapeia para o schema do credit_cards
  const ccType: 'credit' | 'debit' | 'both' =
    input.card_type === 'voucher' || input.card_type === 'other'
      ? 'credit'
      : input.card_type
  const ccBrand: 'visa' | 'master' | 'elo' | 'amex' | 'hipercard' | 'other' = (() => {
    const b = (input.brand ?? '').toLowerCase()
    if (b.includes('visa'))     return 'visa'
    if (b.includes('master'))   return 'master'
    if (b.includes('elo'))      return 'elo'
    if (b.includes('amex'))     return 'amex'
    if (b.includes('hiper'))    return 'hipercard'
    return 'other'
  })()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('credit_cards')
    .insert({
      clinic_id:        ctx.clinic_id,
      name:             input.label.trim(),
      administrator:    input.acquirer?.trim() || null,
      brand:            ccBrand,
      type:             ccType,
      installments_max: input.max_installments ?? (ccType === 'credit' ? 12 : 1),
      fee_percent:      input.fee_percent ?? 0,
      days_to_receive:  input.settlement_days ?? (ccType === 'debit' ? 1 : 30),
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { error: 'Já existe um cartão com este apelido na clínica.' }
    return { error: error.message }
  }
  revalidatePath('/dashboard/financial')
  revalidatePath('/dashboard/cashier')
  return { id: data.id }
}

export async function updatePaymentCard(
  id: string,
  patch: Partial<{
    label:            string
    acquirer:         string
    brand:            string
    max_installments: number
    fee_percent:      number
    settlement_days:  number
    is_active:        boolean
  }>
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!['admin','owner','manager','accountant'].includes(ctx.role)) {
    return { error: 'Sem permissão para editar cartão.' }
  }
  const updates: Record<string, unknown> = {}
  if (patch.label            !== undefined) updates.name             = patch.label
  if (patch.acquirer         !== undefined) updates.administrator    = patch.acquirer
  if (patch.brand            !== undefined) updates.brand            = patch.brand
  if (patch.max_installments !== undefined) updates.installments_max = patch.max_installments
  if (patch.fee_percent      !== undefined) updates.fee_percent      = patch.fee_percent
  if (patch.settlement_days  !== undefined) updates.days_to_receive  = patch.settlement_days
  if (patch.is_active        !== undefined) updates.is_active        = patch.is_active

  const supabase = await createClient()
  const { error } = await supabase
    .from('credit_cards')
    .update(updates)
    .eq('id', id)
    .eq('clinic_id', ctx.clinic_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/financial')
  return { success: true }
}

export async function deactivatePaymentCard(
  id: string
): Promise<{ success: true } | { error: string }> {
  return updatePaymentCard(id, { is_active: false })
}
