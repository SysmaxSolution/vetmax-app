'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type CardType = 'credit' | 'debit' | 'voucher' | 'other'

export interface PaymentCard {
  id:               string
  clinic_id:        string
  label:            string
  acquirer:         string
  card_type:        CardType
  brand:            string | null
  fee_percent:      number
  settlement_days:  number
  max_installments: number
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

export async function listPaymentCards(
  filter?: { card_type?: CardType; only_active?: boolean }
): Promise<PaymentCard[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const supabase = await createClient()
  let q = supabase
    .from('clinic_payment_cards')
    .select('*')
    .eq('clinic_id', ctx.clinic_id)
  if (filter?.card_type) q = q.eq('card_type', filter.card_type)
  if (filter?.only_active !== false) q = q.eq('is_active', true)
  const { data, error } = await q.order('label', { ascending: true })
  if (error) return { error: error.message }
  return (data ?? []) as PaymentCard[]
}

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
  if (!input.label.trim() || !input.acquirer.trim()) {
    return { error: 'Apelido e administradora são obrigatórios.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('clinic_payment_cards')
    .insert({
      clinic_id:        ctx.clinic_id,
      label:            input.label.trim(),
      acquirer:         input.acquirer.trim(),
      card_type:        input.card_type,
      brand:            input.brand?.trim() || null,
      fee_percent:      input.fee_percent ?? 0,
      settlement_days:  input.settlement_days ?? 1,
      max_installments: input.max_installments ?? (input.card_type === 'credit' ? 12 : 1),
      notes:            input.notes?.trim() || null,
      created_by:       ctx.user_id,
    })
    .select('id')
    .single()
  if (error) {
    if (error.message.includes('uidx_clinic_payment_cards_clinic_label')) {
      return { error: 'Já existe um cartão com este apelido na clínica.' }
    }
    return { error: error.message }
  }
  revalidatePath('/dashboard/financial')
  revalidatePath('/dashboard/registry')
  revalidatePath('/dashboard/cashier')
  return { id: data.id }
}

export async function updatePaymentCard(
  id: string,
  patch: Partial<Omit<PaymentCard, 'id'|'clinic_id'|'created_at'>>
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!['admin','owner','manager','accountant'].includes(ctx.role)) {
    return { error: 'Sem permissão para editar cartão.' }
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('clinic_payment_cards')
    .update({ ...patch, updated_at: new Date().toISOString() })
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
