// Integração Sicoob — API Pagamentos v3 (varredura DDA + pagamento/agendamento de
// boletos a fornecedores). Auth: OAuth2 client_credentials + mTLS e-CNPJ A1 (prod).
// SANDBOX usa credenciais públicas de teste (mock), SEM certificado.
// Fonte: collection "API Cobrança Bancária Pagamentos" (integracoes/sicoob).
import 'server-only'
import { mapDdaResponse, buildPagamentoPayload, type DdaBoletoLike, type PagamentoInput } from './sicoob-pagamentos-map'

const SANDBOX = {
  base: 'https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria-pagamentos/v3',
  client_id: '9b5e603e428cc477a2841e2683c92d21',
  token: '1301865f-c6bc-38f3-9f49-666dbcfc59c3',
}
const PROD_BASE = 'https://api.sicoob.com.br/pagamentos/v3'
const TOKEN_URL = 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token'
const SCOPE = 'pagamentos_inclusao pagamentos_consulta pagamentos_alteracao'

export interface PagamentosRuntime {
  environment: 'sandbox' | 'production'
  numeroConta: number
  agencia: number
  clientId?: string
}

function isSandbox(cfg: PagamentosRuntime) { return cfg.environment !== 'production' }

async function mtlsDispatcher(cfg: PagamentosRuntime): Promise<unknown> {
  if (isSandbox(cfg)) return undefined
  throw new Error('Produção Sicoob Pagamentos requer o certificado e-CNPJ A1 (mTLS) da clínica — pendente de onboarding.')
}
async function getToken(cfg: PagamentosRuntime, dispatcher: unknown): Promise<string> {
  if (isSandbox(cfg)) return SANDBOX.token
  if (!cfg.clientId) throw new Error('Client ID Sicoob não configurado para produção.')
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: cfg.clientId, scope: SCOPE })
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, ...(dispatcher ? { dispatcher } : {}) } as RequestInit)
  if (!res.ok) throw new Error(`Falha no token Sicoob (${res.status}).`)
  const j = await res.json() as { access_token?: string }
  if (!j.access_token) throw new Error('Token Sicoob ausente na resposta.')
  return j.access_token
}
function headers(cfg: PagamentosRuntime, token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, client_id: isSandbox(cfg) ? SANDBOX.client_id : (cfg.clientId ?? ''), 'Content-Type': 'application/json', Accept: 'application/json' }
}
function base(cfg: PagamentosRuntime) { return isSandbox(cfg) ? SANDBOX.base : PROD_BASE }

/** Varredura do DDA — GET /boletos (boletos a pagar registrados contra o CNPJ). */
export async function consultarDDA(cfg: PagamentosRuntime, filtros: { dataInicial: string; dataFinal: string; situacao?: number; tipoData?: number }): Promise<{ ok: true; boletos: DdaBoletoLike[]; raw: unknown } | { ok: false; error: string }> {
  try {
    const dispatcher = await mtlsDispatcher(cfg)
    const token = await getToken(cfg, dispatcher)
    const q = new URLSearchParams({ numeroConta: String(cfg.numeroConta), dataInicial: filtros.dataInicial, dataFinal: filtros.dataFinal })
    if (filtros.situacao != null) q.set('situacao', String(filtros.situacao))
    if (filtros.tipoData != null) q.set('tipoData', String(filtros.tipoData))
    const res = await fetch(`${base(cfg)}/boletos?${q}`, { headers: headers(cfg, token), ...(dispatcher ? { dispatcher } : {}) } as RequestInit)
    const raw = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: (raw as any)?.mensagens?.[0]?.mensagem || `Sicoob retornou ${res.status}` }
    return { ok: true, boletos: mapDdaResponse(raw), raw }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Erro ao consultar DDA.' } }
}

/** Consulta um boleto antes de pagar — GET /boletos/:codigoBarras (retorna identificadorConsulta). */
export async function consultarBoletoParaPagar(cfg: PagamentosRuntime, codigoBarras: string, dataPagamento: string): Promise<{ ok: true; raw: any } | { ok: false; error: string }> {
  try {
    const dispatcher = await mtlsDispatcher(cfg)
    const token = await getToken(cfg, dispatcher)
    const q = new URLSearchParams({ numeroConta: String(cfg.numeroConta), dataPagamento })
    const res = await fetch(`${base(cfg)}/boletos/${encodeURIComponent(codigoBarras)}?${q}`, { headers: headers(cfg, token), ...(dispatcher ? { dispatcher } : {}) } as RequestInit)
    const raw = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: (raw as any)?.mensagens?.[0]?.mensagem || `Sicoob retornou ${res.status}` }
    return { ok: true, raw }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Erro ao consultar boleto.' } }
}

/** Paga/agenda um boleto — POST /boletos/pagamentos/:codigoBarras. */
export async function pagarBoleto(cfg: PagamentosRuntime, codigoBarras: string, input: PagamentoInput): Promise<{ ok: true; idPagamento: string | null; raw: unknown } | { ok: false; error: string }> {
  try {
    const dispatcher = await mtlsDispatcher(cfg)
    const token = await getToken(cfg, dispatcher)
    const res = await fetch(`${base(cfg)}/boletos/pagamentos/${encodeURIComponent(codigoBarras)}`, {
      method: 'POST', headers: headers(cfg, token), body: JSON.stringify(buildPagamentoPayload(input)), ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit)
    const raw = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: (raw as any)?.mensagens?.[0]?.mensagem || `Sicoob retornou ${res.status}` }
    const r = (raw as any)?.resultado ?? raw
    return { ok: true, idPagamento: r?.idPagamento ?? r?.id ?? null, raw }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Erro ao pagar boleto.' } }
}

/** Comprovante — GET /boletos/pagamentos/:idPagamento/comprovantes. */
export async function consultarComprovante(cfg: PagamentosRuntime, idPagamento: string): Promise<{ ok: true; raw: unknown } | { ok: false; error: string }> {
  try {
    const dispatcher = await mtlsDispatcher(cfg)
    const token = await getToken(cfg, dispatcher)
    const q = new URLSearchParams({ numeroConta: String(cfg.numeroConta) })
    const res = await fetch(`${base(cfg)}/boletos/pagamentos/${encodeURIComponent(idPagamento)}/comprovantes?${q}`, { headers: headers(cfg, token), ...(dispatcher ? { dispatcher } : {}) } as RequestInit)
    const raw = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: `Sicoob retornou ${res.status}` }
    return { ok: true, raw }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Erro ao consultar comprovante.' } }
}

/** Cancela um agendamento — DELETE /boletos/pagamentos/agendamentos/:idPagamento. */
export async function cancelarAgendamento(cfg: PagamentosRuntime, idPagamento: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const dispatcher = await mtlsDispatcher(cfg)
    const token = await getToken(cfg, dispatcher)
    const res = await fetch(`${base(cfg)}/boletos/pagamentos/agendamentos/${encodeURIComponent(idPagamento)}`, {
      method: 'DELETE', headers: headers(cfg, token), body: JSON.stringify({ numeroConta: cfg.numeroConta }), ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit)
    if (!res.ok) return { ok: false, error: `Sicoob retornou ${res.status}` }
    return { ok: true }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Erro ao cancelar agendamento.' } }
}
