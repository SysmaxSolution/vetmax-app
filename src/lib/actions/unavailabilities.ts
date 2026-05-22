'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface UnavailabilityBlock {
  starts_at: string   // ISO UTC
  ends_at:   string   // ISO UTC
}

export interface CreateUnavailabilityPayload {
  professional_id:  string
  title?:           string | null
  notes?:           string | null
  blocks:           UnavailabilityBlock[]
  recurrence:       Recurrence
  recurrence_until?: string | null   // 'YYYY-MM-DD'
}

export interface UnavailabilityRow {
  id:               string
  professional_id:  string
  title:            string | null
  notes:            string | null
  starts_at:        string
  ends_at:          string
  recurrence:       Recurrence
  recurrence_until: string | null
  professional_name?: string | null
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getUserClinic(): Promise<{ clinicId: string; userId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return { clinicId: profile.clinic_id, userId: user.id }
}

// ─── Create (insere uma linha por bloco) ──────────────────────────────────────

export async function createUnavailabilities(
  payload: CreateUnavailabilityPayload
): Promise<{ success: true; count: number } | { error: string }> {
  const auth = await getUserClinic()
  if ('error' in auth) return auth

  if (!payload.professional_id) return { error: 'Selecione um profissional.' }
  if (!payload.blocks?.length)   return { error: 'Adicione ao menos um bloco de data e horário.' }

  const rows = payload.blocks.map(b => ({
    clinic_id:        auth.clinicId,
    professional_id:  payload.professional_id,
    title:            payload.title?.trim() || null,
    notes:            payload.notes?.trim() || null,
    starts_at:        b.starts_at,
    ends_at:          b.ends_at,
    recurrence:       payload.recurrence,
    recurrence_until: payload.recurrence_until || null,
    created_by:       auth.userId,
  }))

  const supabase = await createClient()
  const { error } = await supabase.from('professional_unavailabilities').insert(rows)
  if (error) return { error: 'Erro ao salvar evento: ' + error.message }

  revalidatePath('/dashboard/appointments')
  revalidatePath('/dashboard/reception')
  return { success: true, count: rows.length }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteUnavailability(id: string): Promise<{ success: true } | { error: string }> {
  const auth = await getUserClinic()
  if ('error' in auth) return auth

  const supabase = await createClient()
  const { error } = await supabase
    .from('professional_unavailabilities')
    .delete()
    .eq('id', id)
    .eq('clinic_id', auth.clinicId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/appointments')
  return { success: true }
}

// ─── Expansão de recorrência ──────────────────────────────────────────────────

function addInterval(date: Date, recurrence: Recurrence): Date {
  const d = new Date(date)
  switch (recurrence) {
    case 'daily':   d.setDate(d.getDate() + 1); break
    case 'weekly':  d.setDate(d.getDate() + 7); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'yearly':  d.setFullYear(d.getFullYear() + 1); break
    default: break
  }
  return d
}

interface ExpandedOccurrence {
  id:              string         // id-base#index para chave única no UI
  base_id:         string
  professional_id: string
  professional_name: string | null
  title:           string | null
  notes:           string | null
  starts_at:       string
  ends_at:         string
  recurrence:      Recurrence
}

export async function listUnavailabilitiesInRange(
  rangeStart: string,  // 'YYYY-MM-DD'
  rangeEnd:   string,  // 'YYYY-MM-DD'
): Promise<ExpandedOccurrence[] | { error: string }> {
  const auth = await getUserClinic()
  if ('error' in auth) return auth

  const supabase = await createClient()
  const startUtc = new Date(`${rangeStart}T00:00:00`).toISOString()
  const endUtc   = new Date(`${rangeEnd}T23:59:59`).toISOString()

  // Busca todas as bases potencialmente relevantes:
  //  - não-recorrentes que se sobrepõem ao range
  //  - recorrentes cujo starts_at <= rangeEnd e recurrence_until >= rangeStart (ou null)
  const { data, error } = await supabase
    .from('professional_unavailabilities')
    .select(`
      id, professional_id, title, notes, starts_at, ends_at, recurrence, recurrence_until,
      profiles:professional_id ( full_name )
    `)
    .eq('clinic_id', auth.clinicId)
    .or(`and(recurrence.eq.none,ends_at.gte.${startUtc},starts_at.lte.${endUtc}),and(recurrence.neq.none,starts_at.lte.${endUtc})`)

  if (error) return { error: error.message }
  if (!data) return []

  const result: ExpandedOccurrence[] = []
  const rangeStartMs = new Date(`${rangeStart}T00:00:00`).getTime()
  const rangeEndMs   = new Date(`${rangeEnd}T23:59:59`).getTime()

  for (const row of data) {
    const profilesField = (row as unknown as { profiles?: { full_name: string | null } | { full_name: string | null }[] | null }).profiles
    const profName = Array.isArray(profilesField)
      ? (profilesField[0]?.full_name ?? null)
      : (profilesField?.full_name ?? null)
    const base = {
      base_id:         row.id,
      professional_id: row.professional_id,
      professional_name: profName,
      title:           row.title,
      notes:           row.notes,
      recurrence:      row.recurrence as Recurrence,
    }

    if (row.recurrence === 'none') {
      result.push({
        ...base,
        id:        row.id,
        starts_at: row.starts_at,
        ends_at:   row.ends_at,
      })
      continue
    }

    // Expansão até no máximo 366 iterações ou até o limite do range / recurrence_until
    const durationMs = new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()
    const untilMs = row.recurrence_until
      ? Math.min(new Date(`${row.recurrence_until}T23:59:59`).getTime(), rangeEndMs)
      : rangeEndMs

    let cursor = new Date(row.starts_at)
    let i = 0
    while (cursor.getTime() <= untilMs && i < 366) {
      const startMs = cursor.getTime()
      const endMs   = startMs + durationMs
      if (endMs >= rangeStartMs) {
        result.push({
          ...base,
          id:        `${row.id}#${i}`,
          starts_at: cursor.toISOString(),
          ends_at:   new Date(endMs).toISOString(),
        })
      }
      cursor = addInterval(cursor, row.recurrence as Recurrence)
      i++
    }
  }

  return result.sort((a, b) => a.starts_at.localeCompare(b.starts_at))
}
