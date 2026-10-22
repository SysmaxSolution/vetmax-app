import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'

export type BoletoEventType =
  | 'emitido' | 'reimpresso' | 'email_enviado' | 'whatsapp_enviado'
  | 'consulta' | 'retorno_banco' | 'instrucao' | 'pago' | 'baixado' | 'erro'

export interface LogBoletoEvent {
  clinicId: string
  boletoId: string
  eventType: BoletoEventType
  actorType?: 'user' | 'bank' | 'system'
  actorId?: string | null
  actorName?: string | null
  detail?: string | null
  situacao?: string | null
  payload?: unknown
}

/** Registra um evento na trilha do boleto. Best-effort (não lança). */
export async function logBoletoEvent(admin: ReturnType<typeof createAdminClient>, ev: LogBoletoEvent): Promise<void> {
  try {
    await admin.from('clinic_boleto_events').insert({
      clinic_id: ev.clinicId, boleto_id: ev.boletoId, event_type: ev.eventType,
      actor_type: ev.actorType ?? 'user', actor_id: ev.actorId ?? null,
      actor_name: ev.actorName ?? null, detail: ev.detail ?? null, situacao: ev.situacao ?? null,
      payload: (ev.payload ?? null) as any,
    })
  } catch { /* trilha é best-effort */ }
}
