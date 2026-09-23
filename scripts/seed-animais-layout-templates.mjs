/**
 * Seed dos 12 documentos da Clínica Animais classificados como "sai hoje"
 * ou "com restrição de baixo esforço" no motor Canvas Nativo, conforme
 * diagnóstico de 22/09/2026 (memória project_animais_layouts_diagnostico +
 * artifact "Diagnóstico Layouts Animais").
 *
 * IMPORTANTE: conteúdo estrutural (campos/seções) reproduz o que o
 * diagnóstico descreveu de cada arquivo — NENHUM dado real de tutor/pet dos
 * originais em C:\SysMax\anexos\Animais_Layouts foi copiado (Zero PII
 * Policy). Textos são genéricos/CFMV-padrão.
 *
 * 9 "sai hoje" (pill ok no diagnóstico):
 *   1. Atestado de Saúde Animal (Animais)         type: outro
 *   2. Atestado de Óbito (Animais)                type: outro
 *   3. Termo de Encaminhamento                    type: encaminhamento
 *   4. TCLE — Anestesia para Ressonância           type: termo
 *   5. Termo de Entrega de Resultados de RM (2 vias) type: termo
 *   6. Termo de Esclarecimento — Tomografia 72h (2 vias) type: termo
 *   7. Autorização Anestésica — Tomografia         type: termo
 *   8. Autorização — Cirurgia e Anestesia          type: termo
 *   9. Autorização — Liberação sem Alta Médica     type: termo
 *
 * 3 "com restrição" de baixo esforço (3-4h cada no diagnóstico):
 *  10. Laudo de Radiografia (1 página)             type: laudo
 *  11. Laudo de Tomografia (1 página)               type: laudo
 *  12. Laudo CCZ (formulário, tamanho Carta)        type: outro
 *
 * Todos usam rodapé com Pág. X de Y (doc.page_of_total), impresso em
 * (doc.printed_at) e QR de validação (qr_validation) — recursos da Fase 1
 * (pagination.ts / identity.ts / doc-verification.ts).
 *
 * Uso:
 *   node scripts/seed-animais-layout-templates.mjs --clinic <uuid>
 *   node scripts/seed-animais-layout-templates.mjs --clinic <uuid> --dry
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
const clinicArgIdx = process.argv.indexOf('--clinic')
const ONLY_CLINIC = clinicArgIdx > -1 ? process.argv[clinicArgIdx + 1] : null
if (!ONLY_CLINIC) { console.error('FATAL: use --clinic <uuid>'); process.exit(1) }

// ── Helpers de elementos (espelham src/lib/canva/elements.ts) ────────────────

const INK = '#0f172a'
const MUTE = '#475569'
const FONT = 'Inter'

let seq = 0
const eid = k => `el_${k}_animais_${(++seq).toString(36).padStart(3, '0')}`

const T = (box, content, ty = {}, extra = {}) => ({
  id: eid('text'), kind: 'text', box, content, zIndex: 2,
  typography: { fontFamily: FONT, fontSize: 10, fontWeight: 400, color: INK, align: 'left', vAlign: 'top', lineHeight: 1.4, ...ty },
  ...extra,
})

const DT = (box, tagId, ty = {}, extra = {}) => ({
  id: eid('dynamic_tag'), kind: 'dynamic_tag', box, tagId, zIndex: 2,
  typography: { fontFamily: FONT, fontSize: 10, fontWeight: 400, color: INK, align: 'left', vAlign: 'top', lineHeight: 1.4, ...ty },
  ...extra,
})

const CT = (box, parts, ty = {}, extra = {}) => ({
  id: eid('composite_tag'), kind: 'composite_tag', box, parts, separator: '   ', hideEmptyParts: true, zIndex: 2,
  typography: { fontFamily: FONT, fontSize: 9.5, fontWeight: 400, color: INK, align: 'left', vAlign: 'top', lineHeight: 1.4, ...ty },
  ...extra,
})

const LN = (box, extra = {}) => ({
  id: eid('line'), kind: 'line', box, orientation: 'horizontal', thickness: 1, color: INK, zIndex: 2, ...extra,
})

const FF = (box, fieldKey, label, opts = {}, ty = {}) => ({
  id: eid('fillable_field'), kind: 'fillable_field', box, fieldKey, label, zIndex: 2,
  placeholder: opts.placeholder ?? '________________________________________',
  required: opts.required ?? false,
  inputType: opts.inputType ?? 'text',
  typography: { fontFamily: FONT, fontSize: 10, fontWeight: 400, color: INK, align: 'left', vAlign: 'top', lineHeight: 1.4, ...ty },
})

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

const QR = (box, extra = {}) => ({
  id: eid('qr_validation'), kind: 'qr_validation', box, showCode: true, caption: 'Verifique a autenticidade', zIndex: 2, ...extra,
})

// ── Blocos compostos reutilizáveis ───────────────────────────────────────────

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

function idBlockFull(y) {
  const line = (dy, parts, sep = '   ·   ') =>
    CT({ x: 7, y: y + dy, w: 86, h: 2.7 }, parts, {}, { separator: sep })
  return [
    BOX({ x: 5, y: y - 1, w: 90, h: 15.5 }),
    line(0, [
      { tagId: 'pet.name', prefix: 'Animal: ' }, { tagId: 'pet.species', prefix: 'Espécie: ' }, { tagId: 'pet.breed', prefix: 'Raça: ' },
    ]),
    line(2.9, [
      { tagId: 'pet.sex', prefix: 'Sexo: ' }, { tagId: 'pet.age_amd', prefix: 'Idade: ' }, { tagId: 'pet.weight', prefix: 'Peso: ' }, { tagId: 'pet.color', prefix: 'Pelagem: ' },
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

function idBlockCompact(y) {
  const line = (dy, parts) =>
    CT({ x: 7, y: y + dy, w: 86, h: 2.7 }, parts, {}, { separator: '   ·   ' })
  return [
    BOX({ x: 5, y: y - 1, w: 90, h: 9.8 }),
    line(0, [
      { tagId: 'pet.name', prefix: 'Animal: ' }, { tagId: 'pet.species', prefix: 'Espécie: ' }, { tagId: 'pet.breed', prefix: 'Raça: ' }, { tagId: 'pet.sex', prefix: 'Sexo: ' },
    ]),
    line(2.9, [
      { tagId: 'pet.age_amd', prefix: 'Idade: ' }, { tagId: 'pet.weight', prefix: 'Peso: ' }, { tagId: 'tutor.name', prefix: 'Tutor(a): ' }, { tagId: 'tutor.cpf', prefix: 'CPF: ' },
    ]),
    line(5.8, [
      { tagId: 'tutor.address', prefix: 'Endereço: ' }, { tagId: 'tutor.phone', prefix: 'Tel: ' },
    ]),
  ]
}

const cityDate = y =>
  CT({ x: 4, y, w: 92, h: 3 }, [
    { tagId: 'clinica.city_state' },
    { tagId: 'consulta.date' },
  ], { fontSize: 10.5, align: 'center' }, { separator: ', ' })

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

/**
 * Rodapé Fase 1: Pág. X de Y + impresso em + QR de validação.
 *
 * ACHADO DE TESTE (23/09/2026): QrValidationElement não contém a caption
 * dentro dos limites do seu `box` — texto ("Verifique a autenticidade")
 * transborda à esquerda e colide com elementos vizinhos mesmo com espaço
 * aparentemente suficiente. Mitigação aqui: caption vazia + box bem maior
 * que o ícone real, e texto de rodapé com largura reduzida para não
 * disputar a mesma faixa horizontal. Ver relatório de teste para o achado
 * completo (candidato a bug do motor, não deste template).
 */
function footerPagQR(y = 93.5) {
  return [
    LN({ x: 4, y: y - 1, w: 92, h: 0.1 }, { color: '#cbd5e1' }),
    DT({ x: 4, y, w: 28, h: 2.6 }, 'doc.page_of_total', { fontSize: 7.5, color: MUTE, prefix: 'Pág. ' }),
    DT({ x: 33, y, w: 34, h: 2.6 }, 'doc.printed_at', { fontSize: 7.5, color: MUTE, align: 'center', prefix: 'Impresso em ' }),
    QR({ x: 78, y: y - 8, w: 18, h: 10 }, { showCode: false, caption: '' }),
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

const state = (elements, pageOverrides = {}) => ({ version: 1, page: page(pageOverrides), elements })

// ── 1. Atestado de Saúde Animal (Animais) ────────────────────────────────────

function buildAtestadoSaudeAnimais() {
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
    ...footerPagQR(),
  ])
}

// ── 2. Atestado de Óbito (Animais) ───────────────────────────────────────────

function buildAtestadoObitoAnimais() {
  return state([
    ...header(),
    title('ATESTADO DE ÓBITO', 13.5),
    T({ x: 6, y: 18.5, w: 88, h: 4 }, 'Atesto, para os devidos fins, o óbito do animal abaixo identificado:', { fontSize: 10.5, lineHeight: 1.5 }),
    ...idBlockFull(24),
    FF({ x: 6, y: 41.5, w: 42, h: 3 }, 'data_hora_obito', 'Data e hora do óbito: ', { required: true, placeholder: '____/____/______  às  ____:____' }),
    FF({ x: 52, y: 41.5, w: 42, h: 3 }, 'local_obito', 'Local do óbito: ', { required: true, placeholder: '_____________________' }),
    FF({ x: 6, y: 45.5, w: 88, h: 9 }, 'causa_mortis', 'Provável causa mortis: ', { required: true, inputType: 'textarea', placeholder: '__________________________________________________' }),
    T({ x: 6, y: 56, w: 88, h: 6 },
      'O responsável pelo animal foi orientado quanto à destinação ambientalmente adequada do cadáver, nos termos da legislação sanitária e ambiental vigente.',
      { fontSize: 9.5, align: 'justify', lineHeight: 1.5, color: MUTE }),
    cityDate(68),
    ...vetSignature(71.5),
    twoViasNote(89.5),
    ...footerPagQR(),
  ])
}

// ── 3. Termo de Encaminhamento (merge-fields, estilo "Cartas Padronizadas") ──

function buildTermoEncaminhamento() {
  return state([
    ...header(),
    title('TERMO DE ENCAMINHAMENTO', 13.5),
    cityDate(18.5),
    T({ x: 6, y: 23, w: 88, h: 3 }, 'Prezado(a) Doutor(a),', { fontSize: 10.5 }),
    CT({ x: 6, y: 27, w: 88, h: 12 }, [
      { tagId: '', staticText: 'Encaminho o(a) paciente ' },
      { tagId: 'pet.name' },
      { tagId: '', staticText: ', ' },
      { tagId: 'pet.species' },
      { tagId: '', staticText: ' da raça ' },
      { tagId: 'pet.breed' },
      { tagId: '', staticText: ', tutor(a) ' },
      { tagId: 'tutor.name' },
      { tagId: '', staticText: ' (CPF ' },
      { tagId: 'tutor.cpf' },
      { tagId: '', staticText: '), para avaliação e conduta que julgar necessárias.' },
    ], { fontSize: 10.5, lineHeight: 1.6, align: 'justify' }, { separator: '' }),
    FF({ x: 6, y: 40, w: 88, h: 12 }, 'motivo_encaminhamento', 'Motivo do encaminhamento / hipótese diagnóstica: ', { required: true, inputType: 'textarea', placeholder: '__________________________________________________' }),
    FF({ x: 6, y: 54, w: 88, h: 10 }, 'exames_realizados', 'Exames já realizados / achados relevantes: ', { inputType: 'textarea', placeholder: '__________________________________________________' }),
    T({ x: 6, y: 66, w: 88, h: 4 }, 'Coloco-me à disposição para esclarecimentos adicionais.', { fontSize: 10, color: MUTE }),
    cityDate(74),
    ...vetSignature(77.5),
    ...footerPagQR(),
  ])
}

// ── 4. TCLE — Anestesia para Ressonância ─────────────────────────────────────

function buildTcleAnestesiaRessonancia() {
  return state([
    ...header(),
    title('TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO', 13.2, 12),
    title('SEDAÇÃO/ANESTESIA PARA RESSONÂNCIA MAGNÉTICA', 16.4, 10),
    CT({ x: 6, y: 21, w: 88, h: 5 }, [
      { tagId: 'tutor.name', prefix: 'Eu, ' },
      { tagId: 'tutor.cpf', prefix: 'CPF ' },
      { tagId: '', staticText: 'na qualidade de responsável pelo animal abaixo identificado:' },
    ], { fontSize: 10.5, lineHeight: 1.5, align: 'justify' }, { separator: ', ' }),
    ...idBlockCompact(26.5),
    T({ x: 6, y: 38, w: 88, h: 30 },
      'DECLARO que fui informado(a), em linguagem clara e acessível, que o exame de Ressonância Magnética exige que o animal permaneça completamente imóvel, sendo necessária sedação profunda ou anestesia geral para sua realização.\n\n' +
      'DECLARO ter sido esclarecido(a) sobre os riscos inerentes ao procedimento anestésico, incluindo reações adversas individuais, complicações cardiorrespiratórias e, em casos raros, risco de óbito, especialmente em animais com comorbidades pré-existentes, idosos ou de raças braquicefálicas.\n\n' +
      'AUTORIZO a equipe médico-veterinária a proceder com a sedação/anestesia necessária e, na ocorrência de intercorrências, a adotar as medidas de suporte e emergência que se fizerem necessárias.',
      { fontSize: 9.5, align: 'justify', lineHeight: 1.55 }),
    cityDate(70.5),
    ...dualSignature(74.5),
    twoViasNote(91.5),
    ...footerPagQR(),
  ])
}

/** Duas vias na mesma folha, separadas por linha pontilhada — reaproveita 1 builder de conteúdo para as 2 metades. */
function duasVias(buildHalf, viaLabels = ['1ª via — Clínica', '2ª via — Tutor(a)']) {
  const half = buildHalf(3, viaLabels[0])
  const half2 = buildHalf(51, viaLabels[1])
  return [
    ...half,
    LN({ x: 4, y: 49.5, w: 92, h: 0.1 }, { dashed: true, color: '#94a3b8' }),
    ...half2,
  ]
}

// ── 5. Termo de Entrega de Resultados de RM (2 vias) ─────────────────────────

function buildTermoEntregaResultadosRM() {
  const buildHalf = (y0, viaLabel) => [
    T({ x: 4, y: y0, w: 92, h: 2 }, viaLabel, { fontSize: 7.5, fontWeight: 700, color: MUTE, letterSpacing: 1 }),
    title('TERMO DE ENTREGA DE RESULTADOS — RESSONÂNCIA MAGNÉTICA', y0 + 3, 9.5),
    ...idBlockCompact(y0 + 7.5),
    T({ x: 6, y: y0 + 16.5, w: 88, h: 9 },
      'Declaro ter recebido, nesta data, o laudo e as imagens do exame de Ressonância Magnética do animal acima identificado, em meio digital e/ou impresso, e estar ciente de que a interpretação dos resultados deve ser feita em conjunto com o médico-veterinário solicitante.',
      { fontSize: 8.5, align: 'justify', lineHeight: 1.4 }),
    CT({ x: 6, y: y0 + 27, w: 88, h: 2.4 }, [{ tagId: 'clinica.city_state' }, { tagId: 'consulta.date' }], { fontSize: 8.5, align: 'center' }, { separator: ', ' }),
    LN({ x: 26, y: y0 + 33, w: 44, h: 0.15 }),
    CT({ x: 26, y: y0 + 33.6, w: 44, h: 2.2 }, [{ tagId: 'tutor.name' }], { fontSize: 8.5, fontWeight: 600, align: 'center' }),
    T({ x: 26, y: y0 + 35.8, w: 44, h: 2 }, 'Tutor(a) / Responsável', { fontSize: 7, color: MUTE, align: 'center' }),
  ]
  return state(duasVias(buildHalf))
}

// ── 6. Termo de Esclarecimento — Tomografia 72h (2 vias) ─────────────────────

function buildTermoEsclarecimentoTomo72h() {
  const buildHalf = (y0, viaLabel) => [
    T({ x: 4, y: y0, w: 92, h: 2 }, viaLabel, { fontSize: 7.5, fontWeight: 700, color: MUTE, letterSpacing: 1 }),
    title('TERMO DE ESCLARECIMENTO — TOMOGRAFIA COMPUTADORIZADA', y0 + 3, 9),
    ...idBlockCompact(y0 + 7.5),
    T({ x: 6, y: y0 + 16.5, w: 88, h: 12 },
      'Fui esclarecido(a) de que o laudo do exame de Tomografia Computadorizada será entregue em até 72 (setenta e duas) horas úteis, contadas a partir da realização do exame, podendo esse prazo ser estendido em casos que exijam avaliação por especialista externo.',
      { fontSize: 8.5, align: 'justify', lineHeight: 1.4 }),
    CT({ x: 6, y: y0 + 30, w: 88, h: 2.4 }, [{ tagId: 'clinica.city_state' }, { tagId: 'consulta.date' }], { fontSize: 8.5, align: 'center' }, { separator: ', ' }),
    LN({ x: 26, y: y0 + 36, w: 44, h: 0.15 }),
    CT({ x: 26, y: y0 + 36.6, w: 44, h: 2.2 }, [{ tagId: 'tutor.name' }], { fontSize: 8.5, fontWeight: 600, align: 'center' }),
    T({ x: 26, y: y0 + 38.8, w: 44, h: 2 }, 'Tutor(a) / Responsável', { fontSize: 7, color: MUTE, align: 'center' }),
  ]
  return state(duasVias(buildHalf))
}

// ── 7. Autorização Anestésica — Tomografia ───────────────────────────────────

function buildAutorizacaoAnestesicaTomografia() {
  return state([
    ...header(),
    title('AUTORIZAÇÃO PARA SEDAÇÃO/ANESTESIA — TOMOGRAFIA COMPUTADORIZADA', 14, 11),
    CT({ x: 6, y: 20.5, w: 88, h: 5 }, [
      { tagId: 'tutor.name', prefix: 'Eu, ' },
      { tagId: 'tutor.cpf', prefix: 'CPF ' },
      { tagId: '', staticText: 'na qualidade de responsável pelo animal abaixo identificado:' },
    ], { fontSize: 10.5, lineHeight: 1.5, align: 'justify' }, { separator: ', ' }),
    ...idBlockCompact(26),
    T({ x: 6, y: 37.5, w: 88, h: 30 },
      'DECLARO ter sido informado(a) de que o exame de Tomografia Computadorizada exige contenção química (sedação) ou anestesia geral para garantir a imobilidade do animal durante a aquisição das imagens.\n\n' +
      'DECLARO estar ciente dos riscos inerentes ao procedimento anestésico, incluindo reações adversas, alterações cardiorrespiratórias e, em casos excepcionais, risco de óbito.\n\n' +
      'AUTORIZO a equipe médico-veterinária a realizar a sedação/anestesia necessária à realização do exame.',
      { fontSize: 9.5, align: 'justify', lineHeight: 1.55 }),
    cityDate(70),
    ...dualSignature(74),
    twoViasNote(91.5),
    ...footerPagQR(),
  ])
}

// ── 8. Autorização — Cirurgia e Anestesia ────────────────────────────────────

function buildAutorizacaoCirurgiaAnestesia() {
  return state([
    ...header(),
    title('AUTORIZAÇÃO PARA PROCEDIMENTO CIRÚRGICO E ANESTÉSICO', 13.5, 11.5),
    CT({ x: 6, y: 20, w: 88, h: 5 }, [
      { tagId: 'tutor.name', prefix: 'Eu, ' },
      { tagId: 'tutor.cpf', prefix: 'CPF ' },
      { tagId: '', staticText: 'na qualidade de responsável pelo animal abaixo identificado:' },
    ], { fontSize: 10.5, lineHeight: 1.5, align: 'justify' }, { separator: ', ' }),
    ...idBlockCompact(25.5),
    FF({ x: 6, y: 37, w: 88, h: 5 }, 'procedimento_autorizado', 'Procedimento(s) autorizado(s): ', { required: true, placeholder: '_______________________________________' }),
    T({ x: 6, y: 43.5, w: 88, h: 26 },
      'DECLARO que fui informado(a), em linguagem clara e acessível, sobre o diagnóstico, a natureza e os objetivos do procedimento cirúrgico indicado, bem como sobre os riscos inerentes aos atos anestésico e cirúrgico, incluindo reações adversas, complicações trans e pós-operatórias e, inclusive, risco de óbito.\n\n' +
      'AUTORIZO a equipe médico-veterinária a realizar o procedimento acima descrito e, na ocorrência de intercorrências ou emergências, a adotar os procedimentos adicionais necessários à preservação da vida e do bem-estar do animal.',
      { fontSize: 9.5, align: 'justify', lineHeight: 1.55 }),
    cityDate(71.5),
    ...dualSignature(75.5),
    twoViasNote(92),
    ...footerPagQR(),
  ])
}

// ── 9. Autorização — Liberação sem Alta Médica ───────────────────────────────

function buildAutorizacaoLiberacaoSemAlta() {
  return state([
    ...header(),
    title('TERMO DE RESPONSABILIDADE', 13.2, 12),
    title('LIBERAÇÃO DE ANIMAL SEM ALTA MÉDICA', 16.4, 10.5),
    CT({ x: 6, y: 21, w: 88, h: 5 }, [
      { tagId: 'tutor.name', prefix: 'Eu, ' },
      { tagId: 'tutor.cpf', prefix: 'CPF ' },
      { tagId: '', staticText: 'na qualidade de responsável pelo animal abaixo identificado:' },
    ], { fontSize: 10.5, lineHeight: 1.5, align: 'justify' }, { separator: ', ' }),
    ...idBlockCompact(26.5),
    T({ x: 6, y: 38, w: 88, h: 22 },
      'DECLARO, para os devidos fins, que estou retirando o animal acima identificado deste estabelecimento SEM ALTA MÉDICA, contrariando a orientação do médico-veterinário responsável pelo atendimento.\n\n' +
      'DECLARO ter sido informado(a) sobre o quadro clínico atual do animal e sobre os riscos decorrentes de sua remoção, incluindo o agravamento do estado de saúde e o risco de óbito, e ASSUMO integral responsabilidade pelas consequências desta decisão, isentando o estabelecimento e a equipe médico-veterinária de qualquer responsabilidade sobre elas.',
      { fontSize: 9.5, align: 'justify', lineHeight: 1.55 }),
    cityDate(61),
    ...dualSignature(65),
    LN({ x: 6, y: 82, w: 40, h: 0.15 }),
    T({ x: 6, y: 82.6, w: 40, h: 4.5 }, 'Testemunha 1\nNome: ______________ CPF: ______________', { fontSize: 8, color: MUTE, align: 'center', lineHeight: 1.5 }),
    LN({ x: 54, y: 82, w: 40, h: 0.15 }),
    T({ x: 54, y: 82.6, w: 40, h: 4.5 }, 'Testemunha 2\nNome: ______________ CPF: ______________', { fontSize: 8, color: MUTE, align: 'center', lineHeight: 1.5 }),
    twoViasNote(90.5),
    ...footerPagQR(),
  ])
}

// ── 10. Laudo de Radiografia (1 página) ──────────────────────────────────────

function buildLaudoRadiografia() {
  return state([
    ...header(),
    title('LAUDO DE RADIOGRAFIA', 13.5),
    ...idBlockCompact(18),
    CT({ x: 6, y: 29.5, w: 88, h: 2.6 }, [
      { tagId: 'consulta.date', prefix: 'Data do exame: ' },
    ], { fontSize: 9.5 }),
    FF({ x: 6, y: 33, w: 42, h: 3 }, 'equipamento', 'Equipamento: ', { placeholder: 'Digital / CR / DR' }),
    FF({ x: 52, y: 33, w: 42, h: 3 }, 'regiao_estudada', 'Região estudada: ', { required: true, placeholder: '________________' }),
    FF({ x: 6, y: 37.5, w: 88, h: 3 }, 'incidencias', 'Incidência(s): ', { required: true, placeholder: '________________________________' }),
    T({ x: 6, y: 42.5, w: 88, h: 2.5 }, 'RELATÓRIO RADIOGRÁFICO', { fontSize: 9.5, fontWeight: 700, color: MUTE, letterSpacing: 1 }),
    FF({ x: 6, y: 45.5, w: 88, h: 30 }, 'relatorio_radiografico', '', { inputType: 'textarea', required: true, placeholder: '__________________________________________________' }),
    T({ x: 6, y: 77, w: 88, h: 2.5 }, 'IMPRESSÃO DIAGNÓSTICA', { fontSize: 9.5, fontWeight: 700, color: MUTE, letterSpacing: 1 }),
    FF({ x: 6, y: 80, w: 88, h: 8 }, 'impressao_diagnostica', '', { inputType: 'textarea', required: true, placeholder: '__________________________________________________' }),
    ...vetSignature(89, 'Assinado eletronicamente'),
    ...footerPagQR(),
  ])
}

// ── 11. Laudo de Tomografia (1 página) ───────────────────────────────────────

function buildLaudoTomografia() {
  return state([
    ...header(),
    title('LAUDO DE TOMOGRAFIA COMPUTADORIZADA', 13.5, 12),
    ...idBlockCompact(18.5),
    CT({ x: 6, y: 30, w: 88, h: 2.6 }, [
      { tagId: 'consulta.date', prefix: 'Data do exame: ' },
    ], { fontSize: 9.5 }),
    FF({ x: 6, y: 33.5, w: 42, h: 3 }, 'protocolo_estudo', 'Protocolo/estudo: ', { placeholder: 'Janela óssea / tecidos moles' }),
    FF({ x: 52, y: 33.5, w: 42, h: 3 }, 'regiao_estudada', 'Região estudada: ', { required: true, placeholder: '________________' }),
    T({ x: 6, y: 38.5, w: 88, h: 2.5 }, 'DESCRIÇÃO TOMOGRÁFICA', { fontSize: 9.5, fontWeight: 700, color: MUTE, letterSpacing: 1 }),
    FF({ x: 6, y: 41.5, w: 88, h: 32 }, 'descricao_tomografica', '', { inputType: 'textarea', required: true, placeholder: '__________________________________________________' }),
    T({ x: 6, y: 75, w: 88, h: 2.5 }, 'IMPRESSÕES DIAGNÓSTICAS', { fontSize: 9.5, fontWeight: 700, color: MUTE, letterSpacing: 1 }),
    FF({ x: 6, y: 78, w: 88, h: 10 }, 'impressoes_diagnosticas', '', { inputType: 'textarea', required: true, placeholder: '__________________________________________________' }),
    ...vetSignature(89, 'Assinado eletronicamente'),
    ...footerPagQR(),
  ])
}

// ── 12. Laudo CCZ (formulário, tamanho Carta/Letter) ─────────────────────────

function buildLaudoCCZ() {
  return state([
    T({ x: 4, y: 3, w: 92, h: 3 }, 'LAUDO MÉDICO-VETERINÁRIO — CENTRO DE CONTROLE DE ZOONOSES', { fontSize: 11.5, fontWeight: 700, align: 'center', lineHeight: 1.3 }),
    LN({ x: 4, y: 8, w: 92, h: 0.15 }, { color: '#94a3b8' }),
    FF({ x: 4, y: 10.5, w: 92, h: 3 }, 'clinica_atendente', 'Clínica/consultório atendente: ', { placeholder: '________________________________' }),
    ...idBlockCompact(15.5),
    FF({ x: 4, y: 27.5, w: 44, h: 3 }, 'data_atendimento', 'Data do atendimento: ', { placeholder: '____/____/______' }),
    FF({ x: 50, y: 27.5, w: 46, h: 3 }, 'especie_raca_detalhe', 'Espécie/raça (detalhe): ', { placeholder: '________________' }),
    FF({ x: 4, y: 32, w: 92, h: 3 }, 'houve_obito', 'Houve óbito? ', { placeholder: 'Sim (  )   Não (  )' }),
    FF({ x: 4, y: 36, w: 92, h: 3 }, 'acidente_vitima_humana', 'Houve acidente com vítima humana (mordedura/arranhadura)? ', { placeholder: 'Sim (  )   Não (  )' }),
    FF({ x: 4, y: 40, w: 92, h: 3 }, 'nome_vitima_humana', 'Nome da vítima (se houver): ', { placeholder: '________________________________' }),
    FF({ x: 4, y: 44, w: 92, h: 8 }, 'historico_clinico', 'Histórico clínico / sintomas observados: ', { inputType: 'textarea', placeholder: '__________________________________________________' }),
    FF({ x: 4, y: 53, w: 92, h: 8 }, 'conduta_adotada', 'Conduta adotada / orientações: ', { inputType: 'textarea', placeholder: '__________________________________________________' }),
    FF({ x: 4, y: 62, w: 92, h: 8 }, 'observacoes_ccz', 'Observações adicionais: ', { inputType: 'textarea', placeholder: '__________________________________________________' }),
    cityDate(76),
    ...vetSignature(79, 'Assinatura e carimbo do Médico-Veterinário'),
    ...footerPagQR(94.5),
  ], { size: 'Letter', orientation: 'portrait' })
}

// ── extracted_fields (mesma lógica do seed padrão) ──────────────────────────

const TAG_LABEL = {
  'tutor.name': 'Nome do Tutor', 'tutor.cpf': 'CPF do Tutor', 'tutor.phone': 'Telefone do Tutor',
  'tutor.address': 'Endereço do Tutor',
  'pet.name': 'Nome do Pet', 'pet.species': 'Espécie', 'pet.breed': 'Raça', 'pet.sex': 'Sexo',
  'pet.age_amd': 'Idade', 'pet.weight': 'Peso', 'pet.color': 'Pelagem', 'pet.microchip': 'Microchip',
  'consulta.date': 'Data da Consulta',
  'clinica.name': 'Nome da Clínica', 'clinica.cnpj': 'CNPJ', 'clinica.phone': 'Telefone da Clínica',
  'clinica.address': 'Endereço da Clínica', 'clinica.city_state': 'Cidade/UF',
  'vet.name': 'Nome do MV', 'vet.crmv': 'CRMV',
  'clinic.logo': 'Logo da Clínica', 'vet.signature': 'Assinatura Eletrônica do MV',
  'doc.page_of_total': 'Pág. X de Y', 'doc.printed_at': 'Impresso em',
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
        label: el.label.replace(/[:\s]+$/, '') || el.fieldKey,
        type: el.inputType === 'textarea' ? 'textarea' : 'text',
        description: 'Campo preenchido pelo MV durante o atendimento',
        required: !!el.required,
      })
    } else if (el.kind === 'dynamic_tag' || el.kind === 'dynamic_image') {
      const label = TAG_LABEL[el.tagId]
      if (label) push({ field_name: el.tagId.replace(/\./g, '_'), label, type: 'text', description: autoDesc, required: false })
    } else if (el.kind === 'composite_tag') {
      for (const part of el.parts) {
        const label = TAG_LABEL[part.tagId]
        if (label) push({ field_name: part.tagId.replace(/\./g, '_'), label, type: 'text', description: autoDesc, required: false })
      }
    }
  }
  return out
}

// ── Catálogo final ───────────────────────────────────────────────────────────

const TEMPLATES = [
  { name: 'Atestado de Saúde Animal (Animais)',                type: 'outro',          build: buildAtestadoSaudeAnimais },
  { name: 'Atestado de Óbito (Animais)',                       type: 'outro',          build: buildAtestadoObitoAnimais },
  { name: 'Termo de Encaminhamento',                           type: 'encaminhamento', build: buildTermoEncaminhamento },
  { name: 'TCLE — Anestesia para Ressonância',                 type: 'termo',          build: buildTcleAnestesiaRessonancia },
  { name: 'Termo de Entrega de Resultados de RM (2 vias)',     type: 'termo',          build: buildTermoEntregaResultadosRM },
  { name: 'Termo de Esclarecimento — Tomografia 72h (2 vias)', type: 'termo',          build: buildTermoEsclarecimentoTomo72h },
  { name: 'Autorização Anestésica — Tomografia',               type: 'termo',          build: buildAutorizacaoAnestesicaTomografia },
  { name: 'Autorização — Cirurgia e Anestesia',                type: 'termo',          build: buildAutorizacaoCirurgiaAnestesia },
  { name: 'Autorização — Liberação sem Alta Médica',           type: 'termo',          build: buildAutorizacaoLiberacaoSemAlta },
  { name: 'Laudo de Radiografia',                              type: 'laudo',          build: buildLaudoRadiografia },
  { name: 'Laudo de Tomografia',                                type: 'laudo',          build: buildLaudoTomografia },
  { name: 'Laudo CCZ',                                          type: 'outro',          build: buildLaudoCCZ },
]

// ── Execução ─────────────────────────────────────────────────────────────────

const client = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
console.log('→ Conectando ao Supabase…')
await client.connect()

try {
  const { rows: clinicRows } = await client.query(`SELECT id, name FROM clinics WHERE id = $1`, [ONLY_CLINIC])
  if (!clinicRows.length) { console.error(`FATAL: clínica ${ONLY_CLINIC} não encontrada`); process.exit(1) }
  console.log(`→ Alvo: ${clinicRows[0].name} — ${ONLY_CLINIC}`)
  console.log(`→ ${TEMPLATES.length} templates a processar:`)
  TEMPLATES.forEach(t => console.log(`    • [${t.type}] ${t.name}`))

  if (DRY) { console.log('\n(--dry) Nada foi gravado.'); process.exit(0) }

  let created = 0, updated = 0
  const ids = {}
  for (const tpl of TEMPLATES) {
    const canvasState = tpl.build()
    const extractedFields = deriveExtractedFields(canvasState)
    const { rows: existing } = await client.query(
      `SELECT id FROM document_templates WHERE clinic_id = $1 AND name = $2 AND type = $3 LIMIT 1`,
      [ONLY_CLINIC, tpl.name, tpl.type],
    )
    if (existing.length > 0) {
      await client.query(
        `UPDATE document_templates
            SET canvas_state = $1::jsonb, extracted_fields = $2::jsonb,
                engine = 'canva-native', updated_at = now()
          WHERE id = $3`,
        [JSON.stringify(canvasState), JSON.stringify(extractedFields), existing[0].id],
      )
      ids[tpl.name] = existing[0].id
      updated++
    } else {
      const { rows: [row] } = await client.query(
        `INSERT INTO document_templates (clinic_id, name, type, engine, extracted_fields, canvas_state)
         VALUES ($1, $2, $3, 'canva-native', $5::jsonb, $4::jsonb) RETURNING id`,
        [ONLY_CLINIC, tpl.name, tpl.type, JSON.stringify(canvasState), JSON.stringify(extractedFields)],
      )
      ids[tpl.name] = row.id
      created++
    }
  }

  console.log(`\n✓ Concluído: ${created} criados, ${updated} atualizados.`)
  console.log(JSON.stringify(ids, null, 2))
} catch (e) {
  console.error('✗ Erro:', e?.message ?? e)
  process.exitCode = 1
} finally {
  await client.end()
}
