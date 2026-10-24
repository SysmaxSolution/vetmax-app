// Tipos do painel por setor da Recepção (kanban da agenda).
//
// Vivem aqui, e não em `src/lib/actions/agenda.ts`, porque aquele arquivo é
// `'use server'` — e tipo exportado de módulo 'use server' faz a action
// responder 500 em runtime sem nenhum erro de compilação.

import type { ConsultationStatus } from '@/types'

export interface AgendaCard {
  id: string
  status: ConsultationStatus
  visit_reason: string
  created_at: string
  scheduled_date: string | null
  patient: {
    id: string
    name: string
    species: string
    photo_url: string | null
  }
  tutor: {
    id: string
    name: string
  }
  vet: {
    id: string
    full_name: string
  } | null
  urgency: 'green' | 'yellow' | 'red' | null
}

export type AgendaColumn = {
  key: ConsultationStatus
  label: string
  cards: AgendaCard[]
}
