/**
 * Macros — blocos prontos que inserem múltiplos elementos posicionados de
 * forma coerente. Pensados para acelerar a criação dos documentos clínicos
 * mais comuns (Receituário, Atestado, Encaminhamento).
 *
 * Cada macro recebe um startY (em % do canvas) e retorna a lista de
 * CanvasElement com box pré-calculado a partir desse offset.
 */

import {
  type CanvasElement,
  makeTextElement, makeLineElement,
  makeDynamicTagElement, makeRepeaterElement, makeDynamicImageElement,
} from './elements'

export interface MacroContext {
  /** Y inicial em % (geralmente max(y+h) dos elementos existentes). */
  startY: number
}

export interface MacroBlock {
  id: string
  label: string
  description: string
  icon: string
  build: (ctx: MacroContext) => CanvasElement[]
}

/** Helper: tag com prefixo de label (ex: "Tutor: {{tutor.name}}"). */
function labeledTag(
  prefix: string,
  tagId: string,
  box: { x: number; y: number; w: number; h: number },
) {
  return makeDynamicTagElement(tagId, { box, prefix, typography: { fontSize: 10 } })
}

export const MACRO_BLOCKS: MacroBlock[] = [
  // ── Cabeçalho do Pet ─────────────────────────────────────────────────────
  {
    id: 'pet_header',
    label: 'Cabeçalho do Pet',
    description: 'Tutor + Paciente em linha 1, Espécie/Raça/Idade/Peso/Sexo em linha 2',
    icon: '🐾',
    build({ startY }) {
      const y1 = startY
      const y2 = startY + 5
      return [
        labeledTag('Tutor: ',    'tutor.name',   { x: 5,  y: y1, w: 47, h: 4 }),
        labeledTag('Paciente: ', 'pet.name',     { x: 54, y: y1, w: 41, h: 4 }),
        labeledTag('Espécie: ',  'pet.species',  { x: 5,  y: y2, w: 22, h: 4 }),
        labeledTag('Raça: ',     'pet.breed',    { x: 29, y: y2, w: 22, h: 4 }),
        labeledTag('Idade: ',    'pet.age',      { x: 53, y: y2, w: 14, h: 4 }),
        labeledTag('Peso: ',     'pet.weight',   { x: 69, y: y2, w: 14, h: 4 }),
        labeledTag('Sexo: ',     'pet.sex',      { x: 85, y: y2, w: 10, h: 4 }),
      ]
    },
  },

  // ── Receituário Padrão (título + repeater de medicações) ────────────────
  {
    id: 'receituario',
    label: 'Receituário Padrão',
    description: 'Título "RECEITUÁRIO" + lista de medicações agrupada por via (oral, tópico, IV…) com destaque de controlados',
    icon: '💊',
    build({ startY }) {
      const y = startY + 2
      return [
        makeTextElement({
          content: 'RECEITUÁRIO',
          box: { x: 5, y, w: 90, h: 5 },
          typography: { fontSize: 13, fontWeight: 700, align: 'center', letterSpacing: 1 },
        }),
        makeLineElement('horizontal', {
          box: { x: 5, y: y + 5, w: 90, h: 0.2 },
          thickness: 1, color: '#0f172a',
        }),
        makeRepeaterElement('prescriptions', {
          box: { x: 5, y: y + 6, w: 90, h: 40 },
          // Defaults clínicos vêm da factory: groupBy=route_of_administration,
          // groupHeaderTemplate="Uso {{group}}", highlightField=is_controlled
        }),
      ]
    },
  },

  // ── Receituário Manipulado ───────────────────────────────────────────────
  {
    id: 'receituario_manipulado',
    label: 'Receituário Manipulado',
    description: 'Apenas medicações manipuladas, agrupadas por farmácia',
    icon: '⚗️',
    build({ startY }) {
      const y = startY + 2
      return [
        makeTextElement({
          content: 'RECEITUÁRIO — MEDICAÇÕES MANIPULADAS',
          box: { x: 5, y, w: 90, h: 5 },
          typography: { fontSize: 12, fontWeight: 700, align: 'center' },
        }),
        makeRepeaterElement('prescriptions', {
          box: { x: 5, y: y + 6, w: 90, h: 35 },
          groupBy: 'prescription_type',
          groupHeaderTemplate: '{{group}}',
          itemTemplate: '{{medication}} — {{dose}} · {{frequency}} por {{duration_days}} dias',
        }),
      ]
    },
  },

  // ── Solicitação de Exames ────────────────────────────────────────────────
  {
    id: 'exam_request',
    label: 'Solicitação de Exames',
    description: 'Título + lista de exames com urgência',
    icon: '🔬',
    build({ startY }) {
      const y = startY + 2
      return [
        makeTextElement({
          content: 'SOLICITAÇÃO DE EXAMES',
          box: { x: 5, y, w: 90, h: 5 },
          typography: { fontSize: 13, fontWeight: 700, align: 'center', letterSpacing: 1 },
        }),
        makeLineElement('horizontal', { box: { x: 5, y: y + 5, w: 90, h: 0.2 } }),
        makeRepeaterElement('exam_items', {
          box: { x: 5, y: y + 6, w: 90, h: 30 },
          itemTemplate: '{{name}}',
          groupBy: 'urgency',
          groupHeaderTemplate: 'Urgência: {{group}}',
        }),
      ]
    },
  },

  // ── Assinatura do MV ─────────────────────────────────────────────────────
  {
    id: 'vet_signature',
    label: 'Assinatura do MV',
    description: 'Linha + Nome do MV + CRMV + Data — para fechar o documento',
    icon: '✍️',
    build({ startY }) {
      const y = Math.max(startY + 5, 80)  // empurra para o fim da página
      return [
        // Imagem da assinatura (se cadastrada)
        makeDynamicImageElement('vet.signature'),
        Object.assign(makeDynamicImageElement('vet.signature'), {
          box: { x: 30, y, w: 40, h: 8 },
        }) as CanvasElement,
        // Linha
        makeLineElement('horizontal', {
          box: { x: 25, y: y + 8, w: 50, h: 0.2 }, thickness: 0.8,
        }),
        // Nome + CRMV centralizados
        labeledTag('', 'vet.name', { x: 25, y: y + 8.5, w: 50, h: 4 }),
        labeledTag('CRMV ', 'vet.crmv', { x: 25, y: y + 12, w: 50, h: 3.5 }),
        // Data à direita
        labeledTag('Data: ', 'consulta.date', { x: 70, y: y + 12, w: 25, h: 3.5 }),
      ].filter((_, i) => i !== 0) // remove o duplicate placeholder do índice 0
    },
  },

  // ── Cabeçalho da Clínica ─────────────────────────────────────────────────
  {
    id: 'clinic_header',
    label: 'Cabeçalho da Clínica',
    description: 'Logo + nome + CNPJ + telefone + endereço',
    icon: '🏥',
    build({ startY }) {
      const y = startY
      return [
        makeDynamicImageElement('clinic.logo'),
        Object.assign(makeDynamicImageElement('clinic.logo'), {
          box: { x: 5, y, w: 15, h: 8 },
        }) as CanvasElement,
        makeDynamicTagElement('clinica.name', {
          box: { x: 22, y, w: 73, h: 4 },
          typography: { fontSize: 13, fontWeight: 700 },
        }),
        labeledTag('CNPJ ',  'clinica.cnpj',    { x: 22, y: y + 4, w: 30, h: 3 }),
        labeledTag('Tel ',   'clinica.phone',   { x: 53, y: y + 4, w: 22, h: 3 }),
        labeledTag('',       'clinica.address', { x: 22, y: y + 7, w: 73, h: 3 }),
      ].filter((_, i) => i !== 0)
    },
  },
]
