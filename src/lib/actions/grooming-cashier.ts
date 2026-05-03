'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Grooming module refactored: Finish session and push payment to central_cashier.
 * Replaces old receipt logic with RPC call to rpc_grooming_finish_and_record_payment.
 */

export async function finishGroomingSessionAndRecord(
  sessionId: string,
  reason?: string
): Promise<{
  success: true
  cashier_entry_id?: string
  timestamp: string
} | { error: string }> {
  const supabase = await createClient()

  // 1. Get current user/clinic
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' }

  // 2. Call RPC to finish session and create cashier entry
  const { data, error } = await supabase.rpc('rpc_grooming_finish_and_record_payment', {
    p_session_id: sessionId,
    p_actor_id: user.id,
    p_reason: reason || null,
  })

  if (error) {
    // Extract meaningful message from PgSQL exception
    const msg = error.message || 'Erro ao finalizar sessão'
    return { error: msg }
  }

  // 3. Extract result
  if (!data || data.length === 0) {
    return { error: 'Nenhum resultado retornado' }
  }

  const result = data[0]

  revalidatePath('/dashboard/grooming')
  return {
    success: true,
    cashier_entry_id: result.cashier_entry_id,
    timestamp: result.timestamp,
  }
}

/**
 * Update grooming session status via RPC (validates state machine).
 * Replaces simple .update() with role-based validation.
 */

export async function updateGroomingStatusViaRPC(
  sessionId: string,
  newStatus: string,
  reason?: string
): Promise<{
  success: true
  transition_id: string
  timestamp: string
} | { error: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  // Call RPC
  const { data, error } = await supabase.rpc('rpc_grooming_update_status', {
    p_session_id: sessionId,
    p_new_status: newStatus,
    p_actor_id: user.id,
    p_reason: reason || null,
  })

  if (error) {
    return { error: error.message || 'Erro ao atualizar status' }
  }

  if (!data || data.length === 0) {
    return { error: 'Nenhum resultado retornado' }
  }

  const result = data[0]

  revalidatePath('/dashboard/grooming')
  return {
    success: true,
    transition_id: result.transition_id,
    timestamp: result.timestamp,
  }
}

/**
 * Get grooming session with full details including payment status.
 */

export async function getGroomingSessionDetail(sessionId: string): Promise<
  {
    id: string
    clinic_id: string
    patient_id: string
    tutor_id: string
    current_status: string
    price_total: number | null
    payment_status: 'pending' | 'paid' | 'waived'
    payment_recorded_at: string | null
    created_at: string
    updated_at: string
  } | { error: string }
> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' }

  const { data, error } = await supabase
    .from('grooming_sessions')
    .select('id, clinic_id, patient_id, tutor_id, current_status, price_total, payment_status, payment_recorded_at, created_at, updated_at')
    .eq('id', sessionId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (error) return { error: error.message }

  return data
}

/**
 * Get related cashier entry for a grooming session.
 */

export async function getGroomingCashierEntry(sessionId: string): Promise<
  {
    id: string
    amount: number
    status: string
    created_at: string
    reason?: string
  } | null | { error: string }
> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' }

  const { data, error } = await supabase
    .from('central_cashier')
    .select('id, amount, status, created_at, reason')
    .eq('source_module', 'grooming')
    .eq('source_id', sessionId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows found (ok)
    return { error: error.message }
  }

  return data || null
}
