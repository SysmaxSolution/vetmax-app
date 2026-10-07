// Parser puro de mensagens HL7 v2 (ORU^R01) dos aparelhos de laboratório.
// Extrai os resultados (segmentos OBX) → analitos. Fica pronto para o
// interfaceamento (URIT/BK-200): quando o listener chegar, só alimenta isto.
// SEM I/O — testável.

export interface HL7Analyte {
  code:     string | null
  name:     string
  value:    string
  unit:     string | null
  ref_text: string | null
  ref_low:  number | null
  ref_high: number | null
  flag:     'H' | 'L' | 'N' | 'A' | null
}

/** Dado encapsulado (ED) do HL7: histograma/scattergram do analisador. */
export interface HL7Graph {
  code:     string | null   // OBX-3 (identifica a curva; ex.: WBCHisto, S0_S90Scattergram)
  name:     string | null
  mime:     string | null   // ex.: image/png
  encoding: string | null   // ex.: Base64
  source:   string | null   // aplicação de origem (ED-1); ex.: 5190Vet
  data:     string          // payload cru (base64)
}

export interface HL7Result {
  panel:     string | null
  /** OBR-3 (Filler/Placer Order Number) — é ONDE o URIT BH-5100 põe o nº da amostra. */
  sample_id: string | null
  /** OBR-4 / MSH-4 — identificação do aparelho. */
  device:    string | null
  /** OBR-7 (Observation Date/Time) em ISO, quando parseável. */
  observed_at: string | null
  /** OBR-15 (Specimen Source) — o BK-200 manda "soro". Vira o "Material" do laudo. */
  specimen: string | null
  analytes:  HL7Analyte[]
  graphs:    HL7Graph[]
}

/**
 * Faixa de referencia do OBX-7. Dois separadores no mundo real:
 * o URIT BH-5100 escreve `6.0-17.0`; o BIOBASE BK-200 (Serium 200) escreve
 * `0.5~1.5`. Sem o til, toda faixa da bioquimica virava texto solto e o laudo
 * saia sem valor de referencia.
 */
function parseRange(ref: string | undefined): { low: number | null; high: number | null } {
  if (!ref) return { low: null, high: null }
  const m = ref.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[-~]\s*(-?\d+(?:[.,]\d+)?)\s*$/)
  if (!m) return { low: null, high: null }
  return { low: parseFloat(m[1].replace(',', '.')), high: parseFloat(m[2].replace(',', '.')) }
}

/** Deriva a flag H/L/N a partir do valor numérico e da faixa (quando não vier). */
export function flagFromValue(value: string, low: number | null, high: number | null): 'H' | 'L' | 'N' | null {
  const v = parseFloat(String(value).replace(',', '.'))
  if (!Number.isFinite(v) || low === null || high === null) return null
  if (v < low) return 'L'
  if (v > high) return 'H'
  return 'N'
}

const normFlag = (f: string | undefined): HL7Analyte['flag'] => {
  const x = (f ?? '').trim().toUpperCase()
  if (x === 'H' || x === 'HH' || x === '>') return 'H'
  if (x === 'L' || x === 'LL' || x === '<') return 'L'
  if (x === 'N') return 'N'
  if (x === 'A' || x === 'AA') return 'A'
  return null
}

/**
 * OBX-5 tipo ED (Encapsulated Data). Forma HL7 canônica, 5 componentes:
 *   sourceApplication ^ typeOfData ^ dataSubtype ^ encoding ^ data
 * O URIT BH-5100 manda `5190Vet^Image^PNG^Base64^iVBORw0KGgo...` → image/png.
 * Tolera a forma curta de 4 componentes (sem sourceApplication).
 */
export function parseEncapsulatedData(raw: string, code: string | null, name: string | null): HL7Graph | null {
  const parts = String(raw ?? '').split('^')
  let source: string | null = null
  let typeOfData: string | null = null
  let subtype: string | null = null
  let encoding: string | null = null
  let data = ''

  if (parts.length >= 5) {
    ;[source, typeOfData, subtype, encoding] = [parts[0] || null, parts[1] || null, parts[2] || null, parts[3] || null]
    data = parts.slice(4).join('^')
  } else if (parts.length === 4) {
    ;[typeOfData, subtype, encoding] = [parts[0] || null, parts[1] || null, parts[2] || null]
    data = parts[3] ?? ''
  } else {
    data = parts[parts.length - 1] ?? ''
  }

  const mime = typeOfData && subtype
    ? `${typeOfData}/${subtype}`.toLowerCase()
    : (subtype || typeOfData || null)

  const clean = (data ?? '').trim()
  if (!clean) return null
  return { code, name, mime, encoding, source, data: clean }
}

/** `data:` URI pronto para <img src>. Null se o payload não for base64 utilizável. */
export function graphDataUri(g: Pick<HL7Graph, 'mime' | 'encoding' | 'data'>): string | null {
  if (!g?.data) return null
  const enc = (g.encoding ?? 'Base64').toLowerCase()
  if (enc !== 'base64') return null
  const mime = (g.mime ?? '').toLowerCase()
  // Só libera tipos de imagem conhecidos — nada de data: URI arbitrária no laudo.
  const safe = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp', 'image/webp']
  const use = safe.includes(mime) ? mime : sniffImageMime(g.data)
  if (!use) return null
  return `data:${use};base64,${g.data}`
}

/** Descobre o tipo da imagem pelo começo do base64 (o cabeçalho ED às vezes mente). */
export function sniffImageMime(b64: string): string | null {
  const s = String(b64 ?? '').trim()
  if (s.startsWith('iVBORw0KGgo')) return 'image/png'   // \x89PNG
  if (s.startsWith('Qk')) return 'image/bmp'            // BM
  if (s.startsWith('/9j/')) return 'image/jpeg'         // JFIF
  if (s.startsWith('R0lGOD')) return 'image/gif'
  return null
}

/**
 * Devolve o HL7 sem os payloads base64 dos OBX tipo ED. Uma mensagem real do
 * URIT BH-5100 tem ~46 KB só de gráficos; guardar isso em `raw_hl7` de cada
 * analito estouraria a tabela. A versão enxuta preserva a rastreabilidade
 * (todos os segmentos e o cabeçalho de cada ED) em ~2 KB.
 */
export function stripEncapsulatedData(message: string): string {
  return String(message ?? '').split(/(\r\n|\r|\n)/).map(part => {
    if (!part.startsWith('OBX')) return part
    const f = part.split('|')
    if ((f[2] ?? '').trim().toUpperCase() !== 'ED') return part
    const parts = (f[5] ?? '').split('^')
    if (parts.length < 2) return part
    const payload = parts[parts.length - 1] ?? ''
    parts[parts.length - 1] = `<${payload.length} bytes base64 omitidos>`
    f[5] = parts.join('^')
    return f.join('|')
  }).join('')
}

/** HL7 TS (AAAAMMDDHHMMSS) → ISO local. Retorna null se não parsear. */
export function parseHL7Timestamp(ts: string | undefined | null): string | null {
  const m = String(ts ?? '').trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/)
  if (!m) return null
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = m
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}`
  return Number.isNaN(Date.parse(iso)) ? null : iso
}

export function parseHL7ORU(message: string): HL7Result | { error: string } {
  if (!message || !/(^|\r|\n)MSH\|/.test(message)) return { error: 'Mensagem HL7 inválida (sem MSH).' }
  const segments = message.split(/\r\n|\r|\n/).map(s => s.trim()).filter(Boolean)

  let panel: string | null = null
  let sample_id: string | null = null
  let device: string | null = null
  let observed_at: string | null = null
  let specimen: string | null = null
  const analytes: HL7Analyte[] = []
  const graphs: HL7Graph[] = []

  for (const seg of segments) {
    const f = seg.split('|')
    const type = f[0]
    if (type === 'MSH') {
      // MSH-3 (sending application) vem vazio no URIT BH-5100; o aparelho é o MSH-4.
      device = device || (f[2] || '').trim() || (f[3] || '').trim() || null
    } else if (type === 'OBR') {
      // Universal Service ID no campo 4: code^name^system
      const svc = (f[4] ?? '').split('^')
      panel = (svc[1] || svc[0] || null) || panel
      // OBR-3 = nº da amostra no URIT BH-5100 (manual do fabricante: BAR101010101).
      sample_id = sample_id || ((f[3] ?? '').split('^')[0] || '').trim() || null
      device = ((svc[1] || svc[0] || '').trim() || null) ?? device
      observed_at = observed_at || parseHL7Timestamp(f[7])
      specimen = specimen || ((f[15] ?? '').split('^')[0] || '').trim() || null
    } else if (type === 'OBX') {
      const valueType = (f[2] ?? '').trim().toUpperCase()
      const obsId = (f[3] ?? '').split('^')
      // Dois layouts de fabricante:
      //  • URIT BH-5100  → OBX-3 = `WBC` (codigo legivel), OBX-4 vazio;
      //  • BIOBASE BK-200 → OBX-3 = `344` (id interno) e OBX-4 = `CREAT`.
      // Sem tratar o segundo, o analito entrava no banco como codigo "344",
      // nao batia com de-para nenhum e a bioquimica saia sem rotulo.
      const subId = (f[4] ?? '').trim()
      const usaSubId = /^\d+$/.test(obsId[0] ?? '') && subId !== '' && !/^\d+$/.test(subId)
      const code = (usaSubId ? subId : obsId[0]) || null
      const name = (usaSubId ? subId : (obsId[1] || obsId[0])) || 'Analito'

      // ED = Encapsulated Data (histograma/scattergram). OBX-5:
      // "sourceApp^typeOfData^dataSubtype^encoding^data" (o formato exato varia
      // por fabricante; capturamos mime/encoding/payload cru para render futuro).
      if (valueType === 'ED') {
        const g = parseEncapsulatedData(f[5] ?? '', code, obsId[1] || null)
        if (g) graphs.push(g)
        continue
      }

      const value = (f[5] ?? '').trim()
      if (!value) continue
      const unit = (f[6] ?? '').trim() || null
      const ref = (f[7] ?? '').trim() || null
      const { low, high } = parseRange(ref ?? undefined)
      const flag = normFlag(f[8]) ?? flagFromValue(value, low, high)
      analytes.push({ code, name, value, unit, ref_text: ref, ref_low: low, ref_high: high, flag })
    }
  }

  return { panel, sample_id, device, observed_at, specimen, analytes, graphs }
}
