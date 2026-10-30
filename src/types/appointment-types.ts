// Tipos de `src/lib/actions/appointment-types.ts` (arquivo 'use server' não
// pode exportar tipo — regra do projeto).

/** Tipo de atendimento da agenda: duração padrão, setor, recurso e serviço. */
export interface AppointmentType {
  id:                    string
  clinic_id:             string
  name:                  string
  sector:                string | null
  duration_minutes:      number
  color:                 string | null
  requires_professional: boolean
  default_room_id:       string | null
  default_room_name:     string | null
  service_item_id:       string | null
  is_active:             boolean
}

export interface AppointmentTypeInput {
  id?:                   string
  name:                  string
  sector?:               string | null
  duration_minutes:      number
  color?:                string | null
  requires_professional?: boolean
  default_room_id?:      string | null
  service_item_id?:      string | null
  is_active?:            boolean
}
