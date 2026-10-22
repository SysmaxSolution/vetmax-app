// Cliente REST da EvoluServices / FinPet.
//
// Duas APIs com autenticação diferente, e a diferença não é cosmética:
//
//   * Transação Remota (maquininha): `POST /remote/token` → JWT, que vai no
//     header com o nome **literal `Bearer`** — não `Authorization: Bearer`.
//     Isso é fora do padrão e é o tipo de detalhe que custa uma tarde.
//   * Link de Pagamento (Orders): BasicAuth comum, no header `Authorization`.
//
// MEDIDO NO SANDBOX EM 22/10/2026, não suposto:
//   * o campo que a doc chama de `apiKey` é a SENHA entregue por e-mail;
//   * o UUID entregue é o `merchantId` do corpo E o `merchantCode` da URL — o
//     mesmo valor serve nos dois lugares;
//   * o token é JWT com TTL de 7.948.800 s (92 dias) — a doc não publica isso;
//   * `POST /api/orders` responde `{uuid, payUrl, reference, status}`; a doc
//     descreve a requisição em detalhe e **não** documenta a resposta, e o campo
//     da URL é `payUrl`;
//   * o status inicial do link é `PENDING`, que não consta da tabela publicada.
//
// Este módulo é transporte puro: não lê banco, não escreve banco, não decide
// regra de negócio. As credenciais chegam por parâmetro, decifradas por quem
// chamou.

import { traduzirErro, type ErroTraduzido } from './evoluservices-erros'
import { valorParaLink, valorParaTransacaoRemota } from './evoluservices-valores'

export const BASE_SANDBOX = 'https://sandbox.evoluservices.com'
export const BASE_PRODUCAO = 'https://api.evoluservices.com'

export function baseDoAmbiente(ambiente: string | null | undefined): string {
  return ambiente === 'production' ? BASE_PRODUCAO : BASE_SANDBOX
}

/** Credenciais de um estabelecimento, já decifradas. */
export interface CredenciaisEvolu {
  base:        string
  /** Usuário da API (entregue por e-mail). */
  username:    string
  /** A senha entregue por e-mail — o que a doc chama de `apiKey`. */
  apiKey:      string
  /** UUID do estabelecimento: serve como `merchantId` e como `merchantCode`. */
  merchantId:  string
  /** BasicAuth do Link, quando a clínica recebeu um par diferente. */
  basicAuth?:  string | null
}

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroTraduzido }

const TEMPO_LIMITE = 20_000

async function requisitar(
  url: string,
  init: RequestInit,
): Promise<{ http: number; json: Record<string, unknown> | unknown[] | null; texto: string }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TEMPO_LIMITE)
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal })
    const texto = await r.text()
    let json: Record<string, unknown> | unknown[] | null = null
    try { json = JSON.parse(texto) } catch { /* resposta não-JSON */ }
    return { http: r.status, json, texto }
  } finally {
    clearTimeout(t)
  }
}

/**
 * Extrai o código de erro do corpo.
 *
 * ⚠️ Cuidado medido no sandbox em 22/10/2026: eles preenchem o campo `error`
 * **também no sucesso**. O cancelamento de link responde
 * `{"success":"true","error":"OK_MSG"}` — ou seja, a presença de `error` NÃO
 * significa falha. Quem manda é o campo `success`.
 *
 * Tratar `error` como sinal de falha faria o sistema dizer "não foi possível
 * cancelar" numa operação que deu certo.
 */
function codigoDoErro(json: unknown): string | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const obj = json as Record<string, unknown>

  // `success: "true"` manda: qualquer coisa em `error` é mensagem, não falha.
  const sucesso = String(obj.success ?? '').toLowerCase()
  if (sucesso === 'true') return null

  const e = obj.error
  if (typeof e !== 'string' || e.trim() === '') return null
  // Defesa extra: códigos de confirmação não são erro, qualquer que seja o
  // `success`. Eles já usam um ("OK_MSG") e podem criar outros.
  if (/^OK(_|$)/i.test(e.trim())) return null
  return e
}

// ─── Autenticação da Transação Remota ───────────────────────────────────────

export interface TokenEvolu {
  token: string
  /** Quando expira, lido do próprio JWT. Null se o token não for JWT. */
  expiraEm: Date | null
}

export async function obterToken(c: CredenciaisEvolu): Promise<Resultado<TokenEvolu>> {
  const { http, json } = await requisitar(`${c.base}/remote/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth: { username: c.username, apiKey: c.apiKey } }),
  })

  const obj = (json && !Array.isArray(json) ? json : {}) as Record<string, unknown>
  const token = (obj.Bearer ?? obj.bearer ?? obj.token) as string | undefined
  if (!token) return { ok: false, erro: traduzirErro(codigoDoErro(json), http) }

  // O TTL não é documentado, mas o token é JWT e o payload traz `exp`.
  let expiraEm: Date | null = null
  const partes = token.split('.')
  if (partes.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))
      if (payload?.exp) expiraEm = new Date(Number(payload.exp) * 1000)
    } catch { /* token opaco ou payload ilegível: segue sem expiração conhecida */ }
  }

  return { ok: true, dados: { token, expiraEm } }
}

/** Header da Transação Remota. O nome do header é `Bearer`, não `Authorization`. */
function headerRemoto(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'Bearer': token }
}

/**
 * Executa uma chamada da Transação Remota renovando o token sob 401.
 *
 * A doc lista `INVALID_TOKEN`, `EXPIRED_TOKEN` e `REVOKED_TOKEN` como 401 e
 * manda pedir novo token. Renovamos **uma** vez: se o segundo 401 vier, o
 * problema é credencial, não sessão, e insistir só atrasa o atendimento.
 */
async function comToken<T>(
  c: CredenciaisEvolu,
  tokenAtual: string | null,
  executar: (token: string) => Promise<{ http: number; json: unknown }>,
  interpretar: (json: unknown) => T,
): Promise<Resultado<T> & { tokenNovo?: TokenEvolu }> {
  let token = tokenAtual
  let tokenNovo: TokenEvolu | undefined

  if (!token) {
    const t = await obterToken(c)
    if (!t.ok) return t
    token = t.dados.token
    tokenNovo = t.dados
  }

  let r = await executar(token)
  if (r.http === 401) {
    const t = await obterToken(c)
    if (!t.ok) return t
    token = t.dados.token
    tokenNovo = t.dados
    r = await executar(token)
  }

  if (r.http >= 400 || codigoDoErro(r.json)) {
    return { ok: false, erro: traduzirErro(codigoDoErro(r.json), r.http), tokenNovo }
  }
  return { ok: true, dados: interpretar(r.json), tokenNovo }
}

// ─── Terminais ──────────────────────────────────────────────────────────────

export interface TerminalEvolu {
  terminalId:     string
  terminalStatus: string
  computerName:   string | null
  macAddress:     string | null
}

/**
 * Terminais aptos a receber transação remota.
 *
 * A doc manda conferir o status ANTES de criar a transação — e com razão: num
 * pinpad de cabo, `OFFLINE` normalmente significa que o computador da recepção
 * está desligado ou sem o programa aberto.
 *
 * Lista vazia não é erro: pode ser que o vínculo da máquina ainda não tenha
 * sido concluído no portal, ou que o programa instalado seja de outro ambiente
 * (o instalador de produção não registra terminal no sandbox).
 */
export async function listarTerminais(c: CredenciaisEvolu, token: string | null = null) {
  return comToken<TerminalEvolu[]>(
    c, token,
    t => requisitar(`${c.base}/remote/merchants/${encodeURIComponent(c.merchantId)}/terminals`,
                    { headers: headerRemoto(t) }),
    json => (Array.isArray(json) ? json : []).map((x: Record<string, unknown>) => ({
      terminalId:     String(x.terminalId ?? ''),
      terminalStatus: String(x.terminalStatus ?? 'UNKNOWN'),
      computerName:   (x.computerName as string | null) ?? null,
      macAddress:     (x.macAddress as string | null) ?? null,
    })),
  )
}

// ─── Beneficiários de split ─────────────────────────────────────────────────

export interface BeneficiarioEvolu {
  code:     string
  name:     string
  document: string
}

/**
 * Beneficiários aptos a receber split deste estabelecimento.
 *
 * Não há API para CRIAR beneficiário: o cadastro é por formulário no portal
 * deles, com duplo consentimento (o estabelecimento aceita o fornecedor e o
 * fornecedor aceita o vínculo). Esta chamada serve para a clínica escolher, no
 * cadastro do profissional, um código que de fato existe.
 */
export async function listarBeneficiarios(c: CredenciaisEvolu, token: string | null = null) {
  return comToken<BeneficiarioEvolu[]>(
    c, token,
    t => requisitar(`${c.base}/remote/merchants/${encodeURIComponent(c.merchantId)}/recipients`,
                    { headers: headerRemoto(t) }),
    json => (Array.isArray(json) ? json : []).map((x: Record<string, unknown>) => ({
      code:     String(x.code ?? ''),
      name:     String(x.name ?? ''),
      document: String(x.document ?? ''),
    })),
  )
}

// ─── Transação remota (a maquininha) ────────────────────────────────────────

export interface SplitEnvio {
  /** Código do beneficiário no portal deles. Texto: a doc valida `[0-9]+` mas
   *  os próprios exemplos dela usam alfanumérico. */
  code: string
  /** Em reais. A conversão para o formato do endpoint é feita aqui dentro. */
  valor: number
  /** Se a taxa incide sobre a parte do beneficiário. Omitido = `true` para eles. */
  chargeFees?: boolean
}

export interface TransacaoRemotaEnvio {
  /** Em reais. */
  valor:          number
  /** Sem ele a cobrança vira notificação nos aparelhos — o que não serve para
   *  pinpad de cabo, que não tem menu. Mande sempre que souber o terminal. */
  terminalId?:    string | null
  parcelas?:      number | null
  /** É o `paymentBrand` que define crédito × débito. Obrigatório se houver parcelas. */
  bandeira?:      string | null
  callbackUrl?:   string | null
  clienteNome?:   string | null
  clienteDocumento?: string | null
  clienteEmail?:  string | null
  clienteTelefone?: string | null
  /** Se o tutor pode mudar parcelas/bandeira na máquina. */
  permiteAlterar?: boolean
  splits?:        SplitEnvio[]
}

export interface TransacaoRemotaCriada {
  transactionId: string
}

export async function criarTransacaoRemota(
  c: CredenciaisEvolu,
  envio: TransacaoRemotaEnvio,
  token: string | null = null,
) {
  const corpo: Record<string, unknown> = {
    merchantId: c.merchantId,
    // Decimal com ponto e 2 casas: a validação deles é `\d+\.\d{2}`.
    value: valorParaTransacaoRemota(envio.valor),
  }
  if (envio.terminalId)        corpo.terminalId = envio.terminalId
  if (envio.parcelas)          corpo.installments = envio.parcelas
  if (envio.bandeira)          corpo.paymentBrand = envio.bandeira
  if (envio.callbackUrl)       corpo.callbackUrl = envio.callbackUrl
  if (envio.clienteNome)       corpo.clientName = envio.clienteNome
  if (envio.clienteDocumento)  corpo.clientDocument = envio.clienteDocumento.replace(/\D/g, '')
  if (envio.clienteEmail)      corpo.clientEmail = envio.clienteEmail
  if (envio.clienteTelefone)   corpo.clientPhone = envio.clienteTelefone
  if (envio.permiteAlterar !== undefined) corpo.installmentsCanChange = String(envio.permiteAlterar)
  if (envio.splits?.length) {
    corpo.splits = envio.splits.map(s => ({
      code: s.code,
      // Também decimal aqui — e é o inverso do split do Link, que é centavos.
      value: valorParaTransacaoRemota(s.valor),
      ...(s.chargeFees === undefined ? {} : { chargeFees: s.chargeFees }),
    }))
  }

  return comToken<TransacaoRemotaCriada>(
    c, token,
    t => requisitar(`${c.base}/remote/transaction`, {
      method: 'POST', headers: headerRemoto(t), body: JSON.stringify({ transaction: corpo }),
    }),
    json => ({
      transactionId: String((json as Record<string, unknown>)?.transactionId ?? ''),
    }),
  )
}

/** Remove uma transação remota que a máquina ainda não começou a processar. */
export async function cancelarTransacaoRemota(
  c: CredenciaisEvolu,
  transactionId: string,
  token: string | null = null,
) {
  // Os erros deste método vêm em HTTP 500 — inclusive
  // `REMOTE_TRANSACTION_ALREADY_PROCESSED`, que significa que a máquina já
  // começou: aí o cancelamento tem de ser feito no portal deles.
  return comToken<{ cancelada: true }>(
    c, token,
    t => requisitar(`${c.base}/remote/${encodeURIComponent(transactionId)}`,
                    { method: 'DELETE', headers: headerRemoto(t) }),
    () => ({ cancelada: true as const }),
  )
}

// ─── Link de pagamento ──────────────────────────────────────────────────────

function headerBasic(c: CredenciaisEvolu): Record<string, string> {
  const par = c.basicAuth && c.basicAuth.includes(':')
    ? c.basicAuth
    : `${c.username}:${c.apiKey}`
  return {
    'Content-Type': 'application/json',
    Authorization: 'Basic ' + Buffer.from(par).toString('base64'),
  }
}

export interface LinkEnvio {
  /** Nossa referência — é por ela que a conciliação acha a venda. */
  referencia:    string
  /** Em reais. */
  valor:         number
  maxParcelas:   number
  minParcelas?:  number | null
  clienteNome:   string
  clienteDocumento?: string | null
  clienteEmail?: string | null
  clienteTelefone?: string | null
  descricao?:    string | null
  /** 'YYYY-MM-DD'. */
  vencimento?:   string | null
  callbackUrl?:  string | null
  splits?:       SplitEnvio[]
  recorrencia?: {
    tipo:      'MONTHLY' | 'FLEXIBLE'
    cobrancas: number
    /** Dias entre as cobranças. */
    frequencia: number
  } | null
}

export interface LinkCriado {
  uuid:       string
  /** A URL que o tutor abre. Campo `payUrl` — não documentado, medido. */
  payUrl:     string
  referencia: string
  status:     string
}

/**
 * Cria o link de pagamento.
 *
 * Atenção ao escopo: o Link aceita **só crédito** (as quatro bandeiras de
 * crédito) e recorrência. Débito só existe pela maquininha — e é o caso em que
 * o split precisa sair no mesmo dia.
 */
export async function criarLink(c: CredenciaisEvolu, envio: LinkEnvio): Promise<Resultado<LinkCriado>> {
  const order: Record<string, unknown> = {
    reference:       envio.referencia,
    // String de CENTAVOS aqui — o oposto da transação remota.
    amount:          valorParaLink(envio.valor),
    maxInstallments: envio.maxParcelas,
    merchantCode:    c.merchantId,
    customerName:    envio.clienteNome,
  }
  if (envio.minParcelas)      order.minInstallments = envio.minParcelas
  if (envio.clienteDocumento) order.customerDocument = envio.clienteDocumento.replace(/\D/g, '')
  if (envio.clienteEmail)     order.customerEmail = envio.clienteEmail
  if (envio.clienteTelefone)  order.customerPhone = envio.clienteTelefone
  if (envio.descricao)        order.description = envio.descricao
  if (envio.vencimento)       order.expirationDate = envio.vencimento
  if (envio.callbackUrl)      order.redirectUrl = envio.callbackUrl
  if (envio.splits?.length) {
    order.splits = envio.splits.map(s => ({
      code: s.code,
      value: valorParaLink(s.valor),   // centavos, diferente do remoto
      ...(s.chargeFees === undefined ? {} : { chargeFees: s.chargeFees }),
    }))
  }
  if (envio.recorrencia) {
    order.recurrent = true
    order.recurrenceType = envio.recorrencia.tipo
    order.quantityCharges = envio.recorrencia.cobrancas
    order.frequency = envio.recorrencia.frequencia
  }

  const { http, json } = await requisitar(`${c.base}/api/orders`, {
    method: 'POST', headers: headerBasic(c), body: JSON.stringify({ order }),
  })

  const obj = (json && !Array.isArray(json) ? json : {}) as Record<string, unknown>
  if (http >= 400 || !obj.payUrl) {
    return { ok: false, erro: traduzirErro(codigoDoErro(json), http) }
  }
  return {
    ok: true,
    dados: {
      uuid:       String(obj.uuid ?? ''),
      payUrl:     String(obj.payUrl),
      referencia: String(obj.reference ?? envio.referencia),
      status:     String(obj.status ?? 'PENDING'),
    },
  }
}

export interface ParcelaConsulta {
  numero:     number
  valor:      number
  status:     string
  dataPrevista: string | null
}

export interface OrderConsulta {
  uuid:       string
  referencia: string
  status:     string
  /** Vazio enquanto ninguém pagou. */
  transacoes: Array<{
    numero:   number | null
    status:   string
    valor:    number
    parcelas: number | null
    bandeira: string | null
    nsu:      string | null
    autorizacao: string | null
    pagamentos: ParcelaConsulta[]
  }>
}

/**
 * Consulta a order.
 *
 * **Obrigatório no fluxo do Link:** o callback do link chega em
 * `x-www-form-urlencoded` com apenas `uuid` e `transactionNumber` — não diz o
 * que aconteceu. Só esta consulta informa status, valor e parcelas. Serve
 * também como validação cruzada antes de dar baixa em título, já que o webhook
 * não é assinado.
 */
export async function consultarOrder(c: CredenciaisEvolu, uuid: string): Promise<Resultado<OrderConsulta>> {
  const { lerValorDeles } = await import('./evoluservices-valores')
  const { http, json } = await requisitar(`${c.base}/api/orders/${encodeURIComponent(uuid)}`,
                                          { headers: headerBasic(c) })
  const obj = (json && !Array.isArray(json) ? json : null) as Record<string, unknown> | null
  if (http >= 400 || !obj) {
    return { ok: false, erro: traduzirErro(codigoDoErro(json), http) }
  }

  const lista = Array.isArray(obj.transactionList) ? obj.transactionList : []
  return {
    ok: true,
    dados: {
      uuid:       String(obj.uuid ?? uuid),
      referencia: String(obj.reference ?? ''),
      status:     String(obj.status ?? ''),
      transacoes: lista.map((t: Record<string, unknown>) => ({
        numero:   t.number === undefined || t.number === null ? null : Number(t.number),
        status:   String(t.status ?? ''),
        valor:    lerValorDeles(t.amount),
        parcelas: t.installments === undefined ? null : Number(t.installments),
        bandeira: (t.paymentBrand as string | null) ?? null,
        nsu:      (t.nsu as string | null) ?? null,
        autorizacao: (t.authorizationNumber as string | null) ?? null,
        pagamentos: (Array.isArray(t.payments) ? t.payments : []).map((p: Record<string, unknown>) => ({
          numero:       Number(p.number ?? 0),
          valor:        lerValorDeles(p.amount),
          status:       String(p.status ?? ''),
          dataPrevista: (p.payDate as string | null) ?? null,
        })),
      })),
    },
  }
}

export interface MetodoDePagamento {
  /** 'CREDIT' ou recorrente. Débito NÃO aparece: o Link não faz débito. */
  tipo:        string
  maxParcelas: number
  /** Bandeiras HABILITADAS para este estabelecimento — não a tabela inteira. */
  bandeiras:   string[]
}

/**
 * Formas de pagamento disponíveis para o estabelecimento e o valor.
 *
 * ⚠️ Os nomes dos parâmetros de query são **literais e com ponto**:
 * `paymentMethods.amount` e `paymentMethods.merchantCode`. Medido em
 * 22/10/2026 — `amount`/`merchantCode` simples devolvem `INVALID_PARAMETER`,
 * e o suporte deles chegou a indicar a forma simples, que também não funciona.
 *
 * Vale a chamada porque a resposta diz as bandeiras REALMENTE habilitadas para
 * aquele estabelecimento, que são menos que a tabela publicada. Oferecer na
 * tela uma bandeira não habilitada gera `INVALID_PAYMENT_BRAND` na frente do
 * tutor.
 */
export async function consultarMetodosDePagamento(
  c: CredenciaisEvolu,
  valorReais: number,
): Promise<Resultado<MetodoDePagamento[]>> {
  const q = new URLSearchParams({
    'paymentMethods.amount':       valorParaLink(valorReais),
    'paymentMethods.merchantCode': c.merchantId,
  })
  const { http, json } = await requisitar(`${c.base}/api/payment-methods?${q}`, { headers: headerBasic(c) })
  const obj = (json && !Array.isArray(json) ? json : null) as Record<string, unknown> | null
  if (http >= 400 || !obj) return { ok: false, erro: traduzirErro(codigoDoErro(json), http) }

  const lista = Array.isArray(obj.paymentMethods) ? obj.paymentMethods : []
  return {
    ok: true,
    dados: lista.map((m: Record<string, unknown>) => {
      // `options` chega como objeto único, não lista, apesar do nome plural.
      const o = (Array.isArray(m.options) ? m.options[0] : m.options) as Record<string, unknown> | null
      const marcas = o?.paymentBrands
      return {
        tipo:        String(m.type ?? ''),
        maxParcelas: Number(o?.maxInstallments ?? 1),
        bandeiras:   Array.isArray(marcas) ? marcas.map(String)
                     : (marcas && typeof marcas === 'object' && Array.isArray((marcas as Record<string, unknown>).value)
                        ? ((marcas as Record<string, unknown>).value as unknown[]).map(String)
                        : []),
      }
    }),
  }
}

/** Cancela um link ainda não pago. Não estorna transação aprovada — para isso
 *  não existe endpoint, e o cancelamento tem de ser feito no portal deles. */
export async function cancelarLink(c: CredenciaisEvolu, uuid: string): Promise<Resultado<{ cancelado: true }>> {
  const { http, json } = await requisitar(`${c.base}/api/orders/${encodeURIComponent(uuid)}`,
                                          { method: 'DELETE', headers: headerBasic(c) })
  if (http >= 400) return { ok: false, erro: traduzirErro(codigoDoErro(json), http) }
  return { ok: true, dados: { cancelado: true } }
}
