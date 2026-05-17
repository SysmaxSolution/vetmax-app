/**
 * Cliente HTTP do microservico Gotenberg.
 *
 * Gotenberg expõe LibreOffice headless por trás de uma API REST simples:
 *
 *   POST {GOTENBERG_URL}/forms/libreoffice/convert
 *   Content-Type: multipart/form-data
 *   files: <arquivo .docx>
 *   -> 200 application/pdf  (corpo = bytes do PDF)
 *
 * Resposta de erro vem como JSON (status 4xx/5xx). Esta lib NAO captura
 * erros — quem chama deve envolver em try/catch para implementar fallback.
 * Plano B (rodar com o .docx editavel) fica a cargo de quem orquestra.
 *
 * Configuracao:
 *   GOTENBERG_URL          (obrigatorio em prod, ex: https://gotenberg.fly.dev)
 *   GOTENBERG_TIMEOUT_MS   (opcional, default 30000)
 */

const DEFAULT_TIMEOUT_MS = 30_000

export class GotenbergNotConfiguredError extends Error {
  constructor() {
    super('GOTENBERG_URL nao configurado')
    this.name = 'GotenbergNotConfiguredError'
  }
}

export class GotenbergRequestError extends Error {
  readonly status: number
  readonly body: string
  constructor(status: number, body: string) {
    super(`Gotenberg HTTP ${status}: ${body.slice(0, 240)}`)
    this.name = 'GotenbergRequestError'
    this.status = status
    this.body = body
  }
}

export class GotenbergTimeoutError extends Error {
  readonly timeoutMs: number
  constructor(timeoutMs: number) {
    super(`Gotenberg timeout apos ${timeoutMs}ms`)
    this.name = 'GotenbergTimeoutError'
    this.timeoutMs = timeoutMs
  }
}

export interface ConvertOptions {
  /** Override da URL — util em testes/integration. */
  url?: string
  /** Override timeout. Default 30s. */
  timeoutMs?: number
  /** Nome do arquivo enviado no multipart — Gotenberg usa para deduzir o conversor. */
  filename?: string
  /** AbortSignal externo para cancelar a requisicao. */
  signal?: AbortSignal
}

export function getGotenbergUrl(): string | null {
  const u = process.env.GOTENBERG_URL?.trim()
  if (!u) return null
  return u.replace(/\/+$/, '')
}

export function isGotenbergConfigured(): boolean {
  return getGotenbergUrl() !== null
}

/**
 * Converte buffer .docx para PDF via Gotenberg.
 *
 * Lanca GotenbergNotConfiguredError se GOTENBERG_URL estiver ausente.
 * Lanca GotenbergTimeoutError em timeout.
 * Lanca GotenbergRequestError em status >= 400.
 * Lanca Error generico em falha de rede.
 */
export async function convertDocxToPdf(
  docxBuffer: Buffer | Uint8Array,
  opts: ConvertOptions = {},
): Promise<Buffer> {
  const baseUrl = opts.url?.replace(/\/+$/, '') ?? getGotenbergUrl()
  if (!baseUrl) throw new GotenbergNotConfiguredError()

  const timeoutMs = opts.timeoutMs ?? (Number(process.env.GOTENBERG_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS)
  const filename = opts.filename || 'document.docx'

  const endpoint = `${baseUrl}/forms/libreoffice/convert`

  // Compose multipart manualmente: a especificacao do Gotenberg exige que o
  // campo se chame "files" (ele aceita 1..N). Usamos FormData global do Node
  // 18+ / Next 16 (alimentado via undici).
  const form = new FormData()
  const blob = new Blob([new Uint8Array(docxBuffer)], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  form.append('files', blob, filename)

  // Encadeia o signal externo + signal de timeout interno.
  const ctrl = new AbortController()
  const externalAbort = opts.signal
  if (externalAbort) {
    if (externalAbort.aborted) ctrl.abort(externalAbort.reason)
    else externalAbort.addEventListener('abort', () => ctrl.abort(externalAbort.reason), { once: true })
  }
  const timer = setTimeout(() => ctrl.abort(new GotenbergTimeoutError(timeoutMs)), timeoutMs)

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      body: form,
      signal: ctrl.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof GotenbergTimeoutError) throw err
    // AbortError quando o timeout dispara (reason eh nosso GotenbergTimeoutError)
    if (
      typeof err === 'object' &&
      err !== null &&
      'name' in err &&
      (err as { name?: string }).name === 'AbortError'
    ) {
      const reason = (ctrl.signal as AbortSignal & { reason?: unknown }).reason
      if (reason instanceof GotenbergTimeoutError) throw reason
      throw new GotenbergTimeoutError(timeoutMs)
    }
    throw err
  }
  clearTimeout(timer)

  if (!res.ok) {
    const text = await safeReadText(res)
    throw new GotenbergRequestError(res.status, text)
  }

  const buf = await res.arrayBuffer()
  if (buf.byteLength === 0) {
    throw new GotenbergRequestError(res.status, 'corpo vazio')
  }
  return Buffer.from(buf)
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return '<sem corpo>'
  }
}

/**
 * Versao que NUNCA lanca: devolve { ok: true, pdf } ou { ok: false, reason }.
 * Conveniencia para fluxos com fallback silencioso (geracao de documento por
 * paciente — se Gotenberg cair, entregamos o .docx editavel).
 */
export async function tryConvertDocxToPdf(
  docxBuffer: Buffer | Uint8Array,
  opts: ConvertOptions = {},
): Promise<
  | { ok: true; pdf: Buffer }
  | { ok: false; reason: 'not_configured' | 'timeout' | 'http' | 'network'; detail: string }
> {
  try {
    const pdf = await convertDocxToPdf(docxBuffer, opts)
    return { ok: true, pdf }
  } catch (err) {
    if (err instanceof GotenbergNotConfiguredError) {
      return { ok: false, reason: 'not_configured', detail: err.message }
    }
    if (err instanceof GotenbergTimeoutError) {
      return { ok: false, reason: 'timeout', detail: err.message }
    }
    if (err instanceof GotenbergRequestError) {
      return { ok: false, reason: 'http', detail: err.message }
    }
    return {
      ok: false,
      reason: 'network',
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}
