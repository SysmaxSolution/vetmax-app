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

function ymdInClinicTz(date: Date): { y: number; m: number; d: number; dow: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TZ,
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
    weekday:  'short',
  }).formatToParts(date)
  const y = parseInt(parts.find(p => p.type === 'year')?.value  ?? '0', 10)
  const m = parseInt(parts.find(p => p.type === 'month')?.value ?? '0', 10)
  const d = parseInt(parts.find(p => p.type === 'day')?.value   ?? '0', 10)
  const weekdayShort = parts.find(p => p.type === 'weekday')?.value ?? 'Sun'
  const dowMap: Record<string, number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }
  return { y, m, d, dow: dowMap[weekdayShort] ?? 0 }
}

/** Verifica se uma indisponibilidade-base atinge o dia alvo (date 'YYYY-MM-DD'). */
function unavailabilityHitsDay(
  base: { starts_at: string; recurrence: string; recurrence_until: string | null },
  targetY: number, targetM: number, targetD: number, targetDow: number,
): boolean {
  const baseDate = new Date(base.starts_at)
  const b = ymdInClinicTz(baseDate)

  const targetISO = `${targetY}-${String(targetM).padStart(2,'0')}-${String(targetD).padStart(2,'0')}`
  const baseISO   = `${b.y}-${String(b.m).padStart(2,'0')}-${String(b.d).padStart(2,'0')}`

  if (base.recurrence === 'none') return targetISO === baseISO

  // não pode ocorrer antes do início da recorrência
  if (targetISO < baseISO) return false
  // respeitar recurrence_until
  if (base.recurrence_until && targetISO > base.recurrence_until) return false

  switch (base.recurrence) {
    case 'daily':   return true
    case 'weekly':  return b.dow === targetDow
    case 'monthly': return b.d === targetD
    case 'yearly':  return b.d === targetD && b.m === targetM
    default:        return false
  }
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
    .select('appointment_interval_minutes, clinic_id')
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

  // Bloqueios manuais (eventos/indisponibilidades) — inclui recorrentes.
  // Buscamos TODAS as bases do profissional/clínica e expandimos no Node.
  const unavailPromise = prof?.clinic_id
    ? admin
        .from('professional_unavailabilities')
        .select('starts_at, ends_at, recurrence, recurrence_until')
        .eq('clinic_id', prof.clinic_id)
        .eq('professional_id', professionalId)
    : Promise.resolve({ data: null, error: null })

  const [{ data: appts, error }, { data: unavails }] = await Promise.all([query, unavailPromise])

  if (error) return { error: error.message }

  const fmt = (total: number) =>
    `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`

  const blocked = new Set<string>()
  const ranges: BookedRange[] = []

  // 1) Appointments existentes (consultas/retornos) ocupam intervalMinutes
  for (const appt of (appts ?? [])) {
    const dt          = new Date(appt.appointment_datetime)
    const { hh, mm }  = hhmmInClinicTz(dt)
    const baseMinutes = hh * 60 + mm
    const endMinutes  = Math.min(baseMinutes + intervalMinutes, 24 * 60)
    ranges.push({ start: fmt(baseMinutes), end: fmt(endMinutes) })
    for (let offset = 0; offset < intervalMinutes; offset += 5) {
      const total = baseMinutes + offset
      if (total < 24 * 60) blocked.add(fmt(total))
    }
  }

  // 2) Indisponibilidades (eventos): expande recorrência e usa a duração real do bloco
  const targetParts = (() => {
    const [y, m, d] = date.split('-').map(Number)
    // Para descobrir o dia da semana respeitando o fuso da clínica, criamos um
    // Date "meio-dia BRT" para evitar virada de dia em UTC.
    const noonInClinic = new Date(`${date}T12:00:00-03:00`)
    const dow = ymdInClinicTz(noonInClinic).dow
    return { y, m, d, dow }
  })()

  for (const u of (unavails ?? [])) {
    if (!unavailabilityHitsDay(u, targetParts.y, targetParts.m, targetParts.d, targetParts.dow)) continue
    const startDt = new Date(u.starts_at)
    const endDt   = new Date(u.ends_at)
    const s = hhmmInClinicTz(startDt)
    const e = hhmmInClinicTz(endDt)
    const startMin = s.hh * 60 + s.mm
    const endMin   = Math.min(e.hh * 60 + e.mm, 24 * 60)
    if (endMin <= startMin) continue
    ranges.push({ start: fmt(startMin), end: fmt(endMin) })
    for (let total = startMin; total < endMin; total += 5) {
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
