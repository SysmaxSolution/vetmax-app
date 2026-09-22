'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTutorContext } from '@/lib/portal/session'
import { canAccessPatient } from '@/lib/portal/access'

export interface PortalMessage {
  id: string
  sender: 'tutor' | 'clinic'
  body: string
  createdAt: string
  senderName: string | null
}

// ─── Tutor (portal) ──────────────────────────────────────────────────────────
async function petClinic(admin: ReturnType<typeof createAdminClient>, petId: string, links: { tutor_id: string; clinic_id: string }[]) {
  const { data: pet } = await admin.from('patients').select('id, tutor_id, clinic_id').eq('id', petId).is('deleted_at', null).maybeSingle()
  if (!pet) return null
  if (!canAccessPatient((pet as any).tutor_id, (pet as any).clinic_id, links)) return null
  return { clinicId: (pet as any).clinic_id as string }
}

/** Thread do tutor para um pet (mensagens da clínica daquele pet). */
export async function getPortalMessages(petId: string): Promise<PortalMessage[] | { error: string }> {
  const ctx = await getTutorContext()
  if (!ctx) return { error: 'auth' }
  const admin = createAdminClient()
  const pc = await petClinic(admin, petId, ctx.links)
  if (!pc) return { error: 'forbidden' }
  const { data } = await admin.from('portal_messages')
    .select('id, sender, body, created_at, sender_profile_id, profiles:sender_profile_id ( full_name )')
    .eq('tutor_user_id', ctx.tutorUserId).eq('clinic_id', pc.clinicId)
    .order('created_at', { ascending: true }).limit(200)
  // marca como lidas as mensagens da clínica
  await admin.from('portal_messages').update({ read_at: new Date().toISOString() })
    .eq('tutor_user_id', ctx.tutorUserId).eq('clinic_id', pc.clinicId).eq('sender', 'clinic').is('read_at', null)
  return (data ?? []).map((m: any) => ({
    id: m.id, sender: m.sender, body: m.body, createdAt: m.created_at,
    senderName: m.sender === 'clinic' ? ((Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)?.full_name ?? 'Clínica') : null,
  }))
}

export async function sendPortalMessage(petId: string, body: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await getTutorContext()
  if (!ctx) return { error: 'Sessão expirada.' }
  const text = (body ?? '').trim()
  if (!text) return { error: 'Escreva uma mensagem.' }
  if (text.length > 2000) return { error: 'Mensagem muito longa.' }
  const admin = createAdminClient()
  const pc = await petClinic(admin, petId, ctx.links)
  if (!pc) return { error: 'Sem acesso a este pet.' }
  const { error } = await admin.from('portal_messages').insert({
    clinic_id: pc.clinicId, tutor_user_id: ctx.tutorUserId, patient_id: petId, sender: 'tutor', body: text,
  })
  return error ? { error: error.message } : { ok: true }
}

export async function getUnreadClinicCount(petId: string): Promise<number> {
  const ctx = await getTutorContext()
  if (!ctx) return 0
  const admin = createAdminClient()
  const pc = await petClinic(admin, petId, ctx.links)
  if (!pc) return 0
  const { count } = await admin.from('portal_messages')
    .select('id', { count: 'exact', head: true })
    .eq('tutor_user_id', ctx.tutorUserId).eq('clinic_id', pc.clinicId).eq('sender', 'clinic').is('read_at', null)
  return count ?? 0
}

// ─── Equipe (dashboard) ──────────────────────────────────────────────────────
async function staff(): Promise<{ userId: string; clinicId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { userId: user.id, clinicId: profile.clinic_id as string }
}

export interface PortalThread { tutorUserId: string; tutorName: string | null; lastBody: string; lastAt: string; unread: number }

/** Threads do portal com mensagens (para a caixa de entrada da equipe). */
export async function listPortalThreads(): Promise<PortalThread[]> {
  const s = await staff(); if ('error' in s) return []
  const admin = createAdminClient()
  const { data } = await admin.from('portal_messages')
    .select('tutor_user_id, body, created_at, sender, read_at, tutor_users:tutor_user_id ( full_name )')
    .eq('clinic_id', s.clinicId).order('created_at', { ascending: false }).limit(500)
  const map = new Map<string, PortalThread>()
  for (const m of (data ?? []) as any[]) {
    const cur = map.get(m.tutor_user_id)
    if (!cur) {
      map.set(m.tutor_user_id, {
        tutorUserId: m.tutor_user_id,
        tutorName: (Array.isArray(m.tutor_users) ? m.tutor_users[0] : m.tutor_users)?.full_name ?? null,
        lastBody: m.body, lastAt: m.created_at,
        unread: m.sender === 'tutor' && !m.read_at ? 1 : 0,
      })
    } else if (m.sender === 'tutor' && !m.read_at) cur.unread += 1
  }
  return Array.from(map.values())
}

export async function getThreadMessages(tutorUserId: string): Promise<PortalMessage[]> {
  const s = await staff(); if ('error' in s) return []
  const admin = createAdminClient()
  const { data } = await admin.from('portal_messages')
    .select('id, sender, body, created_at, sender_profile_id, profiles:sender_profile_id ( full_name )')
    .eq('clinic_id', s.clinicId).eq('tutor_user_id', tutorUserId).order('created_at', { ascending: true }).limit(200)
  await admin.from('portal_messages').update({ read_at: new Date().toISOString() })
    .eq('clinic_id', s.clinicId).eq('tutor_user_id', tutorUserId).eq('sender', 'tutor').is('read_at', null)
  return (data ?? []).map((m: any) => ({
    id: m.id, sender: m.sender, body: m.body, createdAt: m.created_at,
    senderName: m.sender === 'clinic' ? ((Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)?.full_name ?? null) : null,
  }))
}

export async function sendClinicMessage(tutorUserId: string, body: string): Promise<{ ok: true } | { error: string }> {
  const s = await staff(); if ('error' in s) return { error: s.error }
  const text = (body ?? '').trim()
  if (!text) return { error: 'Escreva uma mensagem.' }
  const admin = createAdminClient()
  const { error } = await admin.from('portal_messages').insert({
    clinic_id: s.clinicId, tutor_user_id: tutorUserId, sender: 'clinic', sender_profile_id: s.userId, body: text,
  })
  return error ? { error: error.message } : { ok: true }
}

export async function countUnreadThreads(): Promise<number> {
  const s = await staff(); if ('error' in s) return 0
  const admin = createAdminClient()
  const { count } = await admin.from('portal_messages')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', s.clinicId).eq('sender', 'tutor').is('read_at', null)
  return count ?? 0
}
