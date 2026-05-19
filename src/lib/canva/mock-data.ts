/**
 * Mock data compartilhado entre o EDITOR (CanvasStage/ElementRenderers
 * em modo edit) e o PREVIEW (LaudoPrintable em modo print via
 * buildPreviewContext). Centralizar evita divergências como "PDF tem 3
 * medicações mas editor tem 5".
 *
 * Quando o admin sobe o editor sem uma consulta real aberta, tudo que
 * ele vê (pet/tutor/vet/medicações) vem daqui. No fluxo do veterinário
 * em consultório, esses dados são substituídos pelo ResolveContext
 * real do paciente em atendimento.
 */

import type { ResolveContext } from './dynamic-tags'

export const MOCK_PATIENT = {
  name: 'Toby',
  species: 'Canino',
  breed: 'Golden Retriever',
  sex: 'Macho',
  age: '4 anos',
  weight: 28.4,
  color: 'Dourado',
  microchip: '900215001234567',
}

export const MOCK_TUTOR = {
  name: 'Maria Silva',
  cpf: '12345678900',
  email: 'maria@exemplo.com',
  phone: '11988887777',
  address: 'Rua das Flores, 123',
}

export const MOCK_CONSULTATION_BASE = {
  diagnosis: 'Suspeita de cardiopatia hipertrófica',
  complaint: 'Tosse seca persistente há 3 dias',
  weight: 28.4,
  temperature: 38.5,
  visit_reason_label: 'Consulta',
}

/** 5 medicações cobrindo todas as combinações de via/classe — assim o
 *  preview do Receituário Padrão exibe agrupamento por via + destaque
 *  de controlados de forma representativa. */
export const MOCK_PRESCRIPTIONS = [
  {
    medication: 'Dipirona 25mg/mL', dose: '1 mL',
    frequency: 'a cada 8h', duration_days: 5,
    route_of_administration: 'oral', prescription_type: 'common',
    is_controlled: false,
    orientation: 'Administrar com alimento.',
  },
  {
    medication: 'Drontal Plus', dose: '1 comp por 10 kg',
    frequency: 'dose única, repetir em 30 dias', duration_days: 1,
    route_of_administration: 'oral', prescription_type: 'common',
    is_controlled: false,
  },
  {
    medication: 'Tramadol 50mg', dose: '50 mg',
    frequency: 'a cada 12h', duration_days: 5,
    route_of_administration: 'oral', prescription_type: 'controlled',
    is_controlled: true,
    orientation: 'Receituário azul. Manter fora do alcance.',
  },
  {
    medication: 'Cloridrato de Tramadol Manipulado', dose: '5 gotas',
    frequency: 'a cada 8h', duration_days: 3,
    route_of_administration: 'oral', prescription_type: 'manipulated',
    is_controlled: true,
  },
  {
    medication: 'Pomada Furacin', dose: 'Aplicar fina camada',
    frequency: '3× ao dia', duration_days: 7,
    route_of_administration: 'topical', prescription_type: 'common',
    is_controlled: false,
  },
]

export const MOCK_EXAM_ITEMS = [
  { name: 'Hemograma completo', urgency: 'rotina' },
  { name: 'Ecocardiograma',     urgency: 'urgente' },
  { name: 'Bioquímica renal',   urgency: 'rotina' },
]

export const MOCK_VACCINES = [
  { name: 'V10 (polivalente)', date: '15/04/2026', next: '15/04/2027' },
  { name: 'Antirrábica',       date: '15/04/2026', next: '15/04/2027' },
]

export const MOCK_DYNAMIC_FIELDS = [
  { name: 'Pressão Arterial: 120/80 mmHg' },
  { name: 'Glicemia: 95 mg/dL' },
]

/** Pacote completo para o Repeater — usado tanto pelo renderer em modo edit
 *  (quando ctx é null) quanto pelo buildPreviewContext (consulta sintética). */
export const MOCK_REPEATER_DATA = {
  prescriptions: MOCK_PRESCRIPTIONS,
  exam_items: MOCK_EXAM_ITEMS,
  vaccines: MOCK_VACCINES,
  dynamic_fields: MOCK_DYNAMIC_FIELDS,
} as const

/** Monta o consultation mock incluindo as listas para o Repeater. */
export function buildMockConsultation(date?: Date): Record<string, unknown> {
  const now = date ?? new Date()
  return {
    ...MOCK_CONSULTATION_BASE,
    date: now.toISOString(),
    datetime: now.toISOString(),
    prescriptions: MOCK_PRESCRIPTIONS,
    exam_items: MOCK_EXAM_ITEMS,
    vaccines: MOCK_VACCINES,
  }
}

/** Mini ResolveContext sem clínica/vet reais — útil para previews puramente
 *  estáticos (ex: blocos catalog). NÃO usar em produção. */
export function mockResolveContext(): ResolveContext {
  return {
    patient: { ...MOCK_PATIENT },
    tutor: { ...MOCK_TUTOR },
    consultation: buildMockConsultation(),
    clinic: { name: 'AlmaVet', city: 'São Paulo', state: 'SP' },
    vet: { full_name: 'Dra. Laís Silva', crmv: 'CRMV-SP 12345', nickname: 'Dra. Laís' },
  }
}
