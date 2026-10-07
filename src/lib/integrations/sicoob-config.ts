// Resolve a configuração Sicoob EFETIVA de uma clínica, juntando o que estava
// em três lugares diferentes: a tela de Integrações Financeiras (ambiente e
// client_id), o cadastro da conta bancária (agência/conta) e o certificado
// e-CNPJ A1 cifrado.
//
// Existe porque a integração lia variáveis de ambiente e ignorava tudo isso —
// a clínica marcava "Produção" na tela e a conciliação continuava trazendo os
// lançamentos fictícios do sandbox.
//
// Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptSecret } from './bank-certificate'
import type { SicoobConfig } from './sicoob'

interface BancoConfigurado {
  bank_code?:   string
  provider?:    string
  environment?: string
  client_id?:   string
  agencia?:     string
  conta?:       string
}

const soDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/**
 * Escolhe, entre os bancos configurados, o que corresponde à conta usada.
 * Casa por agência+conta; na falta disso, pelo código do banco.
 */
export function escolherBanco(
  bancos: BancoConfigurado[],
  conta: { agency?: string | null; account?: string | null; bank_code?: string | null },
): BancoConfigurado | null {
  const porConta = bancos.find(b =>
    soDigitos(b.conta) && soDigitos(b.conta) === soDigitos(conta.account) &&
    (!soDigitos(b.agencia) || soDigitos(b.agencia) === soDigitos(conta.agency)))
  if (porConta) return porConta
  const porBanco = bancos.filter(b => soDigitos(b.bank_code) === soDigitos(conta.bank_code))
  return porBanco.length === 1 ? porBanco[0] : null
}

export interface ResolucaoSicoob {
  config: SicoobConfig
  /** Avisos de configuração que valem mostrar mesmo quando dá para prosseguir. */
  avisos: string[]
}

export async function resolverConfigSicoob(
  admin: SupabaseClient,
  clinicId: string,
  conta: { agency?: string | null; account?: string | null; bank_code?: string | null },
): Promise<ResolucaoSicoob | { error: string }> {
  const avisos: string[] = []

  const { data: integ } = await admin
    .from('clinic_bank_integrations')
    .select('bank_enabled, banks')
    .eq('clinic_id', clinicId).maybeSingle()

  if (!integ || (integ as { bank_enabled?: boolean }).bank_enabled !== true) {
    return { error: 'A integração bancária não está ativada para esta clínica (Configurações > Financeiro).' }
  }

  const bancos = Array.isArray((integ as { banks?: unknown }).banks)
    ? ((integ as { banks: BancoConfigurado[] }).banks)
    : []
  const banco = escolherBanco(bancos, conta)
  if (!banco) {
    return { error: 'Nenhum banco configurado corresponde a esta conta. Confira agência e conta em Configurações > Financeiro.' }
  }
  if ((banco.provider ?? 'sicoob') !== 'sicoob') {
    return { error: `A conta está configurada com a integração "${banco.provider}", que não busca extrato.` }
  }

  const environment: SicoobConfig['environment'] =
    banco.environment === 'production' ? 'production' : 'sandbox'

  if (environment === 'sandbox') {
    avisos.push('Ambiente SANDBOX: os lançamentos são fictícios, do ambiente de teste do Sicoob — não são da conta real.')
  }

  const cfg: SicoobConfig = {
    environment,
    client_id: String(banco.client_id ?? '').trim(),
    pfx: null,
    passphrase: null,
  }

  if (environment === 'production') {
    const { data: cert } = await admin
      .from('clinic_bank_certificates')
      .select('pfx_encrypted, passphrase_encrypted, not_after')
      .eq('clinic_id', clinicId)
      .eq('bank_code', soDigitos(banco.bank_code) || '756')
      .maybeSingle()

    if (!cert) {
      return { error: 'Produção exige o certificado e-CNPJ A1 da empresa. Envie o arquivo .pfx em Configurações > Financeiro.' }
    }
    cfg.pfx = decryptSecret((cert as { pfx_encrypted: string }).pfx_encrypted)
    const senha = decryptSecret((cert as { passphrase_encrypted: string | null }).passphrase_encrypted)
    cfg.passphrase = senha ? senha.toString('utf8') : null
    if (!cfg.pfx) {
      return { error: 'Não foi possível decifrar o certificado guardado. Envie o arquivo novamente.' }
    }

    const venc = (cert as { not_after: string | null }).not_after
    if (venc) {
      const dias = Math.floor((new Date(venc).getTime() - Date.now()) / 86400000)
      if (dias < 0) return { error: `O certificado e-CNPJ venceu em ${new Date(venc).toLocaleDateString('pt-BR')}. Renove para voltar a buscar o extrato.` }
      if (dias <= 30) avisos.push(`O certificado e-CNPJ vence em ${dias} dia(s) — providencie a renovação.`)
    }
  }

  return { config: cfg, avisos }
}
