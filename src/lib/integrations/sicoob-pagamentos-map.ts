// Mapeadores PUROS da API Sicoob Pagamentos v3 (DDA + pagamento de boletos).
// Sem I/O — testável. Fonte: collection Postman "API Cobrança Bancária Pagamentos".

export interface DdaBoletoLike {
  barcode: string | null
  beneficiary: string | null
  beneficiary_doc: string | null
  amount: number | null
  due_date: string | null
  document: string | null
  raw: string
}

const str = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v))
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null }
const toISO = (v: unknown): string | null => {
  const s = String(v ?? '').trim(); if (!s) return null
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return s.slice(0, 10)
}

/** Extrai a lista de boletos de várias formas de envelope da resposta do DDA. */
export function extractDdaList(json: unknown): Record<string, unknown>[] {
  const j = (json ?? {}) as Record<string, any>
  const cand = j.resultado ?? j.boletos ?? j.data ?? j
  if (Array.isArray(cand)) return cand as Record<string, unknown>[]
  if (Array.isArray(cand?.boletos)) return cand.boletos
  if (Array.isArray(cand?.itens)) return cand.itens
  return []
}

/** Converte um item de DDA do Sicoob para o formato interno DdaBoleto. */
export function mapDdaBoleto(item: Record<string, unknown>): DdaBoletoLike {
  const g = (...keys: string[]) => { for (const k of keys) { if (item[k] !== undefined && item[k] !== null && item[k] !== '') return item[k] } return null }
  return {
    barcode: str(g('numeroCodigoBarras', 'linhaDigitavel', 'codigoBarras', 'codigoDeBarras')),
    beneficiary: str(g('nomeRazaoSocialBeneficiario', 'nomeBeneficiario', 'nomeCedente', 'beneficiario', 'razaoSocialBeneficiario')),
    beneficiary_doc: str(g('numeroCpfCnpjBeneficiario', 'cpfCnpjBeneficiario', 'numeroCpfCnpjCedente', 'documentoBeneficiario')),
    amount: num(g('valorBoleto', 'valor', 'valorNominal', 'valorTitulo')),
    due_date: toISO(g('dataVencimentoBoleto', 'dataVencimento', 'vencimento', 'dataVencimentoTitulo')),
    document: str(g('numeroDocumento', 'numeroNossoNumero', 'seuNumero', 'nossoNumero')),
    raw: JSON.stringify(item),
  }
}

export function mapDdaResponse(json: unknown): DdaBoletoLike[] {
  return extractDdaList(json).map(mapDdaBoleto)
}

// ─── Pagamento / agendamento ─────────────────────────────────────────────────
export interface DebtorAccount { agencia: number; conta: number; accountType?: number; personType?: number }
export interface PagamentoInput {
  identificadorConsulta: string    // hash retornado pela consulta do boleto
  valor: number
  descontoAbatimento?: number
  multaMora?: number
  observacao?: string
  aceitaValorDivergente?: boolean
  pagadorCpfCnpj?: string
  pagadorNome?: string
  dataPagamento: string            // YYYY-MM-DD (agendamento)
  conta: DebtorAccount
}

/** Monta o corpo do POST /boletos/pagamentos/:codigoBarras. */
export function buildPagamentoPayload(p: PagamentoInput): Record<string, unknown> {
  return {
    identificadorConsulta: p.identificadorConsulta,
    valorBoleto: Number(p.valor.toFixed(2)),
    valorDescontoAbatimento: Number((p.descontoAbatimento ?? 0).toFixed(2)),
    valorMultaMora: Number((p.multaMora ?? 0).toFixed(2)),
    descricaoObservacao: p.observacao ?? '',
    aceitaValorDivergente: p.aceitaValorDivergente ?? false,
    numeroCpfCnpjPortador: (p.pagadorCpfCnpj ?? '').replace(/\D/g, ''),
    nomePortador: p.pagadorNome ?? '',
    amount: Number(p.valor.toFixed(2)),
    date: p.dataPagamento,
    debtorAccount: {
      issuer: p.conta.agencia,
      number: p.conta.conta,
      accountType: p.conta.accountType ?? 0,
      personType: p.conta.personType ?? 0,
    },
  }
}
