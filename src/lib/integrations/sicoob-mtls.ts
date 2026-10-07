// Transporte compartilhado das APIs do Sicoob.
//
// Existe porque o Sicoob exige TLS MÚTUO com o e-CNPJ A1 da empresa: não basta
// o token, o servidor confere o certificado do cliente no próprio aperto de
// mão. E porque três módulos precisam disso (extrato, cobrança, pagamentos) —
// antes só o extrato tinha, e cobrança e pagamentos traziam um stub que
// lançava "pendente de onboarding" em produção:
//
//   async function mtlsDispatcher(cfg) {
//     if (isSandbox(cfg)) return undefined
//     throw new Error('Produção ... requer o certificado e-CNPJ A1 — pendente')
//   }
//
// Eles tentavam usar o `dispatcher` do fetch, que só existe no undici como
// pacote e não está disponível aqui. `node:https` sempre está e aceita `pfx`
// direto — foi assim que o extrato passou a funcionar de verdade.
//
// Roda em runtime Node (Server Action / route handler), nunca em Edge.
// Server-only.

import https from 'node:https'

export interface CredenciaisSicoob {
  environment: 'sandbox' | 'production'
  /** Client ID do aplicativo em PRODUÇÃO (o de sandbox é público e fixo). */
  client_id?: string | null
  /** e-CNPJ A1 da empresa, já decifrado. Obrigatório em produção. */
  pfx?: Buffer | null
  passphrase?: string | null
}

export const ehSandbox = (c: CredenciaisSicoob): boolean => c.environment !== 'production'

export const TOKEN_URL = 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token'

interface Pfx { pfx: Buffer; passphrase: string | undefined }

export function carregarPfx(c: CredenciaisSicoob): Pfx {
  if (!c.pfx || c.pfx.length < 500) {
    throw new Error('Certificado e-CNPJ A1 não cadastrado para esta clínica. Envie o arquivo .pfx em Configurações > Financeiro.')
  }
  return { pfx: c.pfx, passphrase: c.passphrase || undefined }
}

export interface RespostaSicoob { status: number; text: string }

/** Requisição com o certificado no aperto de mão. Só produção. */
export function requisicaoMtls(
  url: string,
  c: CredenciaisSicoob,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<RespostaSicoob> {
  const { pfx, passphrase } = carregarPfx(c)
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
        // Validação do servidor continua ligada — mTLS é mútuo, não substitui.
        rejectUnauthorized: true,
      },
      res => {
        let txt = ''
        res.setEncoding('utf8')
        res.on('data', ch => { txt += ch })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text: txt }))
      },
    )
    req.on('error', e => {
      const code = (e as NodeJS.ErrnoException).code
      const m = code === 'ERR_OSSL_UNSUPPORTED'
        ? 'o Node recusou o .pfx (algoritmo legado) — reexporte o certificado'
        : e.message
      reject(new Error('Falha de conexão com o Sicoob: ' + m))
    })
    if (init.body) req.write(init.body)
    req.end()
  })
}

/**
 * Uma chamada, os dois ambientes: sandbox vai por `fetch` comum (não tem
 * certificado), produção vai por mTLS. Devolve sempre status + texto, para
 * quem chama decidir como ler.
 */
export async function chamarSicoob(
  url: string,
  c: CredenciaisSicoob,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<RespostaSicoob> {
  if (ehSandbox(c)) {
    const r = await fetch(url, { method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body })
    return { status: r.status, text: await r.text() }
  }
  return requisicaoMtls(url, c, init)
}

/** Lê o corpo como JSON sem explodir quando o banco devolve texto. */
export function comoJson<T = Record<string, unknown>>(r: RespostaSicoob): T {
  try { return JSON.parse(r.text || '{}') as T } catch { return {} as T }
}

/**
 * Token de produção, com o escopo do produto.
 *
 * O escopo não é palpite: `cco_extrato`/`cco_saldo` NÃO existem e fazem o
 * Keycloak recusar a requisição inteira com invalid_scope. Medido contra o
 * Sicoob em 2026-10-07, os escopos reais são `cco_consulta` (conta corrente),
 * `boletos_*` (cobrança) e `pagamentos_*` (pagamentos).
 */
export async function obterTokenProducao(c: CredenciaisSicoob, escopo: string): Promise<string> {
  const clientId = c.client_id?.trim()
  if (!clientId) throw new Error('Client ID do Sicoob não preenchido em Configurações > Financeiro.')

  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, scope: escopo }).toString()
  const r = await requisicaoMtls(TOKEN_URL, c, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': String(Buffer.byteLength(body)) },
    body,
  })
  if (r.status !== 200) {
    if (r.status === 401 && r.text.includes('invalid_client')) {
      throw new Error(
        'O Sicoob aceitou o certificado, mas não reconheceu o Client ID. '
        + 'No portal Sicoob Developers, confira: o aplicativo foi criado em PRODUÇÃO e está ativo; '
        + 'o certificado da empresa está VINCULADO a esse aplicativo; e o Client ID foi copiado por inteiro.',
      )
    }
    if (r.status === 400 && r.text.includes('invalid_scope')) {
      throw new Error(
        `O Sicoob recusou os escopos "${escopo}" para este aplicativo. `
        + 'No portal Sicoob Developers, verifique se a API correspondente está vinculada ao aplicativo.',
      )
    }
    throw new Error('Falha no token Sicoob (' + r.status + '): ' + r.text.slice(0, 200))
  }
  const j = comoJson<{ access_token?: string }>(r)
  if (!j.access_token) throw new Error('Token Sicoob ausente na resposta.')
  return j.access_token
}
