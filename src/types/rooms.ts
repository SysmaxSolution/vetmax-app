// Tipos de `src/lib/actions/rooms.ts`.
//
// Ficam aqui porque aquele arquivo é `'use server'` — tipo exportado de módulo
// 'use server' faz a server action responder 500 em runtime sem erro de
// compilação (regra do projeto).

export type RoomType = 'consultation' | 'surgery' | 'grooming' | 'exam' | 'hospitalization'

export type RoomOperationalStatus = 'active' | 'maintenance'

export type RoomCareLevel = 'enfermaria' | 'semi_intensiva' | 'uti' | 'isolamento'

export interface Room {
  id: string
  clinic_id: string
  name: string
  type: RoomType
  capacity: number
  active: boolean
  daily_rate: number
  operational_status: RoomOperationalStatus
  default_care_level: RoomCareLevel | null
  /** Aparece como coluna (recurso) da agenda. */
  schedulable: boolean
  /** Setor da agenda (Imagem, Cirurgia…). */
  sector: string | null
  color: string | null
  created_at: string
  updated_at: string
}
