// Integração Sicoob — API Cobrança Bancária v3 (emissão/consulta/baixa de boletos).
//
// Auth: OAuth2 client_credentials + mTLS com o e-CNPJ A1 da empresa em
// produção. SANDBOX usa credenciais públicas de teste (mock Apigee), SEM
// certificado — serve para validar o schema antes de a clínica ter o e-CNPJ.
//
// O transporte vem de ./sicoob-mtls. Antes havia aqui um `mtlsDispatcher` que
// LANÇAVA em produção ("pendente de onboarding"), porque tentava usar o
// `dispatcher` do fetch, que exige o undici como pacote. Ou seja: boleto não
// funcionava em produção de jeito nenhum, com ou sem carteira configurada.
import 'server-only'
import { buildBoletoPayload, parseBoletoResponse, type BoletoInput, type SicoobBoletoConfig, type BoletoResult } from './sicoob-cobranca-map'
import { chamarSicoob, comoJson, ehSandbox, obterTokenProducao, type CredenciaisSicoob } from './sicoob-mtls'
import { mensagemErro } from '@/lib/errors'

const SANDBOX = {
  base:      'https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria/v3',
  client_id: '9b5e603e428cc477a2841e2683c92d21',
  token:     '1301865f-c6bc-38f3-9f49-666dbcfc59c3',
}
const PROD_BASE = 'https://api.sicoob.com.br/cobranca-bancaria/v3'

/** Escopos MEDIDOS contra o Sicoob de produção (2026-10-07): os três passam. */
export const ESCOPO_COBRANCA = 'boletos_inclusao boletos_consulta boletos_alteracao'

/** Config da carteira + credenciais da clínica. */
export interface CobrancaRuntime extends SicoobBoletoConfig, CredenciaisSicoob {}

async function token(cfg: CobrancaRuntime): Promise<string> {
  return ehSandbox(cfg) ? SANDBOX.token : obterTokenProducao(cfg, ESCOPO_COBRANCA)
}
function headers(cfg: CobrancaRuntime, t: string): Record<string, string> {
  return {
    Authorization: `Bearer ${t}`,
    client_id: ehSandbox(cfg) ? SANDBOX.client_id : (cfg.client_id ?? ''),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}
const base = (cfg: CobrancaRuntime) => (ehSandbox(cfg) ? SANDBOX.base : PROD_BASE)

/** Mensagem de erro do Sicoob, quando ele manda uma. */
function erroDoBanco(raw: unknown, status: number): string {
  const r = raw as { mensagens?: Array<{ mensagem?: string }>; message?: string }
  return String(r?.mensagens?.[0]?.mensagem || r?.message || `Sicoob retornou ${status}`)
}

/** Inclui (emite) um boleto registrado. Retorna linha digitável/código de barras/PDF. */
export async function incluirBoleto(cfg: CobrancaRuntime, input: BoletoInput): Promise<{ ok: true; result: BoletoResult; raw: unknown } | { ok: false; error: string; raw?: unknown }> {
  try {
    const t = await token(cfg)
    const payload = buildBoletoPayload(cfg, input)
    const r = await chamarSicoob(`${base(cfg)}/boletos`, cfg, {
      method: 'POST', headers: headers(cfg, t), body: JSON.stringify(payload),
    })
    const raw = comoJson(r)
    if (r.status < 200 || r.status >= 300) return { ok: false, error: erroDoBanco(raw, r.status), raw }
    return { ok: true, result: parseBoletoResponse(raw), raw }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? mensagemErro(e, 'lib/integrations/sicoob-cobranca.ts') : 'Erro ao emitir boleto.' }
  }
}

/** Consulta a situação de um boleto pelo nosso número. */
export async function consultarBoleto(cfg: CobrancaRuntime, nossoNumero: string): Promise<{ ok: true; raw: unknown } | { ok: false; error: string }> {
  try {
    const t = await token(cfg)
    const q = new URLSearchParams({ numeroCliente: String(cfg.numeroCliente), codigoModalidade: String(cfg.codigoModalidade), nossoNumero })
    const r = await chamarSicoob(`${base(cfg)}/boletos?${q}`, cfg, { headers: headers(cfg, t) })
    const raw = comoJson(r)
    if (r.status < 200 || r.status >= 300) return { ok: false, error: erroDoBanco(raw, r.status) }
    return { ok: true, raw }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? mensagemErro(e, 'lib/integrations/sicoob-cobranca.ts') : 'Erro ao consultar boleto.' }
  }
}

/** Comanda a baixa/cancelamento de um boleto. */
export async function baixarBoleto(cfg: CobrancaRuntime, nossoNumero: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const t = await token(cfg)
    const r = await chamarSicoob(`${base(cfg)}/boletos/baixa`, cfg, {
      method: 'PATCH', headers: headers(cfg, t),
      body: JSON.stringify({ numeroCliente: cfg.numeroCliente, codigoModalidade: cfg.codigoModalidade, nossoNumero }),
    })
    if (r.status < 200 || r.status >= 300) return { ok: false, error: erroDoBanco(comoJson(r), r.status) }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? mensagemErro(e, 'lib/integrations/sicoob-cobranca.ts') : 'Erro ao baixar boleto.' }
  }
}
