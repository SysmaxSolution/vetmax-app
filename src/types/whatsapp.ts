// Tipos neutros (sem 'use server' / 'use client') compartilhados entre actions e componentes

export interface ClinicalContext {
  tutor: { id: string; name: string | null; phone: string | null } | null
  patients: Array<{
    id:                    string
    name:                  string
    species:               string
    breed:                 string | null
    last_weight:           number | null
    last_consultation:     { date: string; visit_reason: string; status: string } | null
    upcoming_consultation: { date: string; visit_reason: string } | null
  }>
}

export interface WppConsultationLink {
  id:             string
  scheduled_date: string | null
  visit_reason:   string | null
  status:         string
  pet_name?:      string
}
