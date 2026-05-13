'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type SlotInfo = {
  bookedTimes:     string[]
  intervalMinutes: number
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
  for (const appt of (appts ?? [])) {
    const dt          = new Date(appt.appointment_datetime)
    const baseMinutes = dt.getHours() * 60 + dt.getMinutes()
    for (let offset = 0; offset < intervalMinutes; offset += 30) {
      const total = baseMinutes + offset
      const hh = String(Math.floor(total / 60)).padStart(2, '0')
      const mm = String(total % 60).padStart(2, '0')
      if (total < 24 * 60) blocked.add(`${hh}:${mm}`)
    }
  }

  return { bookedTimes: Array.from(blocked), intervalMinutes }
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
  const startMin = hh * 60 + mm

  for (let offset = 0; offset < step; offset += 30) {
    const total  = startMin + offset
    const slotHH = String(Math.floor(total / 60)).padStart(2, '0')
    const slotMM = String(total % 60).padStart(2, '0')
    const slot   = `${slotHH}:${slotMM}`
    if (slots.bookedTimes.includes(slot)) {
      return { available: false, conflictAt: slot }
    }
  }
  return { available: true }
}
