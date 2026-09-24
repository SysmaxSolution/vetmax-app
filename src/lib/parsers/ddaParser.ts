// Parser do DDA (Débito Direto Autorizado) — lista de boletos emitidos contra o
// CNPJ da clínica. v1: CSV genérico com aliases PT (cada banco/portal exporta com
// nomes próprios). CNAB/varredura DDA específicos plugam depois. Client-side.

import type { DdaBoleto } from '@/lib/actions/pagfor'

type Field = Exclude<keyof DdaBoleto, 'raw'>

const ALIASES: Record<Field, string[]> = {
  barcode:         ['codigo_barras', 'codigo de barras', 'linha_digitavel', 'linha digitavel', 'codbarras', 'codigo', 'barcode'],
  beneficiary:     ['beneficiario', 'favorecido', 'fornecedor', 'cedente', 'razao_social', 'razao social', 'nome', 'beneficiary'],
  beneficiary_doc: ['cnpj', 'cpf', 'cnpj_cpf', 'cnpj/cpf', 'documento_beneficiario', 'cnpj_favorecido'],
  amount:          ['valor', 'valor_documento', 'valor_titulo', 'valor do documento', 'amount'],
  due_date:        ['vencimento', 'data_vencimento', 'data de vencimento', 'dt_vencimento', 'due_date'],
  document:        ['documento', 'nota', 'nf', 'numero_documento', 'nosso_numero', 'seu_numero', 'num_documento', 'doc'],
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^"|"$/g, '').trim()
const toNum = (v: string | undefined): number | null => {
  if (v == null) return null
  const s = String(v).trim().replace(/[R$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}
const toDate = (v: string | undefined): string | null => {
  if (!v) return null
  const s = v.trim()
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);   if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}

export function parseDdaCsv(text: string): { rows: DdaBoleto[]; errors: string[] } {
  const errors: string[] = []
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { rows: [], errors: ['Arquivo sem linhas de dados.'] }
  const delim = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const header = lines[0].split(delim).map(norm)
  const col: Partial<Record<Field, number>> = {}
  ;(Object.keys(ALIASES) as Field[]).forEach(k => { col[k] = header.findIndex(h => ALIASES[k].includes(h)) })
  if (col.amount == null || col.amount < 0) errors.push('Coluna de valor não reconhecida.')

  const rows = lines.slice(1).map(line => {
    const cells = line.split(delim).map(v => v.trim().replace(/^"|"$/g, ''))
    const get = (k: Field) => (col[k] != null && col[k]! >= 0 ? cells[col[k]!] : undefined)
    return {
      barcode:         get('barcode')?.trim() || null,
      beneficiary:     get('beneficiary')?.trim() || null,
      beneficiary_doc: get('beneficiary_doc')?.trim() || null,
      amount:          toNum(get('amount')),
      due_date:        toDate(get('due_date')),
      document:        get('document')?.trim() || null,
      raw:             line,
    } as DdaBoleto
  }).filter(b => b.amount != null || b.barcode)
  if (!rows.length) errors.push('Nenhum boleto reconhecido.')
  return { rows, errors }
}
