'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type Ctx = { clinic_id: string; user_id: string; role: string } | { error: string }

async function getCtx(): Promise<Ctx> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinic_id: profile.clinic_id, user_id: user.id, role: profile.role as string }
}

/**
 * Registra entrada manual no caixa (suprimento, reposição de troco, aporte, etc).
 * Insere em central_cashier com source_module='manual' e status='recorded'.
 */
export async function recordManualInflow(input: {
  amount:          number
  reason:          string
  payment_method?: string
  effective_date?: string
}): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('rpc_record_manual_inflow', {
    p_clinic_id:      ctx.clinic_id,
    p_amount:         input.amount,
    p_reason:         input.reason,
    p_recorded_by:    ctx.user_id,
    p_payment_method: input.payment_method ?? 'cash',
    p_effective_date: input.effective_date ?? null,
  })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/financial')
  return { id: data as string }
}

/**
 * Atualiza a data efetiva (retroativa) de um lançamento de caixa.
 */
export async function updateCashierEffectiveDate(
  entryId:       string,
  effectiveDate: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const supabase = await createClient()
  const { error } = await supabase.rpc('rpc_update_cashier_effective_date', {
    p_entry_id:       entryId,
    p_effective_date: effectiveDate,
    p_updated_by:     ctx.user_id,
  })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/cashier')
  revalidatePath('/dashboard/financial')
  return { success: true }
}

/**
 * Verifica se há caixa do dia anterior (ou anteriores) ainda aberto.
 * Retorna a sessão mais antiga em aberto, se houver.
 */
export async function getStaleOpenSession(): Promise<{
  has_stale: boolean
  session?: { id: string; opened_at: string; opening_balance: number; days_open: number }
} | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const supabase = await createClient()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('cashier_sessions')
    .select('id, opened_at, opening_balance')
    .eq('clinic_id', ctx.clinic_id)
    .eq('status', 'open')
    .lt('opened_at', today.toISOString())
    .order('opened_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') return { error: error.message }
  if (!data) return { has_stale: false }

  const openedAt = new Date(data.opened_at)
  const msDiff = today.getTime() - openedAt.getTime()
  const daysOpen = Math.max(1, Math.floor(msDiff / (1000 * 60 * 60 * 24)))

  return {
    has_stale: true,
    session: {
      id:              data.id,
      opened_at:       data.opened_at,
      opening_balance: Number(data.opening_balance ?? 0),
      days_open:       daysOpen,
    },
  }
}
