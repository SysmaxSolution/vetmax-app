'use server'

// Ações do PIX dinâmico no caixa (gated por "Utiliza integração PIX?").
// createPixCharge: cria a cobrança e devolve o brcode p/ o QR.
// checkPixCharge: consulta o status (para a baixa automática ao confirmar).

import { getFinancialIntegrations } from '@/lib/actions/financial-integrations'
import { createPixCob, getPixCobStatus, type PixConfig } from '@/lib/integrations/sicoob-pix'

async function pixConfig(): Promise<PixConfig | { error: string }> {
  const cfg = await getFinancialIntegrations()
  if (!cfg.pix_enabled) return { error: 'Integração PIX não está ativada (Gestão > Configurações > Financeiro).' }
  return {
    environment: cfg.pix.environment,
    client_id:   cfg.pix.client_id,
    token:       cfg.pix.token,
    chave:       cfg.pix.pix_key,
  }
}

export async function createPixCharge(params: {
  amount: number; description?: string
}): Promise<{ ok: true; txid: string; brcode: string; environment: 'sandbox' | 'production' } | { error: string }> {
  const cfg = await pixConfig()
  if ('error' in cfg) return cfg
  if (!(params.amount > 0)) return { error: 'Valor inválido para a cobrança PIX.' }
  try {
    const cob = await createPixCob(cfg, { valor: params.amount, descricao: params.description })
    return { ok: true, txid: cob.txid, brcode: cob.brcode, environment: cfg.environment }
  } catch (e) { return { error: (e as Error).message } }
}

export async function checkPixCharge(txid: string): Promise<{ status: string; paid: boolean; e2eid: string | null } | { error: string }> {
  const cfg = await pixConfig()
  if ('error' in cfg) return cfg
  try {
    const st = await getPixCobStatus(cfg, txid)
    return { status: st.status, paid: st.paid, e2eid: st.e2eid }
  } catch (e) { return { error: (e as Error).message } }
}
