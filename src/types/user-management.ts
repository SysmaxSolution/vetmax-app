// Tipos de `src/lib/actions/user-management.ts`.
//
// Ficam aqui porque aquele arquivo é `'use server'` — tipo exportado de módulo
// 'use server' faz a server action responder 500 em runtime sem erro de
// compilação (regra do projeto).

export interface ClinicUserFull {
  id:                          string
  full_name:                   string
  last_name:                   string | null
  role:                        string
  crmv:                        string | null
  mapa_code:                   string | null
  phone:                       string | null
  specialties:                 string[] | null
  nickname:                    string | null
  photo_url:                   string | null
  address:                     string | null
  is_active:                   boolean | null
  room:                        string | null
  /** Setor da agenda (Imagem, Clínica, Cirurgia…). */
  sector:                      string | null
  electronic_signature_url:    string | null
  electronic_signature_path?:   string | null
  appointment_interval_minutes: number | null
}

export interface AdminUpdateUserPayload {
  userId:                       string
  full_name?:                   string
  last_name?:                   string | null
  role?:                        string
  crmv?:                        string | null
  mapa_code?:                   string | null
  phone?:                       string | null
  specialties?:                 string[]
  nickname?:                    string | null
  address?:                     string | null
  is_active?:                   boolean
  room?:                        string | null
  sector?:                      string | null
  photo_url?:                   string | null
  electronic_signature_url?:    string | null
  appointment_interval_minutes?: number | null
}

export type UserModuleAccessRow = {
  module_name: string
  enabled:     boolean
}
