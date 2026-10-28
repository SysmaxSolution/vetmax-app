'use server'

// Empresas Faturantes (multi-CNPJ) — Sprint Animais, Fase 0 (0.2 + base 0.7).
// Entidades de faturamento dentro de UM tenant/clínica (Emp 001/002/003 = 3 CNPJs).
// Mesmo acesso; a OS aponta a empresa faturante; no recebimento o valor é
// quebrado por empresa (contas a receber/NFS-e por CNPJ = Fase 1).
// Tabela companies tem RLS sem policy pública → acesso via service role.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

import { mensagemErro } from '@/lib/errors'
import { zCpfCnpjPreservandoFormato } from '@/lib/validation/primitivos'
import { variantesCnpj } from '@/lib/clinics/grupo-empresas'
import type { Company, CompanyInput } from '@/types/companies'

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role, is_sysmax')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' as const }
  return { clinic_id: profile.clinic_id as string, role: profile.role as string, is_sysmax: profile.is_sysmax === true }
}

const CAN_MANAGE = ['admin', 'owner', 'manager']

export async function listCompanies(): Promise<Company[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('companies')
    .select('id, clinic_id, code, name, legal_name, cnpj, municipal_registration, is_default, is_active, created_at, updated_at')
    .eq('clinic_id', ctx.clinic_id)
    .order('code', { ascending: true })
  if (error) return { error: `Erro ao listar empresas: ${mensagemErro(error, 'lib/actions/companies.ts')}` }
  return (data ?? []) as Company[]
}

export async function upsertCompany(input: CompanyInput): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!CAN_MANAGE.includes(ctx.role)) return { error: 'Sem permissão' }

  const code = input.code.trim()
  const name = input.name.trim()
  if (!code) return { error: 'Informe o código da empresa (ex.: 001)' }
  if (name.length < 2) return { error: 'Nome deve ter ao menos 2 caracteres' }

  // CNPJ é o documento que vai na NFS-e e no boleto. Sem conferir o dígito
  // aqui, o erro só aparece como rejeição da prefeitura ou do banco, depois
  // da nota já numerada. Preserva o formato gravado (produção usa máscara).
  const cnpjInformado = input.cnpj?.trim() || null
  if (cnpjInformado) {
    const c = zCpfCnpjPreservandoFormato.safeParse(cnpjInformado)
    if (!c.success) return { error: c.error.issues[0]?.message ?? 'CNPJ inválido.' }
  }

  const admin = createAdminClient()

  // Empresa com CNPJ de OUTRA clínica do SYSVETMAX liga as duas num grupo e
  // permite ao admin daqui dar acesso de usuários lá (src/lib/clinics/grupo-empresas.ts).
  // Por isso só o suporte SysMax cadastra esse tipo de empresa — senão qualquer
  // admin entraria em tenant alheio digitando um CNPJ.
  if (cnpjInformado && !ctx.is_sysmax) {
    const variantes = variantesCnpj(cnpjInformado)
    if (variantes.length) {
      // Leitura entre tenants de propósito e só para existência: não devolve
      // nome nem id da outra clínica, para o admin não enumerar quem usa o sistema.
      const { count } = await admin.from('clinics').select('id', { count: 'exact', head: true })
        .in('cnpj', variantes).neq('id', ctx.clinic_id)
      if ((count ?? 0) > 0) return { error: 'Este CNPJ pertence a outra clínica cadastrada no SYSVETMAX. Para ligar as duas empresas num grupo, peça ao suporte SysMax.' }
    }
  }

  // Só uma empresa padrão por clínica: se marcar esta como padrão, desmarca as outras.
  if (input.is_default) {
    await admin.from('companies').update({ is_default: false }).eq('clinic_id', ctx.clinic_id)
  }

  const payload = {
    clinic_id: ctx.clinic_id,
    code,
    name,
    legal_name: input.legal_name?.trim() || null,
    cnpj: cnpjInformado,
    municipal_registration: input.municipal_registration?.trim() || null,
    is_default: input.is_default === true,
    is_active: input.is_active !== false,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { data, error } = await admin
      .from('companies')
      .update(payload)
      .eq('id', input.id)
      .eq('clinic_id', ctx.clinic_id)
      .select('id')
      .single()
    if (error) return { error: `Erro ao atualizar: ${mensagemErro(error, 'lib/actions/companies.ts')}` }
    revalidatePath('/dashboard/management')
    return { id: data.id as string }
  }

  const { data, error } = await admin
    .from('companies')
    .insert(payload)
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') return { error: `Já existe uma empresa com o código ${code}` }
    return { error: `Erro ao criar: ${mensagemErro(error, 'lib/actions/companies.ts')}` }
  }
  revalidatePath('/dashboard/management')
  return { id: data.id as string }
}

export async function setCompanyActive(id: string, is_active: boolean): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!CAN_MANAGE.includes(ctx.role)) return { error: 'Sem permissão' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('companies')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('clinic_id', ctx.clinic_id)
  if (error) return { error: `Erro: ${mensagemErro(error, 'lib/actions/companies.ts')}` }
  revalidatePath('/dashboard/management')
  return { ok: true }
}

// Lista enxuta (ativas) para selects no check-in/serviços.
export async function listActiveCompanies(): Promise<{ id: string; code: string; name: string; is_default: boolean }[]> {
  const ctx = await getCtx()
  if ('error' in ctx) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('companies')
    .select('id, code, name, is_default')
    .eq('clinic_id', ctx.clinic_id)
    .eq('is_active', true)
    .order('code', { ascending: true })
  return (data ?? []) as { id: string; code: string; name: string; is_default: boolean }[]
}
