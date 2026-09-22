// Integração Sicoob — API Cobrança Bancária v3 (emissão/consulta/baixa de boletos).
// Auth: OAuth2 client_credentials + mTLS e-CNPJ A1 (produção). SANDBOX usa
// credenciais públicas de teste (mock Apigee), SEM certificado — permite
// construir/validar o schema antes de o cliente ter o e-CNPJ.
import 'server-only'
import { buildBoletoPayload, parseBoletoResponse, type BoletoInput, type SicoobBoletoConfig, type BoletoResult } from './sicoob-cobranca-map'

const SANDBOX = {
  base:      'https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria/v3',
  client_id: '9b5e603e428cc477a2841e2683c92d21',
  token:     '1301865f-c6bc-38f3-9f49-666dbcfc59c3',
}
const PROD_BASE = 'https://api.sicoob.com.br/cobranca-bancaria/v3'
const TOKEN_URL = 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token'
const SCOPE = 'boletos_inclusao boletos_consulta boletos_alteracao'

export interface CobrancaRuntime extends SicoobBoletoConfig {
  environment: 'sandbox' | 'production'
  clientId?: string   // produção
}

function isSandbox(cfg: CobrancaRuntime) { return cfg.environment !== 'production' }

async function mtlsDispatcher(cfg: CobrancaRuntime): Promise<unknown> {
  if (isSandbox(cfg)) return undefined
  // e-CNPJ A1 (undici Agent {connect:{pfx}}) é plugado no onboarding — pendente.
  throw new Error('Produção Sicoob Cobrança requer o certificado e-CNPJ A1 (mTLS) da clínica — pendente de onboarding.')
}

async function getToken(cfg: CobrancaRuntime, dispatcher: unknown): Promise<string> {
  if (isSandbox(cfg)) return SANDBOX.token
  if (!cfg.clientId) throw new Error('Client ID Sicoob não configurado para produção.')
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: cfg.clientId, scope: SCOPE })
  const res = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
    ...(dispatcher ? { dispatcher } : {}),
  } as RequestInit)
  if (!res.ok) throw new Error(`Falha no token Sicoob (${res.status}).`)
  const j = await res.json() as { access_token?: string }
  if (!j.access_token) throw new Error('Token Sicoob ausente na resposta.')
  return j.access_token
}

function headers(cfg: CobrancaRuntime, token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    client_id: isSandbox(cfg) ? SANDBOX.client_id : (cfg.clientId ?? ''),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}
function base(cfg: CobrancaRuntime) { return isSandbox(cfg) ? SANDBOX.base : PROD_BASE }

/** Inclui (emite) um boleto registrado. Retorna linha digitável/código de barras/PDF. */
export async function incluirBoleto(cfg: CobrancaRuntime, input: BoletoInput): Promise<{ ok: true; result: BoletoResult; raw: unknown } | { ok: false; error: string; raw?: unknown }> {
  try {
    const dispatcher = await mtlsDispatcher(cfg)
    const token = await getToken(cfg, dispatcher)
    const payload = buildBoletoPayload(cfg, input)
    const res = await fetch(`${base(cfg)}/boletos`, {
      method: 'POST', headers: headers(cfg, token), body: JSON.stringify(payload),
      ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit)
    const raw = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = (raw as any)?.mensagens?.[0]?.mensagem || (raw as any)?.message || `Sicoob retornou ${res.status}`
      return { ok: false, error: String(msg), raw }
    }
    return { ok: true, result: parseBoletoResponse(raw), raw }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao emitir boleto.' }
  }
}

/** Consulta a situação de um boleto pelo nosso número. */
export async function consultarBoleto(cfg: CobrancaRuntime, nossoNumero: string): Promise<{ ok: true; raw: unknown } | { ok: false; error: string }> {
  try {
    const dispatcher = await mtlsDispatcher(cfg)
    const token = await getToken(cfg, dispatcher)
    const q = new URLSearchParams({ numeroCliente: String(cfg.numeroCliente), codigoModalidade: String(cfg.codigoModalidade), nossoNumero })
    const res = await fetch(`${base(cfg)}/boletos?${q}`, { headers: headers(cfg, token), ...(dispatcher ? { dispatcher } : {}) } as RequestInit)
    const raw = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: `Sicoob retornou ${res.status}` }
    return { ok: true, raw }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao consultar boleto.' }
  }
}

/** Comanda a baixa/cancelamento de um boleto. */
export async function baixarBoleto(cfg: CobrancaRuntime, nossoNumero: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const dispatcher = await mtlsDispatcher(cfg)
    const token = await getToken(cfg, dispatcher)
    const res = await fetch(`${base(cfg)}/boletos/baixa`, {
      method: 'PATCH', headers: headers(cfg, token),
      body: JSON.stringify({ numeroCliente: cfg.numeroCliente, codigoModalidade: cfg.codigoModalidade, nossoNumero }),
      ...(dispatcher ? { dispatcher } : {}),
    } as RequestInit)
    if (!res.ok) return { ok: false, error: `Sicoob retornou ${res.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erro ao baixar boleto.' }
  }
}
