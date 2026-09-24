// Gate genérico de flag de rotina para uso DENTRO das server actions que já têm
// o clinic_id em mãos. Módulo server-only SEM 'use server' (não é action).
//
// Contrato da Tarefa 0: toda rotina nova tem flag própria em clinics.flow_config
// e o padrão é DESLIGADO. Com a flag off a rotina some do menu, a rota
// redireciona E as actions recusam — este módulo cobre a terceira camada.

import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>

/** Lê uma flag booleana de clinics.flow_config. Estrito: só `true` libera. */
export async function clinicFlowFlag(admin: Admin, clinicId: string, flag: string): Promise<boolean> {
  try {
    const { data } = await admin.from('clinics').select('flow_config').eq('id', clinicId).maybeSingle()
    const flow = (data?.flow_config ?? {}) as Record<string, unknown>
    return flow[flag] === true
  } catch {
    return false
  }
}

/** Lê o objeto flow_config inteiro (para quem precisa de mais de uma chave). */
export async function clinicFlowConfig(admin: Admin, clinicId: string): Promise<Record<string, unknown>> {
  try {
    const { data } = await admin.from('clinics').select('flow_config').eq('id', clinicId).maybeSingle()
    return (data?.flow_config ?? {}) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Mensagem única de recusa, para as actions responderem igual em todo lugar. */
export function routineOffError(routine: string): { error: string } {
  return { error: `${routine} não está ativado para esta clínica. Peça a ativação em Gestão > Configurações.` }
}
