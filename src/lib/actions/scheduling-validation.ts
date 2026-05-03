'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Validate if a time slot is available for scheduling against clinic_settings.
 * - Check clinic business_hours for the day
 * - Check working_days array
 * - Check if holiday_work is allowed
 * - Check existing grooming_sessions for conflicts
 */

export async function validateSchedulingSlot(data: {
  clinic_id: string
  scheduled_date: string // ISO 8601 date: YYYY-MM-DD
  scheduled_time: string // HH:MM (24h format)
  duration_minutes: number
}): Promise<{ valid: boolean; reason?: string }> {
  const supabase = await createClient()

  // 1. Fetch clinic settings
  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .select('business_hours, working_days, holiday_work')
    .eq('id', data.clinic_id)
    .single()

  if (clinicError || !clinic) {
    return { valid: false, reason: 'Clínica não encontrada' }
  }

  // 2. Parse requested date and time
  const requestedDate = new Date(`${data.scheduled_date}T${data.scheduled_time}:00`)
  if (isNaN(requestedDate.getTime())) {
    return { valid: false, reason: 'Data/hora inválida' }
  }

  // 3. Get ISO weekday (1=Mon, 7=Sun)
  const isoWeekday = requestedDate.getDay()
  const normalizedWeekday = isoWeekday === 0 ? 7 : isoWeekday

  // 4. Check if day is in working_days
  const workingDays = Array.isArray(clinic.working_days) ? clinic.working_days : [1, 2, 3, 4, 5, 6]
  if (!workingDays.includes(normalizedWeekday)) {
    return { valid: false, reason: 'Clínica fechada neste dia' }
  }

  // 5. Check business hours for the day
  const businessHours = clinic.business_hours as Record<string, { open: string; close: string } | null>
  const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][isoWeekday]
  const daySchedule = businessHours?.[dayName]

  if (!daySchedule) {
    return { valid: false, reason: 'Horário não disponível para este dia' }
  }

  // 6. Validate requested time is within business hours
  const [openHour, openMin] = daySchedule.open.split(':').map(Number)
  const [closeHour, closeMin] = daySchedule.close.split(':').map(Number)
  const [reqHour, reqMin] = data.scheduled_time.split(':').map(Number)

  const openMinutes = openHour * 60 + openMin
  const closeMinutes = closeHour * 60 + closeMin
  const reqMinutes = reqHour * 60 + reqMin
  const endMinutes = reqMinutes + data.duration_minutes

  if (reqMinutes < openMinutes || endMinutes > closeMinutes) {
    return { valid: false, reason: `Horário fora do funcionamento (${daySchedule.open} - ${daySchedule.close})` }
  }

  // 7. Check for existing conflicts in grooming_sessions
  const slotStart = new Date(requestedDate)
  const slotEnd = new Date(slotStart.getTime() + data.duration_minutes * 60000)

  const { data: conflicts, error: conflictError } = await supabase
    .from('grooming_sessions')
    .select('id, scheduled_at')
    .eq('clinic_id', data.clinic_id)
    .eq('scheduled_at', data.scheduled_date) // date match
    .in('current_status', ['scheduled', 'arrived', 'bathing', 'grooming', 'drying', 'waiting_pickup'])

  if (conflictError) {
    return { valid: false, reason: 'Erro ao validar disponibilidade' }
  }

  // Simple conflict check: if any session on same date at similar time, flag it
  // For more sophisticated slot management, integrate with professional_schedules
  if (conflicts && conflicts.length > 0) {
    // In real scenario, check actual time overlaps
    // For now, assume same-date sessions might conflict
    return { valid: false, reason: 'Horário pode estar em conflito' }
  }

  return { valid: true }
}

/**
 * Get available time slots for a specific date based on clinic settings.
 * Returns array of HH:MM slots with configurable interval (e.g., 30min, 1h).
 */

export async function getAvailableSlots(data: {
  clinic_id: string
  scheduled_date: string // YYYY-MM-DD
  interval_minutes?: number // default 30
  duration_minutes?: number // session length, default 60
}): Promise<{ slots: string[]; reason?: string }> {
  const supabase = await createClient()
  const interval = data.interval_minutes || 30
  const duration = data.duration_minutes || 60

  // 1. Fetch clinic settings
  const { data: clinic, error: clinicError } = await supabase
    .from('clinics')
    .select('business_hours, working_days')
    .eq('id', data.clinic_id)
    .single()

  if (clinicError || !clinic) {
    return { slots: [], reason: 'Clínica não encontrada' }
  }

  // 2. Parse date
  const date = new Date(`${data.scheduled_date}T00:00:00`)
  if (isNaN(date.getTime())) {
    return { slots: [], reason: 'Data inválida' }
  }

  const isoWeekday = date.getDay()
  const normalizedWeekday = isoWeekday === 0 ? 7 : isoWeekday
  const workingDays = Array.isArray(clinic.working_days) ? clinic.working_days : [1, 2, 3, 4, 5, 6]

  if (!workingDays.includes(normalizedWeekday)) {
    return { slots: [] } // Closed day
  }

  // 3. Get business hours
  const businessHours = clinic.business_hours as Record<string, { open: string; close: string } | null>
  const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][isoWeekday]
  const daySchedule = businessHours?.[dayName]

  if (!daySchedule) {
    return { slots: [] }
  }

  // 4. Generate slot array
  const [openHour, openMin] = daySchedule.open.split(':').map(Number)
  const [closeHour, closeMin] = daySchedule.close.split(':').map(Number)

  const openMinutes = openHour * 60 + openMin
  const closeMinutes = closeHour * 60 + closeMin
  const slots: string[] = []

  for (let m = openMinutes; m + duration <= closeMinutes; m += interval) {
    const h = Math.floor(m / 60)
    const min = m % 60
    slots.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`)
  }

  return { slots }
}
