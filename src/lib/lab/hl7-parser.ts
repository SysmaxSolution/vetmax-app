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
  code:     string | null   // OBX-3 (identifica a curva; ex.: código proprietário)
  name:     string | null
  mime:     string | null   // ex.: application/octet-stream
  encoding: string | null   // ex.: Base64
  data:     string          // payload cru (base64) — renderização é passo futuro
}

export interface HL7Result {
  panel:    string | null
  analytes: HL7Analyte[]
  graphs:   HL7Graph[]
}

function parseRange(ref: string | undefined): { low: number | null; high: number | null } {
  if (!ref) return { low: null, high: null }
  const m = ref.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*-\s*(-?\d+(?:[.,]\d+)?)\s*$/)
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

export function parseHL7ORU(message: string): HL7Result | { error: string } {
  if (!message || !/(^|\r|\n)MSH\|/.test(message)) return { error: 'Mensagem HL7 inválida (sem MSH).' }
  const segments = message.split(/\r\n|\r|\n/).map(s => s.trim()).filter(Boolean)

  let panel: string | null = null
  const analytes: HL7Analyte[] = []
  const graphs: HL7Graph[] = []

  for (const seg of segments) {
    const f = seg.split('|')
    const type = f[0]
    if (type === 'OBR') {
      // Universal Service ID no campo 4: code^name^system
      const svc = (f[4] ?? '').split('^')
      panel = (svc[1] || svc[0] || null) || panel
    } else if (type === 'OBX') {
      const valueType = (f[2] ?? '').trim().toUpperCase()
      const obsId = (f[3] ?? '').split('^')
      const code = obsId[0] || null
      const name = obsId[1] || obsId[0] || 'Analito'

      // ED = Encapsulated Data (histograma/scattergram). OBX-5:
      // "sourceApp^typeOfData^dataSubtype^encoding^data" (o formato exato varia
      // por fabricante; capturamos mime/encoding/payload cru para render futuro).
      if (valueType === 'ED') {
        const parts = (f[5] ?? '').split('^')
        const encoding = parts.length >= 4 ? (parts[parts.length - 2] || null) : (parts[2] || null)
        const dataRaw = parts.length >= 4 ? parts[parts.length - 1] : (parts[3] ?? parts[parts.length - 1] ?? '')
        const mime = parts[1] ? (parts[0] ? `${parts[0]}/${parts[1]}` : parts[1]) : (parts[0] || null)
        const data = (dataRaw ?? '').trim()
        if (data) graphs.push({ code, name: obsId[1] || null, mime, encoding, data })
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

  return { panel, analytes, graphs }
}
