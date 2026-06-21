// Mapeamento gatilho→módulo e labels (M8). Módulo PURO (sem 'use server') —
// pode ser importado por server actions e por componentes client.

// Cada gatilho de WhatsApp pertence a um módulo. A clínica pode desligar os
// gatilhos de um módulo inteiro (ex.: internação sim, consultório não).
export const TRIGGER_MODULE: Record<string, string> = {
  triage_called:                   'triagem',
  triage_completed:                'triagem',
  documents_sent:                  'consultorio',
  sent_to_review:                  'consultorio',
  consultation_finished:           'consultorio',
  exam_completed:                  'exames',
  hospitalization_update:          'internacao',
  hospitalization_discharge:       'internacao',
  hospitalization_evolution_saved: 'internacao',
  hospitalization_status_changed:  'internacao',
  hospitalization_started:         'internacao',
  grooming_ready_for_pickup:       'banho_tosa',
  grooming_delivered:              'banho_tosa',
  grooming_evolution_saved:        'banho_tosa',
  appointment_scheduled:           'agenda',
  sale_receipt:                    'caixa',
  package_renewal:                 'caixa',
}

export const TRIGGER_MODULE_LABELS: { key: string; label: string }[] = [
  { key: 'triagem',     label: 'Triagem' },
  { key: 'consultorio', label: 'Consultório' },
  { key: 'exames',      label: 'Exames' },
  { key: 'internacao',  label: 'Internação' },
  { key: 'banho_tosa',  label: 'Banho e Tosa' },
  { key: 'agenda',      label: 'Agenda' },
  { key: 'caixa',       label: 'Caixa / Vendas' },
]
