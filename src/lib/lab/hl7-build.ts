// Construção de mensagens HL7 de resposta do LIS (agente-ponte): ACK e DSR^Q03
// (worklist — devolve ao aparelho os exames a dosar da amostra). Puro/testável.

const SEP = '\r'

/** Extrai o Message Control ID (MSH-10) de uma mensagem recebida. */
export function messageControlId(message: string): string {
  const msh = message.split(/\r\n|\r|\n/).find(s => s.startsWith('MSH'))
  if (!msh) return '1'
  const f = msh.split('|')
  return f[9] || '1'
}

/** Extrai o código de barras da amostra de uma mensagem QRY (QRD-8). */
export function parseQryBarcode(message: string): string | null {
  const qrd = message.split(/\r\n|\r|\n/).find(s => s.startsWith('QRD'))
  if (!qrd) return null
  const f = qrd.split('|')
  // QRD-8 = Who Subject Filter (id da amostra/paciente). Fallback: 1º campo com dígitos.
  const cand = (f[8] ?? '').split('^')[0].trim()
  if (cand) return cand
  for (let i = f.length - 1; i >= 1; i--) { const v = (f[i] ?? '').trim(); if (/\d/.test(v)) return v.split('^')[0] }
  return null
}

function msh(type: string, controlId: string, sendingApp = 'SYSVETMAX'): string {
  const ts = '00000000000000' // o agente carimba a data real ao enviar
  return `MSH|^~\\&|${sendingApp}|LIS|ANALYZER|LAB|${ts}||${type}|${controlId}|P|2.3.1`
}

/** ACK de aceitação (AA) para uma mensagem recebida (ex.: ORU). */
export function buildAck(controlId: string, code: 'AA' | 'AE' | 'AR' = 'AA', textMessage = ''): string {
  return [msh('ACK', controlId), `MSA|${code}|${controlId}${textMessage ? '|' + textMessage : ''}`].join(SEP)
}

export interface WorklistSample {
  barcode:      string
  patient_name?: string | null
  species?:     string | null
  exams:        { code?: string | null; name: string }[]
}

/**
 * DSR^Q03 — resposta à consulta de amostra (QRY^Q02). Devolve os exames a dosar.
 * Estrutura: MSH, MSA, QAK, e um DSP por exame (barcode + item obrigatórios).
 * O formato fino de DSP é ajustado por aparelho na instalação.
 */
export function buildDsr(controlId: string, sample: WorklistSample): string {
  const lines = [
    msh('DSR^Q03', controlId),
    `MSA|AA|${controlId}`,
    `QAK|${controlId}|OK`,
  ]
  const label = sample.patient_name ?? ''
  sample.exams.forEach((ex, i) => {
    // DSP: display data — inclui barcode, item nº e nome do exame
    lines.push(`DSP|${i + 1}||${sample.barcode}^${ex.code ?? ex.name}^${ex.name}^${label}`)
  })
  if (sample.exams.length === 0) {
    lines.push(`DSP|1||${sample.barcode}^^SEM_EXAMES^${label}`)
  }
  return lines.join(SEP)
}
