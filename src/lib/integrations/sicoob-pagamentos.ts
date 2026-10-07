// Integração Sicoob — API Pagamentos v3: varredura DDA + pagamento/agendamento
// de boletos a fornecedores.
//
// DDA (Débito Direto Autorizado) são os boletos emitidos CONTRA o CNPJ da
// clínica, que ela ainda deve. É uma API diferente da do extrato de propósito:
// boleto não pago não gera movimento na conta, então não existe linha nenhuma
// no extrato para mostrar. O extrato conta o DEPOIS (o dinheiro saiu); o DDA é
// o ANTES (a cobrança chegou). Alimentam coisas diferentes — contas a pagar e
// conciliação.
//
// Auth: OAuth2 client_credentials + mTLS com o e-CNPJ A1 em produção; SANDBOX
// usa credenciais públicas de teste, sem certificado.
//
// O transporte vem de ./sicoob-mtls. Antes havia aqui um `mtlsDispatcher` que
// LANÇAVA em produção ("pendente de onboarding") — o DDA não funcionava em
// produção de jeito nenhum, com ou sem carteira configurada.
//
// Fonte: collection "API Cobrança Bancária Pagamentos" (integracoes/sicoob).
import 'server-only'
import { mapDdaResponse, buildPagamentoPayload, type DdaBoletoLike, type PagamentoInput } from './sicoob-pagamentos-map'
import { chamarSicoob, comoJson, ehSandbox, obterTokenProducao, type CredenciaisSicoob } from './sicoob-mtls'
import { mensagemErro } from '@/lib/errors'

const SANDBOX = {
  base: 'https://sandbox.sicoob.com.br/sicoob/sandbox/cobranca-bancaria-pagamentos/v3',
  client_id: '9b5e603e428cc477a2841e2683c92d21',
  token: '1301865f-c6bc-38f3-9f49-666dbcfc59c3',
}
const PROD_BASE = 'https://api.sicoob.com.br/pagamentos/v3'

/** Escopos MEDIDOS contra o Sicoob de produção (2026-10-07): os três passam. */
export const ESCOPO_PAGAMENTOS = 'pagamentos_inclusao pagamentos_consulta pagamentos_alteracao'

export interface PagamentosRuntime extends CredenciaisSicoob {
  numeroConta: number
  agencia: number
}

async function token(cfg: PagamentosRuntime): Promise<string> {
  return ehSandbox(cfg) ? SANDBOX.token : obterTokenProducao(cfg, ESCOPO_PAGAMENTOS)
}
function headers(cfg: PagamentosRuntime, t: string): Record<string, string> {
  return {
    Authorization: `Bearer ${t}`,
    client_id: ehSandbox(cfg) ? SANDBOX.client_id : (cfg.client_id ?? ''),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}
const base = (cfg: PagamentosRuntime) => (ehSandbox(cfg) ? SANDBOX.base : PROD_BASE)
const ok2xx = (s: number) => s >= 200 && s < 300

function erroDoBanco(raw: unknown, status: number): string {
  const r = raw as { mensagens?: Array<{ mensagem?: string }>; message?: string }
  return String(r?.mensagens?.[0]?.mensagem || r?.message || `Sicoob retornou ${status}`)
}

/** Varredura do DDA — GET /boletos (boletos a pagar registrados contra o CNPJ). */
export async function consultarDDA(cfg: PagamentosRuntime, filtros: { dataInicial: string; dataFinal: string; situacao?: number; tipoData?: number }): Promise<{ ok: true; boletos: DdaBoletoLike[]; raw: unknown } | { ok: false; error: string }> {
  try {
    const t = await token(cfg)
    const q = new URLSearchParams({ numeroConta: String(cfg.numeroConta), dataInicial: filtros.dataInicial, dataFinal: filtros.dataFinal })
    // situacao e tipoData são obrigatórios na API (1 = a pagar / por vencimento).
    q.set('situacao', String(filtros.situacao ?? 1))
    q.set('tipoData', String(filtros.tipoData ?? 1))
    const r = await chamarSicoob(`${base(cfg)}/boletos?${q}`, cfg, { headers: headers(cfg, t) })
    const raw = comoJson(r)
    if (!ok2xx(r.status)) return { ok: false, error: erroDoBanco(raw, r.status) }
    return { ok: true, boletos: mapDdaResponse(raw), raw }
  } catch (e) { return { ok: false, error: e instanceof Error ? mensagemErro(e, 'lib/integrations/sicoob-pagamentos.ts') : 'Erro ao consultar DDA.' } }
}

/** Consulta um boleto antes de pagar — GET /boletos/:codigoBarras (retorna identificadorConsulta). */
export async function consultarBoletoParaPagar(cfg: PagamentosRuntime, codigoBarras: string, dataPagamento: string): Promise<{ ok: true; raw: Record<string, unknown> } | { ok: false; error: string }> {
  try {
    const t = await token(cfg)
    const q = new URLSearchParams({ numeroConta: String(cfg.numeroConta), dataPagamento })
    const r = await chamarSicoob(`${base(cfg)}/boletos/${encodeURIComponent(codigoBarras)}?${q}`, cfg, { headers: headers(cfg, t) })
    const raw = comoJson(r)
    if (!ok2xx(r.status)) return { ok: false, error: erroDoBanco(raw, r.status) }
    return { ok: true, raw }
  } catch (e) { return { ok: false, error: e instanceof Error ? mensagemErro(e, 'lib/integrations/sicoob-pagamentos.ts') : 'Erro ao consultar boleto.' } }
}

/** Paga/agenda um boleto — POST /boletos/pagamentos/:codigoBarras. */
export async function pagarBoleto(cfg: PagamentosRuntime, codigoBarras: string, input: PagamentoInput): Promise<{ ok: true; idPagamento: string | null; raw: unknown } | { ok: false; error: string }> {
  try {
    const t = await token(cfg)
    const r = await chamarSicoob(`${base(cfg)}/boletos/pagamentos/${encodeURIComponent(codigoBarras)}`, cfg, {
      method: 'POST', headers: headers(cfg, t), body: JSON.stringify(buildPagamentoPayload(input)),
    })
    const raw = comoJson<{ resultado?: { idPagamento?: string; id?: string } ; idPagamento?: string; id?: string }>(r)
    if (!ok2xx(r.status)) return { ok: false, error: erroDoBanco(raw, r.status) }
    const res = raw?.resultado ?? raw
    return { ok: true, idPagamento: res?.idPagamento ?? res?.id ?? null, raw }
  } catch (e) { return { ok: false, error: e instanceof Error ? mensagemErro(e, 'lib/integrations/sicoob-pagamentos.ts') : 'Erro ao pagar boleto.' } }
}

/** Comprovante — GET /boletos/pagamentos/:idPagamento/comprovantes. */
export async function consultarComprovante(cfg: PagamentosRuntime, idPagamento: string): Promise<{ ok: true; raw: unknown } | { ok: false; error: string }> {
  try {
    const t = await token(cfg)
    const q = new URLSearchParams({ numeroConta: String(cfg.numeroConta) })
    const r = await chamarSicoob(`${base(cfg)}/boletos/pagamentos/${encodeURIComponent(idPagamento)}/comprovantes?${q}`, cfg, { headers: headers(cfg, t) })
    const raw = comoJson(r)
    if (!ok2xx(r.status)) return { ok: false, error: erroDoBanco(raw, r.status) }
    return { ok: true, raw }
  } catch (e) { return { ok: false, error: e instanceof Error ? mensagemErro(e, 'lib/integrations/sicoob-pagamentos.ts') : 'Erro ao consultar comprovante.' } }
}

/** Cancela um agendamento — DELETE /boletos/pagamentos/agendamentos/:idPagamento. */
export async function cancelarAgendamento(cfg: PagamentosRuntime, idPagamento: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const t = await token(cfg)
    const r = await chamarSicoob(`${base(cfg)}/boletos/pagamentos/agendamentos/${encodeURIComponent(idPagamento)}`, cfg, {
      method: 'DELETE', headers: headers(cfg, t), body: JSON.stringify({ numeroConta: cfg.numeroConta }),
    })
    if (!ok2xx(r.status)) return { ok: false, error: erroDoBanco(comoJson(r), r.status) }
    return { ok: true }
  } catch (e) { return { ok: false, error: e instanceof Error ? mensagemErro(e, 'lib/integrations/sicoob-pagamentos.ts') : 'Erro ao cancelar agendamento.' } }
}
