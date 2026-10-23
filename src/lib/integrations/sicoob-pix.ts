// Integração Sicoob — API Pix v2 (cobrança dinâmica).
//
// Cria uma cobrança imediata (`cob`), devolve o "copia e cola" para o QR e
// consulta o status para a baixa automática.
//
// ⚠️ Esta era a última integração Sicoob que falava por `fetch` comum e
// esperava um token COLADO À MÃO na tela. Nenhuma das duas coisas funciona em
// produção:
//
//   * O Pix v2 exige TLS MÚTUO — não é exigência do Sicoob, é do BACEN, e vale
//     para todos os bancos. Sem o certificado no aperto de mão, o servidor
//     recusa antes de olhar o token.
//   * O token do Sicoob é OAuth2 `client_credentials`, obtido com o Client ID
//     MAIS o certificado, e expira. Um token fixo num campo de formulário
//     funciona até o dia seguinte, quando para de funcionar sem ninguém mexer
//     em nada.
//
// Agora usa o mesmo transporte dos outros produtos (extrato, cobrança,
// pagamentos): `sicoob-mtls`. O sandbox continua por `fetch`, porque lá não há
// certificado nem token de verdade.
//
// Server-only.

import {
  chamarSicoob, ehSandbox, obterTokenProducao, comoJson,
  type CredenciaisSicoob,
} from './sicoob-mtls'

/**
 * Escopos do Pix. Não são palpite: `cob.write`/`cob.read` criam e leem a
 * cobrança imediata e `pix.read` lê os Pix recebidos. Escopo errado faz o
 * Keycloak recusar a requisição inteira com `invalid_scope`, antes mesmo de
 * chegar à API.
 */
export const ESCOPO_PIX = 'cob.write cob.read pix.read'

export interface PixConfig extends CredenciaisSicoob {
  /** Chave Pix que recebe — é o destino do dinheiro. */
  chave: string
}

export interface PixCob { txid: string; brcode: string; location: string | null }
export interface PixStatus { status: string; paid: boolean; e2eid: string | null; valor: number | null }

const SANDBOX = {
  base:      'https://sandbox.sicoob.com.br/sicoob/sandbox/pix/api/v2',
  client_id: '9b5e603e428cc477a2841e2683c92d21',
  token:     '1301865f-c6bc-38f3-9f49-666dbcfc59c3',
}
const PROD_BASE = 'https://api.sicoob.com.br/pix/api/v2'

const base = (c: PixConfig) => (ehSandbox(c) ? SANDBOX.base : PROD_BASE)

/** Token do ambiente: fixo no sandbox, OAuth com certificado em produção. */
async function token(c: PixConfig): Promise<string> {
  if (ehSandbox(c)) return SANDBOX.token
  return obterTokenProducao(c, ESCOPO_PIX)
}

function cabecalho(c: PixConfig, t: string): Record<string, string> {
  return {
    Authorization: `Bearer ${t}`,
    client_id: ehSandbox(c) ? SANDBOX.client_id : (c.client_id ?? '').trim(),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

/** Cria a cobrança imediata e devolve o copia-e-cola para o QR. */
export async function createPixCob(
  cfg: PixConfig,
  params: { valor: number; descricao?: string; expiracao?: number },
): Promise<PixCob> {
  if (!ehSandbox(cfg) && !cfg.chave) {
    throw new Error('Chave Pix não cadastrada — é para ela que o dinheiro vai.')
  }

  const t = await token(cfg)
  const body = JSON.stringify({
    calendario: { expiracao: params.expiracao ?? 3600 },
    valor: { original: params.valor.toFixed(2) },
    chave: cfg.chave || 'sandbox@sicoob.com.br',
    solicitacaoPagador: (params.descricao ?? 'Recebimento').slice(0, 140),
  })

  const r = await chamarSicoob(`${base(cfg)}/cob`, cfg, {
    method: 'POST', headers: cabecalho(cfg, t), body,
  })
  if (r.status !== 200 && r.status !== 201) {
    throw new Error(`Falha ao criar cobrança PIX (${r.status}): ${r.text.slice(0, 200)}`)
  }

  const j = comoJson<Record<string, unknown>>(r)
  const loc = (j.loc ?? {}) as Record<string, unknown>
  const txid = String(j.txid ?? loc.txid ?? '')
  if (!txid) throw new Error('Cobrança PIX sem txid na resposta.')

  return {
    txid,
    // O nome do campo varia conforme a versão: aceitar os dois evita um QR
    // vazio que só apareceria na frente do cliente.
    brcode: String(j.brcode ?? j.pixCopiaECola ?? loc.brcode ?? ''),
    location: (j.location as string) ?? (loc.location as string) ?? null,
  }
}

/** Consulta o status da cobrança. CONCLUIDA = paga. */
export async function getPixCobStatus(cfg: PixConfig, txid: string): Promise<PixStatus> {
  const t = await token(cfg)
  const r = await chamarSicoob(`${base(cfg)}/cob/${encodeURIComponent(txid)}`, cfg, {
    headers: cabecalho(cfg, t),
  })
  if (r.status !== 200) throw new Error(`Falha ao consultar PIX (${r.status}).`)

  const j = comoJson<{ status?: string; pix?: Array<Record<string, unknown>> }>(r)
  const status = String(j.status ?? 'ATIVA')
  const pagos = Array.isArray(j.pix) ? j.pix : []
  const primeiro = pagos[0]

  return {
    status,
    paid: status === 'CONCLUIDA' || pagos.length > 0,
    e2eid: primeiro ? String(primeiro.endToEndId ?? '') || null : null,
    valor: primeiro ? Number(primeiro.valor) || null : null,
  }
}
