// Integração Sicoob — API Pix v2 (cobrança dinâmica). Cria uma cobrança imediata
// (cob), retorna o "copia e cola" (brcode) para gerar o QR, e consulta o status
// para a baixa automática. Sandbox usa credenciais públicas; produção usa o
// client_id + token da clínica + mTLS e-CNPJ (plugado no onboarding).

export interface PixConfig { environment: 'sandbox' | 'production'; client_id: string; token: string; chave: string }
export interface PixCob { txid: string; brcode: string; location: string | null }
export interface PixStatus { status: string; paid: boolean; e2eid: string | null; valor: number | null }

const SANDBOX = {
  base:      'https://sandbox.sicoob.com.br/sicoob/sandbox/pix/api/v2',
  client_id: '9b5e603e428cc477a2841e2683c92d21',
  token:     '1301865f-c6bc-38f3-9f49-666dbcfc59c3',
}
const PROD_BASE = 'https://api.sicoob.com.br/pix/api/v2'

function resolve(cfg: PixConfig) {
  const sandbox = cfg.environment !== 'production'
  return {
    sandbox,
    base:      sandbox ? SANDBOX.base : PROD_BASE,
    client_id: sandbox ? SANDBOX.client_id : cfg.client_id,
    token:     sandbox ? SANDBOX.token : cfg.token,
  }
}

// Cria uma cobrança imediata e retorna o brcode (copia e cola) p/ o QR.
export async function createPixCob(cfg: PixConfig, params: { valor: number; descricao?: string; expiracao?: number }): Promise<PixCob> {
  const r = resolve(cfg)
  if (!r.sandbox && !r.token) throw new Error('Credenciais de PIX de produção não configuradas.')
  const body = JSON.stringify({
    calendario: { expiracao: params.expiracao ?? 3600 },
    valor: { original: params.valor.toFixed(2) },
    chave: cfg.chave || 'sandbox@sicoob.com.br',
    solicitacaoPagador: (params.descricao ?? 'Recebimento').slice(0, 140),
  })
  const res = await fetch(`${r.base}/cob`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${r.token}`, client_id: r.client_id, 'Content-Type': 'application/json', Accept: 'application/json' },
    body,
  })
  if (!res.ok && res.status !== 201) throw new Error(`Falha ao criar cobrança PIX (${res.status}).`)
  const j = await res.json() as Record<string, unknown>
  const loc = (j.loc ?? {}) as Record<string, unknown>
  const brcode = String(j.brcode ?? j.pixCopiaECola ?? loc.brcode ?? '')
  const txid = String(j.txid ?? loc.txid ?? '')
  if (!txid) throw new Error('Cobrança PIX sem txid na resposta.')
  return { txid, brcode, location: (j.location as string) ?? (loc.location as string) ?? null }
}

// Consulta o status da cobrança (CONCLUIDA = paga).
export async function getPixCobStatus(cfg: PixConfig, txid: string): Promise<PixStatus> {
  const r = resolve(cfg)
  const res = await fetch(`${r.base}/cob/${encodeURIComponent(txid)}`, {
    headers: { Authorization: `Bearer ${r.token}`, client_id: r.client_id, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Falha ao consultar PIX (${res.status}).`)
  const j = await res.json() as { status?: string; pix?: Array<Record<string, unknown>> }
  const status = String(j.status ?? 'ATIVA')
  const pixArr = Array.isArray(j.pix) ? j.pix : []
  const first = pixArr[0]
  return {
    status,
    paid: status === 'CONCLUIDA' || pixArr.length > 0,
    e2eid: first ? String(first.endToEndId ?? '') || null : null,
    valor: first ? Number(first.valor) || null : null,
  }
}
