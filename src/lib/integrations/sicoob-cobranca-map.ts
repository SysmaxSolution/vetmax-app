// Mapeadores PUROS da Cobrança Bancária Sicoob (v3): domínio interno → payload
// da API, e resposta da API → nosso registro. Sem I/O — testável isoladamente.

export interface BoletoInput {
  seuNumero: string            // nº interno (ex.: OS-1001)
  valor: number                // R$
  dataVencimento: string       // YYYY-MM-DD
  dataEmissao?: string         // YYYY-MM-DD (default: hoje via caller)
  especie?: string             // codigoEspecieDocumento (default DM)
  numeroParcela?: number
  multaPercent?: number        // % de multa após vencimento (0 = sem)
  jurosMesPercent?: number     // % de juros ao mês (0 = sem)
  descontoValor?: number       // desconto até a 1ª data
  descontoData?: string        // YYYY-MM-DD
  mensagens?: string[]         // instruções impressas no boleto
  pagador: {
    cpfCnpj: string
    nome: string
    endereco: string
    bairro: string
    cidade: string
    cep: string
    uf: string
    email?: string
  }
}

export interface SicoobBoletoConfig {
  numeroCliente: number
  numeroContaCorrente: number
  codigoModalidade: number     // 1 = simples com registro
}

const onlyDigits = (s: string) => (s ?? '').replace(/\D/g, '')

/** Monta o corpo do POST /boletos a partir do domínio interno. */
export function buildBoletoPayload(cfg: SicoobBoletoConfig, b: BoletoInput): Record<string, unknown> {
  const multa = b.multaPercent && b.multaPercent > 0
  const juros = b.jurosMesPercent && b.jurosMesPercent > 0
  const desc = b.descontoValor && b.descontoValor > 0 && b.descontoData
  return {
    numeroCliente: cfg.numeroCliente,
    codigoModalidade: cfg.codigoModalidade,
    numeroContaCorrente: cfg.numeroContaCorrente,
    codigoEspecieDocumento: b.especie ?? 'DM',
    dataEmissao: b.dataEmissao,
    seuNumero: b.seuNumero,
    valor: Number(b.valor.toFixed(2)),
    dataVencimento: b.dataVencimento,
    numeroParcela: b.numeroParcela ?? 1,
    // multa: 0 dispensar, 2 percentual
    tipoMulta: multa ? 2 : 0,
    ...(multa ? { valorMulta: Number(b.multaPercent!.toFixed(2)) } : {}),
    // juros: 3 isento, 2 taxa mensal (%)
    tipoJurosMora: juros ? 2 : 3,
    ...(juros ? { valorJurosMora: Number(b.jurosMesPercent!.toFixed(2)) } : {}),
    // desconto: 0 sem, 1 valor fixo até a data
    tipoDesconto: desc ? 1 : 0,
    ...(desc ? { dataPrimeiroDesconto: b.descontoData, valorPrimeiroDesconto: Number(b.descontoValor!.toFixed(2)) } : {}),
    gerarPdf: true,
    pagador: {
      numeroCpfCnpj: onlyDigits(b.pagador.cpfCnpj),
      nome: b.pagador.nome,
      endereco: b.pagador.endereco,
      bairro: b.pagador.bairro,
      cidade: b.pagador.cidade,
      cep: onlyDigits(b.pagador.cep),
      uf: (b.pagador.uf ?? '').toUpperCase().slice(0, 2),
      ...(b.pagador.email ? { email: b.pagador.email } : {}),
    },
    ...(b.mensagens && b.mensagens.length ? { mensagensInstrucao: b.mensagens.slice(0, 5) } : {}),
  }
}

export interface BoletoResult {
  nossoNumero: string | null
  linhaDigitavel: string | null
  codigoBarras: string | null
  pixCopiaECola: string | null
  pdfBase64: string | null
}

/** Extrai os campos úteis da resposta do Sicoob (tolerante ao envelope). */
export function parseBoletoResponse(json: unknown): BoletoResult {
  const j = (json ?? {}) as Record<string, any>
  const r = (j.resultado ?? j) as Record<string, any>
  const str = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v))
  return {
    nossoNumero: str(r.nossoNumero),
    linhaDigitavel: str(r.linhaDigitavel),
    codigoBarras: str(r.codigoBarras),
    pixCopiaECola: str(r.pixCopiaECola ?? r.qrCode),
    pdfBase64: str(r.pdfBoleto ?? r.pdf),
  }
}
