'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTutorContext } from '@/lib/portal/session'
import { canAccessPatient } from '@/lib/portal/access'

export interface PreconsultInput {
  petId: string
  chiefComplaint: string
  symptoms?: string
  durationText?: string
  fasting?: boolean | null
  currentMeds?: string
  notes?: string
}

export interface PreconsultRecord {
  id: string
  chiefComplaint: string
  symptoms: string | null
  durationText: string | null
  fasting: boolean | null
  currentMeds: string | null
  notes: string | null
  status: string
  createdAt: string
}

// ─── Tutor: envia a pré-consulta ─────────────────────────────────────────────
export async function submitPreconsultation(input: PreconsultInput): Promise<{ ok: true } | { error: string }> {
  const ctx = await getTutorContext()
  if (!ctx) return { error: 'Sessão expirada. Entre novamente.' }
  const complaint = (input.chiefComplaint ?? '').trim()
  if (complaint.length < 3) return { error: 'Descreva o motivo da consulta.' }

  const admin = createAdminClient()
  const { data: pet } = await admin
    .from('patients').select('id, tutor_id, clinic_id').eq('id', input.petId).is('deleted_at', null).maybeSingle()
  if (!pet) return { error: 'Pet não encontrado.' }
  if (!canAccessPatient((pet as any).tutor_id, (pet as any).clinic_id, ctx.links)) return { error: 'Sem acesso a este pet.' }

  const { error } = await admin.from('portal_preconsultations').insert({
    clinic_id: (pet as any).clinic_id, patient_id: (pet as any).id, tutor_user_id: ctx.tutorUserId,
    chief_complaint: complaint,
    symptoms: input.symptoms?.trim() || null,
    duration_text: input.durationText?.trim() || null,
    fasting: input.fasting ?? null,
    current_meds: input.currentMeds?.trim() || null,
    notes: input.notes?.trim() || null,
  })
  if (error) return { error: error.message }
  return { ok: true }
}

// ─── Recepção/equipe: pré-consultas pendentes de um pet ──────────────────────
export async function getPetPreconsultations(patientId: string): Promise<PreconsultRecord[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('portal_preconsultations')
    .select('id, chief_complaint, symptoms, duration_text, fasting, current_meds, notes, status, created_at')
    .eq('patient_id', patientId).eq('clinic_id', profile.clinic_id)
    .in('status', ['pending', 'seen'])
    .order('created_at', { ascending: false }).limit(10)
  return (data ?? []).map((r: any) => ({
    id: r.id, chiefComplaint: r.chief_complaint, symptoms: r.symptoms ?? null,
    durationText: r.duration_text ?? null, fasting: r.fasting ?? null,
    currentMeds: r.current_meds ?? null, notes: r.notes ?? null,
    status: r.status, createdAt: r.created_at,
  }))
}

// ─── Recepção: marca a pré-consulta como aproveitada/vista ───────────────────
export async function markPreconsultation(id: string, status: 'used' | 'seen' | 'archived'): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  const admin = createAdminClient()
  const { error } = await admin.from('portal_preconsultations')
    .update({ status, seen_at: new Date().toISOString(), seen_by: user.id })
    .eq('id', id).eq('clinic_id', profile.clinic_id)
  if (error) return { error: error.message }
  return { ok: true }
}
