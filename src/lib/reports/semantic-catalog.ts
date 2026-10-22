// Semantic layer do "Relatório Inteligente" (item 1.c). A IA NUNCA gera SQL nem
// calcula números — apenas traduz o pedido em uma SPEC validada contra ESTE
// catálogo curado. O backend monta a consulta determinística. SEM I/O aqui.

export const METRICS = {
  faturamento: { label: 'Faturamento', kind: 'sum' as const, money: true },
  n_titulos:   { label: 'Nº de títulos', kind: 'count' as const, money: false },
}
export type MetricKey = keyof typeof METRICS

export const DIMENSIONS = {
  month:          { label: 'Mês' },
  category:       { label: 'Categoria' },
  payment_method: { label: 'Forma de pagamento' },
  company:        { label: 'Empresa (CNPJ)' },
  tutor:          { label: 'Cliente' },
}
export type DimensionKey = keyof typeof DIMENSIONS

export interface ReportSpec {
  metric:    MetricKey
  dimension: DimensionKey
  from:      string   // AAAA-MM-DD
  to:        string   // AAAA-MM-DD
  filters?:  { category?: string; payment_method?: string }
}

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

/** Valida a SPEC da IA contra o catálogo. Rejeita tudo fora do allowlist. */
export function validateSpec(raw: any): ReportSpec | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Especificação inválida.' }
  if (!(raw.metric in METRICS))       return { error: `Métrica não suportada: ${raw.metric}` }
  if (!(raw.dimension in DIMENSIONS))  return { error: `Dimensão não suportada: ${raw.dimension}` }
  if (!isDate(raw.from) || !isDate(raw.to)) return { error: 'Período (from/to) inválido.' }
  if (raw.from > raw.to) return { error: 'Data inicial maior que a final.' }
  const filters: { category?: string; payment_method?: string } = {}
  if (raw.filters && typeof raw.filters === 'object') {
    if (typeof raw.filters.category === 'string' && raw.filters.category.trim()) filters.category = raw.filters.category.trim()
    if (typeof raw.filters.payment_method === 'string' && raw.filters.payment_method.trim()) filters.payment_method = raw.filters.payment_method.trim()
  }
  return { metric: raw.metric, dimension: raw.dimension, from: raw.from, to: raw.to, filters }
}

const PM_LABEL: Record<string, string> = {
  cash: 'Dinheiro', pix: 'PIX', credit: 'Cartão de crédito', debit: 'Cartão de débito',
  credit_balance: 'Crédito do cliente', transfer: 'Transferência', boleto: 'Boleto', voucher: 'Voucher', convenio: 'Convênio', other: 'Outro',
}

export interface RowMaps { companyName: Map<string, string>; tutorName: Map<string, string> }

/** Extrai {chave,rótulo} de um lançamento para a dimensão escolhida. Puro. */
export function dimensionValue(dim: DimensionKey, row: any, maps: RowMaps): { key: string; label: string } {
  switch (dim) {
    case 'month': { const mo = String(row.payment_date ?? '').slice(0, 7); return { key: mo, label: mo } }
    case 'category': { const c = row.category ?? '—'; return { key: c, label: c === '—' ? 'Sem categoria' : c } }
    case 'payment_method': { const pm = row.payment_method ?? '—'; return { key: pm, label: PM_LABEL[pm] ?? pm } }
    case 'company': { const cid = row.company_id ?? '—'; return { key: cid, label: cid === '—' ? 'Sem empresa' : (maps.companyName.get(cid) ?? 'Empresa') } }
    case 'tutor': { const tid = row.tutor_id ?? '—'; return { key: tid, label: tid === '—' ? 'Sem cliente' : (maps.tutorName.get(tid) ?? 'Cliente') } }
  }
}

/** Descrição textual do catálogo para o prompt da IA (fonte da verdade única). */
export function catalogPromptSummary(): string {
  const metrics = Object.entries(METRICS).map(([k, v]) => `${k} (${v.label})`).join(', ')
  const dims = Object.entries(DIMENSIONS).map(([k, v]) => `${k} (${v.label})`).join(', ')
  return `Métricas: ${metrics}. Dimensões: ${dims}. Filtros opcionais: category, payment_method.`
}
