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
import { encryptSecret, lerPfx } from '@/lib/integrations/bank-certificate'
import type { CertificadoInfo, CertificadoAceito } from '@/types/bank-certificates'

import { mensagemErro } from '@/lib/errors'
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

export async function listarCertificados(): Promise<CertificadoInfo[]> {
  const c = await ctx(); if ('error' in c) return []
  const { data } = await c.admin
    .from('clinic_bank_certificates')
    .select('bank_code, company_id, file_name, subject_cn, cnpj, not_after, created_at, companies:company_id ( name )')
    .eq('clinic_id', c.clinicId)
  return (data ?? []).map(r => {
    const row = r as Record<string, unknown>
    const venc = (row.not_after as string | null) ?? null
    const emp = row.companies as { name?: string } | { name?: string }[] | null
    return {
      bank_code:    row.bank_code as string,
      company_id:   (row.company_id as string | null) ?? null,
      company_name: (Array.isArray(emp) ? emp[0]?.name : emp?.name) ?? null,
      file_name:    (row.file_name as string | null) ?? null,
      subject_cn:   (row.subject_cn as string | null) ?? null,
      cnpj:         (row.cnpj as string | null) ?? null,
      not_after:    venc,
      dias:         venc ? Math.floor((new Date(venc).getTime() - Date.now()) / 86400000) : null,
      uploaded_at:  row.created_at as string,
    }
  })
}

export async function enviarCertificado(input: {
  bank_code:  string
  /** Empresa faturante dona do certificado. Nulo = certificado da clínica. */
  company_id: string | null
  file_name:  string
  /** Conteúdo do .pfx em base64 (o componente lê o arquivo no navegador). */
  pfx_base64: string
  passphrase: string
}): Promise<CertificadoAceito | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!PODE_EDITAR.includes(c.role)) return { error: 'Sem permissão para configurar o certificado.' }

  let bruto: Buffer
  try { bruto = Buffer.from(input.pfx_base64, 'base64') }
  catch { return { error: 'Arquivo inválido.' } }

  // Lê o arquivo COMO A CERTIFICADORA ENTREGOU (inclusive no container RC2-40
  // que o Node não abre) e devolve um reempacotado em AES-256, já com titular
  // e validade — ninguém digita CNPJ nem vencimento.
  const lido = lerPfx(bruto, input.passphrase)
  if (!lido.ok) return { error: lido.erro }

  const bankCode = (input.bank_code || '756').replace(/\D/g, '') || '756'
  const companyId = input.company_id || null
  const avisos: string[] = []

  // A empresa precisa ser desta clínica — e o CNPJ do certificado tem de ser o
  // dela. Não bloqueia (matriz e filial compartilham raiz, e há caso de
  // procuração), mas avisa alto: subir o certificado da empresa errada só
  // apareceria mais tarde, como recusa do banco no handshake TLS.
  if (companyId) {
    const { data: emp } = await c.admin
      .from('companies').select('name, cnpj')
      .eq('id', companyId).eq('clinic_id', c.clinicId).maybeSingle()
    if (!emp) return { error: 'Empresa faturante não encontrada nesta clínica.' }
    const soDig = (v: unknown) => String(v ?? '').replace(/\D/g, '')
    const doCert = soDig(lido.cnpj)
    const daEmpresa = soDig((emp as { cnpj?: string | null }).cnpj)
    if (doCert && daEmpresa && doCert !== daEmpresa) {
      avisos.push(
        `O CNPJ do certificado (${lido.cnpj}) é diferente do cadastrado em "${(emp as { name: string }).name}". ` +
        'Confirme se é mesmo o certificado desta empresa — o banco recusa a conexão quando não confere.')
    }
  }

  // SELECT e então UPDATE/INSERT, em vez de upsert: `company_id` pode ser nulo
  // (certificado da clínica), e NULL nunca conflita com NULL — um ON CONFLICT
  // criaria uma linha nova a cada envio. Ver migration 0511.
  let q = c.admin.from('clinic_bank_certificates')
    .select('id').eq('clinic_id', c.clinicId).eq('bank_code', bankCode)
  q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null)
  const { data: existente } = await q.maybeSingle()

  const valores = {
    file_name:            input.file_name?.slice(0, 200) ?? null,
    pfx_encrypted:        encryptSecret(lido.pfx),
    passphrase_encrypted: input.passphrase ? encryptSecret(input.passphrase) : null,
    subject_cn:           lido.subject_cn,
    cnpj:                 lido.cnpj,
    not_after:            lido.not_after,
    uploaded_by:          c.userId,
    updated_at:           new Date().toISOString(),
  }

  const { error } = existente
    ? await c.admin.from('clinic_bank_certificates')
        .update(valores).eq('id', (existente as { id: string }).id)
    : await c.admin.from('clinic_bank_certificates')
        .insert({ clinic_id: c.clinicId, bank_code: bankCode, company_id: companyId, ...valores })

  if (error) return { error: 'Erro ao guardar o certificado: ' + mensagemErro(error, 'lib/actions/bank-certificates.ts') }
  revalidatePath('/dashboard/management')
  return { ok: true, subject_cn: lido.subject_cn, cnpj: lido.cnpj, not_after: lido.not_after, avisos }
}

export async function removerCertificado(
  bankCode: string, companyId: string | null = null,
): Promise<{ ok: true } | { error: string }> {
  const c = await ctx(); if ('error' in c) return { error: c.error }
  if (!PODE_EDITAR.includes(c.role)) return { error: 'Sem permissão para configurar o certificado.' }
  let q = c.admin.from('clinic_bank_certificates')
    .delete().eq('clinic_id', c.clinicId).eq('bank_code', (bankCode || '756').replace(/\D/g, '') || '756')
  q = companyId ? q.eq('company_id', companyId) : q.is('company_id', null)
  const { error } = await q
  if (error) return { error: mensagemErro(error, 'lib/actions/bank-certificates.ts') }
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
    .select('id, agency, account, bank_code, company_id')
    .eq('id', bankAccountId).eq('clinic_id', c.clinicId).maybeSingle()
  if (!acct) return { ok: false, etapa: 'conta', detalhe: 'Conta bancária não encontrada nesta clínica.' }

  const { resolverConfigSicoob } = await import('@/lib/integrations/sicoob-config')
  const r = await resolverConfigSicoob(c.admin, c.clinicId, {
    id:         bankAccountId,
    agency:     (acct as { agency?: string | null }).agency ?? null,
    account:    (acct as { account?: string | null }).account ?? null,
    bank_code:  (acct as { bank_code?: string | null }).bank_code ?? null,
    company_id: (acct as { company_id?: string | null }).company_id ?? null,
  })
  if ('error' in r) return { ok: false, etapa: 'configuração', detalhe: r.error }

  const { testarConexaoSicoob } = await import('@/lib/integrations/sicoob')
  const res = await testarConexaoSicoob(r.config)
  return r.avisos.length && res.ok
    ? { ...res, detalhe: res.detalhe + ' · ' + r.avisos.join(' · ') }
    : res
}
