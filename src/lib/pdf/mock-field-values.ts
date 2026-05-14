/**
 * Mock de valores ficticios para testar geracao pixel-perfect de PDFs.
 *
 * Faz matching por padroes comuns no field_name (snake_case). Casos sem match
 * recebem um placeholder generico baseado no tipo (text/number/date/...).
 *
 * Usado apenas pelo botao "Gerar PDF de Teste" no editor de templates.
 */

import type { ExtractedField } from '@/types'

type Matcher = {
  test: (fieldName: string, label: string) => boolean
  value: string | number | boolean
}

const TODAY_BR = (() => {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
})()

const TODAY_ISO = (() => {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
})()

const includesAny = (s: string, terms: string[]) =>
  terms.some(t => s.includes(t))

const MATCHERS: Matcher[] = [
  // Pet / paciente
  { test: (n, l) => includesAny(n, ['paciente', 'pet', 'animal', 'nome_pet', 'nome_animal'])
                || includesAny(l.toLowerCase(), ['paciente', 'animal']),
    value: 'Snow' },

  // Especie
  { test: n => includesAny(n, ['especie', 'species']), value: 'Canino' },

  // Raca
  { test: n => includesAny(n, ['raca', 'breed']), value: 'Border Collie' },

  // Idade
  { test: n => includesAny(n, ['idade', 'age']), value: '5 anos' },

  // Sexo
  { test: n => includesAny(n, ['sexo', 'gender']), value: 'Macho' },

  // Peso
  { test: n => includesAny(n, ['peso', 'weight', 'kg']), value: '12.5 kg' },

  // Pelagem / cor
  { test: n => includesAny(n, ['pelagem', 'cor_pelo', 'coat']), value: 'Preto e branco' },

  // Tutor / proprietario
  { test: (n, l) => includesAny(n, ['tutor', 'proprietario', 'dono', 'owner', 'responsavel_tutor'])
                || includesAny(l.toLowerCase(), ['tutor', 'proprietario', 'dono']),
    value: 'Joao da Silva' },

  // CPF
  { test: n => includesAny(n, ['cpf']), value: '123.456.789-00' },

  // Telefone
  { test: n => includesAny(n, ['telefone', 'celular', 'fone', 'phone']), value: '(11) 98765-4321' },

  // Email
  { test: n => includesAny(n, ['email', 'e_mail']), value: 'joao.silva@example.com' },

  // Endereco
  { test: n => includesAny(n, ['endereco', 'address', 'logradouro']), value: 'Rua das Flores, 123 - Sao Paulo/SP' },

  // CEP
  { test: n => includesAny(n, ['cep']), value: '01234-567' },

  // Veterinario / MV / responsavel
  { test: (n, l) => includesAny(n, ['veterinario', 'medico_vet', 'mv', 'responsavel_tecnico', 'vet_responsavel'])
                || includesAny(l.toLowerCase(), ['veterinario', 'medico']),
    value: 'Dr. Marcelo Costa' },

  // CRMV
  { test: n => includesAny(n, ['crmv', 'registro_crmv']), value: 'CRMV-SP 74.696' },

  // Clinica
  { test: n => includesAny(n, ['clinica', 'hospital', 'nome_clinica']), value: 'VetMax Clinica Veterinaria' },

  // CNPJ
  { test: n => includesAny(n, ['cnpj']), value: '12.345.678/0001-90' },

  // Data
  { test: n => includesAny(n, ['data', 'date', 'dia_exame']), value: TODAY_BR },

  // Hora
  { test: n => includesAny(n, ['hora', 'time', 'horario']), value: '14:30' },

  // ECG / exame especifico — laudo cardiologico
  { test: n => includesAny(n, ['frequencia_cardiaca', 'fc_bpm', 'bpm']), value: '120 bpm' },
  { test: n => includesAny(n, ['ritmo', 'rhythm']), value: 'Sinusal' },
  { test: n => includesAny(n, ['mitral']), value: 'Valva mitral com leve regurgitacao' },
  { test: n => includesAny(n, ['aortica', 'aorta']), value: 'Sem alteracoes' },
  { test: n => includesAny(n, ['tricuspide']), value: 'Sem alteracoes' },
  { test: n => includesAny(n, ['pulmonar']), value: 'Sem alteracoes' },
  { test: n => includesAny(n, ['septo']), value: 'Espessura preservada' },
  { test: n => includesAny(n, ['atrio_esquerdo', 'ae']), value: 'Diametro dentro da normalidade' },
  { test: n => includesAny(n, ['ventriculo_esquerdo', 've']), value: 'Funcao sistolica preservada' },
  { test: n => includesAny(n, ['fracao_ejecao', 'ef', 'ejection']), value: '65%' },
  { test: n => includesAny(n, ['fracao_encurtamento', 'fs']), value: '40%' },

  // Temperatura
  { test: n => includesAny(n, ['temperatura', 'temp']), value: '38.5 C' },

  // FR
  { test: n => includesAny(n, ['frequencia_respiratoria', 'fr', 'respiratoria']), value: '24 mpm' },

  // Pressao
  { test: n => includesAny(n, ['pressao', 'pa', 'pressao_arterial']), value: '120/80 mmHg' },

  // Condicao paciente
  { test: n => includesAny(n, ['condicao', 'condicao_paciente', 'estado_clinico']),
    value: 'Calmo, hidratado, em decubito lateral direito' },

  // Diagnostico
  { test: n => includesAny(n, ['diagnostico', 'diagnosis', 'conclusao']),
    value: 'Cardiomiopatia hipertrofica leve compensada' },

  // Observacoes / consideracoes
  { test: n => includesAny(n, ['observacoes', 'obs', 'consideracoes', 'recomendacoes', 'notas']),
    value: 'Recomendado controle ecocardiografico em 3 meses. Manter dieta atual.' },

  // Anamnese / queixa
  { test: n => includesAny(n, ['anamnese', 'queixa', 'historico']),
    value: 'Tutor relata episodios de tosse seca apos exercicio.' },

  // Medicacao / tratamento
  { test: n => includesAny(n, ['medicacao', 'tratamento', 'prescricao']),
    value: 'Pimobendan 5mg - 1/2 comprimido VO BID por 30 dias.' },
]

/**
 * Retorna um valor mock para o campo, ou um placeholder generico se nao
 * houver matcher especifico.
 */
export function mockValueForField(field: ExtractedField): string | number | boolean {
  const name = field.field_name.toLowerCase()
  const label = field.label

  for (const m of MATCHERS) {
    if (m.test(name, label)) return m.value
  }

  // Fallback por tipo
  switch (field.type) {
    case 'date':     return TODAY_ISO
    case 'number':   return 42
    case 'boolean':  return true
    case 'textarea': return `Exemplo de preenchimento para ${field.label}.`
    case 'select':   return 'Opcao 1'
    default:         return `[${field.label}]`
  }
}

/**
 * Constroi um dicionario completo de mocks para todos os fields do template.
 */
export function buildMockFieldValues(
  fields: ExtractedField[],
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const f of fields) {
    out[f.field_name] = mockValueForField(f)
  }
  return out
}
