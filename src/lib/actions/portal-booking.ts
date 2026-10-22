'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getTutorContext } from '@/lib/portal/session'
import { canAccessPatient } from '@/lib/portal/access'
import { resolveBookingConfig, type BookingMode } from '@/lib/scheduling/booking-config'
import { freeSlots, rangeOverlaps, toMin, type Range, type BusinessHoursMap } from '@/lib/scheduling/slots'
import type { PortalBookingOptions, SubmitBookingInput } from '@/lib/portal/types'

const CLINIC_TZ = 'America/Sao_Paulo'

function hhmmInTz(d: Date): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: CLINIC_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
  const hh = p.find(x => x.type === 'hour')?.value ?? '00'
  const mm = p.find(x => x.type === 'minute')?.value ?? '00'
  return `${hh === '24' ? '00' : hh}:${mm}`
}
function dowInTz(dateISO: string): number {
  const noon = new Date(`${dateISO}T12:00:00-03:00`)
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: CLINIC_TZ, weekday: 'short' }).formatToParts(noon).find(p => p.type === 'weekday')?.value ?? 'Sun'
  return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[wd] ?? 0
}

// ── Helpers internos (admin; sem auth de staff) ──────────────────────────────
type LoadResult =
  | { ok: false; error: 'auth' | 'not_found' | 'forbidden' }
  | { ok: true; admin: ReturnType<typeof createAdminClient>; pet: any }

async function loadPetForTutor(petId: string): Promise<LoadResult> {
  const ctx = await getTutorContext()
  if (!ctx) return { ok: false, error: 'auth' }
  const admin = createAdminClient()
  const { data: pet } = await admin
    .from('patients').select('id, name, tutor_id, clinic_id').eq('id', petId).is('deleted_at', null).maybeSingle()
  if (!pet) return { ok: false, error: 'not_found' }
  if (!canAccessPatient((pet as any).tutor_id, (pet as any).clinic_id, ctx.links)) return { ok: false, error: 'forbidden' }
  return { ok: true, admin, pet: pet as any }
}

async function clinicBookingMode(admin: ReturnType<typeof createAdminClient>, clinicId: string): Promise<BookingMode> {
  const { data } = await admin.from('clinics').select('flow_config').eq('id', clinicId).maybeSingle()
  const cfg = resolveBookingConfig((data as any)?.flow_config)
  return cfg.portalEnabled ? cfg.portalMode : 'off'
}

async function vetBookedRanges(admin: ReturnType<typeof createAdminClient>, vetId: string, clinicId: string, dateISO: string): Promise<{ ranges: Range[]; interval: number }> {
  const { data: prof } = await admin.from('profiles').select('appointment_interval_minutes').eq('id', vetId).maybeSingle()
  const interval = (prof as any)?.appointment_interval_minutes ?? 60
  const { data: appts } = await admin
    .from('appointments').select('appointment_datetime, status')
    .eq('professional_id', vetId).eq('clinic_id', clinicId)
    .gte('appointment_datetime', `${dateISO}T00:00:00`).lte('appointment_datetime', `${dateISO}T23:59:59`)
    .neq('status', 'cancelled')
  const ranges: Range[] = []
  for (const a of (appts ?? [])) {
    const start = hhmmInTz(new Date((a as any).appointment_datetime))
    const endMin = Math.min(toMin(start) + interval, 24 * 60)
    ranges.push({ start, end: `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}` })
  }
  return { ranges, interval }
}

// ── Opções de agendamento (UI) ────────────────────────────────────────────────
export async function getPortalBookingOptions(petId: string): Promise<PortalBookingOptions | { error: string }> {
  const r = await loadPetForTutor(petId)
  if (!r.ok) return { error: r.error }
  const { admin, pet } = r

  const mode = await clinicBookingMode(admin, pet.clinic_id)

  const { data: vets } = await admin
    .from('profiles').select('id, full_name')
    .eq('clinic_id', pet.clinic_id).eq('role', 'vet').neq('is_active', false)
    .order('full_name', { ascending: true })

  // sugestão: último MV que atendeu o pet
  const { data: lastCons } = await admin
    .from('consultations').select('vet_id').eq('patient_id', petId).not('vet_id', 'is', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  // serviços agendáveis (com prazo médio → dimensiona o bloco de agenda)
  const { data: catalog } = await admin
    .from('clinic_catalog').select('id, name, expected_duration_minutes, item_type, is_active')
    .eq('clinic_id', pet.clinic_id).eq('is_active', true)
    .in('item_type', ['consultation', 'exam', 'grooming', 'other'])
    .order('name', { ascending: true })

  return {
    mode, petName: pet.name,
    vets: (vets ?? []).map((v: any) => ({ id: v.id, name: v.full_name ?? 'Veterinário' })),
    suggestedVetId: (lastCons as any)?.vet_id ?? null,
    services: (catalog ?? []).map((c: any) => ({ id: c.id, name: c.name, durationMinutes: c.expected_duration_minutes ?? null })),
  }
}

// ── Slots livres (modo direto) ────────────────────────────────────────────────
export async function getPortalFreeSlots(petId: string, vetId: string, dateISO: string, durationOverride?: number | null): Promise<{ slots: string[] } | { error: string }> {
  const r = await loadPetForTutor(petId)
  if (!r.ok) return { error: r.error }
  const { admin, pet } = r
  if (!vetId) return { error: 'Selecione o veterinário.' }

  const { data: clinic } = await admin.from('clinics').select('business_hours').eq('id', pet.clinic_id).maybeSingle()
  const bh = (clinic as any)?.business_hours as BusinessHoursMap | null
  const { ranges, interval } = await vetBookedRanges(admin, vetId, pet.clinic_id, dateISO)
  // O bloco usa o prazo médio do serviço quando informado; senão o intervalo do MV.
  const step = durationOverride && durationOverride > 0 ? durationOverride : interval

  // hoje: descarta horários já passados (no fuso da clínica)
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ }).format(new Date())
  const minStart = dateISO === todayISO ? toMin(hhmmInTz(new Date())) : 0

  return { slots: freeSlots(bh, dowInTz(dateISO), step, ranges, minStart) }
}

// ── Submit ─────────────────────────────────────────────────────────────────────
export async function submitPortalBooking(
  input: SubmitBookingInput,
): Promise<{ mode: 'reception'; requestId: string } | { mode: 'direct'; appointmentId: string } | { error: string }> {
  const r = await loadPetForTutor(input.petId)
  if (!r.ok) return { error: r.error === 'auth' ? 'Sessão expirada.' : 'Pet não encontrado.' }
  const { admin, pet } = r
  if (!input.date || !input.time) return { error: 'Escolha data e horário.' }

  const mode = await clinicBookingMode(admin, pet.clinic_id)
  if (mode === 'off') return { error: 'Agendamento pelo portal não está disponível nesta clínica.' }

  // Serviço escolhido → prazo médio (dimensiona o bloco) + nome como motivo
  let serviceDuration: number | null = null
  let serviceName: string | null = null
  if (input.serviceId) {
    const { data: svc } = await admin.from('clinic_catalog')
      .select('name, expected_duration_minutes').eq('id', input.serviceId).eq('clinic_id', pet.clinic_id).maybeSingle()
    if (svc) { serviceDuration = (svc as any).expected_duration_minutes ?? null; serviceName = (svc as any).name ?? null }
  }
  const reasonFinal = input.reason?.trim() || serviceName || 'Consulta'

  if (mode === 'reception') {
    const { data, error } = await admin.from('appointment_requests').insert({
      clinic_id: pet.clinic_id, conversation_id: null, tutor_id: pet.tutor_id, pet_id: pet.id,
      preferred_date: input.date, preferred_time: input.time,
      preferred_date_alt: input.altDate || null, preferred_time_alt: input.altTime || null,
      visit_reason: reasonFinal, vet_id: input.vetId || null,
      status: 'pending_reception_validation', source: 'portal',
    }).select('id').single()
    if (error || !data) return { error: 'Não foi possível enviar a solicitação.' }
    return { mode: 'reception', requestId: data.id as string }
  }

  // modo direto — exige vet e horário livre (checagem no servidor)
  if (!input.vetId) return { error: 'Selecione o veterinário.' }
  const { ranges, interval } = await vetBookedRanges(admin, input.vetId, pet.clinic_id, input.date)
  const step = serviceDuration && serviceDuration > 0 ? serviceDuration : interval
  const startMin = toMin(input.time)
  if (rangeOverlaps(startMin, startMin + step, ranges)) {
    return { error: 'Esse horário acabou de ser ocupado. Escolha outro.' }
  }
  const { data, error } = await admin.from('appointments').insert({
    clinic_id: pet.clinic_id, pet_id: pet.id, tutor_id: pet.tutor_id,
    appointment_datetime: `${input.date}T${input.time}:00`,
    reason: reasonFinal, professional_id: input.vetId,
    duration_minutes: serviceDuration && serviceDuration > 0 ? serviceDuration : null,
    status: 'scheduled', source: 'portal',
  }).select('id').single()
  if (error || !data) return { error: 'Não foi possível agendar. Tente novamente.' }
  return { mode: 'direct', appointmentId: data.id as string }
}
