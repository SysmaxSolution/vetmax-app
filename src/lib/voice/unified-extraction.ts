// Schema e normalização da extração unificada de voz clínica (multi-domínio).
// Módulo PURO (sem 'use server') — usado pela server action em ai_extraction.ts
// e testável isoladamente. Um único ditado é roteado para as abas da Internação
// (Sinais Vitais, Fluidoterapia, Dados Clínicos, Tarefas, Medicações) ou da
// Cirurgia (Ficha Anestésica, Checklist, Relatório).

export type VoiceContext = 'hospitalization' | 'surgery'

export interface VoiceVitals {
  temperature:    number | null
  heart_rate:     number | null
  resp_rate:      number | null
  weight:         number | null
  blood_pressure: string | null
  glucose:        number | null
  spo2:           number | null
  mucosa:         string | null
  tpc_seconds:    number | null
  hydration_pct:  number | null
  pain_score:     number | null
}
export interface VoiceFluid {
  direction: 'in' | 'out'
  kind:      'fluid' | 'urine' | 'emesis' | 'bleeding' | 'other'
  volume_ml: number
  notes:     string | null
}
export interface VoiceClinicalData {
  diet_notes:          string | null
  fasting:             boolean | null
  isolation_required:  boolean | null
  estimated_discharge: string | null
}
export interface VoiceTask {
  kind:            'exam' | 'procedure' | 'feeding' | 'other'
  description:     string
  frequency_hours: number | null
}
export interface VoiceMedication {
  name:            string
  dose:            string | null
  route:           string | null
  frequency_hours: number | null
  duration_hours:  number | null
  notes:           string | null
  /** Marcado quando faltam dose/via/frequência — exige revisão manual. */
  needs_review:    boolean
  /** Marcado quando uma medicação anterior do draft já tem o mesmo princípio
   *  ativo + dose normalizada (heurística de duplicação por re-ditado). */
  is_duplicate_suggestion?: boolean
}
export interface VoiceChecklist {
  fasting_confirmed: boolean | null
  preop_exams_ok:    boolean | null
  consent_signed:    boolean | null
}
export interface UnifiedVoiceExtraction {
  notes:             string
  improvement_level: 'melhorou' | 'estavel' | 'piorou' | null
  vitals:            VoiceVitals | null
  fluids:            VoiceFluid[]
  clinical_data:     VoiceClinicalData | null
  tasks:             VoiceTask[]
  medications:       VoiceMedication[]
  checklist:         VoiceChecklist | null
}

// ─── Normalizadores (defensivos contra saída irregular da IA) ────────────────

const _num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/[^\d.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}
const _str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}
const _bool = (v: unknown): boolean | null => {
  if (v === true || v === false) return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (['true', 'sim', 'confirmado', 'ok'].includes(s)) return true
    if (['false', 'não', 'nao', 'pendente'].includes(s)) return false
  }
  return null
}
const FLUID_KINDS = ['fluid', 'urine', 'emesis', 'bleeding', 'other'] as const
const TASK_KINDS = ['exam', 'procedure', 'feeding', 'other'] as const
const FREQ_ALLOWED = [4, 6, 8, 12, 24] as const

function _freq(v: unknown): number | null {
  const n = _num(v)
  if (n === null || n <= 0) return null
  // Aproxima para a cadência permitida mais próxima (dropdown 4/6/8/12/24).
  return FREQ_ALLOWED.reduce<number>((best, f) => Math.abs(f - n) < Math.abs(best - n) ? f : best, FREQ_ALLOWED[0])
}

/** Normaliza o JSON cru da IA no schema estrito, descartando ruído. */
export function normalizeUnifiedExtraction(raw: any): UnifiedVoiceExtraction {
  const r = raw ?? {}
  const vitalsRaw = r.vitals ?? null
  const hasVital = vitalsRaw && Object.values(vitalsRaw).some(v => v !== null && v !== undefined && v !== '')
  const vitals: VoiceVitals | null = hasVital ? {
    temperature: _num(vitalsRaw.temperature), heart_rate: _num(vitalsRaw.heart_rate),
    resp_rate: _num(vitalsRaw.resp_rate), weight: _num(vitalsRaw.weight),
    blood_pressure: _str(vitalsRaw.blood_pressure), glucose: _num(vitalsRaw.glucose),
    spo2: _num(vitalsRaw.spo2), mucosa: _str(vitalsRaw.mucosa),
    tpc_seconds: _num(vitalsRaw.tpc_seconds), hydration_pct: _num(vitalsRaw.hydration_pct),
    pain_score: _num(vitalsRaw.pain_score),
  } : null

  const fluids: VoiceFluid[] = Array.isArray(r.fluids) ? r.fluids.flatMap((f: any): VoiceFluid[] => {
    const vol = _num(f?.volume_ml)
    if (vol === null || vol <= 0) return []
    const kind = (FLUID_KINDS as readonly string[]).includes(f?.kind) ? f.kind : 'other'
    const direction = f?.direction === 'in' ? 'in' : f?.direction === 'out' ? 'out' : (kind === 'fluid' ? 'in' : 'out')
    return [{ direction, kind, volume_ml: vol, notes: _str(f?.notes) }]
  }) : []

  const cdRaw = r.clinical_data ?? null
  const hasCd = cdRaw && Object.values(cdRaw).some(v => v !== null && v !== undefined && v !== '')
  const clinical_data: VoiceClinicalData | null = hasCd ? {
    diet_notes: _str(cdRaw.diet_notes), fasting: _bool(cdRaw.fasting),
    isolation_required: _bool(cdRaw.isolation_required), estimated_discharge: _str(cdRaw.estimated_discharge),
  } : null

  const tasks: VoiceTask[] = Array.isArray(r.tasks) ? r.tasks.flatMap((t: any): VoiceTask[] => {
    const description = _str(t?.description)
    if (!description) return []
    const kind = (TASK_KINDS as readonly string[]).includes(t?.kind) ? t.kind : 'other'
    return [{ kind, description, frequency_hours: _freq(t?.frequency_hours) }]
  }) : []

  const medications: VoiceMedication[] = Array.isArray(r.medications) ? r.medications.flatMap((m: any): VoiceMedication[] => {
    const name = _str(m?.name)
    if (!name) return []
    const dose = _str(m?.dose), route = _str(m?.route), frequency_hours = _freq(m?.frequency_hours)
    return [{
      name, dose, route, frequency_hours, duration_hours: _num(m?.duration_hours),
      notes: _str(m?.notes), needs_review: !dose || !route || frequency_hours === null,
    }]
  }) : []

  const clRaw = r.checklist ?? null
  const hasCl = clRaw && Object.values(clRaw).some(v => v !== null && v !== undefined && v !== '')
  const checklist: VoiceChecklist | null = hasCl ? {
    fasting_confirmed: _bool(clRaw.fasting_confirmed), preop_exams_ok: _bool(clRaw.preop_exams_ok),
    consent_signed: _bool(clRaw.consent_signed),
  } : null

  const lvl = _str(r.improvement_level)
  const improvement_level = (lvl === 'melhorou' || lvl === 'estavel' || lvl === 'piorou') ? lvl : null

  return { notes: _str(r.notes) ?? '', improvement_level, vitals, fluids, clinical_data, tasks, medications, checklist }
}

// Heurística de duplicação de medicação entre gravações sucessivas.
//
//  - Nome: minúsculas, sem acentos, sem concentração inline (250mg / 1 ml / 0,5g
//    no final do nome quando dose explícita está separada). Compara o "núcleo"
//    do princípio ativo.
//  - Dose: minúsculas, sem espaços, sem unidade quando os dígitos coincidem.
//    Ex.: "250 mg" ≡ "250mg".
const _stripAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
export function normalizeMedName(name: string | null | undefined): string {
  if (!name) return ''
  let s = _stripAccents(name).toLowerCase().trim()
  // Tira concentração inline trailing (ex.: "amoxicilina 250mg" → "amoxicilina")
  s = s.replace(/\s*\d+(?:[.,]\d+)?\s*(?:mg|ml|g|mcg|ui)\b\s*$/i, '')
  // Compacta espaços e símbolos.
  return s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}
export function normalizeDose(dose: string | null | undefined): string {
  if (!dose) return ''
  return _stripAccents(dose).toLowerCase().replace(/\s+/g, '').replace(',', '.')
}
function isLikelyDuplicateMed(a: VoiceMedication, b: VoiceMedication): boolean {
  const nA = normalizeMedName(a.name), nB = normalizeMedName(b.name)
  if (!nA || !nB) return false
  if (nA !== nB) return false
  // Se nenhum dos dois tem dose: mesmo nome já basta para marcar como possível duplicata.
  if (!a.dose && !b.dose) return true
  // Se ambos têm dose: comparar dose normalizada.
  return normalizeDose(a.dose) === normalizeDose(b.dose)
}

// Merge por campo: escalar/objeto vazio recebe o novo valor; campo já preenchido
// é mantido (nunca sobrescreve). Listas SOMAM (append). Garante o requisito de
// múltiplas gravações cumulativas que nunca apagam o que já foi ditado.
const _mergeScalar = <T>(cur: T | null, inc: T | null): T | null => (cur === null || cur === undefined ? (inc ?? null) : cur)

function _mergeObj<T extends Record<string, any>>(cur: T | null, inc: T | null): T | null {
  if (!cur) return inc
  if (!inc) return cur
  const out = { ...cur } as Record<string, any>
  for (const k of Object.keys(inc)) out[k] = _mergeScalar(cur[k] ?? null, inc[k] ?? null)
  return out as T
}

/** Acumula duas extrações (gravações sucessivas) sem perder dados anteriores. */
export function mergeExtractions(a: UnifiedVoiceExtraction, b: UnifiedVoiceExtraction): UnifiedVoiceExtraction {
  // Marca cada medicação NOVA (de b) como possível duplicata se já existe em a.
  const medsB = b.medications.map(m => {
    const dup = a.medications.some(existing => isLikelyDuplicateMed(existing, m))
    return dup ? { ...m, is_duplicate_suggestion: true } : m
  })
  return {
    notes: [a.notes, b.notes].filter(s => s && s.trim()).join('\n').trim(),
    improvement_level: a.improvement_level ?? b.improvement_level,
    vitals: _mergeObj(a.vitals, b.vitals),
    fluids: [...a.fluids, ...b.fluids],
    clinical_data: _mergeObj(a.clinical_data, b.clinical_data),
    tasks: [...a.tasks, ...b.tasks],
    medications: [...a.medications, ...medsB],
    checklist: _mergeObj(a.checklist, b.checklist),
  }
}

export const EMPTY_EXTRACTION: UnifiedVoiceExtraction = {
  notes: '', improvement_level: null, vitals: null, fluids: [],
  clinical_data: null, tasks: [], medications: [], checklist: null,
}

/** Conta itens capturados por aba — para o resumo "Identifiquei: ...". */
export function summarizeExtraction(x: UnifiedVoiceExtraction): { label: string; count: number }[] {
  const out: { label: string; count: number }[] = []
  if (x.vitals) out.push({ label: 'sinais vitais', count: 1 })
  if (x.fluids.length) out.push({ label: 'fluido(s)', count: x.fluids.length })
  if (x.clinical_data) out.push({ label: 'dados clínicos', count: 1 })
  if (x.tasks.length) out.push({ label: 'tarefa(s)', count: x.tasks.length })
  if (x.medications.length) out.push({ label: 'medicação(ões)', count: x.medications.length })
  if (x.checklist) out.push({ label: 'checklist', count: 1 })
  return out
}

export function buildUnifiedPrompt(transcript: string, context: VoiceContext): string {
  const domains = context === 'surgery'
    ? `- "vitals": aferição transoperatória (temperature °C, heart_rate bpm, resp_rate mpm, spo2 %, blood_pressure "120/80"). null se não mencionar.
- "checklist": { "fasting_confirmed", "preop_exams_ok", "consent_signed" } como booleano (true/false/null) conforme o cirurgião confirmar.
- "notes": texto do RELATÓRIO CIRÚRGICO (técnica, achados, intercorrências).
- "medications": [] (não usado em cirurgia). "fluids": []. "tasks": []. "clinical_data": null.`
    : `- "vitals": sinais vitais (temperature °C, heart_rate bpm, resp_rate mpm, weight kg, blood_pressure "120/80", glucose mg/dL, spo2 %, mucosa, tpc_seconds, hydration_pct %, pain_score 0-10). null se não mencionar.
- "fluids": movimentações hídricas, cada uma { "direction": "in"|"out", "kind": "fluid"|"urine"|"emesis"|"bleeding"|"other", "volume_ml": número, "notes": string|null }. Entradas (soro/fluidoterapia) = "in"; saídas (urina/êmese/sangramento) = "out".
- "clinical_data": { "diet_notes", "fasting" (bool), "isolation_required" (bool), "estimated_discharge" (texto/data) }. null se nada disso for dito.
- "tasks": tarefas de enfermagem agendadas, cada uma { "kind": "exam"|"procedure"|"feeding"|"other", "description": string, "frequency_hours": 4|6|8|12|24|null }. "única" → null.
- "medications": cada uma { "name", "dose", "route", "frequency_hours": 4|6|8|12|24|null, "duration_hours": número|null, "notes" }.
- "notes": resumo clínico livre da evolução. "improvement_level": "melhorou"|"estavel"|"piorou" pelo tom do relato.`

  return `Você é um assistente clínico veterinário (CFMV). Estruture o ditado do plantonista em JSON estrito.
Transcrição: "${transcript}"

Extraia SOMENTE o que foi efetivamente dito (não invente valores). Campos não mencionados = null ou lista vazia.
${domains}

Retorne SOMENTE o JSON com as chaves: notes, improvement_level, vitals, fluids, clinical_data, tasks, medications, checklist.
Sem markdown, sem comentários.`
}
