'use server'

// Empresas Faturantes (multi-CNPJ) — Sprint Animais, Fase 0 (0.2 + base 0.7).
// Entidades de faturamento dentro de UM tenant/clínica (Emp 001/002/003 = 3 CNPJs).
// Mesmo acesso; a OS aponta a empresa faturante; no recebimento o valor é
// quebrado por empresa (contas a receber/NFS-e por CNPJ = Fase 1).
// Tabela companies tem RLS sem policy pública → acesso via service role.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface Company {
  id: string
  clinic_id: string
  code: string
  name: string
  legal_name: string | null
  cnpj: string | null
  municipal_registration: string | null
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CompanyInput {
  id?: string
  code: string
  name: string
  legal_name?: string | null
  cnpj?: string | null
  municipal_registration?: string | null
  is_default?: boolean
  is_active?: boolean
}

async function getCtx() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' as const }
  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica' as const }
  return { clinic_id: profile.clinic_id as string, role: profile.role as string }
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
  if (error) return { error: `Erro ao listar empresas: ${error.message}` }
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

  const admin = createAdminClient()

  // Só uma empresa padrão por clínica: se marcar esta como padrão, desmarca as outras.
  if (input.is_default) {
    await admin.from('companies').update({ is_default: false }).eq('clinic_id', ctx.clinic_id)
  }

  const payload = {
    clinic_id: ctx.clinic_id,
    code,
    name,
    legal_name: input.legal_name?.trim() || null,
    cnpj: input.cnpj?.trim() || null,
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
    if (error) return { error: `Erro ao atualizar: ${error.message}` }
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
    return { error: `Erro ao criar: ${error.message}` }
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
  if (error) return { error: `Erro: ${error.message}` }
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
