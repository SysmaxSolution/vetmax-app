'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Tipos ───────────────────────────────────────────────────────────────────

/**
 * Sinais vitais estruturados (tabela clinical_vitals, compartilhada Internação ×
 * Cirurgia). Aqui sempre escopados a uma internação (hospitalization_id).
 * Todos os parâmetros são opcionais — registra-se o que houver na aferição.
 */
export interface ClinicalVital {
  id:             string
  recorded_at:    string
  recorded_by:    string | null
  temperature:    number | null   // °C
  heart_rate:     number | null   // bpm
  resp_rate:      number | null   // mpm
  weight:         number | null   // kg
  blood_pressure: string | null   // "120/80"
  glucose:        number | null   // mg/dL
  spo2:           number | null   // %
  mucosa:         string | null
  tpc_seconds:    number | null   // tempo de preenchimento capilar (s)
  hydration_pct:  number | null   // % de desidratação estimada
  pain_score:     number | null   // 0–10
  notes:          string | null
  source:         'manual' | 'voice' | 'iot'
}

export interface RecordVitalPayload {
  hospitalization_id: string
  temperature?:    number | null
  heart_rate?:     number | null
  resp_rate?:      number | null
  weight?:         number | null
  blood_pressure?: string | null
  glucose?:        number | null
  spo2?:           number | null
  mucosa?:         string | null
  tpc_seconds?:    number | null
  hydration_pct?:  number | null
  pain_score?:     number | null
  notes?:          string | null
  source?:         'manual' | 'voice' | 'iot'
}

async function getCtx(): Promise<{ clinicId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id, userId: user.id }
}

const NUM = (v: number | null | undefined): number | null =>
  v === null || v === undefined || Number.isNaN(v) ? null : Number(v)

// ─── List ────────────────────────────────────────────────────────────────────

/** Lista os sinais vitais de uma internação, do mais recente ao mais antigo. */
export async function listClinicalVitals(hospitalizationId: string): Promise<ClinicalVital[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clinical_vitals')
    .select('id, recorded_at, recorded_by, temperature, heart_rate, resp_rate, weight, blood_pressure, glucose, spo2, mucosa, tpc_seconds, hydration_pct, pain_score, notes, source')
    .eq('clinic_id', ctx.clinicId)
    .eq('hospitalization_id', hospitalizationId)
    .order('recorded_at', { ascending: false })
    .limit(200)

  if (error) return { error: error.message }
  return (data ?? []).map((r): ClinicalVital => ({
    id:             r.id as string,
    recorded_at:    r.recorded_at as string,
    recorded_by:    (r.recorded_by as string | null) ?? null,
    temperature:    r.temperature    === null ? null : Number(r.temperature),
    heart_rate:     r.heart_rate     === null ? null : Number(r.heart_rate),
    resp_rate:      r.resp_rate      === null ? null : Number(r.resp_rate),
    weight:         r.weight         === null ? null : Number(r.weight),
    blood_pressure: (r.blood_pressure as string | null) ?? null,
    glucose:        r.glucose        === null ? null : Number(r.glucose),
    spo2:           r.spo2           === null ? null : Number(r.spo2),
    mucosa:         (r.mucosa as string | null) ?? null,
    tpc_seconds:    r.tpc_seconds    === null ? null : Number(r.tpc_seconds),
    hydration_pct:  r.hydration_pct  === null ? null : Number(r.hydration_pct),
    pain_score:     r.pain_score     === null ? null : Number(r.pain_score),
    notes:          (r.notes as string | null) ?? null,
    source:         (r.source as 'manual' | 'voice' | 'iot') ?? 'manual',
  }))
}

// ─── Record ──────────────────────────────────────────────────────────────────

/** Registra uma aferição de sinais vitais para a internação. */
export async function recordClinicalVital(payload: RecordVitalPayload): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!payload.hospitalization_id) return { error: 'hospitalization_id é obrigatório.' }

  // Exige ao menos um parâmetro preenchido (evita registro vazio).
  const hasAny = [
    payload.temperature, payload.heart_rate, payload.resp_rate, payload.weight,
    payload.blood_pressure, payload.glucose, payload.spo2, payload.mucosa,
    payload.tpc_seconds, payload.hydration_pct, payload.pain_score,
  ].some(v => v !== null && v !== undefined && `${v}`.trim() !== '')
  if (!hasAny) return { error: 'Informe ao menos um parâmetro clínico.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clinical_vitals')
    .insert({
      clinic_id:          ctx.clinicId,
      hospitalization_id: payload.hospitalization_id,
      recorded_by:        ctx.userId,
      temperature:    NUM(payload.temperature),
      heart_rate:     NUM(payload.heart_rate),
      resp_rate:      NUM(payload.resp_rate),
      weight:         NUM(payload.weight),
      blood_pressure: payload.blood_pressure?.trim() || null,
      glucose:        NUM(payload.glucose),
      spo2:           NUM(payload.spo2),
      mucosa:         payload.mucosa?.trim() || null,
      tpc_seconds:    NUM(payload.tpc_seconds),
      hydration_pct:  NUM(payload.hydration_pct),
      pain_score:     NUM(payload.pain_score),
      notes:          payload.notes?.trim() || null,
      source:         payload.source ?? 'manual',
    })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao registrar sinais vitais: ' + error.message }
  revalidatePath('/dashboard/hospitalization')
  return { id: data.id as string }
}
