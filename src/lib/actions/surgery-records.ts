'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type SurgeryStage = 'preop' | 'anesthesia' | 'report'

export interface SurgeryRecord {
  id:           string
  surgery_id:   string
  stage:        SurgeryStage
  notes:        string
  created_by:   string | null
  author_name:  string | null
  created_at:   string
  updated_at:   string
}

const VALID_STAGES: SurgeryStage[] = ['preop', 'anesthesia', 'report']

async function getCtx(): Promise<{ clinicId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id, userId: user.id }
}

async function isSurgeryEditable(admin: ReturnType<typeof createAdminClient>, surgeryId: string, clinicId: string): Promise<boolean> {
  const { data } = await admin.from('surgeries').select('status').eq('id', surgeryId).eq('clinic_id', clinicId).single()
  return !!data && data.status !== 'done' && data.status !== 'canceled'
}

// ─── List + create + update + delete ────────────────────────────────────────

export async function listSurgeryRecords(surgeryId: string, stage?: SurgeryStage): Promise<SurgeryRecord[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  let q = admin
    .from('surgery_records')
    .select('id, surgery_id, stage, notes, created_by, created_at, updated_at, profiles ( name )')
    .eq('clinic_id', ctx.clinicId)
    .eq('surgery_id', surgeryId)
    .order('created_at', { ascending: false })
  if (stage) q = q.eq('stage', stage)
  const { data, error } = await q
  if (error) return { error: error.message }
  return (data ?? []).map((r: any): SurgeryRecord => ({
    id:          r.id, surgery_id: r.surgery_id, stage: r.stage,
    notes:       r.notes, created_by: r.created_by, created_at: r.created_at, updated_at: r.updated_at,
    author_name: (r.profiles as any)?.name ?? null,
  }))
}

export async function createSurgeryRecord(payload: { surgery_id: string; stage: SurgeryStage; notes: string }): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!VALID_STAGES.includes(payload.stage)) return { error: 'Etapa inválida.' }
  if (!payload.notes?.trim()) return { error: 'Anotação vazia.' }

  const admin = createAdminClient()
  if (!(await isSurgeryEditable(admin, payload.surgery_id, ctx.clinicId))) return { error: 'Cirurgia finalizada — feed bloqueado.' }

  const { data, error } = await admin.from('surgery_records')
    .insert({ clinic_id: ctx.clinicId, surgery_id: payload.surgery_id, stage: payload.stage, notes: payload.notes.trim(), created_by: ctx.userId })
    .select('id').single()
  if (error) return { error: error.message }
  revalidatePath('/dashboard/surgery')
  return { id: data.id as string }
}

export async function updateSurgeryRecord(id: string, notes: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  if (!notes?.trim()) return { error: 'Anotação vazia.' }

  const admin = createAdminClient()
  // Apenas o próprio autor pode editar, e somente se a cirurgia ainda está em andamento.
  const { data: rec } = await admin.from('surgery_records').select('surgery_id, created_by').eq('id', id).eq('clinic_id', ctx.clinicId).single()
  if (!rec) return { error: 'Registro não encontrado.' }
  if (rec.created_by !== ctx.userId) return { error: 'Apenas o autor pode editar este registro.' }
  if (!(await isSurgeryEditable(admin, rec.surgery_id as string, ctx.clinicId))) return { error: 'Cirurgia finalizada — feed bloqueado.' }

  const { error } = await admin.from('surgery_records').update({ notes: notes.trim(), updated_at: new Date().toISOString() }).eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/surgery')
  return { success: true }
}

export async function deleteSurgeryRecord(id: string): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return ctx
  const admin = createAdminClient()
  const { data: rec } = await admin.from('surgery_records').select('surgery_id, created_by').eq('id', id).eq('clinic_id', ctx.clinicId).single()
  if (!rec) return { error: 'Registro não encontrado.' }
  if (rec.created_by !== ctx.userId) return { error: 'Apenas o autor pode remover este registro.' }
  if (!(await isSurgeryEditable(admin, rec.surgery_id as string, ctx.clinicId))) return { error: 'Cirurgia finalizada — feed bloqueado.' }

  const { error } = await admin.from('surgery_records').delete().eq('id', id).eq('clinic_id', ctx.clinicId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/surgery')
  return { success: true }
}
