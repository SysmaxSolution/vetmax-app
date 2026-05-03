// Arquivo sem 'use server' — pode ser importado por Client e Server Components
import type { DocumentTemplate } from '@/types'

export const SYSMAX_TEMPLATE_IDS = {
  receita:        '__sysmax_receita__',
  encaminhamento: '__sysmax_encaminhamento__',
} as const

export function isSystemTemplate(templateId: string): boolean {
  return templateId.startsWith('__sysmax_')
}

export const SYSTEM_TEMPLATES: DocumentTemplate[] = [
  {
    id:              '__sysmax_receita__',
    clinic_id:       '__sysmax__',
    name:            'Receita Padrão Sysmax',
    type:            'receita',
    file_url:        null,
    created_at:      new Date(0).toISOString(),
    extracted_fields: [
      {
        field_name:  'medicamento',
        label:       'Medicamento e Concentração',
        type:        'text',
        description: 'Nome e concentração do medicamento (ex: Meloxicam 0,5mg/ml)',
        required:    true,
      },
      {
        field_name:  'posologia',
        label:       'Posologia',
        type:        'textarea',
        description: 'Dose, via, frequência e duração (ex: 0,2mg/kg VO a cada 24h por 5 dias)',
        required:    true,
      },
      {
        field_name:  'indicacao',
        label:       'Indicação Clínica',
        type:        'text',
        description: 'Motivo da prescrição (ex: anti-inflamatório pós-cirúrgico)',
        required:    false,
      },
      {
        field_name:  'observacoes',
        label:       'Observações para o Tutor',
        type:        'textarea',
        description: 'Precauções, interações ou cuidados especiais',
        required:    false,
      },
    ],
  },
  {
    id:              '__sysmax_encaminhamento__',
    clinic_id:       '__sysmax__',
    name:            'Encaminhamento Padrão Sysmax',
    type:            'encaminhamento',
    file_url:        null,
    created_at:      new Date(0).toISOString(),
    extracted_fields: [
      {
        field_name:  'especialidade',
        label:       'Especialidade / Exame Solicitado',
        type:        'text',
        description: 'Ex: Cardiologia, Hemograma Completo, Raio-X Torácico',
        required:    true,
      },
      {
        field_name:  'motivo',
        label:       'Motivo do Encaminhamento',
        type:        'textarea',
        description: 'Hipótese diagnóstica e justificativa clínica',
        required:    true,
      },
      {
        field_name:  'historico',
        label:       'Histórico Relevante',
        type:        'textarea',
        description: 'Informações clínicas pertinentes para o especialista (medicações em uso, alergias, resultados prévios)',
        required:    false,
      },
    ],
  },
]
