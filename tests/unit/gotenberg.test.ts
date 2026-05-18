/**
 * Testes do cliente Gotenberg.
 *
 * Estrategia: mocka fetch global para simular respostas do microservico.
 * Nao depende de Gotenberg real rodando — esses casos sao para CI.
 */

import {
  convertDocxToPdf,
  tryConvertDocxToPdf,
  isGotenbergConfigured,
  getGotenbergUrl,
  GotenbergNotConfiguredError,
  GotenbergRequestError,
  GotenbergTimeoutError,
} from '@/lib/docx/gotenberg'

const ORIGINAL_FETCH = global.fetch
const ORIGINAL_URL = process.env.GOTENBERG_URL
const ORIGINAL_TIMEOUT = process.env.GOTENBERG_TIMEOUT_MS

afterEach(() => {
  global.fetch = ORIGINAL_FETCH
  if (ORIGINAL_URL === undefined) delete process.env.GOTENBERG_URL
  else process.env.GOTENBERG_URL = ORIGINAL_URL
  if (ORIGINAL_TIMEOUT === undefined) delete process.env.GOTENBERG_TIMEOUT_MS
  else process.env.GOTENBERG_TIMEOUT_MS = ORIGINAL_TIMEOUT
})

const FAKE_DOCX = Buffer.from('PK\x03\x04 fake-docx')
const FAKE_PDF = Buffer.from('%PDF-1.4 fake')

describe('config helpers', () => {
  it('isGotenbergConfigured retorna true quando URL definida', () => {
    process.env.GOTENBERG_URL = 'https://gotenberg.fly.dev'
    expect(isGotenbergConfigured()).toBe(true)
    expect(getGotenbergUrl()).toBe('https://gotenberg.fly.dev')
  })

  it('isGotenbergConfigured retorna false quando URL ausente', () => {
    delete process.env.GOTENBERG_URL
    expect(isGotenbergConfigured()).toBe(false)
    expect(getGotenbergUrl()).toBeNull()
  })

  it('remove barras finais da URL', () => {
    process.env.GOTENBERG_URL = 'https://gotenberg.fly.dev///'
    expect(getGotenbergUrl()).toBe('https://gotenberg.fly.dev')
  })
})

describe('convertDocxToPdf', () => {
  it('lanca GotenbergNotConfiguredError se URL ausente', async () => {
    delete process.env.GOTENBERG_URL
    await expect(convertDocxToPdf(FAKE_DOCX)).rejects.toBeInstanceOf(
      GotenbergNotConfiguredError,
    )
  })

  it('faz POST ao endpoint correto com multipart files', async () => {
    process.env.GOTENBERG_URL = 'https://gotenberg.test'
    let capturedUrl = ''
    let capturedMethod = ''
    let capturedBody: unknown = null
    global.fetch = jest.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedUrl = url
      capturedMethod = init.method ?? ''
      capturedBody = init.body
      return new Response(FAKE_PDF, {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      })
    }) as unknown as typeof fetch

    const pdf = await convertDocxToPdf(FAKE_DOCX, { filename: 'rx.docx' })
    expect(capturedUrl).toBe('https://gotenberg.test/forms/libreoffice/convert')
    expect(capturedMethod).toBe('POST')
    expect(capturedBody).toBeInstanceOf(FormData)
    const fd = capturedBody as FormData
    const file = fd.get('files')
    expect(file).toBeInstanceOf(Blob)
    expect((file as File).name).toBe('rx.docx')
    expect(pdf).toBeInstanceOf(Buffer)
    expect(pdf.toString('utf8')).toContain('%PDF')
  })

  it('lanca GotenbergRequestError em status 500', async () => {
    process.env.GOTENBERG_URL = 'https://gotenberg.test'
    global.fetch = jest.fn().mockResolvedValue(
      new Response('libreoffice crashed', { status: 500 }),
    ) as unknown as typeof fetch

    await expect(convertDocxToPdf(FAKE_DOCX)).rejects.toBeInstanceOf(GotenbergRequestError)
  })

  it('lanca GotenbergRequestError quando corpo vazio com status 200', async () => {
    process.env.GOTENBERG_URL = 'https://gotenberg.test'
    global.fetch = jest.fn().mockResolvedValue(
      new Response(new Uint8Array(0), { status: 200 }),
    ) as unknown as typeof fetch

    await expect(convertDocxToPdf(FAKE_DOCX)).rejects.toBeInstanceOf(GotenbergRequestError)
  })

  it('respeita timeout customizado', async () => {
    process.env.GOTENBERG_URL = 'https://gotenberg.test'
    global.fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const e = new Error('aborted')
            ;(e as Error & { name: string }).name = 'AbortError'
            reject(e)
          })
        }),
    ) as unknown as typeof fetch

    await expect(
      convertDocxToPdf(FAKE_DOCX, { timeoutMs: 50 }),
    ).rejects.toBeInstanceOf(GotenbergTimeoutError)
  })

  it('aceita opts.url sobrescrevendo env', async () => {
    process.env.GOTENBERG_URL = 'https://wrong.test'
    let captured = ''
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      captured = url
      return new Response(FAKE_PDF, { status: 200 })
    }) as unknown as typeof fetch

    await convertDocxToPdf(FAKE_DOCX, { url: 'https://override.test' })
    expect(captured).toBe('https://override.test/forms/libreoffice/convert')
  })
})

describe('tryConvertDocxToPdf — fallback silencioso', () => {
  it('devolve { ok: true, pdf } em sucesso', async () => {
    process.env.GOTENBERG_URL = 'https://gotenberg.test'
    global.fetch = jest.fn().mockResolvedValue(
      new Response(FAKE_PDF, { status: 200 }),
    ) as unknown as typeof fetch

    const r = await tryConvertDocxToPdf(FAKE_DOCX)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.pdf).toBeInstanceOf(Buffer)
  })

  it('devolve { ok: false, reason: not_configured } se sem URL', async () => {
    delete process.env.GOTENBERG_URL
    const r = await tryConvertDocxToPdf(FAKE_DOCX)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('not_configured')
  })

  it('devolve { ok: false, reason: http } em status 500', async () => {
    process.env.GOTENBERG_URL = 'https://gotenberg.test'
    global.fetch = jest.fn().mockResolvedValue(
      new Response('crash', { status: 500 }),
    ) as unknown as typeof fetch

    const r = await tryConvertDocxToPdf(FAKE_DOCX)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('http')
  })

  it('devolve { ok: false, reason: network } em falha de fetch', async () => {
    process.env.GOTENBERG_URL = 'https://gotenberg.test'
    global.fetch = jest.fn().mockRejectedValue(new Error('connect ECONNREFUSED')) as unknown as typeof fetch

    const r = await tryConvertDocxToPdf(FAKE_DOCX)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('network')
  })

  it('devolve { ok: false, reason: timeout } quando aborta', async () => {
    process.env.GOTENBERG_URL = 'https://gotenberg.test'
    global.fetch = jest.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const e = new Error('aborted')
            ;(e as Error & { name: string }).name = 'AbortError'
            reject(e)
          })
        }),
    ) as unknown as typeof fetch

    const r = await tryConvertDocxToPdf(FAKE_DOCX, { timeoutMs: 30 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('timeout')
  })
})
