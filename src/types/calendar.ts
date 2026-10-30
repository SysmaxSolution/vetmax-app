// Tipos de `src/lib/actions/calendar.ts`.
//
// Ficam aqui porque aquele arquivo é `'use server'` — tipo exportado de módulo
// 'use server' faz a server action responder 500 em runtime sem erro de
// compilação (regra do projeto).

export type CalendarEventType = 'appointment' | 'grooming'

export interface UnifiedCalendarEvent {
  id:               string
  type:             CalendarEventType
  title:            string
  datetime:         string        // ISO datetime of start
  status:           string
  petId:            string
  petName:          string
  tutorName:        string
  petSpecies:       string
  sourceId:         string
  reason?:          string        // appointment reason
  services?:        string[]      // grooming services
  source?:          string        // 'manual' | 'whatsapp'
  professionalId:   string | null
  professionalName: string | null
  durationMinutes:  number        // duração do bloco na agenda (default 60 / 120 grooming)
  /** Recurso (sala/aparelho) e tipo de atendimento da marcação (0527). */
  roomId?:          string | null
  roomName?:        string | null
  appointmentTypeName?: string | null
  appointmentTypeColor?: string | null
  botConfirmationStatus?: 'confirmed' | 'rescheduled' | 'cancelled' | null
}

export interface CalendarProfessional {
  id:   string
  name: string
  role: string
  sector?: string | null
}

/** Sala/aparelho que aparece como coluna da agenda (rooms.schedulable). */
export interface ScheduleResource {
  id:       string
  name:     string
  type:     string
  sector:   string | null
  color:    string | null
  capacity: number
}
