'use server'

// Ações do PIX dinâmico no caixa (gated por "Utiliza integração PIX?").
// createPixCharge: cria a cobrança e devolve o brcode p/ o QR.
// checkPixCharge: consulta o status (para a baixa automática ao confirmar).

import { getFinancialIntegrations } from '@/lib/actions/financial-integrations'
import { createPixCob, getPixCobStatus, type PixConfig } from '@/lib/integrations/sicoob-pix'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

import { mensagemErro } from '@/lib/errors'

/**
 * Credencial do Pix: o bloco da tela MAIS o certificado da empresa.
 *
 * O certificado não está no formulário de propósito — ele é o mesmo e-CNPJ que
 * o extrato, a cobrança e o PAGFOR já usam, guardado cifrado por empresa. Pedir
 * de novo seria pedir à clínica que mantivesse duas cópias da mesma credencial
 * em dia.
 *
 * Em produção o Pix v2 EXIGE TLS mútuo (regra do BACEN). Sem resolver o
 * certificado aqui, a chamada falha no aperto de mão — antes de qualquer token.
 */
async function pixConfig(): Promise<PixConfig | { error: string }> {
  const cfg = await getFinancialIntegrations()
  if (!cfg.pix_enabled) {
    return { error: 'A integração PIX não está ativada para esta clínica.' }
  }

  const ambiente = cfg.pix.environment === 'production' ? 'production' : 'sandbox'
  const chave = (cfg.pix.pix_key ?? '').trim()

  // Sandbox não tem certificado nem chave de verdade: segue direto.
  if (ambiente !== 'production') {
    return { environment: 'sandbox', client_id: cfg.pix.client_id, pfx: null, passphrase: null, chave }
  }

  if (!cfg.pix.client_id?.trim()) {
    return { error: 'O Client ID do PIX não está preenchido.' }
  }
  if (!chave) {
    return { error: 'A chave PIX que recebe os pagamentos não está cadastrada.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sua sessão expirou. Entre de novo para continuar.' }
  const { data: perfil } = await supabase.from('profiles').select('clinic_id').eq('id', user.id).single()
  const clinicId = perfil?.clinic_id as string | undefined
  if (!clinicId) return { error: 'Perfil sem clínica.' }

  // A conta Sicoob padrão diz de QUAL empresa é o certificado. Com vários
  // CNPJs na mesma clínica, apresentar o certificado de um na conta de outro
  // faz o banco recusar a conexão.
  const admin = createAdminClient()
  const { data: conta } = await admin.from('bank_accounts')
    .select('id, agency, account, bank_code, company_id')
    .eq('clinic_id', clinicId).eq('bank_code', '756')
    .order('is_default', { ascending: false }).limit(1).maybeSingle()
  if (!conta) return { error: 'Nenhuma conta do banco está cadastrada.' }

  const { resolverConfigSicoob } = await import('@/lib/integrations/sicoob-config')
  const r = await resolverConfigSicoob(admin, clinicId, {
    id: (conta as { id?: string }).id ?? null,
    agency: (conta as { agency?: string | null }).agency ?? null,
    account: (conta as { account?: string | null }).account ?? null,
    bank_code: '756',
    company_id: (conta as { company_id?: string | null }).company_id ?? null,
  })
  if ('error' in r) return { error: r.error }

  return {
    environment: 'production',
    // O Client ID do Pix é próprio: no portal do Sicoob cada API tem o seu
    // aplicativo, e o do extrato não serve aqui.
    client_id: cfg.pix.client_id.trim(),
    pfx: r.config.pfx,
    passphrase: r.config.passphrase,
    chave,
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
  } catch (e) { return { error: mensagemErro(e, 'lib/actions/pix.ts') } }
}

export async function checkPixCharge(txid: string): Promise<{ status: string; paid: boolean; e2eid: string | null } | { error: string }> {
  const cfg = await pixConfig()
  if ('error' in cfg) return cfg
  try {
    const st = await getPixCobStatus(cfg, txid)
    return { status: st.status, paid: st.paid, e2eid: st.e2eid }
  } catch (e) { return { error: mensagemErro(e, 'lib/actions/pix.ts') } }
}
