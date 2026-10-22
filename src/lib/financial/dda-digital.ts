// Identidade de um boleto do DDA, para a importação não duplicar.
//
// Mesma lição de `extrato-digital.ts`, que nasceu de um estrago medido em
// produção: 150 linhas em `bank_statements` com 43 grupos duplicados, porque
// consultar o mesmo período duas vezes criava cópias — inclusive de lançamento
// já conciliado. Aqui o risco é idêntico: a Bruna consulta o DDA, é
// interrompida, volta e consulta de novo.
//
// A ordem de preferência não é estética. É da chave mais forte para a mais
// fraca:
//
//   1. `numeroIdentificadorBoletoCip` — o id do boleto na CIP. Único de
//      verdade, atribuído pelo sistema de compensação. Idempotência perfeita.
//   2. `numeroCodigoBarras` — chave natural do boleto. Dois boletos diferentes
//      não compartilham código de barras.
//   3. hash do conteúdo — só para importação por arquivo (CSV), onde não vem
//      nem CIP nem, às vezes, código de barras.

import { createHash } from 'node:crypto'

export interface BoletoParaDigital {
  barcode?:         string | null
  beneficiary?:     string | null
  beneficiary_doc?: string | null
  amount?:          number | null
  due_date?:        string | null
  document?:        string | null
  /** Resposta crua do banco — é de onde sai o identificador da CIP. */
  raw?:             string | Record<string, unknown> | null
}

function cru(b: BoletoParaDigital): Record<string, unknown> {
  if (!b.raw) return {}
  if (typeof b.raw === 'string') {
    try { return JSON.parse(b.raw) as Record<string, unknown> } catch { return {} }
  }
  return b.raw
}

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/**
 * Digital de um boleto. Estável entre consultas do mesmo período.
 *
 * Recebe `clinicId` para que a digital nunca colida entre clínicas, mesmo que
 * o índice único já as separe — assim a função serve também para comparar
 * listas em memória.
 */
export function digitalDoBoleto(clinicId: string, b: BoletoParaDigital): string {
  const r = cru(b)

  const cip = soDigitos(r.numeroIdentificadorBoletoCip ?? r.identificadorBoletoCip)
  if (cip) return `cip:${cip}`

  const cb = soDigitos(b.barcode ?? r.numeroCodigoBarras ?? r.codigoBarras)
  if (cb.length >= 44) return `cb:${cb}`

  // Último recurso: conteúdo. Inclui a clínica para não cruzar com outra base.
  const h = createHash('md5').update([
    clinicId,
    soDigitos(b.beneficiary_doc),
    (b.beneficiary ?? '').trim().toUpperCase(),
    Number(b.amount ?? 0).toFixed(2),
    b.due_date ?? '',
    b.document ?? '',
  ].join('|')).digest('hex')
  return `h:${h}`
}

/** Digitais de um lote, na mesma ordem. */
export function digitaisDoLote(clinicId: string, boletos: BoletoParaDigital[]): string[] {
  return boletos.map(b => digitalDoBoleto(clinicId, b))
}
