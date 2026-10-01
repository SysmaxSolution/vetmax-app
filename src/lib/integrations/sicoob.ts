// Integração Sicoob — API Conta Corrente v4 (extrato por período) para a
// conciliação bancária automatizada (1.3). Auth: OAuth2 client_credentials + mTLS
// e-CNPJ A1 (produção). SANDBOX usa credenciais públicas de teste, SEM certificado
// — permite construir/testar antes de o cliente ter o e-CNPJ.
//
// Config por ambiente (env):
//   SICOOB_ENV=sandbox|production (default sandbox)
//   produção: SICOOB_CLIENT_ID + SICOOB_PFX_BASE64 + SICOOB_PFX_PASSWORD (por clínica,
//   depois migram p/ tabela de integração por clinic_id).
//
// Retorno normalizado no formato consumido por importStatements (BankStatement).

import https from 'node:https'

export interface SicoobTx { date: string; amount: number; description: string; type: 'credit' | 'debit'; external_id?: string }

const SANDBOX = {
  base:      'https://sandbox.sicoob.com.br/sicoob/sandbox/conta-corrente/v4',
  client_id: '9b5e603e428cc477a2841e2683c92d21',
  token:     '1301865f-c6bc-38f3-9f49-666dbcfc59c3', // access_token fixo do sandbox
}
const PROD_BASE  = 'https://api.sicoob.com.br/conta-corrente/v4'
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
export interface SicoobConfig {
  environment: 'sandbox' | 'production'
  client_id:   string
  /** e-CNPJ A1 da empresa. Obrigatorio em producao (mTLS). */
  pfx?:        Buffer | null
  passphrase?: string | null
}

const ehSandbox = (cfg: SicoobConfig) => cfg.environment !== 'production'



// --- Transporte mTLS (so producao) -----------------------------------------
// O Sicoob exige TLS mutuo com o e-CNPJ A1 da empresa: nao basta o token, o
// servidor confere o certificado do cliente no aperto de mao. Usamos
// `node:https` em vez de undici -- o `dispatcher` do fetch so existe no undici
// como pacote, que nao esta disponivel aqui; `node:https` sempre esta e aceita
// pfx direto. Roda em runtime Node (Server Action/route handler), nao em Edge.
//
// O certificado NUNCA fica no banco nem no repositorio: vem de variavel de
// ambiente, em base64, com a senha separada.
interface Pfx { pfx: Buffer; passphrase: string | undefined }

function carregarPfx(cfg: SicoobConfig): Pfx {
  if (!cfg.pfx || cfg.pfx.length < 500) {
    throw new Error('Certificado e-CNPJ A1 nao cadastrado para esta clinica. Envie o arquivo .pfx em Configuracoes > Financeiro.')
  }
  return { pfx: cfg.pfx, passphrase: cfg.passphrase || undefined }
}

/** Requisicao HTTPS com o certificado do cliente apresentado no handshake. */
function requisicaoMtls(
  url: string,
  cfg: SicoobConfig,
  init: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; text: string }> {
  const { pfx, passphrase } = carregarPfx(cfg)
  const u = new URL(url)
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: init.method ?? 'GET',
        headers: init.headers ?? {},
        pfx,
        passphrase,
        // Validacao do servidor continua ligada -- mTLS e mutuo, nao substitui.
        rejectUnauthorized: true,
      },
      res => {
        let txt = ''
        res.setEncoding('utf8')
        res.on('data', c => { txt += c })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: txt }))
      },
    )
    req.on('error', e => {
      const code = (e as NodeJS.ErrnoException).code
      const m = code === 'ERR_OSSL_UNSUPPORTED'
        ? 'o Node recusou o .pfx (algoritmo legado) -- reexporte o certificado'
        : e.message
      reject(new Error('Falha de conexao com o Sicoob: ' + m))
    })
    if (init.body) req.write(init.body)
    req.end()
  })
}

async function getToken(cfg: SicoobConfig): Promise<string> {
  if (ehSandbox(cfg)) return SANDBOX.token
  const clientId = cfg.client_id?.trim()
  if (!clientId) throw new Error('Client ID do Sicoob nao preenchido em Configuracoes > Financeiro.')
  if (clientId === SANDBOX.client_id) {
    // Erro comum no onboarding: o client_id publico da documentacao e de
    // sandbox e nao autentica em producao, mesmo com o certificado certo.
    throw new Error('O SICOOB_CLIENT_ID configurado e o client_id publico de SANDBOX. Crie o aplicativo no portal Sicoob Developers e use o client_id de producao.')
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials', client_id: clientId, scope: 'openid cco_extrato cco_saldo',
  }).toString()
  const r = await requisicaoMtls(TOKEN_URL, cfg, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': String(Buffer.byteLength(body)),
    },
    body,
  })
  if (r.status !== 200) {
    // Chegar aqui com 401 invalid_client significa que o certificado JÁ passou
    // (sem ele o gateway responde 403 antes da autenticação). Então o problema
    // está no cadastro do aplicativo no portal Sicoob, não no nosso lado — e
    // repassar o erro cru do OAuth não ajuda ninguém a resolver.
    if (r.status === 401 && /invalid_client/.test(r.text)) {
      throw new Error(
        'O Sicoob aceitou o certificado, mas não reconheceu o Client ID. '
        + 'No portal Sicoob Developers, confira: o aplicativo foi criado em PRODUÇÃO e está ativo; '
        + 'o certificado da empresa está VINCULADO a esse aplicativo; os escopos cco_extrato e cco_saldo '
        + 'estão habilitados; e o Client ID foi copiado por inteiro.',
      )
    }
    throw new Error('Falha no token Sicoob (' + r.status + '): ' + r.text.slice(0, 200))
  }
  const j = JSON.parse(r.text || '{}') as { access_token?: string }
  if (!j.access_token) throw new Error('Token Sicoob ausente na resposta.')
  return j.access_token
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
const toNum = (v: unknown): number => {
  if (typeof v === 'number') return v
  const n = Number(String(v ?? '').replace(/[R$\s.]/g, m => (m === '.' ? '' : '')).replace(',', '.'))
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

  let corpo: string
  if (ehSandbox(cfg)) {
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error('Extrato Sicoob ' + mes + '/' + ano + ' falhou (' + res.status + ').')
    corpo = await res.text()
  } else {
    const r = await requisicaoMtls(url, cfg, { headers })
    if (r.status !== 200) throw new Error('Extrato Sicoob ' + mes + '/' + ano + ' falhou (' + r.status + '): ' + r.text.slice(0, 160))
    corpo = r.text
  }
  const j = JSON.parse(corpo || '{}') as { transacoes?: Array<Record<string, unknown>> }
  const txs = Array.isArray(j.transacoes) ? j.transacoes : []
  const out: SicoobTx[] = []
  for (const t of txs) {
    const valor = toNum(t.valor)
    const date = toDate(t.data ?? t.dataLote)
    if (!date || !Number.isFinite(valor)) continue                       // pula lixo do sandbox (lorem)
    out.push({
      date, amount: Math.abs(valor), description: String(t.descricao ?? 'Lançamento'),
      type: inferType(t.tipo, valor), external_id: t.numeroDocumento ? String(t.numeroDocumento) : undefined,
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
      const monthTxs = await fetchMonth(cfg, params.conta, mes, ano, diaIni, diaFim, token, clientId)
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
