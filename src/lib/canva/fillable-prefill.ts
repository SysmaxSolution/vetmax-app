/**
 * Cadeia de auto-preenchimento de FillableFieldElement.
 *
 * Quando o vet abre o editor de um laudo Canvas Visual, cada campo
 * preenchível é resolvido nesta ordem (primeiro hit vence):
 *
 *   1. TAG canônica — label do campo bate com um sinônimo conhecido
 *      (ex: "Peso atual" → patient.weight, "CRMV" → vet.crmv).
 *      Lê direto do ResolveContext já carregado.
 *
 *   2. CADASTRO do pet — campos clínicos persistidos no pet
 *      (alergias, doenças crônicas, cirurgias anteriores) detectados
 *      por palavra-chave no label.
 *
 *   3. HISTÓRICO — último patient_document do mesmo pet que já tenha
 *      preenchido o mesmo `fieldKey`. Permite que "tamanho_aorta" seja
 *      carregado da última eco do paciente, por exemplo.
 *
 *   4. VOZ + IA — campos que sobraram são despachados em UMA chamada
 *      ao Claude com o `consultations.audio_transcript` + lista de
 *      labels. A IA extrai o que o MV ditou. Único custo de token.
 *
 * Cada valor preenchido recebe um `source` para que a UI possa
 * sinalizar a origem (badge "Banco" / "Histórico" / "Voz").
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import type { FillableFieldElement } from './elements'
import type { ResolveContext } from './dynamic-tags'

export type FillableSource = 'tag' | 'patient' | 'history' | 'voice' | 'default'

export interface PrefillResult {
  values: Record<string, string>
  sources: Record<string, FillableSource>
  filled_keys: string[]
  unfilled_keys: string[]
}

// ── Camada 1: sinônimos de label → caminho no ResolveContext ────────────────
//
// Usa substring match em label normalizado (lowercase, sem acentos).
// Primeira regex que casa vence — ordene do mais específico ao mais genérico.

interface LabelRule {
  /** Regex aplicada ao label normalizado (sem acento, lowercase). */
  match: RegExp
  /** Função que extrai o valor do ResolveContext. */
  resolve: (ctx: ResolveContext) => string | null
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[:*]+$/g, '')
    .trim()
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

const LABEL_RULES: LabelRule[] = [
  // ── Pet ─────────────────────────────────────────────────────────────────
  { match: /\b(nome do pet|nome do animal|paciente|animal|pet)\b/, resolve: c => asString((c.patient as any)?.name) },
  { match: /\b(especie)\b/,            resolve: c => asString((c.patient as any)?.species) },
  { match: /\b(raca)\b/,               resolve: c => asString((c.patient as any)?.breed) },
  { match: /\b(sexo|genero)\b/,        resolve: c => asString((c.patient as any)?.sex) },
  { match: /\b(idade)\b/,              resolve: c => asString((c.patient as any)?.age) },
  { match: /\b(pelagem|cor|pelo)\b/,   resolve: c => asString((c.patient as any)?.color) },
  { match: /\b(microchip|chip)\b/,     resolve: c => asString((c.patient as any)?.microchip) },
  // Peso na consulta (mais específico) tem preferência sobre peso do cadastro.
  { match: /\b(peso)\b/,               resolve: c => {
    const w = (c.consultation as any)?.weight ?? (c.patient as any)?.weight
    if (w === null || w === undefined || w === '') return null
    return String(w)
  }},

  // ── Tutor ────────────────────────────────────────────────────────────────
  { match: /\b(nome do tutor|tutor|proprietario|responsavel|dono)\b/, resolve: c => asString((c.tutor as any)?.name) },
  { match: /\b(cpf)\b/,                resolve: c => asString((c.tutor as any)?.cpf) },
  { match: /\b(telefone|celular|fone|tel)\b/, resolve: c => asString((c.tutor as any)?.phone) },
  { match: /\b(e[\s-]?mail|email)\b/,  resolve: c => asString((c.tutor as any)?.email) },
  { match: /\b(endereco|logradouro)\b/, resolve: c => asString((c.tutor as any)?.address) },

  // ── Consulta ─────────────────────────────────────────────────────────────
  { match: /\b(temperatura|temp\.?\s*retal)\b/, resolve: c => {
    const t = (c.consultation as any)?.temperature
    return t === null || t === undefined ? null : String(t)
  }},
  { match: /\b(diagnostico|dx)\b/,     resolve: c => asString((c.consultation as any)?.diagnosis) },
  { match: /\b(queixa|motivo da visita|motivo|anamnese principal)\b/, resolve: c => asString((c.consultation as any)?.complaint) },
  { match: /\b(data da consulta|data do atendimento|data)\b/, resolve: c => {
    const d = (c.consultation as any)?.date
    if (!d) return null
    const dt = new Date(d)
    return Number.isNaN(dt.getTime()) ? null : dt.toLocaleDateString('pt-BR')
  }},

  // ── Veterinário ──────────────────────────────────────────────────────────
  { match: /\b(crmv)\b/,               resolve: c => asString((c.vet as any)?.crmv) },
  { match: /\b(nome do (vet|mv|veterinario|medico)|veterinario|medico\b)/, resolve: c => asString((c.vet as any)?.full_name) },
  { match: /\b(especialidade)\b/,      resolve: c => asString((c.vet as any)?.specialty) },

  // ── Clínica ──────────────────────────────────────────────────────────────
  { match: /\b(cnpj)\b/,               resolve: c => asString((c.clinic as any)?.cnpj) },
  { match: /\b(clinica|nome da clinica)\b/, resolve: c => asString((c.clinic as any)?.name) },
  { match: /\b(cep)\b/,                resolve: c => asString((c.clinic as any)?.cep) },
  { match: /\b(cidade)\b/,             resolve: c => asString((c.clinic as any)?.city) },
  { match: /\b(uf|estado)\b/,          resolve: c => asString((c.clinic as any)?.state) },
]

function resolveFromCanonicalTag(
  field: FillableFieldElement,
  ctx: ResolveContext,
): string | null {
  const norm = normalize(field.label || field.fieldKey)
  for (const rule of LABEL_RULES) {
    if (rule.match.test(norm)) {
      const v = rule.resolve(ctx)
      if (v) return v
    }
  }
  return null
}

// ── Camada 2: cadastro do pet (campos clínicos persistidos) ─────────────────

interface PatientRecord {
  allergies?: string | null
  chronic_diseases?: string | null
  past_surgeries?: string | null
  neutered?: boolean | null
}

function resolveFromPatientRecord(
  field: FillableFieldElement,
  patient: PatientRecord | null,
): string | null {
  if (!patient) return null
  const norm = normalize(field.label || field.fieldKey)
  if (/\b(alergias?|alergia)\b/.test(norm))           return asString(patient.allergies)
  if (/\b(doencas? cronicas?|cronica)\b/.test(norm))  return asString(patient.chronic_diseases)
  if (/\b(cirurgias? anteriores?|cirurgia previa)\b/.test(norm)) return asString(patient.past_surgeries)
  if (/\b(castrado|castracao|esterilizado)\b/.test(norm) && patient.neutered !== null && patient.neutered !== undefined) {
    return patient.neutered ? 'Sim' : 'Não'
  }
  return null
}

// ── Camada 3: histórico de fillable_fields em laudos anteriores ─────────────

async function loadHistoryByFieldKey(
  supabase: SupabaseClient,
  patientId: string,
  fieldKeys: string[],
): Promise<Record<string, string>> {
  if (fieldKeys.length === 0) return {}
  // Pega os 25 documentos mais recentes do pet; varre em ordem reversa
  // até encontrar valor para cada fieldKey solicitado.
  const { data } = await supabase
    .from('patient_documents')
    .select('content_json, created_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(25)

  const result: Record<string, string> = {}
  const pending = new Set(fieldKeys)
  for (const doc of data ?? []) {
    if (pending.size === 0) break
    const cj = doc.content_json as { fillable_fields?: Record<string, unknown> } | null
    const ff = cj?.fillable_fields
    if (!ff || typeof ff !== 'object') continue
    for (const key of Array.from(pending)) {
      const raw = ff[key]
      if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
        result[key] = String(raw)
        pending.delete(key)
      }
    }
  }
  return result
}

// ── Camada 4: extração via voz com IA ───────────────────────────────────────

async function resolveFromVoice(
  transcript: string,
  fields: FillableFieldElement[],
): Promise<Record<string, string>> {
  if (!transcript || transcript.trim().length < 5) return {}
  if (fields.length === 0) return {}
  if (!process.env.ANTHROPIC_API_KEY) return {}

  const fieldsDesc = fields
    .map(f => {
      const type = f.inputType ?? 'text'
      const label = (f.label || f.fieldKey).replace(/:\s*$/, '').trim()
      const hint = f.placeholder ? ` (formato: ${f.placeholder})` : ''
      return `- "${f.fieldKey}" (${type}): ${label}${hint}`
    })
    .join('\n')

  const prompt = `Você é um assistente de documentação clínica veterinária. Extraia da transcrição de voz do MV os valores correspondentes aos campos listados abaixo.

TRANSCRIÇÃO DE VOZ DO MÉDICO VETERINÁRIO:
"""
${transcript}
"""

CAMPOS A EXTRAIR (use exatamente o fieldKey como chave do JSON):
${fieldsDesc}

REGRAS:
1. Retorne APENAS um objeto JSON válido (sem markdown, sem texto extra).
2. Use o fieldKey exato como chave.
3. Para "number", devolva número sem unidade.
4. Para "date", devolva DD/MM/AAAA.
5. Se a transcrição NÃO menciona o campo, OMITA o campo do JSON (não use null, não invente).
6. Use linguagem clínica formal em PT-BR.
7. Hoje é ${new Date().toLocaleDateString('pt-BR')}.

JSON:`

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return {}
    const parsed = JSON.parse(match[0]) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const f of fields) {
      const raw = parsed[f.fieldKey]
      if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
        out[f.fieldKey] = String(raw)
      }
    }
    return out
  } catch (e) {
    console.error('[fillable-prefill] voice extraction failed:', e)
    return {}
  }
}

// ── Orquestrador ────────────────────────────────────────────────────────────

export interface PrefillInput {
  supabase:        SupabaseClient
  resolveContext:  ResolveContext
  patientId:       string
  consultationId:  string
  clinicId:        string
  fillableDefs:    FillableFieldElement[]
}

export async function prefillFillableFields(input: PrefillInput): Promise<PrefillResult> {
  const { supabase, resolveContext, patientId, consultationId, clinicId, fillableDefs } = input

  const values: Record<string, string> = {}
  const sources: Record<string, FillableSource> = {}

  if (fillableDefs.length === 0) {
    return { values, sources, filled_keys: [], unfilled_keys: [] }
  }

  // Pré-carrega o cadastro do pet e a transcrição da consulta em paralelo
  // (são as duas fontes externas ao resolveContext já recebido).
  const [{ data: patient }, { data: consultation }] = await Promise.all([
    supabase
      .from('patients')
      .select('allergies, chronic_diseases, past_surgeries, neutered')
      .eq('id', patientId)
      .eq('clinic_id', clinicId)
      .single(),
    supabase
      .from('consultations')
      .select('audio_transcript, vet_notes')
      .eq('id', consultationId)
      .eq('clinic_id', clinicId)
      .single(),
  ])

  // Camadas 1 + 2: resolução determinística rápida
  const remainingAfterDeterministic: FillableFieldElement[] = []
  for (const f of fillableDefs) {
    const tag = resolveFromCanonicalTag(f, resolveContext)
    if (tag) {
      values[f.fieldKey] = tag
      sources[f.fieldKey] = 'tag'
      continue
    }
    const fromRecord = resolveFromPatientRecord(f, patient as PatientRecord | null)
    if (fromRecord) {
      values[f.fieldKey] = fromRecord
      sources[f.fieldKey] = 'patient'
      continue
    }
    if (f.defaultValue) {
      values[f.fieldKey] = f.defaultValue
      sources[f.fieldKey] = 'default'
      continue
    }
    remainingAfterDeterministic.push(f)
  }

  // Camada 3: histórico (uma query em batch para todos os fieldKeys que sobraram)
  if (remainingAfterDeterministic.length > 0) {
    const history = await loadHistoryByFieldKey(
      supabase,
      patientId,
      remainingAfterDeterministic.map(f => f.fieldKey),
    )
    for (const f of remainingAfterDeterministic) {
      const v = history[f.fieldKey]
      if (v) {
        values[f.fieldKey] = v
        sources[f.fieldKey] = 'history'
      }
    }
  }

  // Camada 4: voz (apenas para os que ainda restam)
  const stillUnfilled = remainingAfterDeterministic.filter(f => !values[f.fieldKey])
  const transcript = (consultation?.audio_transcript ?? '') + '\n' + (consultation?.vet_notes ?? '')
  if (stillUnfilled.length > 0 && transcript.trim().length >= 5) {
    const fromVoice = await resolveFromVoice(transcript, stillUnfilled)
    for (const [k, v] of Object.entries(fromVoice)) {
      values[k] = v
      sources[k] = 'voice'
    }
  }

  const filled_keys = Object.keys(values)
  const unfilled_keys = fillableDefs
    .map(f => f.fieldKey)
    .filter(k => !values[k])

  return { values, sources, filled_keys, unfilled_keys }
}
