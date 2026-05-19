/**
 * Catálogo de Dynamic Tags — campos do banco que o admin pode injetar
 * no canvas como elementos vivos. Em tempo de impressão, são resolvidos
 * com os dados reais do paciente/consulta/clínica.
 */

export interface DynamicTagDef {
  id: string                 // identificador estável (usado em CanvasElement.tagId)
  label: string              // PT-BR exibido na toolbar
  group: TagGroup            // agrupamento no menu
  /** Caminho de acesso no contexto resolvido em runtime.
   *  Ex: 'patient.name' → patientContext.patient.name */
  path: string
  /** Pré-formatador opcional (ex: data, peso, telefone). */
  format?: TagFormat
  /** Sugestão de valor mock para preview no editor. */
  preview?: string
}

export type TagGroup = 'tutor' | 'pet' | 'consulta' | 'clinica' | 'vet'
export type TagFormat =
  | 'date' | 'datetime' | 'time'
  | 'day_2digits' | 'month_2digits' | 'month_name_br' | 'year_4digits' | 'weekday_br'
  | 'weight_kg' | 'temperature_c'
  | 'phone_br' | 'cpf_br' | 'currency_brl'
  | 'uppercase'

export const DYNAMIC_TAGS: DynamicTagDef[] = [
  // ── Tutor ────────────────────────────────────────────────────────────────
  { id: 'tutor.name',    label: 'Nome do Tutor',       group: 'tutor',  path: 'tutor.name',          preview: 'Maria Silva' },
  { id: 'tutor.cpf',     label: 'CPF do Tutor',        group: 'tutor',  path: 'tutor.cpf',           format: 'cpf_br', preview: '123.456.789-00' },
  { id: 'tutor.phone',   label: 'Telefone do Tutor',   group: 'tutor',  path: 'tutor.phone',         format: 'phone_br', preview: '(11) 98888-7777' },
  { id: 'tutor.email',   label: 'E-mail do Tutor',     group: 'tutor',  path: 'tutor.email',         preview: 'maria@exemplo.com' },
  { id: 'tutor.address', label: 'Endereço do Tutor',   group: 'tutor',  path: 'tutor.address',       preview: 'Rua das Flores, 123' },

  // ── Pet ──────────────────────────────────────────────────────────────────
  { id: 'pet.name',      label: 'Nome do Pet',         group: 'pet',    path: 'patient.name',        preview: 'Toby' },
  { id: 'pet.species',   label: 'Espécie',             group: 'pet',    path: 'patient.species',     preview: 'Canino' },
  { id: 'pet.breed',     label: 'Raça',                group: 'pet',    path: 'patient.breed',       preview: 'Golden Retriever' },
  { id: 'pet.sex',       label: 'Sexo',                group: 'pet',    path: 'patient.sex',         preview: 'Macho' },
  { id: 'pet.age',       label: 'Idade',               group: 'pet',    path: 'patient.age',         preview: '4 anos' },
  { id: 'pet.weight',    label: 'Peso',                group: 'pet',    path: 'patient.weight',      format: 'weight_kg', preview: '28,4 kg' },
  { id: 'pet.color',     label: 'Pelagem',             group: 'pet',    path: 'patient.color',       preview: 'Dourado' },
  { id: 'pet.microchip', label: 'Microchip',           group: 'pet',    path: 'patient.microchip',   preview: '900215001234567' },

  // ── Consulta ─────────────────────────────────────────────────────────────
  { id: 'consulta.date',         label: 'Data da Consulta',    group: 'consulta', path: 'consultation.date',         format: 'date',           preview: '18/05/2026' },
  { id: 'consulta.datetime',     label: 'Data + Hora',         group: 'consulta', path: 'consultation.datetime',     format: 'datetime',       preview: '18/05/2026 14:30' },
  { id: 'consulta.time',         label: 'Hora da Consulta',    group: 'consulta', path: 'consultation.datetime',     format: 'time',           preview: '14:30' },
  { id: 'consulta.day',          label: 'Dia (DD)',            group: 'consulta', path: 'consultation.date',         format: 'day_2digits',    preview: '18' },
  { id: 'consulta.month',        label: 'Mês (MM)',            group: 'consulta', path: 'consultation.date',         format: 'month_2digits',  preview: '05' },
  { id: 'consulta.month_name',   label: 'Mês por extenso',     group: 'consulta', path: 'consultation.date',         format: 'month_name_br',  preview: 'maio' },
  { id: 'consulta.year',         label: 'Ano (AAAA)',          group: 'consulta', path: 'consultation.date',         format: 'year_4digits',   preview: '2026' },
  { id: 'consulta.weekday',      label: 'Dia da Semana',       group: 'consulta', path: 'consultation.date',         format: 'weekday_br',     preview: 'segunda-feira' },
  { id: 'consulta.diagnosis',    label: 'Diagnóstico',         group: 'consulta', path: 'consultation.diagnosis',    preview: 'Suspeita de cardiopatia' },
  { id: 'consulta.complaint',    label: 'Queixa Principal',    group: 'consulta', path: 'consultation.complaint',    preview: 'Tosse seca há 3 dias' },
  { id: 'consulta.weight',       label: 'Peso na Consulta',    group: 'consulta', path: 'consultation.weight',       format: 'weight_kg',      preview: '28,4 kg' },
  { id: 'consulta.temperature',  label: 'Temperatura',         group: 'consulta', path: 'consultation.temperature',  format: 'temperature_c',  preview: '38,5 °C' },
  { id: 'consulta.visit_reason', label: 'Motivo da Visita',    group: 'consulta', path: 'consultation.visit_reason_label', preview: 'Consulta de rotina' },

  // ── Clínica ──────────────────────────────────────────────────────────────
  { id: 'clinica.name',          label: 'Nome',               group: 'clinica', path: 'clinic.name',                              preview: 'AlmaVet' },
  { id: 'clinica.cnpj',          label: 'CNPJ',               group: 'clinica', path: 'clinic.cnpj',                              preview: '12.345.678/0001-90' },
  { id: 'clinica.phone',         label: 'Telefone',           group: 'clinica', path: 'clinic.phone',         format: 'phone_br', preview: '(11) 3333-4444' },
  { id: 'clinica.address',       label: 'Endereço Completo',  group: 'clinica', path: 'clinic.address',                           preview: 'Av. Paulista, 1000 — São Paulo/SP' },
  { id: 'clinica.city',          label: 'Cidade',             group: 'clinica', path: 'clinic.city',                              preview: 'São Paulo' },
  { id: 'clinica.state',         label: 'UF (Estado)',        group: 'clinica', path: 'clinic.state',         format: 'uppercase', preview: 'SP' },
  { id: 'clinica.city_state',    label: 'Cidade / UF',        group: 'clinica', path: 'clinic.city_state',                        preview: 'São Paulo/SP' },
  { id: 'clinica.business_type', label: 'Tipo de Negócio',    group: 'clinica', path: 'clinic.business_type_label',               preview: 'Clínica Veterinária' },
  { id: 'clinica.business_hours',label: 'Horário de Funcionamento', group: 'clinica', path: 'clinic.business_hours_label',         preview: 'Seg–Sex 08:00–18:00 · Sáb 08:00–12:00' },
  { id: 'clinica.razao_social',  label: 'Razão Social',       group: 'clinica', path: 'clinic.razao_social',                      preview: 'AlmaVet Veterinária Ltda' },

  // ── Médico Veterinário / Usuário ─────────────────────────────────────────
  { id: 'vet.name',       label: 'Nome do MV',         group: 'vet', path: 'vet.full_name',     preview: 'Dra. Laís Silva' },
  { id: 'vet.nickname',   label: 'Apelido',            group: 'vet', path: 'vet.nickname',      preview: 'Dra. Laís' },
  { id: 'vet.role',       label: 'Cargo',              group: 'vet', path: 'vet.role_label',    preview: 'Médica Veterinária' },
  { id: 'vet.crmv',       label: 'CRMV',               group: 'vet', path: 'vet.crmv',          preview: 'CRMV-SP 12345' },
  { id: 'vet.specialty',  label: 'Especialidade',      group: 'vet', path: 'vet.specialty',     preview: 'Cardiologia' },
  { id: 'vet.phone',      label: 'Telefone',           group: 'vet', path: 'vet.phone',         format: 'phone_br', preview: '(11) 97777-6666' },
  { id: 'vet.mapa_code',  label: 'Código MAPA',        group: 'vet', path: 'vet.mapa_code',     preview: 'SP-12345' },
  { id: 'vet.username',   label: 'Usuário (login)',    group: 'vet', path: 'vet.username',      preview: 'lais.silva' },
]

export const TAG_GROUP_LABEL: Record<TagGroup | ImageTagGroup, string> = {
  tutor:    'Tutor',
  pet:      'Pet',
  consulta: 'Consulta',
  clinica:  'Clínica',
  vet:      'Médico Veterinário',
}

export function tagsByGroup(): Array<{ group: TagGroup; label: string; tags: DynamicTagDef[] }> {
  const groups: TagGroup[] = ['pet', 'tutor', 'consulta', 'vet', 'clinica']
  return groups.map(g => ({
    group: g,
    label: TAG_GROUP_LABEL[g],
    tags: DYNAMIC_TAGS.filter(t => t.group === g),
  }))
}

export function findTag(id: string): DynamicTagDef | undefined {
  return DYNAMIC_TAGS.find(t => t.id === id)
}

// ── Dynamic IMAGES (logo, foto, assinatura) ──────────────────────────────────

export type ImageTagGroup = TagGroup

export interface DynamicImageTagDef {
  id: string
  label: string
  group: ImageTagGroup
  /** Caminho que resolve para uma URL absoluta no contexto. */
  path: string
  /** Preview no editor quando context é mock. */
  previewUrl?: string
}

export const DYNAMIC_IMAGE_TAGS: DynamicImageTagDef[] = [
  { id: 'clinic.logo',      label: 'Logo da Clínica',           group: 'clinica', path: 'clinic.logo_url' },
  { id: 'vet.photo',        label: 'Foto do MV (avatar)',       group: 'vet',     path: 'vet.photo_url' },
  { id: 'vet.signature',    label: 'Assinatura Eletrônica',     group: 'vet',     path: 'vet.electronic_signature_url' },
]

export function findImageTag(id: string): DynamicImageTagDef | undefined {
  return DYNAMIC_IMAGE_TAGS.find(t => t.id === id)
}

export function imageTagsByGroup(): Array<{ group: ImageTagGroup; label: string; tags: DynamicImageTagDef[] }> {
  const groups: ImageTagGroup[] = ['clinica', 'vet']
  return groups.map(g => ({
    group: g,
    label: TAG_GROUP_LABEL[g],
    tags: DYNAMIC_IMAGE_TAGS.filter(t => t.group === g),
  }))
}

export function resolveImageTagUrl(tagId: string, ctx: ResolveContext): string | null {
  const def = findImageTag(tagId)
  if (!def) return null
  const v = getPath(ctx, def.path)
  if (typeof v === 'string' && v.trim()) return v
  return null
}

// ── Resolução em runtime ─────────────────────────────────────────────────────

export interface ResolveContext {
  tutor?:   Record<string, unknown>
  patient?: Record<string, unknown>
  consultation?: Record<string, unknown>
  clinic?:  Record<string, unknown>
  vet?:     Record<string, unknown>
}

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

export function resolveTagValue(tagId: string, ctx: ResolveContext): string {
  const def = findTag(tagId)
  if (!def) return ''

  const raw = getPath(ctx, def.path)
  if (raw === null || raw === undefined || raw === '') return ''

  switch (def.format) {
    case 'date':           return formatDateBR(raw)
    case 'datetime':       return formatDateTimeBR(raw)
    case 'time':           return formatTimeBR(raw)
    case 'day_2digits':    return formatDayBR(raw)
    case 'month_2digits':  return formatMonth2digits(raw)
    case 'month_name_br':  return formatMonthName(raw)
    case 'year_4digits':   return formatYear(raw)
    case 'weekday_br':     return formatWeekday(raw)
    case 'weight_kg':      return formatWeightKg(raw)
    case 'temperature_c':  return formatTemperatureC(raw)
    case 'phone_br':       return formatPhoneBR(String(raw))
    case 'cpf_br':         return formatCpfBR(String(raw))
    case 'currency_brl':   return formatBRL(raw)
    case 'uppercase':      return String(raw).toUpperCase()
    default:               return String(raw)
  }
}

function toDate(raw: unknown): Date | null {
  const d = raw instanceof Date ? raw : new Date(String(raw))
  return Number.isNaN(d.getTime()) ? null : d
}

function formatTimeBR(raw: unknown): string {
  const d = toDate(raw); if (!d) return ''
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
function formatDayBR(raw: unknown): string {
  const d = toDate(raw); if (!d) return ''
  return String(d.getDate()).padStart(2, '0')
}
function formatMonth2digits(raw: unknown): string {
  const d = toDate(raw); if (!d) return ''
  return String(d.getMonth() + 1).padStart(2, '0')
}
const MONTHS_BR = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]
function formatMonthName(raw: unknown): string {
  const d = toDate(raw); if (!d) return ''
  return MONTHS_BR[d.getMonth()]
}
function formatYear(raw: unknown): string {
  const d = toDate(raw); if (!d) return ''
  return String(d.getFullYear())
}
function formatWeekday(raw: unknown): string {
  const d = toDate(raw); if (!d) return ''
  return d.toLocaleDateString('pt-BR', { weekday: 'long' })
}
function formatTemperatureC(raw: unknown): string {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw))
  if (Number.isNaN(n)) return ''
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C`
}

function formatDateBR(raw: unknown): string {
  const d = raw instanceof Date ? raw : new Date(String(raw))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR')
}

function formatDateTimeBR(raw: unknown): string {
  const d = raw instanceof Date ? raw : new Date(String(raw))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function formatWeightKg(raw: unknown): string {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw))
  if (Number.isNaN(n)) return ''
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} kg`
}

function formatPhoneBR(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return raw
}

function formatCpfBR(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.length !== 11) return raw
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function formatBRL(raw: unknown): string {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw))
  if (Number.isNaN(n)) return ''
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
