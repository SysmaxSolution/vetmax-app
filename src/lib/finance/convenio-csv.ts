// Parser PURO de demonstrativo de convênio em CSV, com mapeamento configurável
// de colunas → campos internos. Prepara o 1.9 (conferência AVA): quando o
// convênio enviar o arquivo, basta apontar as colunas — sem novo parser.

export type ConvenioField =
  | 'externalId' | 'serviceDate' | 'tutorName' | 'petName' | 'procedureName'
  | 'repassValue' | 'coparticipationValue' | 'veterinarian' | 'microchip' | 'planName'

export type ColumnMapping = Partial<Record<ConvenioField, string>>  // campo → cabeçalho da coluna

export interface ConvenioLine {
  external_appointment_id: string
  service_date: string
  tutor_name_raw: string | null
  pet_name_raw: string | null
  procedure_name_raw: string | null
  veterinarian_raw: string | null
  microchip_raw: string | null
  plan_name_raw: string | null
  repass_value: number
  coparticipation_value: number
}

/** Divide uma linha CSV respeitando aspas e o separador informado. */
export function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ } else inQuotes = !inQuotes
    } else if (ch === sep && !inQuotes) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out.map(s => s.trim())
}

/** Detecta o separador mais provável (';' comum no Brasil, senão ','). */
export function detectSeparator(headerLine: string): string {
  return (headerLine.split(';').length >= headerLine.split(',').length) ? ';' : ','
}

/** Converte valor monetário BR/US → number. */
export function parseMoney(v: string | undefined | null): number {
  if (v == null) return 0
  let s = String(v).replace(/[R$\s]/g, '')
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')       // 1.234,56
  else if (s.includes(',')) s = s.replace(',', '.')                                          // 1234,56
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

/** Normaliza data para ISO yyyy-mm-dd (aceita dd/mm/yyyy e yyyy-mm-dd). */
export function parseDateISO(v: string | undefined | null): string {
  const s = String(v ?? '').trim()
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);   if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return s.slice(0, 10)
}

export interface ParsedConvenio { headers: string[]; lines: ConvenioLine[] }

/**
 * Lê o CSV e aplica o mapeamento. Se `mapping` for omitido, só retorna os
 * cabeçalhos (para a UI oferecer o de-para de colunas).
 */
export function parseConvenioCsv(text: string, mapping?: ColumnMapping): ParsedConvenio | { error: string } {
  const rows = text.split(/\r\n|\r|\n/).filter(r => r.trim().length > 0)
  if (rows.length < 1) return { error: 'Arquivo vazio.' }
  const sep = detectSeparator(rows[0])
  const headers = splitCsvLine(rows[0], sep)
  if (!mapping) return { headers, lines: [] }

  const idx = (field: ConvenioField): number => {
    const col = mapping[field]; if (!col) return -1
    return headers.findIndex(h => h.toLowerCase() === col.toLowerCase())
  }
  const cols: Record<ConvenioField, number> = {
    externalId: idx('externalId'), serviceDate: idx('serviceDate'), tutorName: idx('tutorName'),
    petName: idx('petName'), procedureName: idx('procedureName'), repassValue: idx('repassValue'),
    coparticipationValue: idx('coparticipationValue'), veterinarian: idx('veterinarian'),
    microchip: idx('microchip'), planName: idx('planName'),
  }
  if (cols.repassValue < 0) return { error: 'Mapeie ao menos a coluna de valor de repasse.' }

  const get = (arr: string[], i: number) => (i >= 0 && i < arr.length ? arr[i] : '')
  const lines: ConvenioLine[] = []
  for (let r = 1; r < rows.length; r++) {
    const c = splitCsvLine(rows[r], sep)
    if (c.every(x => x === '')) continue
    lines.push({
      external_appointment_id: get(c, cols.externalId) || `L${r}`,
      service_date: parseDateISO(get(c, cols.serviceDate)),
      tutor_name_raw: get(c, cols.tutorName) || null,
      pet_name_raw: get(c, cols.petName) || null,
      procedure_name_raw: get(c, cols.procedureName) || null,
      veterinarian_raw: get(c, cols.veterinarian) || null,
      microchip_raw: get(c, cols.microchip) || null,
      plan_name_raw: get(c, cols.planName) || null,
      repass_value: parseMoney(get(c, cols.repassValue)),
      coparticipation_value: parseMoney(get(c, cols.coparticipationValue)),
    })
  }
  return { headers, lines }
}
