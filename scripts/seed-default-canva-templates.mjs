/**
 * Seed dos LAYOUTS PADRÃO de documentos veterinários (motor Canvas Nativo)
 * para todas as clínicas do plano FREE — exceto Almavet (layouts próprios).
 *
 * 9 documentos essenciais do dia a dia do MV, com conteúdo mínimo conforme
 * Resolução CFMV nº 1.321/2020 (Anexos I–XII) e Portaria SVS/MS nº 344/1998
 * (Receita de Controle Especial, Anexo XVII):
 *
 *   1. Receituário (receita simples)               type: receita
 *   2. Receita de Controle Especial                 type: receita
 *   3. Atestado de Saúde Animal                     type: outro
 *   4. Atestado de Óbito                            type: outro
 *   5. Solicitação de Exames                        type: exame
 *   6. TCLE — Procedimento Cirúrgico e Anestésico   type: termo
 *   7. TCLE — Internação e Tratamento Clínico       type: termo
 *   8. TCLE — Eutanásia                             type: termo
 *   9. Termo de Retirada sem Alta Médica            type: termo
 *
 * Idempotente: por (clinic_id, name, type) — UPDATE do canvas_state se já
 * existir, INSERT caso contrário.
 *
 * Além das clínicas, SEMPRE atualiza a biblioteca canônica
 * `default_document_templates` — fonte do trigger clinics_seed_default_templates
 * (migration 0414) que copia os layouts para toda clínica recém-cadastrada.
 *
 * Uso:
 *   node scripts/seed-default-canva-templates.mjs           # clínicas Free
 *   node scripts/seed-default-canva-templates.mjs --all     # TODAS exceto Almavet
 *   node scripts/seed-default-canva-templates.mjs --dry     # só lista alvos
 *   node scripts/seed-default-canva-templates.mjs --clinic <uuid>  # 1 clínica
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envText = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8')
const env = Object.fromEntries(
  envText.split(/\r?\n/).filter(l => l && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')] })
)

const conn = env.DATABASE_URL ?? env.POSTGRES_URL
if (!conn) { console.error('FATAL: DATABASE_URL ausente no .env.local'); process.exit(1) }

const DRY = process.argv.includes('--dry')
const ALL = process.argv.includes('--all')
const clinicArgIdx = process.argv.indexOf('--clinic')
const ONLY_CLINIC = clinicArgIdx > -1 ? process.argv[clinicArgIdx + 1] : null

// ── Helpers de elementos (espelham src/lib/canva/elements.ts) ────────────────

const INK = '#0f172a'      // slate-900
const MUTE = '#475569'     // slate-600
const FONT = 'Inter'

let seq = 0
const eid = k => `el_${k}_seed_${(++seq).toString(36).padStart(3, '0')}`

/** Texto livre. */
const T = (box, content, ty = {}, extra = {}) => ({
  id: eid('text'), kind: 'text', box, content, zIndex: 2,
  typography: { fontFamily: FONT, fontSize: 10, fontWeight: 400, color: INK, align: 'left', vAlign: 'top', lineHeight: 1.4, ...ty },
  ...extra,
})

/** Dynamic tag do catálogo DYNAMIC_TAGS (ids pet.* / tutor.* / clinica.* / vet.* / consulta.*). */
const DT = (box, tagId, ty = {}, extra = {}) => ({
  id: eid('dynamic_tag'), kind: 'dynamic_tag', box, tagId, zIndex: 2,
  typography: { fontFamily: FONT, fontSize: 10, fontWeight: 400, color: INK, align: 'left', vAlign: 'top', lineHeight: 1.4, ...ty },
  ...extra,
})

/** Composite tag — parts: [{tagId, prefix?, suffix?}] ou {staticText}. */
const CT = (box, parts, ty = {}, extra = {}) => ({
  id: eid('composite_tag'), kind: 'composite_tag', box, parts, separator: '   ', hideEmptyParts: true, zIndex: 2,
  typography: { fontFamily: FONT, fontSize: 9.5, fontWeight: 400, color: INK, align: 'left', vAlign: 'top', lineHeight: 1.4, ...ty },
  ...extra,
})

const LN = (box, extra = {}) => ({
  id: eid('line'), kind: 'line', box, orientation: 'horizontal', thickness: 1, color: INK, zIndex: 2, ...extra,
})

/** Campo preenchível pelo MV no atendimento. */
const FF = (box, fieldKey, label, opts = {}, ty = {}) => ({
  id: eid('fillable_field'), kind: 'fillable_field', box, fieldKey, label, zIndex: 2,
  placeholder: opts.placeholder ?? '________________________________________',
  required: opts.required ?? false,
  inputType: opts.inputType ?? 'text',
  typography: { fontFamily: FONT, fontSize: 10, fontWeight: 400, color: INK, align: 'left', vAlign: 'top', lineHeight: 1.4, ...ty },
})

/** Caixa com borda (text vazio com block) — moldura de seções. */
const BOX = (box, extra = {}) => ({
  id: eid('text'), kind: 'text', box, content: '', zIndex: 1,
  typography: { fontFamily: FONT, fontSize: 9, color: INK },
  block: { borderColor: '#94a3b8', borderWidth: 1, borderRadius: 6, paddingX: 8, paddingY: 6, ...extra.block },
})

const IMG_LOGO = box => ({
  id: eid('dynamic_image'), kind: 'dynamic_image', box, tagId: 'clinic.logo', objectFit: 'contain', fallbackText: '', zIndex: 2,
})
const IMG_SIGN = box => ({
  id: eid('dynamic_image'), kind: 'dynamic_image', box, tagId: 'vet.signature', objectFit: 'contain', fallbackText: '', zIndex: 2,
})

// ── Blocos compostos reutilizáveis ───────────────────────────────────────────

/** Cabeçalho institucional: logo + nome + endereço + CNPJ/tel + divisor. */
function header() {
  return [
    IMG_LOGO({ x: 4, y: 2.5, w: 15, h: 8 }),
    DT({ x: 21, y: 3, w: 58, h: 3.6 }, 'clinica.name', { fontSize: 15, fontWeight: 700, align: 'center', vAlign: 'middle' }),
    CT({ x: 21, y: 6.8, w: 58, h: 2.4 }, [
      { tagId: 'clinica.address' }, { tagId: 'clinica.city_state' },
    ], { fontSize: 8.5, color: MUTE, align: 'center' }, { separator: ' — ' }),
    CT({ x: 21, y: 9.2, w: 58, h: 2.4 }, [
      { tagId: 'clinica.cnpj', prefix: 'CNPJ: ' }, { tagId: 'clinica.phone', prefix: 'Tel: ' },
    ], { fontSize: 8.5, color: MUTE, align: 'center' }, { separator: '  ·  ' }),
    LN({ x: 4, y: 12, w: 92, h: 0.15 }, { color: '#94a3b8' }),
  ]
}

const title = (text, y = 13.5, fontSize = 13) =>
  T({ x: 4, y, w: 92, h: 3.6 }, text, { fontSize, fontWeight: 700, align: 'center', vAlign: 'middle', letterSpacing: 1 })

/** Identificação completa do animal + tutor (conteúdo mínimo Art. 3º Res. 1321/2020). */
function idBlockFull(y) {
  const line = (dy, parts, sep = '   ·   ') =>
    CT({ x: 7, y: y + dy, w: 86, h: 2.7 }, parts, {}, { separator: sep })
  return [
    BOX({ x: 5, y: y - 1, w: 90, h: 15.5 }),
    line(0, [
      { tagId: 'pet.name', prefix: 'Animal: ' }, { tagId: 'pet.species', prefix: 'Espécie: ' }, { tagId: 'pet.breed', prefix: 'Raça: ' },
    ]),
    line(2.9, [
      { tagId: 'pet.sex', prefix: 'Sexo: ' }, { tagId: 'pet.age', prefix: 'Idade: ' }, { tagId: 'pet.weight', prefix: 'Peso: ' }, { tagId: 'pet.color', prefix: 'Pelagem: ' },
    ]),
    line(5.8, [{ tagId: 'pet.microchip', prefix: 'Microchip: ' }]),
    line(8.7, [
      { tagId: 'tutor.name', prefix: 'Tutor(a): ' }, { tagId: 'tutor.cpf', prefix: 'CPF: ' },
    ]),
    line(11.6, [
      { tagId: 'tutor.address', prefix: 'Endereço: ' }, { tagId: 'tutor.phone', prefix: 'Tel: ' },
    ]),
  ]
}

/** Identificação compacta (3 linhas) — receitas e solicitações. */
function idBlockCompact(y) {
  const line = (dy, parts) =>
    CT({ x: 7, y: y + dy, w: 86, h: 2.7 }, parts, {}, { separator: '   ·   ' })
  return [
    BOX({ x: 5, y: y - 1, w: 90, h: 9.8 }),
    line(0, [
      { tagId: 'pet.name', prefix: 'Animal: ' }, { tagId: 'pet.species', prefix: 'Espécie: ' }, { tagId: 'pet.breed', prefix: 'Raça: ' }, { tagId: 'pet.sex', prefix: 'Sexo: ' },
    ]),
    line(2.9, [
      { tagId: 'pet.age', prefix: 'Idade: ' }, { tagId: 'pet.weight', prefix: 'Peso: ' }, { tagId: 'tutor.name', prefix: 'Tutor(a): ' }, { tagId: 'tutor.cpf', prefix: 'CPF: ' },
    ]),
    line(5.8, [
      { tagId: 'tutor.address', prefix: 'Endereço: ' }, { tagId: 'tutor.phone', prefix: 'Tel: ' },
    ]),
  ]
}

/** Cidade/UF + data por extenso. */
const cityDate = y =>
  CT({ x: 4, y, w: 92, h: 3 }, [
    { tagId: 'clinica.city_state' },
    { tagId: 'consulta.date' },
  ], { fontSize: 10.5, align: 'center' }, { separator: ', ' })

/** Assinatura do MV centralizada (imagem + linha + nome + CRMV). */
function vetSignature(y, label = null) {
  const els = [
    IMG_SIGN({ x: 36, y, w: 28, h: 7 }),
    LN({ x: 30, y: y + 7.4, w: 40, h: 0.15 }),
    DT({ x: 25, y: y + 8, w: 50, h: 2.6 }, 'vet.name', { fontSize: 10, fontWeight: 600, align: 'center' }),
    DT({ x: 25, y: y + 10.4, w: 50, h: 2.4 }, 'vet.crmv', { fontSize: 9, color: MUTE, align: 'center' }),
  ]
  if (label) els.push(T({ x: 25, y: y + 12.6, w: 50, h: 2.2 }, label, { fontSize: 8, color: MUTE, align: 'center' }))
  return els
}

/** Duas assinaturas lado a lado: tutor (esq.) + MV (dir.). */
function dualSignature(y) {
  return [
    LN({ x: 6, y: y + 7.4, w: 40, h: 0.15 }),
    CT({ x: 6, y: y + 8, w: 40, h: 2.6 }, [{ tagId: 'tutor.name' }], { fontSize: 9.5, fontWeight: 600, align: 'center' }),
    T({ x: 6, y: y + 10.4, w: 40, h: 2.2 }, 'Tutor(a) / Responsável pelo animal', { fontSize: 8, color: MUTE, align: 'center' }),
    IMG_SIGN({ x: 61, y, w: 24, h: 7 }),
    LN({ x: 54, y: y + 7.4, w: 40, h: 0.15 }),
    DT({ x: 54, y: y + 8, w: 40, h: 2.6 }, 'vet.name', { fontSize: 9.5, fontWeight: 600, align: 'center' }),
    DT({ x: 54, y: y + 10.4, w: 40, h: 2.4 }, 'vet.crmv', { fontSize: 8.5, color: MUTE, align: 'center' }),
  ]
}

const twoViasNote = (y, extra = '') =>
  T({ x: 4, y, w: 92, h: 2.4 }, `Documento emitido em 2 (duas) vias — Res. CFMV nº 1.321/2020.${extra}`, { fontSize: 7.5, color: MUTE, align: 'center' })

const page = (overrides = {}) => ({
  size: 'A4', orientation: 'portrait',
  margins: { top: 1, bottom: 1, left: 1, right: 1 },
  backgroundImageUrl: null, backgroundColor: '#FFFFFF',
  ...overrides,
})

const state = elements => ({ version: 1, page: page(), elements })

/** Repeater de prescrições multi-linha (leader dots + agrupamento por via). */
const rxRepeater = (box, maxItemsPerPage, filter = null) => ({
  id: eid('repeater'), kind: 'repeater', box, source: 'prescriptions', zIndex: 2,
  ...(filter ? { filter } : {}),
  itemTemplate: '{{medication}} — {{dose}}',
  itemTemplateLines: [
    { template: '{{medication}} {{dose}}{{LEADER}}{{pharmaceutical_form}}', leaderDots: true, style: { fontWeight: 700 } },
    { template: '{{frequency}}, durante {{duration_days}} dias.' },
    { template: 'OBS: {{orientation}}', style: { fontStyle: 'italic' }, hideIfEmpty: true, marginBottom: 6 },
  ],
  groupAndEnumerate: true,
  maxItemsPerPage,
  lineSpacing: 4,
  groupBy: 'route_of_administration',
  groupHeaderTemplate: 'Uso {{group}}',
  groupHeaderTypography: { fontFamily: FONT, fontSize: 10, fontWeight: 700, color: INK },
  highlightField: 'is_controlled',
  highlightColor: '#dbeafe',
  highlightBadge: '★ CONTROLADO',
  typography: { fontFamily: FONT, fontSize: 10, fontWeight: 400, color: INK, align: 'left', vAlign: 'top', lineHeight: 1.4 },
})

// ── 1. Receituário (receita simples) ─────────────────────────────────────────

function buildReceitaSimples() {
  return state([
    ...header(),
    title('RECEITUÁRIO', 13.5),
    T({ x: 4, y: 17.2, w: 92, h: 2.4 }, 'USO VETERINÁRIO', { fontSize: 8, fontWeight: 700, color: MUTE, align: 'center', letterSpacing: 2 }),
    ...idBlockCompact(21.5),
    // Port. SVS/MS 344/98: controlados saem APENAS na Receita de Controle Especial
    rxRepeater({ x: 5, y: 33.5, w: 90, h: 38 }, 6, { field: 'is_controlled', equals: true, negate: true }),
    cityDate(74),
    ...vetSignature(77.5),
    T({ x: 4, y: 92, w: 92, h: 2.4 }, 'Receita válida por 10 (dez) dias a partir da data de emissão (orientação CFMV; RDC Anvisa nº 471/2021 para antimicrobianos).', { fontSize: 7.5, color: MUTE, align: 'center' }),
  ])
}

// ── 2. Receita de Controle Especial (Anexo XVII, Port. SVS/MS 344/98) ────────

function buildReceitaControleEspecial() {
  return state([
    // Emitente (esq.) + vias (dir.)
    BOX({ x: 4, y: 2.5, w: 55, h: 12.5 }),
    T({ x: 6, y: 3.3, w: 51, h: 2.2 }, 'IDENTIFICAÇÃO DO EMITENTE', { fontSize: 7, fontWeight: 700, color: MUTE, letterSpacing: 1 }),
    DT({ x: 6, y: 5.5, w: 51, h: 2.6 }, 'vet.name', { fontSize: 10.5, fontWeight: 700 }),
    DT({ x: 6, y: 8, w: 51, h: 2.4 }, 'vet.crmv', { fontSize: 9 }),
    CT({ x: 6, y: 10.3, w: 51, h: 4.2 }, [
      { tagId: 'clinica.name' }, { tagId: 'clinica.address' }, { tagId: 'clinica.city_state' },
    ], { fontSize: 8, color: MUTE, lineHeight: 1.3 }, { separator: ' — ' }),
    BOX({ x: 61, y: 2.5, w: 35, h: 12.5 }),
    T({ x: 62, y: 3.3, w: 33, h: 10.5 }, '1ª via — RETENÇÃO DA FARMÁCIA\n\n2ª via — ORIENTAÇÃO AO COMPRADOR', { fontSize: 7.5, fontWeight: 600, align: 'center', vAlign: 'middle', lineHeight: 1.5 }),

    title('RECEITA DE CONTROLE ESPECIAL', 16.5, 12.5),
    T({ x: 4, y: 19.8, w: 92, h: 2.2 }, 'USO VETERINÁRIO', { fontSize: 8, fontWeight: 700, color: MUTE, align: 'center', letterSpacing: 2 }),

    // Comprador (tutor) — CPF e endereço obrigatórios
    BOX({ x: 5, y: 22.5, w: 90, h: 9.8 }),
    CT({ x: 7, y: 23.5, w: 86, h: 2.7 }, [
      { tagId: 'tutor.name', prefix: 'Comprador(a)/Tutor(a): ' }, { tagId: 'tutor.cpf', prefix: 'CPF: ' },
    ], {}, { separator: '   ·   ' }),
    CT({ x: 7, y: 26.4, w: 86, h: 2.7 }, [
      { tagId: 'tutor.address', prefix: 'Endereço: ' }, { tagId: 'tutor.phone', prefix: 'Tel: ' },
    ], {}, { separator: '   ·   ' }),
    CT({ x: 7, y: 29.3, w: 86, h: 2.7 }, [
      { tagId: 'pet.name', prefix: 'Animal: ' }, { tagId: 'pet.species', prefix: 'Espécie: ' }, { tagId: 'pet.breed', prefix: 'Raça: ' }, { tagId: 'pet.sex', prefix: 'Sexo: ' },
    ], {}, { separator: '   ·   ' }),

    rxRepeater({ x: 5, y: 34, w: 90, h: 26 }, 3, { field: 'is_controlled', equals: true }),
    T({ x: 5, y: 60.5, w: 90, h: 2.2 }, 'Quantidade máxima para 30 (trinta) dias de tratamento.', { fontSize: 7.5, color: MUTE, fontStyle: 'italic' }),

    cityDate(63.5),
    ...vetSignature(66.5, 'Assinatura e carimbo do Médico-Veterinário'),

    // Comprador / Fornecedor (preenchidos na dispensação)
    BOX({ x: 4, y: 82, w: 45, h: 15.5 }),
    T({ x: 5.5, y: 82.8, w: 42, h: 2 }, 'IDENTIFICAÇÃO DO COMPRADOR', { fontSize: 7, fontWeight: 700, color: MUTE, letterSpacing: 1 }),
    T({ x: 5.5, y: 85, w: 42, h: 11.5 }, 'Nome: ______________________________\nRG: ________________________________\nEndereço: ___________________________\nCidade/UF: _____________ Tel: ________', { fontSize: 8, lineHeight: 1.85 }),
    BOX({ x: 51, y: 82, w: 45, h: 15.5 }),
    T({ x: 52.5, y: 82.8, w: 42, h: 2 }, 'IDENTIFICAÇÃO DO FORNECEDOR', { fontSize: 7, fontWeight: 700, color: MUTE, letterSpacing: 1 }),
    T({ x: 52.5, y: 85, w: 42, h: 8 }, 'Data: ____/____/______', { fontSize: 8 }),
    LN({ x: 54, y: 93.5, w: 39, h: 0.15 }),
    T({ x: 52.5, y: 94, w: 42, h: 2 }, 'Assinatura do Farmacêutico', { fontSize: 7.5, color: MUTE, align: 'center' }),
  ])
}

// ── 3. Atestado de Saúde Animal (Art. 5º, Res. CFMV 1321/2020) ───────────────

function buildAtestadoSaude() {
  return state([
    ...header(),
    title('ATESTADO DE SAÚDE ANIMAL', 13.5),
    T({ x: 6, y: 18.5, w: 88, h: 6.5 },
      'Atesto, para os devidos fins, que o animal abaixo identificado foi por mim examinado nesta data, apresentando-se clinicamente sadio, sem sinais de doenças infectocontagiosas ou parasitárias no momento do exame.',
      { fontSize: 10.5, align: 'justify', lineHeight: 1.5 }),
    ...idBlockFull(26.5),
    FF({ x: 6, y: 44, w: 88, h: 9 }, 'observacoes_imunizacoes', 'Imunizações / observações: ', { inputType: 'textarea', placeholder: '__________________________________________________' }),
    FF({ x: 6, y: 54, w: 60, h: 3 }, 'validade_atestado', 'Validade deste atestado: ', { placeholder: '________ dias' }),
    cityDate(70),
    ...vetSignature(73.5),
    T({ x: 4, y: 92, w: 92, h: 2.4 }, 'Atestado emitido nos termos da Res. CFMV nº 1.321/2020.', { fontSize: 7.5, color: MUTE, align: 'center' }),
  ])
}

// ── 4. Atestado de Óbito (Art. 8º, Res. CFMV 1321/2020) ──────────────────────

function buildAtestadoObito() {
  return state([
    ...header(),
    title('ATESTADO DE ÓBITO', 13.5),
    T({ x: 6, y: 18.5, w: 88, h: 4 },
      'Atesto, para os devidos fins, o óbito do animal abaixo identificado:',
      { fontSize: 10.5, lineHeight: 1.5 }),
    ...idBlockFull(24),
    FF({ x: 6, y: 41.5, w: 42, h: 3 }, 'data_hora_obito', 'Data e hora do óbito: ', { required: true, placeholder: '____/____/______  às  ____:____' }),
    FF({ x: 52, y: 41.5, w: 42, h: 3 }, 'local_obito', 'Local do óbito: ', { required: true, placeholder: '_____________________' }),
    FF({ x: 6, y: 45.5, w: 88, h: 9 }, 'causa_mortis', 'Provável causa mortis: ', { required: true, inputType: 'textarea', placeholder: '__________________________________________________' }),
    T({ x: 6, y: 56, w: 88, h: 6 },
      'O responsável pelo animal foi orientado quanto à destinação ambientalmente adequada do cadáver, nos termos da legislação sanitária e ambiental vigente.',
      { fontSize: 9.5, align: 'justify', lineHeight: 1.5, color: MUTE }),
    cityDate(68),
    ...vetSignature(71.5),
    twoViasNote(92),
  ])
}

// ── 5. Solicitação de Exames ─────────────────────────────────────────────────

function buildSolicitacaoExames() {
  return state([
    ...header(),
    title('SOLICITAÇÃO DE EXAMES', 13.5),
    ...idBlockCompact(19.5),
    FF({ x: 6, y: 31, w: 88, h: 4.5 }, 'suspeita_clinica', 'Suspeita clínica: ', { placeholder: '_______________________________________________' }),
    T({ x: 6, y: 36.5, w: 88, h: 2.5 }, 'Exames solicitados:', { fontSize: 10, fontWeight: 700 }),
    {
      id: eid('repeater'), kind: 'repeater', box: { x: 5, y: 39.5, w: 90, h: 32 }, source: 'exam_items', zIndex: 2,
      itemTemplate: '{{name}}',
      itemTemplateLines: [
        { template: '{{name}}', style: { fontWeight: 600 } },
        { template: 'OBS: {{notes}}', style: { fontStyle: 'italic', fontSize: 9 }, hideIfEmpty: true, marginBottom: 4 },
      ],
      groupAndEnumerate: true, lineSpacing: 4, maxItemsPerPage: 12,
      typography: { fontFamily: FONT, fontSize: 10, fontWeight: 400, color: INK, align: 'left', vAlign: 'top', lineHeight: 1.4 },
    },
    cityDate(74),
    ...vetSignature(77.5),
  ])
}

// ── 6. TCLE — Procedimento Cirúrgico e Anestésico ────────────────────────────

function buildTermoCirurgico() {
  return state([
    ...header(),
    title('TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO', 13.2, 12),
    title('PROCEDIMENTO CIRÚRGICO E ANESTÉSICO', 16.4, 10.5),
    CT({ x: 6, y: 21, w: 88, h: 5 }, [
      { tagId: 'tutor.name', prefix: 'Eu, ' },
      { tagId: 'tutor.cpf', prefix: 'CPF ' },
      { tagId: '', staticText: 'na qualidade de responsável pelo animal abaixo identificado:' },
    ], { fontSize: 10.5, lineHeight: 1.5, align: 'justify' }, { separator: ', ' }),
    ...idBlockCompact(26.5),
    FF({ x: 6, y: 38, w: 88, h: 5 }, 'procedimento_autorizado', 'Procedimento(s) autorizado(s): ', { required: true, placeholder: '_______________________________________' }),
    T({ x: 6, y: 44.5, w: 88, h: 26 },
      'DECLARO que fui informado(a), em linguagem clara e acessível, sobre o diagnóstico, a natureza e os objetivos do procedimento cirúrgico indicado, bem como sobre os riscos inerentes aos atos anestésico e cirúrgico, incluindo reações adversas, complicações trans e pós-operatórias e, inclusive, risco de óbito.\n\nAUTORIZO a equipe médico-veterinária a realizar o procedimento acima descrito e, na ocorrência de intercorrências ou emergências, a adotar os procedimentos adicionais necessários à preservação da vida e do bem-estar do animal.\n\nCOMPROMETO-ME a seguir as orientações pré e pós-operatórias fornecidas pela equipe e a arcar com os custos decorrentes do procedimento e de eventuais cuidados complementares.',
      { fontSize: 9.5, align: 'justify', lineHeight: 1.55 }),
    cityDate(72.5),
    ...dualSignature(76.5),
    twoViasNote(92),
  ])
}

// ── 7. TCLE — Internação e Tratamento Clínico ────────────────────────────────

function buildTermoInternacao() {
  return state([
    ...header(),
    title('TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO', 13.2, 12),
    title('INTERNAÇÃO E TRATAMENTO CLÍNICO', 16.4, 10.5),
    CT({ x: 6, y: 21, w: 88, h: 5 }, [
      { tagId: 'tutor.name', prefix: 'Eu, ' },
      { tagId: 'tutor.cpf', prefix: 'CPF ' },
      { tagId: '', staticText: 'na qualidade de responsável pelo animal abaixo identificado:' },
    ], { fontSize: 10.5, lineHeight: 1.5, align: 'justify' }, { separator: ', ' }),
    ...idBlockCompact(26.5),
    FF({ x: 6, y: 38, w: 88, h: 5 }, 'motivo_internacao', 'Motivo da internação: ', { required: true, placeholder: '____________________________________________' }),
    T({ x: 6, y: 44.5, w: 88, h: 26 },
      'AUTORIZO a internação do animal acima identificado neste estabelecimento, para tratamento clínico e/ou pós-cirúrgico, e DECLARO estar ciente de que: (1) fui informado(a) sobre o quadro clínico, o plano terapêutico proposto e os riscos inerentes, inclusive de agravamento do estado de saúde e de óbito; (2) as visitas seguem as normas internas do estabelecimento; (3) os custos de diárias, medicamentos, exames e procedimentos realizados durante a internação são de minha responsabilidade; (4) a retirada do animal antes da alta médica exige a assinatura de termo específico de responsabilidade.\n\nCOMPROMETO-ME a manter atualizados meus contatos e a atender prontamente às solicitações da equipe médico-veterinária.',
      { fontSize: 9.5, align: 'justify', lineHeight: 1.55 }),
    cityDate(72.5),
    ...dualSignature(76.5),
    twoViasNote(92),
  ])
}

// ── 8. TCLE — Eutanásia ──────────────────────────────────────────────────────

function buildTermoEutanasia() {
  return state([
    ...header(),
    title('TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO', 13.2, 12),
    title('EUTANÁSIA', 16.4, 10.5),
    CT({ x: 6, y: 21, w: 88, h: 5 }, [
      { tagId: 'tutor.name', prefix: 'Eu, ' },
      { tagId: 'tutor.cpf', prefix: 'CPF ' },
      { tagId: '', staticText: 'na qualidade de responsável pelo animal abaixo identificado:' },
    ], { fontSize: 10.5, lineHeight: 1.5, align: 'justify' }, { separator: ', ' }),
    ...idBlockCompact(26.5),
    FF({ x: 6, y: 38, w: 88, h: 5 }, 'indicacao_motivo', 'Indicação / motivo: ', { required: true, placeholder: '______________________________________________' }),
    T({ x: 6, y: 44.5, w: 88, h: 17 },
      'DECLARO que fui esclarecido(a) pelo médico-veterinário sobre o quadro clínico do animal, seu prognóstico e as alternativas terapêuticas disponíveis, e que AUTORIZO, de livre e espontânea vontade, a realização da EUTANÁSIA, a ser executada por método humanitário, em conformidade com a Resolução CFMV nº 1.000/2012.\n\nDECLARO, ainda, estar ciente de que o procedimento é irreversível.',
      { fontSize: 9.5, align: 'justify', lineHeight: 1.55 }),
    FF({ x: 6, y: 62.5, w: 88, h: 4.5 }, 'destinacao_corpo', 'Destinação do corpo: ', { placeholder: '_____________________________________________' }),
    cityDate(70.5),
    ...dualSignature(74.5),
    twoViasNote(92),
  ])
}

// ── 9. Termo de Retirada sem Alta Médica (Art. 11, Res. CFMV 1321/2020) ──────

function buildTermoRetiradaSemAlta() {
  return state([
    ...header(),
    title('TERMO DE RESPONSABILIDADE', 13.2, 12),
    title('RETIRADA DE ANIMAL SEM ALTA MÉDICA', 16.4, 10.5),
    CT({ x: 6, y: 21, w: 88, h: 5 }, [
      { tagId: 'tutor.name', prefix: 'Eu, ' },
      { tagId: 'tutor.cpf', prefix: 'CPF ' },
      { tagId: '', staticText: 'na qualidade de responsável pelo animal abaixo identificado:' },
    ], { fontSize: 10.5, lineHeight: 1.5, align: 'justify' }, { separator: ', ' }),
    ...idBlockCompact(26.5),
    T({ x: 6, y: 38, w: 88, h: 22 },
      'DECLARO, para os devidos fins, que estou retirando o animal acima identificado deste estabelecimento SEM ALTA MÉDICA, contrariando a orientação do médico-veterinário responsável pelo atendimento.\n\nDECLARO ter sido informado(a) sobre o quadro clínico atual do animal e sobre os riscos decorrentes de sua remoção, incluindo o agravamento do estado de saúde e o risco de óbito, e ASSUMO integral responsabilidade pelas consequências desta decisão, isentando o estabelecimento e a equipe médico-veterinária de qualquer responsabilidade sobre elas.',
      { fontSize: 9.5, align: 'justify', lineHeight: 1.55 }),
    cityDate(61),
    ...dualSignature(65),
    // Testemunhas (exigidas em caso de recusa de assinatura — Art. 11 §único)
    LN({ x: 6, y: 85, w: 40, h: 0.15 }),
    T({ x: 6, y: 85.6, w: 40, h: 4.5 }, 'Testemunha 1\nNome: ______________ CPF: ______________', { fontSize: 8, color: MUTE, align: 'center', lineHeight: 1.5 }),
    LN({ x: 54, y: 85, w: 40, h: 0.15 }),
    T({ x: 54, y: 85.6, w: 40, h: 4.5 }, 'Testemunha 2\nNome: ______________ CPF: ______________', { fontSize: 8, color: MUTE, align: 'center', lineHeight: 1.5 }),
    twoViasNote(93),
  ])
}

// ── 10. Atestado de Vacinação ────────────────────────────────────────────────
// A Animais emite este atestado desde sempre (o Vertis gerava um relatório).
// `patient_vaccines` já tem os dados e `resolve-context.ts` já os expõe na
// source `vaccines` — então aqui é só o layout, sem código novo de dados.

/** Repeater de vacinas: uma linha por dose, com lote e próxima dose. */
const vaccineRepeater = (box, maxItemsPerPage) => ({
  id: eid('repeater'), kind: 'repeater', box, source: 'vaccines', zIndex: 2,
  itemTemplate: '{{name}} — {{date}}',
  itemTemplateLines: [
    { template: '{{name}}{{LEADER}}{{date}}', leaderDots: true, style: { fontWeight: 700 } },
    { template: 'Fabricante: {{manufacturer}} · Lote: {{lot}} · Validade: {{validity}} · Via: {{route}}', hideIfEmpty: true },
    { template: 'Próxima dose: {{next}}', style: { fontStyle: 'italic' }, hideIfEmpty: true, marginBottom: 5 },
  ],
  groupAndEnumerate: true,
  maxItemsPerPage,
  lineSpacing: 4,
  typography: { fontFamily: FONT, fontSize: 9.5, fontWeight: 400, color: INK, align: 'left', vAlign: 'top', lineHeight: 1.4 },
})

function buildAtestadoVacinacao() {
  return state([
    ...header(),
    title('ATESTADO DE VACINAÇÃO', 13.5, 13),
    ...idBlockFull(18),
    T({ x: 6, y: 35, w: 88, h: 5 },
      'ATESTO, para os devidos fins, que o animal acima identificado recebeu neste estabelecimento as doses de vacina relacionadas abaixo:',
      { fontSize: 10, align: 'justify', lineHeight: 1.5 }),
    vaccineRepeater({ x: 6, y: 41, w: 88, h: 36 }, 7),
    T({ x: 6, y: 78.5, w: 88, h: 4 },
      'A proteção conferida depende do cumprimento do calendário vacinal completo e dos reforços nas datas indicadas.',
      { fontSize: 8, color: MUTE, align: 'justify', lineHeight: 1.4 }),
    cityDate(83),
    ...vetSignature(86.5),
  ])
}

// ── 11. Termo de Não Aceitação de Conduta e Exames ───────────────────────────
// Documento corrente na Animais e ausente da nossa biblioteca: protege a equipe
// quando o tutor RECUSA exame pré-anestésico ou conduta indicada. O original
// deles lista três recusas para rubricar individualmente — mantido, porque é
// isso que dá valor probatório (o tutor rubrica item a item, não em bloco).

function buildTermoNaoAceitacao() {
  return state([
    ...header(),
    title('TERMO DE NÃO ACEITAÇÃO DE CONDUTA', 13.2, 12),
    title('E DE NÃO REALIZAÇÃO DE EXAMES', 16.4, 10.5),
    CT({ x: 6, y: 21, w: 88, h: 5 }, [
      { tagId: 'tutor.name', prefix: 'Eu, ' },
      { tagId: 'tutor.cpf', prefix: 'CPF ' },
      { tagId: '', staticText: 'na qualidade de responsável pelo animal abaixo identificado:' },
    ], { fontSize: 10.5, lineHeight: 1.5, align: 'justify' }, { separator: ', ' }),
    ...idBlockCompact(26.5),
    T({ x: 6, y: 38, w: 88, h: 11 },
      'DECLARO que fui devidamente informado(a) e esclarecido(a) quanto aos riscos anestésicos e cirúrgicos do animal acima referido, do qual sou responsável. Estou ciente de que o procedimento anestésico pode apresentar intercorrências e RESPONSABILIZO-ME por NÃO realizar os procedimentos e exames abaixo assinalados, solicitados pelo Médico Veterinário:',
      { fontSize: 9.5, align: 'justify', lineHeight: 1.55 }),
    // Rubrica item a item — é o que sustenta o documento juridicamente.
    FF({ x: 6, y: 50, w: 10, h: 4 }, 'recusa_hemograma_rubrica', '', { placeholder: '______' }),
    T({ x: 17, y: 50.2, w: 77, h: 4.5 }, 'Exames hematológicos (até 15 dias antes do procedimento anestésico)', { fontSize: 9.5, lineHeight: 1.4 }),
    FF({ x: 6, y: 56, w: 10, h: 4 }, 'recusa_cardio_rubrica', '', { placeholder: '______' }),
    T({ x: 17, y: 56.2, w: 77, h: 4.5 }, 'Eletrocardiograma e ecocardiograma (até 6 meses antes do procedimento anestésico)', { fontSize: 9.5, lineHeight: 1.4 }),
    FF({ x: 6, y: 62, w: 10, h: 4 }, 'recusa_jejum_rubrica', '', { placeholder: '______' }),
    T({ x: 17, y: 62.2, w: 77, h: 4.5 }, 'Jejum alimentar e/ou hídrico conforme recomendação do Médico Veterinário', { fontSize: 9.5, lineHeight: 1.4 }),
    FF({ x: 6, y: 68, w: 10, h: 4 }, 'recusa_outro_rubrica', '', { placeholder: '______' }),
    FF({ x: 17, y: 68, w: 77, h: 4.5 }, 'recusa_outro_descricao', 'Outro: ', { placeholder: '____________________________________________' }),
    T({ x: 6, y: 74, w: 88, h: 5 },
      'ASSUMO integral responsabilidade pelas consequências desta recusa, isentando o estabelecimento e a equipe médico-veterinária de responsabilidade sobre os desdobramentos dela decorrentes.',
      { fontSize: 9.5, align: 'justify', lineHeight: 1.55 }),
    cityDate(80),
    // O original da Animais tem três assinaturas: tutor, anestesista e MV responsável.
    LN({ x: 6, y: 90, w: 34, h: 0.15 }),
    CT({ x: 6, y: 90.6, w: 34, h: 2.4 }, [{ tagId: 'tutor.name' }], { fontSize: 8.5, fontWeight: 600, align: 'center' }),
    T({ x: 6, y: 93, w: 34, h: 2.2 }, 'Tutor(a) / Responsável', { fontSize: 7.5, color: MUTE, align: 'center' }),
    LN({ x: 43, y: 90, w: 24, h: 0.15 }),
    T({ x: 43, y: 90.6, w: 24, h: 4.6 }, 'MV Anestesista\nCRMV: __________', { fontSize: 7.5, color: MUTE, align: 'center', lineHeight: 1.5 }),
    LN({ x: 70, y: 90, w: 24, h: 0.15 }),
    DT({ x: 70, y: 90.6, w: 24, h: 2.4 }, 'vet.name', { fontSize: 8.5, fontWeight: 600, align: 'center' }),
    DT({ x: 70, y: 93, w: 24, h: 2.2 }, 'vet.crmv', { fontSize: 7.5, color: MUTE, align: 'center' }),
  ])
}

// ── 12. TCLE — Anestesia para Exame de Imagem ────────────────────────────────
// UM template para tomografia E ressonância, não dois. A Animais mantém arquivos
// separados por modalidade, mas o texto de risco anestésico é o mesmo e a
// diferença (contraste iodado, mielotomografia) cabe em campo preenchível.
// Duplicar por modalidade é exatamente o vício que medimos no catálogo do Vertis
// — 11 variantes de HISTOPATOLÓGICO pela mesma razão.

function buildTermoAnestesiaImagem() {
  return state([
    ...header(),
    title('TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO', 13.2, 12),
    title('PROCEDIMENTO ANESTÉSICO PARA EXAME DE IMAGEM', 16.4, 10.5),
    CT({ x: 6, y: 21, w: 88, h: 5 }, [
      { tagId: 'tutor.name', prefix: 'Eu, ' },
      { tagId: 'tutor.cpf', prefix: 'CPF ' },
      { tagId: '', staticText: 'na qualidade de responsável pelo animal abaixo identificado:' },
    ], { fontSize: 10.5, lineHeight: 1.5, align: 'justify' }, { separator: ', ' }),
    ...idBlockCompact(26.5),
    FF({ x: 6, y: 38, w: 43, h: 5 }, 'exame_modalidade', 'Exame: ', { required: true, placeholder: 'Tomografia / Ressonância' }),
    FF({ x: 51, y: 38, w: 43, h: 5 }, 'exame_regioes', 'Região(ões): ', { required: true, placeholder: '____________________' }),
    FF({ x: 6, y: 44, w: 88, h: 5 }, 'contraste', 'Contraste: ', { placeholder: 'iodado endovenoso / intratecal / não se aplica' }),
    T({ x: 6, y: 50.5, w: 88, h: 30 },
      'AUTORIZO a realização do procedimento anestésico e do exame de imagem acima descritos, solicitados pelo médico-veterinário responsável.\n\n'
      + 'DECLARO que fui informado(a) quanto aos riscos possíveis de um evento anestésico, entre eles: náuseas, vômitos, aspiração de conteúdo gástrico, depressão respiratória, intubação difícil por variações anatômicas, hipertermia maligna, reação alérgica, choque anafilático, lesões bucais, sintomas neurológicos transitórios, acidente vascular cerebral, arritmias cardíacas, infarto, hipóxia, parada cardiorrespiratória, sinais oculares, disfunção cognitiva pós-anestésica, reações tóxicas e óbito.\n\n'
      + 'DECLARO ter sido informado(a) quanto à importância, ao propósito, aos benefícios, aos riscos e às complicações potenciais do exame solicitado, e que tive oportunidade de fazer perguntas, respondidas satisfatoriamente.\n\n'
      + 'ESTOU CIENTE de que, havendo administração de meio de contraste, a maioria dos pacientes não apresenta efeito adverso, mas podem ocorrer náuseas, vômitos, reações alérgicas e dificuldade respiratória e, excepcionalmente, complicações mais sérias como choque, insuficiência renal e eventos cardiorrespiratórios.\n\n'
      + 'AUTORIZO a equipe a adotar, em caso de intercorrência ou emergência, os procedimentos adicionais necessários à preservação da vida e do bem-estar do animal.',
      { fontSize: 9, align: 'justify', lineHeight: 1.5 }),
    cityDate(82),
    ...dualSignature(85.5),
  ])
}

// ── 13. Termo de Esclarecimento — Prazo de Entrega de Laudo ──────────────────
// Também UM template para tomografia e ressonância. Os prazos diferem (a Animais
// pratica 3-5 dias úteis na tomografia conforme o nº de regiões, e 4 dias na
// ressonância, com taxa de urgência opcional de 1 dia útil) — isso é campo, não
// documento separado. O texto comum é o que importa: por que o laudo demora e
// por que a prévia não vai para o tutor antes do laudo oficial.

function buildTermoPrazoLaudo() {
  return state([
    ...header(),
    title('TERMO DE ESCLARECIMENTO', 13.2, 12),
    title('SOBRE O PRAZO DE ENTREGA DO LAUDO', 16.4, 10.5),
    ...idBlockCompact(21),
    FF({ x: 6, y: 32.5, w: 43, h: 5 }, 'exame_modalidade', 'Exame: ', { required: true, placeholder: 'Tomografia / Ressonância' }),
    FF({ x: 51, y: 32.5, w: 43, h: 5 }, 'prazo_laudo', 'Prazo do laudo oficial: ', { required: true, placeholder: '___ dias úteis' }),
    T({ x: 6, y: 39, w: 88, h: 28 },
      'O estudo por imagem é uma avaliação complexa e multiplanar de segmentos específicos do corpo do paciente. '
      + 'Exige trabalho minucioso do médico-veterinário imaginologista e reconstrução das imagens em software próprio. '
      + 'Para oferecer um resultado de excelência, a equipe de diagnóstico por imagem necessita do prazo acima indicado, '
      + 'contado a partir do término da realização do exame, para a emissão do LAUDO DEFINITIVO (oficial).\n\n'
      + 'Todos os casos são avaliados de forma particular, respeitando a urgência e a emergência de cada paciente, '
      + 'independentemente de sua origem. Em casos de extrema urgência, a equipe disponibiliza prévias e imagens ao '
      + 'médico-veterinário solicitante, por telefone e/ou e-mail, se este julgar necessário.\n\n'
      + 'DECLARO estar ciente de que a equipe NÃO repassa informações preliminares dos achados do exame a '
      + 'proprietários ou tutores antes da emissão do laudo oficial. Informações prévias são prestadas apenas ao '
      + 'médico-veterinário responsável pelo encaminhamento.',
      { fontSize: 9, align: 'justify', lineHeight: 1.5 }),
    // Opção de urgência — na Animais vale para ressonância (1 dia útil, taxa).
    T({ x: 6, y: 68.5, w: 88, h: 3 }, 'Taxa de urgência (quando disponível para a modalidade):', { fontSize: 9, fontWeight: 700 }),
    FF({ x: 6, y: 72, w: 10, h: 4 }, 'urgencia_aceito', '', { placeholder: '[   ]' }),
    T({ x: 17, y: 72.2, w: 77, h: 4.5 }, 'Aceito e contrato o pagamento da taxa de urgência', { fontSize: 9, lineHeight: 1.4 }),
    FF({ x: 6, y: 77, w: 10, h: 4 }, 'urgencia_recusado', '', { placeholder: '[   ]' }),
    T({ x: 17, y: 77.2, w: 77, h: 4.5 }, 'Não aceito e não contrato a taxa de urgência (laudo no prazo padrão)', { fontSize: 9, lineHeight: 1.4 }),
    cityDate(83),
    ...dualSignature(86.5),
  ])
}

// ── 14. Laudo Médico Veterinário ─────────────────────────────────────────────
// Primeiro template de tipo `laudo` da biblioteca: até aqui `document_templates`
// aceitava o tipo mas o catálogo padrão tinha zero — toda clínica desenhava o
// laudo do zero no editor. Este é o laudo clínico de texto livre (Res. CFMV
// 1321/2020 Art. 5º): identificação, histórico, achados, conclusão.
// Laudo de exame de laboratório NÃO é este — aquele é montado a partir de
// `exam_results` + `lab_reference_items`, fora do Canva.

function buildLaudoMedicoVeterinario() {
  return state([
    ...header(),
    title('LAUDO MÉDICO VETERINÁRIO', 13.5, 13),
    ...idBlockFull(18),
    FF({ x: 6, y: 35, w: 88, h: 5 }, 'laudo_exame', 'Exame / procedimento: ', { required: true, placeholder: '____________________________________________' }),
    T({ x: 6, y: 41.5, w: 88, h: 3 }, 'HISTÓRICO / INDICAÇÃO CLÍNICA', { fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5 }),
    FF({ x: 6, y: 45, w: 88, h: 11 }, 'laudo_historico', '', { inputType: 'textarea', placeholder: '' }),
    T({ x: 6, y: 57, w: 88, h: 3 }, 'ACHADOS', { fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5 }),
    FF({ x: 6, y: 60.5, w: 88, h: 18 }, 'laudo_achados', '', { inputType: 'textarea', required: true, placeholder: '' }),
    T({ x: 6, y: 79.5, w: 88, h: 3 }, 'CONCLUSÃO', { fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5 }),
    FF({ x: 6, y: 83, w: 88, h: 9 }, 'laudo_conclusao', '', { inputType: 'textarea', required: true, placeholder: '' }),
    // A conclusão é ato privativo do MV — a assinatura fecha o documento.
    ...vetSignature(93.5),
  ])
}

// ── extracted_fields derivados do canvas_state ──────────────────────────────
// A UI de Gestão > Modelos e o fluxo legado exibem extracted_fields como o
// "conteúdo" do template. Deriva a lista real de campos de cada layout para
// os cards não aparecerem como "0 campos".

const TAG_LABEL = {
  'tutor.name': 'Nome do Tutor', 'tutor.cpf': 'CPF do Tutor', 'tutor.phone': 'Telefone do Tutor',
  'tutor.email': 'E-mail do Tutor', 'tutor.address': 'Endereço do Tutor',
  'pet.name': 'Nome do Pet', 'pet.species': 'Espécie', 'pet.breed': 'Raça', 'pet.sex': 'Sexo',
  'pet.age': 'Idade', 'pet.weight': 'Peso', 'pet.color': 'Pelagem', 'pet.microchip': 'Microchip',
  'consulta.date': 'Data da Consulta', 'consulta.diagnosis': 'Diagnóstico',
  'clinica.name': 'Nome da Clínica', 'clinica.cnpj': 'CNPJ', 'clinica.phone': 'Telefone da Clínica',
  'clinica.address': 'Endereço da Clínica', 'clinica.city_state': 'Cidade/UF',
  'vet.name': 'Nome do MV', 'vet.crmv': 'CRMV',
  'clinic.logo': 'Logo da Clínica', 'vet.signature': 'Assinatura Eletrônica do MV',
}

const REPEATER_FIELD = {
  prescriptions: { field_name: 'medicamentos_prescritos', label: 'Medicamentos Prescritos' },
  exam_items:    { field_name: 'exames_solicitados',      label: 'Exames Solicitados' },
  vaccines:      { field_name: 'vacinas_aplicadas',       label: 'Vacinas Aplicadas' },
}

function deriveExtractedFields(canvasState) {
  const out = []
  const seen = new Set()
  const push = f => { if (!seen.has(f.field_name)) { seen.add(f.field_name); out.push(f) } }
  const autoDesc = 'Preenchido automaticamente com os dados do atendimento/cadastro'

  for (const el of canvasState.elements) {
    if (el.kind === 'fillable_field') {
      push({
        field_name: el.fieldKey,
        label: el.label.replace(/[:\s]+$/, ''),
        type: el.inputType === 'textarea' ? 'textarea' : el.inputType === 'date' ? 'date' : el.inputType === 'number' ? 'number' : 'text',
        description: 'Campo preenchido pelo MV durante o atendimento',
        required: !!el.required,
      })
    } else if (el.kind === 'dynamic_tag' || el.kind === 'dynamic_image') {
      const label = TAG_LABEL[el.tagId]
      if (label) push({
        field_name: el.tagId.replace(/\./g, '_'), label, type: 'text',
        description: autoDesc, required: false,
      })
    } else if (el.kind === 'composite_tag') {
      for (const part of el.parts) {
        const label = TAG_LABEL[part.tagId]
        if (label) push({
          field_name: part.tagId.replace(/\./g, '_'), label, type: 'text',
          description: autoDesc, required: false,
        })
      }
    } else if (el.kind === 'repeater') {
      const rf = REPEATER_FIELD[el.source]
      if (rf) push({ ...rf, type: 'textarea', description: 'Lista preenchida automaticamente a partir do atendimento', required: false })
    }
  }
  return out
}

// ── Catálogo final ───────────────────────────────────────────────────────────

const TEMPLATES = [
  { name: 'Receituário',                                        type: 'receita', build: buildReceitaSimples },
  { name: 'Receita de Controle Especial',                       type: 'receita', build: buildReceitaControleEspecial },
  { name: 'Atestado de Saúde Animal',                           type: 'outro',   build: buildAtestadoSaude },
  { name: 'Atestado de Óbito',                                  type: 'outro',   build: buildAtestadoObito },
  { name: 'Solicitação de Exames',                              type: 'exame',   build: buildSolicitacaoExames },
  { name: 'Termo de Consentimento — Cirurgia e Anestesia',      type: 'termo',   build: buildTermoCirurgico },
  { name: 'Termo de Consentimento — Internação',                type: 'termo',   build: buildTermoInternacao },
  { name: 'Termo de Consentimento — Eutanásia',                 type: 'termo',   build: buildTermoEutanasia },
  { name: 'Termo de Retirada sem Alta Médica',                  type: 'termo',   build: buildTermoRetiradaSemAlta },
  { name: 'Atestado de Vacinação',                              type: 'outro',   build: buildAtestadoVacinacao },
  { name: 'Termo de Não Aceitação de Conduta e Exames',         type: 'termo',   build: buildTermoNaoAceitacao },
  { name: 'Termo de Consentimento — Anestesia para Exame de Imagem', type: 'termo', build: buildTermoAnestesiaImagem },
  { name: 'Termo de Esclarecimento — Prazo de Entrega do Laudo', type: 'termo',   build: buildTermoPrazoLaudo },
  { name: 'Laudo Médico Veterinário',                           type: 'laudo',   build: buildLaudoMedicoVeterinario },
]

// ── Execução ─────────────────────────────────────────────────────────────────

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
console.log('→ Conectando ao Supabase…')
await client.connect()

try {
  // ── Biblioteca canônica (fonte do trigger da migration 0414) ─────────────
  // Atualizada SEMPRE (inclusive em --dry não: só quando grava de verdade).
  if (!DRY) {
    let libUpserts = 0
    for (const tpl of TEMPLATES) {
      const canvasState = tpl.build()
      const extractedFields = deriveExtractedFields(canvasState)
      await client.query(
        `INSERT INTO default_document_templates (name, type, engine, extracted_fields, canvas_state, updated_at)
         VALUES ($1, $2, 'canva-native', $3::jsonb, $4::jsonb, now())
         ON CONFLICT (name, type) DO UPDATE
            SET canvas_state = EXCLUDED.canvas_state,
                extracted_fields = EXCLUDED.extracted_fields,
                engine = EXCLUDED.engine,
                updated_at = now()`,
        [tpl.name, tpl.type, JSON.stringify(extractedFields), JSON.stringify(canvasState)],
      ).then(() => libUpserts++)
        .catch(e => {
          if (/relation .* does not exist/i.test(e.message)) {
            console.warn('  (aviso: default_document_templates ainda não existe — aplique a migration 0414)')
          } else throw e
        })
    }
    if (libUpserts) console.log(`→ Biblioteca canônica: ${libUpserts} layouts atualizados (default_document_templates)`)
  }

  const params = []
  let where = `COALESCE(ts.plan_name, 'free') = 'free' AND c.name NOT ILIKE '%almavet%'`
  if (ALL) where = `c.name NOT ILIKE '%almavet%'`
  if (ONLY_CLINIC) { params.push(ONLY_CLINIC); where = `c.id = $1` }

  const { rows: clinics } = await client.query(
    `SELECT c.id, c.name, COALESCE(ts.plan_name, 'free') AS plan
       FROM clinics c
       LEFT JOIN tenant_subscriptions ts ON ts.clinic_id = c.id
      WHERE ${where}
      ORDER BY c.name`,
    params,
  )

  console.log(`→ ${clinics.length} clínica(s) alvo (${ALL ? 'TODAS exceto Almavet' : 'plano Free, exceto Almavet'}):`)
  clinics.forEach(c => console.log(`    • ${c.name} [${c.plan}] — ${c.id}`))

  if (DRY) { console.log('\n(--dry) Nada foi gravado.'); process.exit(0) }
  if (clinics.length === 0) { console.log('Nenhuma clínica alvo. Nada a fazer.'); process.exit(0) }

  let created = 0, updated = 0
  for (const clinic of clinics) {
    for (const tpl of TEMPLATES) {
      const canvasState = tpl.build()
      const extractedFields = deriveExtractedFields(canvasState)
      const { rows: existing } = await client.query(
        `SELECT id FROM document_templates WHERE clinic_id = $1 AND name = $2 AND type = $3 LIMIT 1`,
        [clinic.id, tpl.name, tpl.type],
      )
      if (existing.length > 0) {
        await client.query(
          `UPDATE document_templates
              SET canvas_state = $1::jsonb, extracted_fields = $2::jsonb,
                  engine = 'canva-native', updated_at = now()
            WHERE id = $3`,
          [JSON.stringify(canvasState), JSON.stringify(extractedFields), existing[0].id],
        )
        updated++
      } else {
        await client.query(
          `INSERT INTO document_templates (clinic_id, name, type, engine, extracted_fields, canvas_state)
           VALUES ($1, $2, $3, 'canva-native', $5::jsonb, $4::jsonb)`,
          [clinic.id, tpl.name, tpl.type, JSON.stringify(canvasState), JSON.stringify(extractedFields)],
        )
        created++
      }
    }
    console.log(`  ✓ ${clinic.name}: ${TEMPLATES.length} templates ok`)
  }

  console.log(`\n✓ Concluído: ${created} criados, ${updated} atualizados em ${clinics.length} clínica(s).`)
  console.log('→ Verifique em: Gestão > Modelos (qualquer clínica Free).')
} catch (e) {
  console.error('✗ Erro:', e?.message ?? e)
  process.exitCode = 1
} finally {
  await client.end()
}
