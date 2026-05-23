'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type BookedRange = { start: string; end: string } // 'HH:MM'

export type SlotInfo = {
  bookedTimes:     string[]
  bookedRanges:    BookedRange[]
  intervalMinutes: number
}

// Fuso horário de referência (todas as clínicas no Brasil — Brasília).
// Importante: server actions rodam na Vercel em UTC; usar getHours() aqui
// leria 12h para um agendamento de 09h BRT (offset -03:00). Sempre extrair
// HH/MM no fuso da clínica via Intl.DateTimeFormat.
const CLINIC_TZ = 'America/Sao_Paulo'

function hhmmInClinicTz(date: Date): { hh: number; mm: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TZ,
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false,
  }).formatToParts(date)
  const hh = parseInt(parts.find(p => p.type === 'hour')?.value   ?? '0', 10)
  const mm = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10)
  return { hh: hh === 24 ? 0 : hh, mm }
}

export async function getProfessionalSlots(
  professionalId: string,
  date: string,
  excludeAppointmentId?: string,
): Promise<SlotInfo | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()

  const { data: prof } = await admin
    .from('profiles')
    .select('appointment_interval_minutes')
    .eq('id', professionalId)
    .single()

  const intervalMinutes = prof?.appointment_interval_minutes ?? 60

  const dayStart = `${date}T00:00:00`
  const dayEnd   = `${date}T23:59:59`

  let query = admin
    .from('appointments')
    .select('appointment_datetime')
    .eq('professional_id', professionalId)
    .gte('appointment_datetime', dayStart)
    .lte('appointment_datetime', dayEnd)
    .not('status', 'eq', 'cancelled')

  if (excludeAppointmentId) {
    query = query.neq('id', excludeAppointmentId)
  }

  const { data: appts, error } = await query

  if (error) return { error: error.message }

  const blocked = new Set<string>()
  const ranges: BookedRange[] = []
  for (const appt of (appts ?? [])) {
    const dt          = new Date(appt.appointment_datetime)
    const { hh, mm }  = hhmmInClinicTz(dt)
    const baseMinutes = hh * 60 + mm
    const endMinutes  = Math.min(baseMinutes + intervalMinutes, 24 * 60)
    const fmt = (total: number) =>
      `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
    ranges.push({ start: fmt(baseMinutes), end: fmt(endMinutes) })
    for (let offset = 0; offset < intervalMinutes; offset += 5) {
      const total = baseMinutes + offset
      if (total < 24 * 60) blocked.add(fmt(total))
    }
  }

  return { bookedTimes: Array.from(blocked), bookedRanges: ranges, intervalMinutes }
}

export async function checkProfessionalAvailability(
  professionalId: string,
  date: string,
  time: string,
  excludeAppointmentId?: string,
): Promise<{ available: true } | { available: false; conflictAt: string } | { error: string }> {
  const slots = await getProfessionalSlots(professionalId, date, excludeAppointmentId)
  if ('error' in slots) return { error: slots.error }

  const step     = slots.intervalMinutes > 0 ? slots.intervalMinutes : 60
  const [hh, mm] = time.split(':').map(Number)
  const newStart = hh * 60 + mm
  const newEnd   = newStart + step

  for (const r of slots.bookedRanges) {
    const [rsH, rsM] = r.start.split(':').map(Number)
    const [reH, reM] = r.end.split(':').map(Number)
    const rs = rsH * 60 + rsM
    const re = reH * 60 + reM
    // Sobreposição de intervalos: [newStart, newEnd) ∩ [rs, re) ≠ ∅
    if (newStart < re && rs < newEnd) {
      return { available: false, conflictAt: r.start }
    }
  }
  return { available: true }
}
