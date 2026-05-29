'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type TaskKind = 'exam' | 'procedure' | 'feeding' | 'other'
export type TaskStatus = 'active' | 'paused' | 'done'

export interface HospTask {
  id:                 string
  hospitalization_id: string
  kind:               TaskKind
  description:        string
  frequency_hours:    number | null
  started_at:         string
  duration_hours:     number | null
  last_done_at:       string | null
  status:             TaskStatus
}

export interface CreateTaskPayload {
  hospitalization_id: string
  kind:               TaskKind
  description:        string
  frequency_hours?:   number | null
  duration_hours?:    number | null
  started_at?:        string | null
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

function mapRow(r: Record<string, any>): HospTask {
  return {
    id:                 r.id as string,
    hospitalization_id: r.hospitalization_id as string,
    kind:               r.kind as TaskKind,
    description:        r.description as string,
    frequency_hours:    r.frequency_hours === null ? null : Number(r.frequency_hours),
    started_at:         r.started_at as string,
    duration_hours:     r.duration_hours === null ? null : Number(r.duration_hours),
    last_done_at:       (r.last_done_at as string | null) ?? null,
    status:             r.status as TaskStatus,
  }
}

// ─── List ────────────────────────────────────────────────────────────────────

/** Tarefas ativas/pausadas da clínica (Mapa de Execução). Filtro opcional por internação. */
export async function listHospitalizationTasks(hospitalizationId?: string): Promise<HospTask[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  let q = admin
    .from('hospitalization_tasks')
    .select('id, hospitalization_id, kind, description, frequency_hours, started_at, duration_hours, last_done_at, status')
    .eq('clinic_id', ctx.clinicId)
    .neq('status', 'done')
    .order('created_at', { ascending: false })
  if (hospitalizationId) q = q.eq('hospitalization_id', hospitalizationId)
  const { data, error } = await q
  if (error) return { error: error.message }
  return (data ?? []).map(mapRow)
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createHospitalizationTask(payload: CreateTaskPayload): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!payload.hospitalization_id)   return { error: 'hospitalization_id é obrigatório.' }
  if (!payload.description?.trim())  return { error: 'Descrição da tarefa é obrigatória.' }
  if (!['exam', 'procedure', 'feeding', 'other'].includes(payload.kind)) return { error: 'Tipo inválido.' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('hospitalization_tasks')
    .insert({
      clinic_id:          ctx.clinicId,
      hospitalization_id: payload.hospitalization_id,
      kind:               payload.kind,
      description:        payload.description.trim(),
      frequency_hours:    NUM(payload.frequency_hours),
      duration_hours:     NUM(payload.duration_hours),
      started_at:         payload.started_at || new Date().toISOString(),
      created_by:         ctx.userId,
      status:             'active',
    })
    .select('id')
    .single()
  if (error) return { error: 'Erro ao agendar tarefa: ' + error.message }
  revalidatePath('/dashboard/hospitalization')
  return { id: data.id as string }
}

// ─── Marcar feito / status / excluir ──────────────────────────────────────────

export async function markTaskDone(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { error } = await admin
    .from('hospitalization_tasks')
    .update({ last_done_at: new Date().toISOString() })
    .eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/hospitalization')
  return { success: true }
}

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { error } = await admin
    .from('hospitalization_tasks')
    .update({ status })
    .eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/hospitalization')
  return { success: true }
}

/** Edita os campos de uma tarefa agendada (tipo, descrição, frequência). */
export async function updateHospitalizationTask(
  id: string,
  fields: { kind?: TaskKind; description?: string; frequency_hours?: number | null },
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const patch: Record<string, unknown> = {}
  if (fields.kind !== undefined) {
    if (!['exam', 'procedure', 'feeding', 'other'].includes(fields.kind)) return { error: 'Tipo inválido.' }
    patch.kind = fields.kind
  }
  if (fields.description !== undefined) {
    if (!fields.description.trim()) return { error: 'Descrição da tarefa é obrigatória.' }
    patch.description = fields.description.trim()
  }
  if (fields.frequency_hours !== undefined) patch.frequency_hours = NUM(fields.frequency_hours)
  if (Object.keys(patch).length === 0) return { success: true }

  const admin = createAdminClient()
  const { error } = await admin
    .from('hospitalization_tasks')
    .update(patch)
    .eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/hospitalization')
  return { success: true }
}

/** Remove uma tarefa agendada. */
export async function deleteHospitalizationTask(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { error } = await admin
    .from('hospitalization_tasks')
    .delete()
    .eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/hospitalization')
  return { success: true }
}
