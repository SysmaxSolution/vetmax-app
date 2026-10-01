// Curvas do analisador (histogramas/scattergramas) no Storage, não no banco.
//
// Tudo aqui é PURO (sem I/O) de propósito: é o miolo testável do que a 0487
// mudou. O upload/assinatura vive em persist-graphs.ts (escrita) e
// exam-report-data.ts (leitura).
//
// Motivação: ver o cabeçalho de supabase/migrations/0487_exam_graphs_storage.sql.

/** Bucket privado das curvas (criado na 0487). */
export const GRAPH_BUCKET = 'exam-graphs'

/** Validade da signed URL entregue ao laudo. Uma hora cobre impressão/PDF. */
export const GRAPH_SIGNED_TTL = 3600

const IMAGE_MIMES = ['image/png', 'image/bmp', 'image/jpeg', 'image/gif', 'image/webp'] as const

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png', 'image/bmp': 'bmp', 'image/jpeg': 'jpg',
  'image/jpg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
}

/** Extensão do objeto a partir do mime; `bin` quando desconhecido. */
export function extForMime(mime: string | null | undefined): string {
  return EXT_BY_MIME[String(mime ?? '').toLowerCase()] ?? 'bin'
}

/** Tipo da imagem pelos bytes (o cabeçalho ED do aparelho às vezes mente). */
export function sniffImageMimeBytes(bytes: Uint8Array): string | null {
  if (!bytes || bytes.length < 4) return null
  const b = bytes
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
      && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

const u32 = (b: Uint8Array, at: number) =>
  ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0

const u32le = (b: Uint8Array, at: number) =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0

/**
 * Dimensões da imagem sem decodificar pixel (só o cabeçalho). PNG e BMP —
 * é o que o URIT BH-5100 manda. Null quando não der para saber; dimensão é
 * metadado acessório, nunca bloqueia a gravação da curva.
 */
export function imageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (!bytes) return null
  const mime = sniffImageMimeBytes(bytes)
  if (mime === 'image/png') {
    // IHDR: 8 bytes de assinatura + 4 len + 4 'IHDR' + width(4) + height(4)
    if (bytes.length < 24) return null
    if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') return null
    const width = u32(bytes, 16), height = u32(bytes, 20)
    return width > 0 && height > 0 ? { width, height } : null
  }
  if (mime === 'image/bmp') {
    if (bytes.length < 26) return null
    const width = u32le(bytes, 18)
    // Altura pode vir negativa (bitmap top-down) — interessa o módulo.
    const raw = u32le(bytes, 22)
    const height = raw > 0x7fffffff ? 0x100000000 - raw : raw
    return width > 0 && height > 0 ? { width, height } : null
  }
  return null
}

export interface DecodedGraph {
  bytes:  Uint8Array
  mime:   string
  byteLength: number
  width:  number | null
  height: number | null
}

/**
 * base64 do HL7 → PNG BINÁRIO. É daqui que vem a primeira economia: o base64
 * infla 4/3, então sair dele já corta ~25% do peso da curva.
 *
 * Devolve null (e o chamador descarta a curva, sem derrubar o import dos
 * analitos) quando: não é base64, não é imagem conhecida, ou veio vazio.
 */
export function decodeGraphPayload(
  g: { data?: string | null; mime?: string | null; encoding?: string | null },
): DecodedGraph | null {
  const raw = String(g?.data ?? '').trim()
  if (!raw) return null
  const enc = String(g?.encoding ?? 'Base64').toLowerCase()
  if (enc !== 'base64') return null

  // Remove quebras de linha/espaços que alguns aparelhos inserem no ED.
  const clean = raw.replace(/[\s\r\n]+/g, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) return null

  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(Buffer.from(clean, 'base64'))
  } catch { return null }
  if (bytes.length === 0) return null

  const declared = String(g?.mime ?? '').toLowerCase()
  const sniffed = sniffImageMimeBytes(bytes)
  // Confia nos BYTES antes do cabeçalho declarado; só aceita imagem conhecida.
  const mime = sniffed ?? ((IMAGE_MIMES as readonly string[]).includes(declared) ? declared : null)
  if (!mime) return null

  const dim = imageDimensions(bytes)
  return {
    bytes, mime, byteLength: bytes.length,
    width: dim?.width ?? null, height: dim?.height ?? null,
  }
}

/** Código da curva → segmento de caminho estável e seguro (WBCHisto → wbchisto). */
export function graphSlug(code: string | null | undefined): string {
  const s = String(code ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || 'curva'
}

/**
 * Caminho do objeto: `{clinic_id}/{consultation_id}/{slug}.{ext}`.
 *
 * DETERMINÍSTICO de propósito — é o que torna a regravação do mesmo ORU
 * idempotente (upsert sobrescreve, não acumula lixo). Não é enumerável na
 * prática: os dois primeiros segmentos são UUID v4 (122 bits cada), o bucket é
 * privado e não há política de leitura/listagem para anon/authenticated — só
 * o service_role, atrás da checagem de clinic_id no servidor.
 */
export function graphObjectPath(
  clinicId: string, consultationId: string, code: string | null | undefined, mime: string | null | undefined,
): string {
  return `${clinicId}/${consultationId}/${graphSlug(code)}.${extForMime(mime)}`
}

/**
 * Resolve a origem da imagem de UMA curva para o laudo.
 * Linha nova → signed URL do Storage (o navegador baixa de lá, sem passar pela
 * função). Linha legada (0485, só base64) → `data:` URI, como antes.
 */
export function resolveGraphSrc(
  row: { storage_path?: string | null; mime?: string | null; encoding?: string | null; data?: string | null },
  signedByPath: Map<string, string>,
): string | null {
  const path = row?.storage_path ?? null
  if (path) {
    const signed = signedByPath.get(path)
    if (signed) return signed
  }
  if (row?.data) {
    const enc = String(row.encoding ?? 'Base64').toLowerCase()
    if (enc !== 'base64') return null
    const declared = String(row.mime ?? '').toLowerCase()
    const mime = (IMAGE_MIMES as readonly string[]).includes(declared)
      ? declared
      : sniffBase64Mime(row.data)
    if (!mime) return null
    return `data:${mime};base64,${row.data}`
  }
  return null
}

/** Mesma heurística do hl7-parser, sobre o base64 já persistido. */
function sniffBase64Mime(b64: string): string | null {
  const s = String(b64 ?? '').trim()
  if (s.startsWith('iVBORw0KGgo')) return 'image/png'
  if (s.startsWith('Qk')) return 'image/bmp'
  if (s.startsWith('/9j/')) return 'image/jpeg'
  if (s.startsWith('R0lGOD')) return 'image/gif'
  return null
}
