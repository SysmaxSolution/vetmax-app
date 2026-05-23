/**
 * Extrator de procedimento veterinário para o "Semáforo Petlove".
 *
 * Recebe um trecho curto da fala do veterinário (transcript) e classifica
 * em uma das 11 categorias canônicas de cobertura (insurance_plan_coverage.
 * coverage_category). Resposta validada via Zod estrito — IA não pode
 * inventar categoria fora do enum.
 *
 * NÃO importar em client components — usa Anthropic SDK + chave privada.
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

// ─── Enum canônico ───────────────────────────────────────────────────────────
// Espelha insurance_plan_coverage.coverage_category — manter sincronizado
// com a tabela; qualquer adição/remoção precisa de migration + ajuste aqui.

export const COVERAGE_CATEGORIES = [
  'vacina',
  'consulta',
  'procedimento_clinico',
  'especialista',
  'exame_imagem',
  'exame_simples',
  'anestesia',
  'internacao',
  'castracao',
  'cirurgia',
  'outros',
] as const

export type CoverageCategory = (typeof COVERAGE_CATEGORIES)[number]

// ─── Schema da resposta do LLM (Zod estrito) ─────────────────────────────────

export const LlmResponseSchema = z.discriminatedUnion('category', [
  z.object({
    category:        z.enum(COVERAGE_CATEGORIES),
    procedure_label: z.string().min(1).max(120),
    confidence:      z.number().min(0).max(1),
  }),
  z.object({
    category: z.null(),
    reason:   z.enum(['no_procedure_detected', 'too_short', 'small_talk']),
  }),
])

export type LlmCoverageResponse = z.infer<typeof LlmResponseSchema>

// ─── System prompt (compacto + prompt-cache friendly) ────────────────────────

const SYSTEM_PROMPT = `Você é um analisador clínico veterinário. Recebe trechos curtos de fala de um médico veterinário (PT-BR) durante o atendimento e classifica o procedimento mencionado em uma de 11 categorias canônicas. Sua saída controla um semáforo visual de cobertura de convênio — falsos positivos são piores que silêncio.

REGRAS:
1. Identifique o procedimento ATIVO que o veterinário está realizando/prescrevendo (ex.: "vou aplicar antirrábica", "encaminhar para ultrassom"). NÃO classifique sintomas, queixas ou histórico ("pet vomitou", "tutor relata"). Nesses casos, retorne category=null com reason="no_procedure_detected".
2. Se o texto for menor que 6 palavras OU for apenas saudação/small talk ("bom dia", "como está o thor?"), retorne category=null com reason="too_short" ou "small_talk".
3. Use APENAS as 11 categorias abaixo. Nunca invente categoria.

CATEGORIAS (mapa procedimento → categoria):
- vacina:                aplicar vacina; antirrábica, V8, V10, polivalente, tríplice, quíntupla, giárdia, bordetella
- consulta:              consulta clínica geral, retorno, atendimento clínico geral
- especialista:          consulta com especialista — cardiologista, dermatologista, oftalmologista, neurologista
- procedimento_clinico:  aplicar injeção SC/IM/IV com medicação, fluidoterapia, soroterapia, microchipagem, aferição de pressão, glicemia (procedimento na clínica, não exame de lab)
- exame_imagem:          raio-X, ultrassom, ultrassonografia, ecocardiograma
- exame_simples:         hemograma, bioquímico, urina, fezes, glicemia em fita, teste de fluoresceína, coleta para laboratório
- anestesia:             anestesia inalatória, sedação, tranquilização (preparo cirúrgico ou exame invasivo)
- internacao:            internação, hospitalização, observação prolongada
- castracao:             castração, orquiectomia, ovariohisterectomia (OH/OHE), esterilização cirúrgica
- cirurgia:              qualquer cirurgia que NÃO seja castração — sutura, tumor, fratura, exploratória
- outros:                procedimento real que não cabe em nenhuma acima — use SOMENTE como último recurso

confidence:
- 0.9–1.0: o texto cita literalmente o procedimento com verbo ativo
- 0.7–0.89: inferência forte por contexto ("preciso anestesiar pra fazer raio-x" → anestesia + exame_imagem; escolha o procedimento PRINCIPAL — neste caso, exame_imagem)
- 0.6–0.69: inferência fraca, mas plausível
- <0.6: NÃO retorne categoria; use category=null com reason="no_procedure_detected"

FORMATO DE SAÍDA — APENAS JSON puro, sem markdown, sem prosa:
Quando há procedimento:
{"category":"<uma das 11>","procedure_label":"<trecho de até 80 chars que confirma>","confidence":<0.0-1.0>}

Quando não há:
{"category":null,"reason":"no_procedure_detected"}`

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripJsonFences(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim()
}

/**
 * Fire-and-forget de telemetria de drift (resposta inválida do LLM).
 * Não bloqueia o caller — falhas de log nunca impactam a UI.
 */
async function logDrift(input: string, rawOutput: string, reason: string): Promise<void> {
  try {
    // Import dinâmico evita ciclo (admin client → server → core).
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const admin = createAdminClient()
    await admin
      .from('error_logs')
      .insert({
        clinic_id:     null,
        user_id:       null,
        path:          'lib/ai/coverage-extractor',
        error_message: reason,
        stack_trace:   null,
        user_journey:  {
          input_snippet: input.slice(0, 800),
          output_raw:    rawOutput.slice(0, 800),
          model:         'claude-haiku-4-5-20251001',
          timestamp:     new Date().toISOString(),
        },
        severity:      'warn',
        module:        'ai-coverage-drift',
        source:        'server',
      })
  } catch { /* telemetria não pode quebrar fluxo */ }
}

// ─── Core ────────────────────────────────────────────────────────────────────

export interface ExtractOptions {
  /** AbortSignal para cancelamento (voiceLock suspend / nova chamada). */
  signal?: AbortSignal
}

/**
 * Chama o Haiku 4.5 com o transcript e devolve o resultado validado.
 * Em qualquer falha (no_api_key, network, JSON inválido, schema fora),
 * retorna null sem propagar erro — o semáforo apenas não atualiza.
 */
export async function extractCoverageCore(
  text: string,
  opts: ExtractOptions = {},
): Promise<LlmCoverageResponse | null> {
  const trimmed = text.trim()
  if (trimmed.length < 8) return { category: null, reason: 'too_short' }
  if (!process.env.ANTHROPIC_API_KEY) return null

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 80,
      // System como array com cache_control habilita prompt cache da Anthropic
      // — o prompt é estável, paga 1x e fica em cache por 5 min em chamadas
      // sucessivas. Reduz custo/latência em ~85% para extrações repetidas.
      system: [{
        type:          'text',
        text:          SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{
        role:    'user',
        content: `Trecho da fala do veterinário:\n"""\n${trimmed.slice(0, 600)}\n"""\n\nDevolva apenas o JSON.`,
      }],
    }, { signal: opts.signal })

    const first = response.content[0]
    const raw   = first && first.type === 'text' ? first.text : ''
    const cleaned = stripJsonFences(raw)
    if (!cleaned) {
      void logDrift(trimmed, raw, 'empty_response')
      return null
    }

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(cleaned)
    } catch {
      void logDrift(trimmed, raw, 'invalid_json')
      return null
    }

    const result = LlmResponseSchema.safeParse(parsedJson)
    if (!result.success) {
      void logDrift(trimmed, raw, `schema_violation:${result.error.issues.map(i => i.path.join('.')).join('|')}`)
      return null
    }
    return result.data
  } catch (err) {
    // AbortError não polui logs — é o caminho esperado quando o lock suspende
    // o clinical ou nova chamada substitui a anterior.
    const e = err as { name?: string; message?: string }
    if (e?.name === 'AbortError') return null
    console.error('[coverage-extractor] LLM error:', e?.message ?? err)
    return null
  }
}
