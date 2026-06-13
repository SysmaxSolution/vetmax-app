import Anthropic from '@anthropic-ai/sdk'

/**
 * Wrapper resiliente sobre o cliente Anthropic com suporte a chave de fallback.
 *
 * Configuração via env:
 *   ANTHROPIC_API_KEY          → chave primária (obrigatória)
 *   ANTHROPIC_API_KEY_FALLBACK → chave secundária (opcional, usada em
 *                                 caso de credit balance esgotado na primária)
 *
 * Uso:
 *   import { createMessageWithFallback } from '@/lib/ai/anthropic-client'
 *   const resp = await createMessageWithFallback({
 *     model: 'claude-haiku-4-5',
 *     max_tokens: 512,
 *     messages: [...],
 *   })
 *
 * Comportamento:
 *   - Tenta chamar com a chave primária
 *   - Se falhar com erro "credit balance too low" ou "insufficient_quota" E
 *     houver chave de fallback configurada, retenta com ela
 *   - Loga (apenas no console do server) qual chave foi usada
 */

const primaryClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const fallbackKey = process.env.ANTHROPIC_API_KEY_FALLBACK
const fallbackClient = fallbackKey
  ? new Anthropic({ apiKey: fallbackKey })
  : null

function isCreditError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes('credit balance') || msg.includes('insufficient_quota')
}

export async function createMessageWithFallback(
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  try {
    return await primaryClient.messages.create(params)
  } catch (err) {
    if (!isCreditError(err) || !fallbackClient) {
      throw err
    }
    console.warn('[anthropic-client] Chave primária sem créditos — tentando fallback')
    try {
      const resp = await fallbackClient.messages.create(params)
      console.info('[anthropic-client] Fallback OK')
      return resp
    } catch (fallbackErr) {
      console.error('[anthropic-client] Fallback também falhou:', fallbackErr instanceof Error ? fallbackErr.message : fallbackErr)
      // Lança o erro do fallback (mais relevante)
      throw fallbackErr
    }
  }
}

/**
 * Cliente direto — para chamadas streaming ou que precisam de método específico
 * (.tools.list, .batches, etc.). Não tem fallback automático.
 */
export const anthropic = primaryClient

/** Verifica se há fallback configurado. */
export function hasFallbackKey(): boolean {
  return fallbackClient !== null
}
