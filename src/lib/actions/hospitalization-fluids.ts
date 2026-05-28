'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type FluidDirection = 'in' | 'out'
export type FluidKind = 'fluid' | 'urine' | 'emesis' | 'bleeding' | 'other'

export interface FluidEntry {
  id:          string
  direction:   FluidDirection
  kind:        FluidKind
  volume_ml:   number
  recorded_at: string
  recorded_by: string | null
  notes:       string | null
}

export interface FluidBalanceSummary {
  entries:    FluidEntry[]
  total_in:   number   // mL
  total_out:  number   // mL
  /** Saldo Hídrico = total_in − total_out. Positivo = retenção; negativo = perda. */
  balance_ml: number
}

export interface RecordFluidPayload {
  hospitalization_id: string
  direction:          FluidDirection
  kind:               FluidKind
  volume_ml:          number
  notes?:             string | null
}

async function getCtx(): Promise<{ clinicId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id, userId: user.id }
}

// ─── List + summary ────────────────────────────────────────────────────────

/** Lista as movimentações hídricas e calcula o saldo (Entradas − Saídas). */
export async function getFluidBalance(hospitalizationId: string): Promise<FluidBalanceSummary | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('hospitalization_fluid_balance')
    .select('id, direction, kind, volume_ml, recorded_at, recorded_by, notes')
    .eq('clinic_id', ctx.clinicId)
    .eq('hospitalization_id', hospitalizationId)
    .order('recorded_at', { ascending: false })
    .limit(300)

  if (error) return { error: error.message }

  const entries = (data ?? []).map((r): FluidEntry => ({
    id:          r.id as string,
    direction:   r.direction as FluidDirection,
    kind:        r.kind as FluidKind,
    volume_ml:   Number(r.volume_ml ?? 0),
    recorded_at: r.recorded_at as string,
    recorded_by: (r.recorded_by as string | null) ?? null,
    notes:       (r.notes as string | null) ?? null,
  }))

  let total_in = 0, total_out = 0
  for (const e of entries) {
    if (e.direction === 'in') total_in += e.volume_ml
    else total_out += e.volume_ml
  }
  return { entries, total_in, total_out, balance_ml: total_in - total_out }
}

// ─── Record ──────────────────────────────────────────────────────────────────

/** Registra uma entrada ou saída de fluido (mL). */
export async function recordFluid(payload: RecordFluidPayload): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!payload.hospitalization_id) return { error: 'hospitalization_id é obrigatório.' }
  if (!(payload.volume_ml > 0))    return { error: 'Volume deve ser maior que zero.' }
  if (!['in', 'out'].includes(payload.direction)) return { error: 'direction inválido.' }
  if (!['fluid', 'urine', 'emesis', 'bleeding', 'other'].includes(payload.kind)) return { error: 'kind inválido.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('hospitalization_fluid_balance')
    .insert({
      clinic_id:          ctx.clinicId,
      hospitalization_id: payload.hospitalization_id,
      direction:          payload.direction,
      kind:               payload.kind,
      volume_ml:          payload.volume_ml,
      recorded_by:        ctx.userId,
      notes:              payload.notes?.trim() || null,
    })
    .select('id')
    .single()

  if (error) return { error: 'Erro ao registrar fluido: ' + error.message }
  revalidatePath('/dashboard/hospitalization')
  return { id: data.id as string }
}

// ─── Delete (corrigir lançamento errado) ─────────────────────────────────────

export async function deleteFluidEntry(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { error } = await admin
    .from('hospitalization_fluid_balance')
    .delete()
    .eq('id', id)
    .eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/hospitalization')
  return { success: true }
}
