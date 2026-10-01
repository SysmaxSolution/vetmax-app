// Leitura do corpo das rotas do Laboratório aceitando corpo COMPRIMIDO.
//
// Por quê: o agente manda o ORU inteiro (~47 kB por hemograma, quase tudo
// base64 das curvas) para /api/lab/results. Com gzip o mesmo corpo vai em
// ~12 kB. Isso é transferência de entrada da função — o outro lado da conta
// que estourou na Vercel.
//
// RETROCOMPATIBILIDADE É OBRIGATÓRIA: o agente JÁ INSTALADO na Clínica Animais
// envia JSON puro, sem Content-Encoding. Esse caminho tem que continuar
// funcionando para o laboratório não parar. Por isso: sem cabeçalho (ou
// `identity`) = corpo em texto, exatamente como antes.

import { gunzipSync, inflateSync, inflateRawSync, brotliDecompressSync } from 'node:zlib'

/** Teto do corpo que entra (já comprimido). Um ORU real tem ~47 kB cru. */
export const MAX_LAB_BODY_BYTES = 4 * 1024 * 1024
/** Teto do corpo DESCOMPRIMIDO — barra bomba de descompressão. */
export const MAX_LAB_BODY_INFLATED = 16 * 1024 * 1024

export type DecodeResult = { text: string } | { error: string }

/** Normaliza o cabeçalho: "gzip", "GZIP", "gzip, identity" → "gzip". */
export function normalizeEncoding(header: string | null | undefined): string {
  const first = String(header ?? '').split(',')[0].trim().toLowerCase()
  return first === '' ? 'identity' : first
}

/**
 * Bytes do corpo → texto, honrando Content-Encoding.
 * Puro (só zlib síncrono): é o miolo testável da Tarefa 2.
 */
export function decodeLabBody(raw: Uint8Array, contentEncoding?: string | null): DecodeResult {
  if (!raw || raw.length === 0) return { error: 'Corpo vazio.' }
  if (raw.length > MAX_LAB_BODY_BYTES) return { error: 'Corpo acima do limite.' }

  const enc = normalizeEncoding(contentEncoding)
  const buf = Buffer.from(raw.buffer ?? raw, (raw as Buffer).byteOffset ?? 0, raw.length)

  if (enc === 'identity') return { text: buf.toString('utf8') }

  let out: Buffer
  try {
    if (enc === 'gzip' || enc === 'x-gzip') out = gunzipSync(buf, { maxOutputLength: MAX_LAB_BODY_INFLATED })
    else if (enc === 'deflate') {
      try { out = inflateSync(buf, { maxOutputLength: MAX_LAB_BODY_INFLATED }) }
      catch { out = inflateRawSync(buf, { maxOutputLength: MAX_LAB_BODY_INFLATED }) }
    }
    else if (enc === 'br') out = brotliDecompressSync(buf, { maxOutputLength: MAX_LAB_BODY_INFLATED })
    else return { error: `Content-Encoding não suportado: ${enc}.` }
  } catch {
    return { error: 'Corpo comprimido inválido.' }
  }
  return { text: out.toString('utf8') }
}

export type ParseResult<T> = { body: T } | { error: string }

/** decodeLabBody + JSON.parse, com a mensagem de erro que a rota devolve. */
export function parseLabBody<T = unknown>(raw: Uint8Array, contentEncoding?: string | null): ParseResult<T> {
  const decoded = decodeLabBody(raw, contentEncoding)
  if ('error' in decoded) return { error: decoded.error }
  try { return { body: JSON.parse(decoded.text) as T } }
  catch { return { error: 'JSON inválido.' } }
}

/** Lê o Request inteiro e devolve o JSON, comprimido ou não. */
export async function readLabRequest<T = unknown>(req: Request): Promise<ParseResult<T>> {
  let raw: Uint8Array
  try { raw = new Uint8Array(await req.arrayBuffer()) }
  catch { return { error: 'Não foi possível ler o corpo da requisição.' } }
  return parseLabBody<T>(raw, req.headers.get('content-encoding'))
}
