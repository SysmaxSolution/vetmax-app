/**
 * Lógica pura da redução de peso do Laboratório (correção do
 * FAIR_USE_LIMITS_EXCEEDED / fastOriginTransfer na Vercel):
 *
 *  1. decodificação base64 → PNG binário + metadados (migration 0487)
 *  2. resolução do caminho do objeto no bucket privado `exam-graphs`
 *  3. escolha da origem da imagem no laudo (Storage novo × base64 legado)
 *  4. aceitação do corpo COMPRIMIDO e do corpo NÃO comprimido em
 *     /api/lab/results — o agente já instalado na clínica manda JSON puro e
 *     tem que continuar funcionando.
 */
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib'
import {
  GRAPH_BUCKET, decodeGraphPayload, extForMime, graphObjectPath, graphSlug,
  imageDimensions, resolveGraphSrc, sniffImageMimeBytes,
} from '@/lib/lab/graph-storage'
import { decodeLabBody, normalizeEncoding, parseLabBody } from '@/lib/lab/request-body'

/** PNG 1x1 real (assinatura + IHDR + IDAT + IEND). */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
)
const PNG_1x1_B64 = PNG_1x1.toString('base64')

/** PNG sintético (só o cabeçalho IHDR importa para imageDimensions). */
function pngHeader(w: number, h: number): Buffer {
  const b = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(w, 16)
  b.writeUInt32BE(h, 20)
  return b
}

describe('sniff e dimensões da curva', () => {
  it('reconhece PNG pelos bytes', () => {
    expect(sniffImageMimeBytes(PNG_1x1)).toBe('image/png')
  })

  it('reconhece BMP pelos bytes e lê as dimensões', () => {
    const bmp = Buffer.alloc(26)
    bmp.write('BM', 0, 'ascii')
    bmp.writeUInt32LE(320, 18)
    bmp.writeUInt32LE(240, 22)
    expect(sniffImageMimeBytes(bmp)).toBe('image/bmp')
    expect(imageDimensions(bmp)).toEqual({ width: 320, height: 240 })
  })

  it('lê largura/altura do IHDR do PNG', () => {
    expect(imageDimensions(pngHeader(300, 135))).toEqual({ width: 300, height: 135 })
  })

  it('devolve null quando não é imagem conhecida', () => {
    expect(sniffImageMimeBytes(Buffer.from('nao-sou-imagem'))).toBeNull()
    expect(imageDimensions(Buffer.from('nao-sou-imagem'))).toBeNull()
  })
})

describe('decodeGraphPayload — base64 do HL7 para binário', () => {
  it('converte base64 em PNG binário e corta o inchaço de 4/3', () => {
    const d = decodeGraphPayload({ data: PNG_1x1_B64, mime: 'image/png', encoding: 'Base64' })
    expect(d).not.toBeNull()
    expect(d!.mime).toBe('image/png')
    expect(d!.byteLength).toBe(PNG_1x1.length)
    expect(d!.byteLength).toBeLessThan(PNG_1x1_B64.length)
    expect(d!.byteLength / PNG_1x1_B64.length).toBeLessThan(0.78)
    expect(Buffer.from(d!.bytes).equals(PNG_1x1)).toBe(true)
  })

  it('preenche dimensões quando o cabeçalho permite', () => {
    const png = pngHeader(300, 135)
    const d = decodeGraphPayload({ data: png.toString('base64'), mime: 'image/png', encoding: 'Base64' })
    expect([d!.width, d!.height]).toEqual([300, 135])
  })

  it('confia nos bytes, não no mime declarado pelo aparelho', () => {
    const d = decodeGraphPayload({ data: PNG_1x1_B64, mime: 'application/octet-stream', encoding: 'Base64' })
    expect(d!.mime).toBe('image/png')
  })

  it('tolera quebras de linha que alguns aparelhos põem no ED', () => {
    const quebrado = PNG_1x1_B64.replace(/(.{20})/g, '$1\r\n')
    const d = decodeGraphPayload({ data: quebrado, mime: null, encoding: 'Base64' })
    expect(d!.mime).toBe('image/png')
    expect(Buffer.from(d!.bytes).equals(PNG_1x1)).toBe(true)
  })

  it('recusa payload vazio, encoding não-base64 e lixo', () => {
    expect(decodeGraphPayload({ data: '', mime: 'image/png', encoding: 'Base64' })).toBeNull()
    expect(decodeGraphPayload({ data: PNG_1x1_B64, mime: 'image/png', encoding: 'Hex' })).toBeNull()
    expect(decodeGraphPayload({ data: '!!! nao base64 !!!', mime: 'image/png', encoding: 'Base64' })).toBeNull()
  })
})

describe('caminho do objeto no bucket privado', () => {
  const CLINIC = '11111111-1111-4111-8111-111111111111'
  const CONS = '22222222-2222-4222-8222-222222222222'

  it('usa o bucket da 0487', () => {
    expect(GRAPH_BUCKET).toBe('exam-graphs')
  })

  it('monta {clinic}/{consulta}/{curva}.png — isolado por clínica', () => {
    expect(graphObjectPath(CLINIC, CONS, 'WBCHisto', 'image/png'))
      .toBe(`${CLINIC}/${CONS}/wbchisto.png`)
  })

  it('é determinístico — reimportar o mesmo ORU sobrescreve, não acumula', () => {
    const a = graphObjectPath(CLINIC, CONS, 'S0_S90Scattergram', 'image/png')
    const b = graphObjectPath(CLINIC, CONS, 'S0_S90Scattergram', 'image/png')
    expect(a).toBe(b)
    expect(a).toBe(`${CLINIC}/${CONS}/s0-s90scattergram.png`)
  })

  it('sanitiza o código da curva e resolve a extensão pelo mime', () => {
    expect(graphSlug('S90/S90D Diff')).toBe('s90-s90d-diff')
    expect(graphSlug(null)).toBe('curva')
    expect(extForMime('image/bmp')).toBe('bmp')
    expect(extForMime('image/jpeg')).toBe('jpg')
    expect(extForMime('application/pdf')).toBe('bin')
  })
})

describe('resolveGraphSrc — Storage novo x base64 legado', () => {
  const path = 'clinic/cons/wbchisto.png'
  const SIGNED = 'https://proj.supabase.co/storage/v1/object/sign/exam-graphs/x?token=abc'
  const signed = new Map([[path, SIGNED]])

  it('linha nova: usa a signed URL (o navegador baixa fora da função)', () => {
    const src = resolveGraphSrc({ storage_path: path, mime: 'image/png', encoding: 'binary', data: null }, signed)
    expect(src).toBe(SIGNED)
  })

  it('linha legada (0485, só base64): continua renderizando por data: URI', () => {
    const src = resolveGraphSrc({ storage_path: null, mime: 'image/png', encoding: 'Base64', data: PNG_1x1_B64 }, signed)
    expect(src).toBe(`data:image/png;base64,${PNG_1x1_B64}`)
  })

  it('assinatura falhou mas há base64: cai no fallback em vez de ficar sem imagem', () => {
    const src = resolveGraphSrc({ storage_path: 'outro/caminho.png', mime: 'image/png', encoding: 'Base64', data: PNG_1x1_B64 }, signed)
    expect(src).toBe(`data:image/png;base64,${PNG_1x1_B64}`)
  })

  it('sem caminho e sem payload: null (o laudo esconde a figura)', () => {
    expect(resolveGraphSrc({ storage_path: null, mime: 'image/png', encoding: 'Base64', data: null }, signed)).toBeNull()
  })

  it('não gera data: URI de tipo arbitrário', () => {
    const svg = Buffer.from('<svg onload="x()"/>').toString('base64')
    expect(resolveGraphSrc({ storage_path: null, mime: 'image/svg+xml', encoding: 'Base64', data: svg }, signed)).toBeNull()
  })
})

describe('corpo da rota /api/lab/results — comprimido E não comprimido', () => {
  const payload = { hl7: 'MSH|^~&||5190Vet|LIS|PC|20260925190100||ORU^R01|4|P|2.3.1', barcode: '1234' }
  const json = JSON.stringify(payload)

  it('AGENTE JÁ INSTALADO: JSON puro, sem Content-Encoding, continua aceito', () => {
    const r = parseLabBody<typeof payload>(Buffer.from(json, 'utf8'), null)
    expect('body' in r && r.body).toEqual(payload)
  })

  it('também aceita o cabeçalho explícito identity', () => {
    const r = parseLabBody<typeof payload>(Buffer.from(json, 'utf8'), 'identity')
    expect('body' in r && r.body).toEqual(payload)
  })

  it('AGENTE NOVO: corpo gzip é descomprimido e dá o mesmo objeto', () => {
    const r = parseLabBody<typeof payload>(gzipSync(Buffer.from(json, 'utf8')), 'gzip')
    expect('body' in r && r.body).toEqual(payload)
  })

  it('aceita deflate e brotli (proxies que recomprimem)', () => {
    expect('body' in parseLabBody(deflateSync(Buffer.from(json)), 'deflate')).toBe(true)
    expect('body' in parseLabBody(brotliCompressSync(Buffer.from(json)), 'br')).toBe(true)
  })

  it('normaliza o cabeçalho (maiúsculas, lista, vazio)', () => {
    expect(normalizeEncoding('GZIP')).toBe('gzip')
    expect(normalizeEncoding('gzip, identity')).toBe('gzip')
    expect(normalizeEncoding(null)).toBe('identity')
    expect(normalizeEncoding('')).toBe('identity')
  })

  it('gzip reduz de verdade o corpo de um ORU com curvas base64', () => {
    const curva = PNG_1x1_B64.repeat(400)
    const oru = JSON.stringify({ barcode: '1234', hl7: `OBX|1|ED|WBCHisto||5190Vet^image^PNG^Base64^${curva}` })
    const cru = Buffer.byteLength(oru, 'utf8')
    const gz = gzipSync(Buffer.from(oru, 'utf8'), { level: 6 }).length
    expect(gz).toBeLessThan(cru * 0.5)
    const r = parseLabBody<{ hl7: string }>(gzipSync(Buffer.from(oru, 'utf8')), 'gzip')
    expect('body' in r && r.body.hl7.length).toBe(JSON.parse(oru).hl7.length)
  })

  it('recusa corpo vazio, encoding desconhecido e payload corrompido', () => {
    expect('error' in decodeLabBody(Buffer.alloc(0), null)).toBe(true)
    expect('error' in decodeLabBody(Buffer.from(json), 'compress')).toBe(true)
    expect('error' in decodeLabBody(Buffer.from('nao-e-gzip'), 'gzip')).toBe(true)
  })

  it('JSON inválido devolve a mesma mensagem de antes', () => {
    const r = parseLabBody(Buffer.from('{nao-e-json'), null)
    expect(r).toEqual({ error: 'JSON inválido.' })
  })
})
