'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type SlotInfo = {
  /** Slots já ocupados no formato "HH:MM" */
  bookedTimes:      string[]
  /** Intervalo em minutos configurado para o profissional (padrão 60) */
  intervalMinutes:  number
}

/** Retorna os horários ocupados de um profissional em uma data e o intervalo dele */
export async function getProfessionalSlots(
  professionalId: string,
  date: string,          // yyyy-MM-dd
): Promise<SlotInfo | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const admin = createAdminClient()

  // Intervalo do profissional
  const { data: prof } = await admin
    .from('profiles')
    .select('appointment_interval_minutes')
    .eq('id', professionalId)
    .single()

  const intervalMinutes = prof?.appointment_interval_minutes ?? 60

  // Agendamentos não cancelados do profissional na data
  const dayStart = `${date}T00:00:00`
  const dayEnd   = `${date}T23:59:59`

  const { data: appts, error } = await admin
    .from('appointments')
    .select('appointment_datetime')
    .eq('professional_id', professionalId)
    .gte('appointment_datetime', dayStart)
    .lte('appointment_datetime', dayEnd)
    .not('status', 'eq', 'cancelled')

  if (error) return { error: error.message }

  // Extrai HH:MM e expande pelo intervalo (bloqueia slots dentro do intervalo)
  const blocked = new Set<string>()
  for (const appt of (appts ?? [])) {
    const dt = new Date(appt.appointment_datetime)
    // Bloqueia o slot exato e os slots dentro do intervalo configurado
    const baseMinutes = dt.getHours() * 60 + dt.getMinutes()
    for (let offset = 0; offset < intervalMinutes; offset += 30) {
      const total = baseMinutes + offset
      const hh = String(Math.floor(total / 60)).padStart(2, '0')
      const mm = String(total % 60).padStart(2, '0')
      if (total < 24 * 60) blocked.add(`${hh}:${mm}`)
    }
  }

  return {
    bookedTimes:     Array.from(blocked),
    intervalMinutes,
  }
}

/** Verifica se um horário está disponível para um profissional em uma data.
 *  Retorna `{ available: true }` ou `{ available: false, conflictAt: 'HH:MM' }`.
 */
export async function checkProfessionalAvailability(
  professionalId: string,
  date: string,   // yyyy-MM-dd
  time: string,   // HH:MM
): Promise<{ available: true } | { available: false; conflictAt: string } | { error: string }> {
  const slots = await getProfessionalSlots(professionalId, date)
  if ('error' in slots) return { error: slots.error }

  const step     = slots.intervalMinutes > 0 ? slots.intervalMinutes : 60
  const [hh, mm] = time.split(':').map(Number)
  const startMin = hh * 60 + mm

  // Verifica todos os slots que o novo agendamento ocuparia
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
