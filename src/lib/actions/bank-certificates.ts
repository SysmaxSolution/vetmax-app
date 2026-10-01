'use server'

// Certificado e-CNPJ A1 da clínica, para a integração bancária (mTLS).
//
// O arquivo entra cifrado e NUNCA volta para o navegador — a tela recebe só
// metadados (nome do arquivo, vencimento, quem enviou). É a credencial que
// autentica a empresa no banco; tratá-la como qualquer outro campo de
// formulário seria errado.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { encryptSecret, validarPfx } from '@/lib/integrations/bank-certificate'

const PODE_EDITAR = ['admin', 'owner', 'manager']

type Ctx = { admin: ReturnType<typeof createAdminClient>; clinicId: string; userId: string; role: string }

async function ctx(): Promise<Ctx | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }
  const { data: profile } = await supabase.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  return {
    admin: createAdminClient(),
    clinicId: profile.clinic_id as string,
    userId: user.id,
    role: (profile.role as string) ?? '',
  }
}

export interface CertificadoInfo {
  bank_code:   string
  file_name:   string | null
  subject_cn:  string | null
  cnpj:        string | null
  not_after:   string | null
  /** Dias até vencer; negativo = vencido. Null quando não informado. */
  dias:        number | null
  uploaded_at: string
}

export async function listarCertificados(): Promise<CertificadoInfo[]> {
  const c = await ctx(); if ('error' in c) return []
  const { data } = await c.admin
    .from('clinic_bank_certificates')
    .select('bank_code, file_name, subject_cn, cnpj, not_after, created_at')
    .eq('clinic_id', c.clinicId)
  return (data ?? []).map(r => {
    const venc = (r as { not_after: string | null }).not_after
    return {
      bank_code:   r.bank_code as string,
      file_name:   (r.file_name as string) ?? null,
      subject_cn:  (r.subject_cn as string) ?? null,
      cnpj:        (r.cnpj as string) ?? null,
      not_after:   venc,
      dias:        venc ? Math.floor((new Date(venc).getTime() - Date.now()) / 86400000) : null,
      uploaded_at: r.created_at as string,
    }
  })
}

export async function enviarCertificado(input: {
  bank_code:  string
  file_name:  string
  /** Conteúdo do .pfx em base64 (o componente lê o arquivo no navegador). */
  pfx_base64: string
  passphrase: string
  /** Opcionais, só para o alerta de vencimento e identificação na tela. */
  cnpj?:      string
  not_after?: string
}): Promise<{ ok: true } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!PODE_EDITAR.includes(c.role)) return { error: 'Sem permissão para configurar o certificado.' }

  let pfx: Buffer
  try { pfx = Buffer.from(input.pfx_base64, 'base64') }
  catch { return { error: 'Arquivo inválido.' } }

  // Valida ANTES de guardar: senha errada e certificado com criptografia
  // antiga são os dois tropeços reais do onboarding, e os dois só apareceriam
  // na hora de puxar o extrato.
  const v = validarPfx(pfx, input.passphrase || undefined)
  if (!v.ok) return { error: v.erro ?? 'Certificado inválido.' }

  const { error } = await c.admin.from('clinic_bank_certificates').upsert({
    clinic_id:            c.clinicId,
    bank_code:            (input.bank_code || '756').replace(/\D/g, '') || '756',
    file_name:            input.file_name?.slice(0, 200) ?? null,
    pfx_encrypted:        encryptSecret(pfx),
    passphrase_encrypted: input.passphrase ? encryptSecret(input.passphrase) : null,
    cnpj:                 input.cnpj?.trim() || null,
    not_after:            input.not_after || null,
    uploaded_by:          c.userId,
    updated_at:           new Date().toISOString(),
  }, { onConflict: 'clinic_id,bank_code' })

  if (error) return { error: 'Erro ao guardar o certificado: ' + error.message }
  revalidatePath('/dashboard/management')
  return { ok: true }
}

export async function removerCertificado(bankCode: string): Promise<{ ok: true } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!PODE_EDITAR.includes(c.role)) return { error: 'Sem permissão para configurar o certificado.' }
  const { error } = await c.admin.from('clinic_bank_certificates')
    .delete().eq('clinic_id', c.clinicId).eq('bank_code', (bankCode || '756').replace(/\D/g, '') || '756')
  if (error) return { error: error.message }
  revalidatePath('/dashboard/management')
  return { ok: true }
}

/** Aperta a mão com o banco e diz em que etapa parou. */
export async function testarIntegracaoBancaria(
  bankAccountId: string,
): Promise<{ ok: boolean; etapa: string; detalhe: string }> {
  const c = await ctx()
  if ('error' in c) return { ok: false, etapa: 'sessão', detalhe: c.error }

  const { data: acct } = await c.admin.from('bank_accounts')
    .select('agency, account, bank_code')
    .eq('id', bankAccountId).eq('clinic_id', c.clinicId).maybeSingle()
  if (!acct) return { ok: false, etapa: 'conta', detalhe: 'Conta bancária não encontrada nesta clínica.' }

  const { resolverConfigSicoob } = await import('@/lib/integrations/sicoob-config')
  const r = await resolverConfigSicoob(c.admin, c.clinicId, {
    agency:    (acct as { agency?: string | null }).agency ?? null,
    account:   (acct as { account?: string | null }).account ?? null,
    bank_code: (acct as { bank_code?: string | null }).bank_code ?? null,
  })
  if ('error' in r) return { ok: false, etapa: 'configuração', detalhe: r.error }

  const { testarConexaoSicoob } = await import('@/lib/integrations/sicoob')
  const res = await testarConexaoSicoob(r.config)
  return r.avisos.length && res.ok
    ? { ...res, detalhe: res.detalhe + ' · ' + r.avisos.join(' · ') }
    : res
}
