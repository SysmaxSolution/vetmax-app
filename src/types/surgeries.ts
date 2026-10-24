// Tipos de `src/lib/actions/surgeries.ts`.
//
// Ficam aqui porque aquele arquivo é `'use server'` — tipo exportado de módulo
// 'use server' faz a server action responder 500 em runtime sem erro de
// compilação (regra do projeto).

export type SurgeryStatus = 'preparo' | 'sala' | 'rpa' | 'done' | 'canceled'

export interface SurgeryChecklist {
  fasting_confirmed?: boolean
  preop_exams_ok?:    boolean
  consent_signed?:    boolean
  consent_doc_id?:    string | null
  /** Checagens próprias do serviço (0518): rótulo → marcado. */
  custom?:            Record<string, boolean>
}

export interface SurgeryCard {
  id:              string
  clinic_id:       string
  patient_id:      string
  procedure_name:  string
  status:          SurgeryStatus
  asa_risk:        string | null
  isolation_required?: boolean
  postop_hospitalization_id: string | null
  patient: {
    id: string; name: string; species: string; breed: string | null; photo_url: string | null
  }
  tutor: { name: string } | null
}

export interface SurgeryBoard {
  preparo: SurgeryCard[]
  sala:    SurgeryCard[]
  rpa:     SurgeryCard[]
}

export interface SurgeryDetail extends SurgeryCard {
  consultation_id: string | null
  checklist:       SurgeryChecklist
  surgical_report: string | null
  notes:           string | null
  /** Serviço do catálogo de origem e o que ele traz para a ficha (0518). */
  service_id:              string | null
  service_preop_checklist: string[]
  service_default_kit_id:  string | null
}

export interface SurgeryVital {
  id: string; recorded_at: string
  temperature: number | null; heart_rate: number | null; resp_rate: number | null
  spo2: number | null; blood_pressure: string | null; notes: string | null
}
