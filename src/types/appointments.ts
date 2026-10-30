// Tipos de `src/lib/actions/appointments.ts`.
//
// Ficam aqui porque aquele arquivo é `'use server'` — tipo exportado de módulo
// 'use server' faz a server action responder 500 em runtime sem erro de
// compilação (regra do projeto).

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'cancelled' | 'arrived'

export interface AppointmentItem {
  id: string
  pet_id: string
  tutor_id: string
  appointment_datetime: string
  reason: string
  status: AppointmentStatus
  notes: string | null
  created_at: string
  patient: { id: string; name: string; species: string; breed: string | null }
  tutor:   { id: string; name: string; phone: string }
}

export interface CreateAppointmentPayload {
  pet_id:               string
  tutor_id:             string
  appointment_datetime: string   // 'YYYY-MM-DDTHH:MM:00' — naive local time
  reason:               string
  notes?:               string
  professional_id?:     string
  duration_minutes?:    number   // M4 — NULL usa o intervalo do profissional
  /** Sala/aparelho ocupado (0527) — conflito é recusado no servidor. */
  room_id?:             string
  appointment_type_id?: string
}

export interface UpcomingAppointment {
  id:                   string
  appointment_datetime: string
  reason:               string
  status:               AppointmentStatus
  notes:                string | null
}

export interface AppointmentFull {
  id:                   string
  pet_id:               string
  tutor_id:             string
  professional_id:      string | null
  appointment_datetime: string
  reason:               string
  status:               string
  notes:                string | null
  duration_minutes:     number | null
  patient:              { id: string; name: string; species: string }
  tutor:                { id: string; name: string; phone: string }
  professional:         { id: string; full_name: string } | null
}

export interface UpdateAppointmentPayload {
  appointment_datetime?: string
  professional_id?:      string | null
  notes?:                string | null
  duration_minutes?:     number | null
}

export interface ProfessionalCount {
  vet_id: string
  vet_name: string
  count: number
}
