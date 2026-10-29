// Tipos da extração por voz da consulta (Single Voice Engine).
//
// Módulo PURO — saíram de `src/lib/actions/pharmacy.ts`, que tem 'use server'.
// Tipo exportado de server action responde 500 em produção sem erro de
// compilação; a guarda `guard-use-server-types.mjs` bloqueia o padrão.

export type VoiceExtractionResult = {
  notas_clinicas: string
  transcript_corrected?: string  // Frente 2: transcrição após o dicionário de correção
  medicacoes_aplicadas: Array<{
    medication_name: string
    dosage: string | null
    route: 'IV' | 'IM' | 'SC' | 'oral' | 'topical' | 'other' | null
    notes: string | null
    is_controlled?: boolean
  }>
  documentos_sugeridos: Array<{
    tipo: 'receita' | 'encaminhamento' | 'exame' | 'laudo'
    motivo: string
    title: string
    summary: string
    is_controlled?: boolean
  }>
  agendamentos_sugeridos: Array<{
    data_sugerida: string   // YYYY-MM-DD
    motivo: string          // "Retorno" | "Consulta" | "Exame" | "Vacinação" | "Cirurgia"
  }>
  sinais_vitais?: {
    weight?:           number | null
    temperature?:      number | null
    heart_rate?:       number | null
    respiratory_rate?: number | null
    chief_complaint?:  string | null
  }
  laudo_exame?: string
  vaccines_applied?: Array<{
    vaccine_name:  string
    next_due_date: string | null
    notes:         string | null
  }>
  // NOVO: Cadastro Vivo
  pet_profile_updates?: {
    medical_history?: string | null
    reproductive_status?: string | null
    coat_color?: string | null
    behavior_tags?: string[]
  }
  // NOVO: Roteamento por Voz
  suggested_routing?: 'discharge' | 'hospitalization' | 'exams' | 'waiting_exam' | null

}
export type FlowConfigInput = {
  vet_merged_modules: Array<'triage' | 'exams'>
}
