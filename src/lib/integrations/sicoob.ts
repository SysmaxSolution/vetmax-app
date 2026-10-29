// Integração Sicoob — API Conta Corrente v4 (extrato por período) para a
// conciliação bancária automatizada (1.3). Auth: OAuth2 client_credentials + mTLS
// e-CNPJ A1 (produção). SANDBOX usa credenciais públicas de teste, SEM certificado
// — permite construir/testar antes de o cliente ter o e-CNPJ.
//
// Config vem da CLÍNICA, não de variável de ambiente: ambiente, client_id e
// certificado são resolvidos por ./sicoob-config a partir da tela de
// Integrações Financeiras e da tabela clinic_bank_certificates.
//
// Este comentário já descreveu um contrato por env (SICOOB_ENV,
// SICOOB_CLIENT_ID, SICOOB_PFX_BASE64). Nenhuma dessas variáveis existia no
// projeto da Vercel, e o `?? 'sandbox'` fazia a clínica marcar "Produção" na
// tela e a conciliação trazer lançamentos fictícios. Não voltar para env.
//
// Retorno normalizado no formato consumido por importStatements (BankStatement).

import { carregarPfx, chamarSicoob, ehSandbox, obterTokenProducao, type CredenciaisSicoob } from './sicoob-mtls'

export interface SicoobTx {
  date: string
  amount: number
  description: string
  type: 'credit' | 'debit'
  /** numeroDocumento — serve para casar com titulo, NAO para identificar. */
  external_id?: string
  /**
   * transactionId do Sicoob: identificador UNICO da transacao.
   *
   * Existe porque `numeroDocumento` NAO identifica: para Pix ele vem como a
   * string literal "Pix". Em producao havia 51 linhas com external_id "Pix" e
   * 43 grupos duplicados — reimportar o periodo duplicava tudo. O
   * transactionId e o que permite importacao idempotente.
   */
  tx_id?: string
  /**
   * `descInfComplementar` cru. Para Pix traz o NOME da contraparte e o
   * documento mascarado; para cartao, a adquirente e a bandeira. Vinha sendo
   * descartado — o operador so via "PIX RECEBIDO - OUTRA IF".
   */
  contraparte?: string
}

const SANDBOX = {
  base:      'https://sandbox.sicoob.com.br/sicoob/sandbox/conta-corrente/v4',
  client_id: '9b5e603e428cc477a2841e2683c92d21',
  token:     '1301865f-c6bc-38f3-9f49-666dbcfc59c3', // access_token fixo do sandbox
}
const PROD_BASE  = 'https://api.sicoob.com.br/conta-corrente/v4'

/**
 * Escopo do token para ler o extrato. MEDIDO contra o Sicoob de producao em
 * 2026-10-07, nao suposto: `cco_extrato` e `cco_saldo` NAO existem e fazem o
 * Keycloak recusar a requisicao inteira com invalid_scope, mesmo com o
 * certificado e o client_id corretos. O escopo de leitura da Conta Corrente e
 * `cco_consulta` (existe tambem `cco_transferencias`, que nao usamos).
 * Travado por tests/unit/sicoob-escopos.test.ts.
 */
export const ESCOPO_EXTRATO = 'openid cco_consulta'
const TOKEN_URL  = 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token'

/**
 * Configuracao da integracao. Vem da CLINICA (tela de Integracoes Financeiras),
 * nao de variavel de ambiente.
 *
 * Antes `isSandbox()` lia `process.env.SICOOB_ENV`, que nunca foi definido ->
 * dava sandbox sempre. A clinica marcava "Producao" na tela, o client_id dela
 * era ignorado e a conciliacao trazia os lancamentos ficticios do sandbox como
 * se fossem do banco. Era o pior tipo de defeito: silencioso e plausivel.
 */
/**
 * Credencial da clinica para o Sicoob. E a mesma forma usada por cobranca e
 * pagamentos — unificada em ./sicoob-mtls para nao divergirem.
 */
export type SicoobConfig = CredenciaisSicoob




async function getToken(cfg: SicoobConfig): Promise<string> {
  if (ehSandbox(cfg)) return SANDBOX.token
  if (cfg.client_id?.trim() === SANDBOX.client_id) {
    // Erro comum no onboarding: o client_id publico da documentacao e de
    // sandbox e nao autentica em producao, mesmo com o certificado certo.
    throw new Error('O Client ID configurado e o client_id publico de SANDBOX. Crie o aplicativo no portal Sicoob Developers e use o client_id de producao.')
  }
  return obterTokenProducao(cfg, ESCOPO_EXTRATO)
}

/** Diagnostico de onboarding: aperta a mao com o Sicoob e diz o que falta. */
export async function testarConexaoSicoob(cfg: SicoobConfig): Promise<{ ok: boolean; etapa: string; detalhe: string }> {
  if (ehSandbox(cfg)) return { ok: true, etapa: 'sandbox', detalhe: 'Ambiente sandbox -- nao usa certificado nem client_id proprio.' }
  try { carregarPfx(cfg) } catch (e) { return { ok: false, etapa: 'certificado', detalhe: (e as Error).message } }
  try {
    await getToken(cfg)
    return { ok: true, etapa: 'token', detalhe: 'Certificado aceito e token emitido.' }
  } catch (e) {
    return { ok: false, etapa: 'token', detalhe: (e as Error).message }
  }
}

const toDate = (v: unknown): string | null => {
  if (!v) return null
  const s = String(v).trim()
  let m = s.match(/(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);   if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}
/**
 * Numero da conta como a API quer: so digitos, COM o digito verificador.
 *
 * O cadastro guarda mascarado ("8658-4") e a action mandava cru. Medido
 * contra o Sicoob de producao (2026-10-07):
 *   8658-4 -> 404 Not Found   |   86584 -> 200 extrato real   |   8658 -> 400
 */
export const normalizarConta = (v: unknown): string => String(v ?? '').replace(/\D/g, '')

/**
 * Converte valor monetario que chega em DOIS formatos diferentes.
 *
 * O SANDBOX devolve numero (1555.05). A PRODUCAO devolve string "1555.05",
 * com ponto DECIMAL. Mas tambem existe entrada no formato brasileiro,
 * "R$ 1.555,05", onde o ponto e MILHAR.
 *
 * A versao anterior removia todo ponto — correto para o formato brasileiro,
 * catastrofico para o da API: "1555.05" virava 155505, cem vezes maior. Como
 * o sandbox devolve numero, o erro nunca aparecia em teste e so entraria em
 * cena na primeira conciliacao real.
 *
 * Regra: tem virgula -> virgula e o decimal e ponto e milhar (pt-BR);
 * nao tem virgula -> ponto e o decimal (API).
 */
export const toNum = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  let t = String(v ?? '').replace(/[R$\s ]/g, '').trim()
  if (!t) return NaN
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')   // pt-BR
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}
const inferType = (tipo: unknown, valor: number): 'credit' | 'debit' => {
  const t = String(tipo ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (t.includes('cred') || t === 'c') return 'credit'
  if (t.includes('deb')  || t === 'd') return 'debit'
  return valor >= 0 ? 'credit' : 'debit'
}

// Busca o extrato de UM mês (janela de dias). O Sicoob limita a ~3 meses de histórico.
async function fetchMonth(cfg: SicoobConfig, conta: string, mes: number, ano: number, diaIni: number, diaFim: number, token: string, clientId: string): Promise<SicoobTx[]> {
  const base = ehSandbox(cfg) ? SANDBOX.base : PROD_BASE
  const url = `${base}/extrato/${mes}/${ano}?diaInicial=${diaIni}&diaFinal=${diaFim}&numeroContaCorrente=${encodeURIComponent(conta)}&agruparCNAB=false`
  const headers = { Authorization: 'Bearer ' + token, client_id: clientId, Accept: 'application/json' }

  // chamarSicoob escolhe o transporte: fetch no sandbox, mTLS em producao.
  const r = await chamarSicoob(url, cfg, { headers })
  if (r.status !== 200) {
    // Mantem o corpo da resposta na mensagem: foi o que permitiu descobrir que
    // o 404 era conta mascarada na URL, e nao conta inexistente.
    throw new Error('Extrato Sicoob ' + mes + '/' + ano + ' falhou (' + r.status + ')'
      + (r.text ? ': ' + r.text.slice(0, 160) : '.'))
  }
  return extrairTransacoes(r.text)
}

/**
 * Transforma o corpo do extrato em lancamentos. Exportada para ser testavel:
 * foi aqui que a producao passou batido.
 *
 * O SANDBOX devolve `{ transacoes: [...] }` no nivel de cima; a PRODUCAO
 * devolve `{ mensagens, resultado: { saldoAtual, ..., transacoes: [...] } }`.
 * Ler so o nivel de cima fazia a conciliacao autenticar, receber o extrato
 * real e importar ZERO lancamento, reclamando "nenhum lancamento no periodo"
 * — o pior tipo de falha, porque parece problema do banco.
 */
export function extrairTransacoes(corpo: string): SicoobTx[] {
  let j: {
    transacoes?: Array<Record<string, unknown>>
    resultado?: { transacoes?: Array<Record<string, unknown>> }
  }
  try { j = JSON.parse(corpo || '{}') } catch { return [] }

  const lista = j?.resultado?.transacoes ?? j?.transacoes
  const txs = Array.isArray(lista) ? lista : []
  const out: SicoobTx[] = []
  for (const t of txs) {
    const valor = toNum(t.valor)
    const date = toDate(t.data ?? t.dataLote)
    if (!date || !Number.isFinite(valor)) continue                       // pula lixo do sandbox (lorem)
    out.push({
      date, amount: Math.abs(valor), description: String(t.descricao ?? 'Lançamento'),
      type: inferType(t.tipo, valor),
      external_id: t.numeroDocumento ? String(t.numeroDocumento) : undefined,
      tx_id: t.transactionId ? String(t.transactionId) : undefined,
      contraparte: t.descInfComplementar ? String(t.descInfComplementar) : undefined,
    })
  }
  return out
}

// Busca o extrato por PERÍODO (itera os meses do intervalo, respeitando o limite).
export async function fetchSicoobExtrato(params: {
  conta: string; start_date: string; end_date: string; config: SicoobConfig
}): Promise<{ statements: SicoobTx[]; warnings: string[] }> {
  const cfg = params.config
  const warnings: string[] = []
  const start = new Date(params.start_date + 'T00:00:00')
  const end   = new Date(params.end_date + 'T00:00:00')
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) throw new Error('Período inválido.')

  // A conta chega MASCARADA do cadastro ("8658-4") e a API quer so digitos.
  // Medido contra o Sicoob de producao (2026-10-07):
  //   numeroContaCorrente=8658-4  -> 404 Not Found
  //   numeroContaCorrente=86584   -> 200, extrato real
  //   numeroContaCorrente=8658    -> 400 "Numero da conta corrente e obrigatorio"
  // Normalizar AQUI, na fronteira, e nao em cada chamador: a action mandava o
  // valor cru de bank_accounts.account e o 404 parecia conta inexistente.
  // O digito verificador faz parte do numero — nao remover.
  const contaDigitos = normalizarConta(params.conta)
  if (!contaDigitos) throw new Error('Conta sem numero cadastrado — confira o cadastro da conta bancaria.')

  const clientId = ehSandbox(cfg) ? SANDBOX.client_id : (cfg.client_id ?? '')
  const token = await getToken(cfg)

  const statements: SicoobTx[] = []
  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  while (cur <= end) {
    const mes = cur.getMonth() + 1, ano = cur.getFullYear()
    const lastDay = new Date(ano, mes, 0).getDate()
    const diaIni = (cur.getFullYear() === start.getFullYear() && cur.getMonth() === start.getMonth()) ? start.getDate() : 1
    const diaFim = (cur.getFullYear() === end.getFullYear() && cur.getMonth() === end.getMonth()) ? end.getDate() : lastDay
    try {
      const monthTxs = await fetchMonth(cfg, contaDigitos, mes, ano, diaIni, diaFim, token, clientId)
      statements.push(...monthTxs)
    } catch (e) {
      warnings.push(`${String(mes).padStart(2, '0')}/${ano}: ${(e as Error).message}`)
    }
    cur.setMonth(cur.getMonth() + 1)
  }

  // SANDBOX retorna dados fictícios (lorem) que o parser descarta → gera alguns
  // lançamentos de DEMONSTRAÇÃO no período p/ validar o fluxo ponta a ponta. Em
  // produção (com e-CNPJ real) isto nunca roda.
  if (ehSandbox(cfg) && statements.length === 0) {
    const d0 = params.start_date, d1 = params.end_date
    statements.push(
      { date: d0, amount: 500, description: '[SANDBOX] PIX RECEBIDO', type: 'credit', external_id: 'SBX-1' },
      { date: d1, amount: 150, description: '[SANDBOX] REPASSE CARTAO', type: 'credit', external_id: 'SBX-2' },
      { date: d1, amount: 80,  description: '[SANDBOX] TARIFA', type: 'debit', external_id: 'SBX-3' },
    )
    warnings.push('Ambiente sandbox: lançamentos de demonstração (a produção usa o extrato real do e-CNPJ da clínica).')
  }
  return { statements, warnings }
}

export const sicoobEnvLabel = (cfg: SicoobConfig): string => (ehSandbox(cfg) ? 'sandbox (teste)' : 'produção')
