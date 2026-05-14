/**
 * LEI 1 — A Trava de IA (Whitelist Estrita).
 *
 * Fluxo refatorado em DUAS passagens:
 *
 *   1. PRE-MATCH LOCAL (deterministico, gratuito)
 *      Para cada label, tenta `matchCanonicalLocal`. Se um sinonimo da
 *      whitelist bate, resolve imediatamente — Claude nao e chamado.
 *
 *   2. CLAUDE COMO ULTIMA INSTANCIA
 *      Labels que NAO bateram localmente sao enviados para Claude com
 *      uma instrucao agressiva: VOCE SABE que estes labels NAO estao na
 *      whitelist (porque ja foi tentado). DEVE retornar custom_* com
 *      is_custom: true e valor canonico VAZIO.
 *
 * Defesa em profundidade — apos a resposta do Claude:
 *   - Se field_name e um canonico (esta na whitelist) MAS o label original
 *     NAO e sinonimo legitimo, FORCAMOS conversao para custom_*.
 *   - Bloqueio absoluto contra alucinacao "Mitral → raca".
 */

import { Anthropic } from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { FieldType } from '@/types'
import {
  CANONICAL_WHITELIST,
  matchCanonicalLocal,
  isCanonical,
  isLegitCanonicalAssignment,
  buildCustomFieldName,
  guessCustomType,
} from '@/lib/pdf/canonical-whitelist'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface MatchRequest {
  labels: string[]
  doc_type: 'laudo' | 'receita' | 'encaminhamento' | 'termo' | 'exame' | 'outro'
  doc_name?: string
}

export interface FieldMatch {
  label_original: string
  field_name: string
  type: FieldType
  description: string
  required: boolean
  is_system_field?: boolean
  is_custom?: boolean
}

interface MatchResponse {
  matches: FieldMatch[]
  stats: {
    input_labels: number
    matched_local: number
    matched_ai: number
    forced_custom: number
  }
}

// ── Prompt minimalista para a sobra que nao bateu localmente ────────────

const SYSTEM_PROMPT = `Voce e um classificador determinístico de rotulos de documentos veterinarios.

CONTEXTO: O sistema chamador JA tentou casar os rotulos com a WHITELIST DE CAMPOS CANONICOS abaixo e FALHOU. Os rotulos que voce esta recebendo NAO sao sinonimos exatos de NENHUM campo canonico.

REGRA INQUEBRAVEL — TRAVA DE IA:

Voce esta PROIBIDO de mapear qualquer rotulo recebido para um campo canonico. Voce E OBRIGADO a retornar TODOS os rotulos como custom_*.

Para cada rotulo, devolva:
{
  "label_original": "<copia exata>",
  "field_name": "custom_<snake_case do rotulo, sem acentos>",
  "type": "text" | "number" | "date" | "textarea",
  "description": "Parametro especifico — preencher manualmente",
  "required": false,
  "is_system_field": false,
  "is_custom": true
}

Heuristica de type:
  - Se rotulo menciona kg/cm/mm/mmHg/bpm/% → "number"
  - Se rotulo eh "Anamnese/Observacoes/Diagnostico/Tratamento" → "textarea"
  - Se menciona "data/dia" → "date"
  - Default → "text"

WHITELIST DE CANONICOS (apenas referencia — voce NAO pode usar):
${Object.keys(CANONICAL_WHITELIST).join(', ')}

Lixo a ignorar (numeracao "i.", "ii.", separadores) — OMITA da resposta.

FORMATO DE SAIDA: APENAS um array JSON. Sem markdown. Sem explicacoes.`

// ── Helpers ─────────────────────────────────────────────────────────────

function repairAndParseJson(raw: string): any[] {
  let str = raw.trim()
  str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try { return JSON.parse(str) } catch {}
  const arrayMatch = str.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    str = arrayMatch[0]
    try { return JSON.parse(str) } catch {}
  }
  str = str.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}').replace(/'/g, '"')
  try { return JSON.parse(str) } catch {}
  throw new Error('Resposta da IA invalida (JSON nao parseavel)')
}

/**
 * Sanitiza UMA atribuicao Claude. Aplica a LEI 1 estrita: se o Claude
 * tentou usar um canonico que nao bate em sinonimo da whitelist, forca
 * conversao para custom_*.
 *
 * Retorna a quantidade de "forced_custom" para estatistica.
 */
function sanitizeMatch(m: any): { match: FieldMatch | null; forced: boolean } {
  if (!m || typeof m.label_original !== 'string' || !m.label_original.trim()) {
    return { match: null, forced: false }
  }

  const labelOriginal = m.label_original.trim()
  const rawFieldName = typeof m.field_name === 'string' ? m.field_name.trim() : ''
  // snake_case enforcement basico
  const fieldName = rawFieldName
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')

  // LEI 1 — defesa em profundidade
  let finalFieldName = fieldName
  let finalIsCustom = m.is_custom === true || fieldName.startsWith('custom_')
  let forced = false

  if (isCanonical(fieldName)) {
    // Claude tentou usar um canonico. Validar se eh sinonimo legitimo.
    if (!isLegitCanonicalAssignment(labelOriginal, fieldName)) {
      // ALUCINACAO. Forcar custom_.
      finalFieldName = buildCustomFieldName(labelOriginal)
      finalIsCustom = true
      forced = true
      console.warn(
        `[match-template-fields] LEI 1 — Alucinacao bloqueada: ` +
        `"${labelOriginal}" -> "${fieldName}" (ilegitimo) | forcando "${finalFieldName}"`,
      )
    }
  } else if (!finalFieldName) {
    finalFieldName = buildCustomFieldName(labelOriginal)
    finalIsCustom = true
  } else if (!finalIsCustom && !finalFieldName.startsWith('custom_')) {
    // Field_name nao-canonico mas tambem sem prefixo custom_ — corrige
    finalFieldName = `custom_${finalFieldName}`
    finalIsCustom = true
  }

  const validTypes: FieldType[] = ['text', 'number', 'date', 'select', 'boolean', 'textarea']
  const type: FieldType = validTypes.includes(m.type) ? m.type : guessCustomType(labelOriginal)

  return {
    match: {
      label_original: labelOriginal,
      field_name: finalFieldName,
      type,
      description: typeof m.description === 'string' && m.description.trim()
        ? m.description
        : 'Parametro especifico — preencher manualmente',
      required: m.required === true,
      is_system_field: m.is_system_field === true && !finalIsCustom,
      is_custom: finalIsCustom,
    },
    forced,
  }
}

// ── POST handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse<MatchResponse | { error: string }>> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })

    const body = (await req.json()) as MatchRequest
    if (!Array.isArray(body.labels) || body.labels.length === 0) {
      return NextResponse.json({ error: 'labels obrigatorio (array nao vazio)' }, { status: 400 })
    }
    if (body.labels.length > 200) {
      return NextResponse.json({ error: 'Excesso de labels (max 200)' }, { status: 400 })
    }

    // Dedup labels preservando ordem
    const uniqueLabels = Array.from(new Set(body.labels.map(l => l.trim()).filter(Boolean)))

    // ── PASSAGEM 1: pre-match local (deterministico) ─────────────────────
    const localMatches: FieldMatch[] = []
    const labelsForAi: string[] = []
    for (const label of uniqueLabels) {
      const local = matchCanonicalLocal(label)
      if (local) {
        localMatches.push({
          label_original: label,
          field_name: local.field_name,
          type: local.type,
          description: `Campo ${local.field_name}`,
          required: local.required,
          is_system_field: local.is_system,
          is_custom: false,
        })
      } else {
        labelsForAi.push(label)
      }
    }

    // ── PASSAGEM 2: Claude para os que sobraram ──────────────────────────
    let aiMatches: FieldMatch[] = []
    let forcedCount = 0

    if (labelsForAi.length > 0) {
      if (!process.env.ANTHROPIC_API_KEY) {
        // Sem IA, fallback puro: gera custom_ para tudo que sobrou
        aiMatches = labelsForAi.map(label => ({
          label_original: label,
          field_name: buildCustomFieldName(label),
          type: guessCustomType(label),
          description: 'Parametro especifico — preencher manualmente',
          required: false,
          is_system_field: false,
          is_custom: true,
        }))
      } else {
        const userPrompt =
          `Tipo de documento: ${body.doc_type}\n` +
          (body.doc_name ? `Nome: ${body.doc_name}\n` : '') +
          `\nROTULOS NAO-CANONICOS (todos viram custom_*):\n` +
          labelsForAi.map((l, i) => `${i + 1}. ${l}`).join('\n')

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        })

        const raw = response.content[0]
        if (raw.type !== 'text') {
          return NextResponse.json({ error: 'Resposta inesperada da IA' }, { status: 500 })
        }

        let parsed: any[]
        try {
          parsed = repairAndParseJson(raw.text)
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error('[match-template-fields] parse error:', msg, 'raw:', raw.text.slice(0, 500))
          // Fallback: gera custom para tudo
          aiMatches = labelsForAi.map(label => ({
            label_original: label,
            field_name: buildCustomFieldName(label),
            type: guessCustomType(label),
            description: 'Parametro especifico — preencher manualmente',
            required: false,
            is_system_field: false,
            is_custom: true,
          }))
          parsed = []
        }

        for (const m of parsed) {
          const { match, forced } = sanitizeMatch(m)
          if (match) {
            aiMatches.push(match)
            if (forced) forcedCount++
          }
        }

        // Defesa: se sobrou label sem match (Claude omitiu por engano),
        // cria custom_ para fechar.
        const seen = new Set(aiMatches.map(m => m.label_original))
        for (const label of labelsForAi) {
          if (!seen.has(label)) {
            aiMatches.push({
              label_original: label,
              field_name: buildCustomFieldName(label),
              type: guessCustomType(label),
              description: 'Parametro especifico — preencher manualmente',
              required: false,
              is_system_field: false,
              is_custom: true,
            })
          }
        }
      }
    }

    // ── Combina e deduplica por field_name (locais tem precedencia) ─────
    const seen = new Set<string>()
    const all = [...localMatches, ...aiMatches]
    const deduped: FieldMatch[] = []
    for (const m of all) {
      if (seen.has(m.field_name)) {
        // Field_name colidiu (raro). Se for um custom_, sufixa com numero
        if (m.field_name.startsWith('custom_')) {
          let i = 2
          let candidate = `${m.field_name}_${i}`
          while (seen.has(candidate)) {
            i++
            candidate = `${m.field_name}_${i}`
          }
          deduped.push({ ...m, field_name: candidate })
          seen.add(candidate)
        }
        // Senao, descarta duplicata canonica (precedencia ao primeiro)
        continue
      }
      seen.add(m.field_name)
      deduped.push(m)
    }

    return NextResponse.json({
      matches: deduped,
      stats: {
        input_labels: uniqueLabels.length,
        matched_local: localMatches.length,
        matched_ai: aiMatches.length,
        forced_custom: forcedCount,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[match-template-fields] erro:', msg)
    return NextResponse.json({ error: 'Erro interno: ' + msg }, { status: 500 })
  }
}
