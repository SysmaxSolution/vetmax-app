'use server'

// Cadastro de Clínicas Parceiras (Sprint Animais, Fase 0, peça 0.8).
// Clínicas que ENCAMINHAM pacientes (B2B). Guarda a tabela de preço usada
// para a parceira e a config de comissão/coparticipação (opcional, ativável).
// Tabela partner_clinics tem RLS sem policy pública → acesso via service role
// (createAdminClient), sempre filtrando por clinic_id manualmente.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface PartnerClinic {
  id: string
  clinic_id: string
  name: string
  legal_name: string | null
  cnpj: string | null
  crmv: string | null
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  price_table_id: string | null
  commission_enabled: boolean
  commission_percent: number | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PartnerClinicInput {
  id?: string
  name: string
  legal_name?: string | null
  cnpj?: string | null
  crmv?: string | null
  contact_name?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  price_table_id?: string | null
  commission_enabled?: boolean
  commission_percent?: number | null
  notes?: string | null
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
  return { clinic_id: profile.clinic_id as string, user_id: user.id, role: profile.role as string }
}

const CAN_MANAGE = ['admin', 'owner', 'manager']

export async function listPartnerClinics(filters?: {
  q?: string
  is_active?: boolean
}): Promise<PartnerClinic[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  const admin = createAdminClient()

  let query = admin
    .from('partner_clinics')
    .select('*')
    .eq('clinic_id', ctx.clinic_id)

  if (filters?.is_active !== undefined) query = query.eq('is_active', filters.is_active)
  if (filters?.q?.trim()) query = query.ilike('name', `%${filters.q.trim()}%`)

  const { data, error } = await query.order('name', { ascending: true })
  if (error) return { error: `Erro ao listar clínicas parceiras: ${error.message}` }
  return (data ?? []) as PartnerClinic[]
}

export async function upsertPartnerClinic(
  input: PartnerClinicInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!CAN_MANAGE.includes(ctx.role))
    return { error: 'Apenas administradores e gerentes podem cadastrar clínicas parceiras' }

  const name = input.name.trim()
  if (name.length < 2) return { error: 'Nome deve ter ao menos 2 caracteres' }

  const pct = input.commission_percent
  if (input.commission_enabled && (pct == null || pct < 0 || pct > 100))
    return { error: 'Informe uma comissão válida (0 a 100%) para ativar o comissionamento' }

  const admin = createAdminClient()
  const payload = {
    clinic_id: ctx.clinic_id,
    name,
    legal_name: input.legal_name?.trim() || null,
    cnpj: input.cnpj?.trim() || null,
    crmv: input.crmv?.trim() || null,
    contact_name: input.contact_name?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    price_table_id: input.price_table_id || null,
    commission_enabled: input.commission_enabled === true,
    commission_percent: input.commission_enabled ? Number(pct) : null,
    notes: input.notes?.trim() || null,
    is_active: input.is_active !== false,
    updated_at: new Date().toISOString(),
  }

  if (input.id) {
    const { data, error } = await admin
      .from('partner_clinics')
      .update(payload)
      .eq('id', input.id)
      .eq('clinic_id', ctx.clinic_id)
      .select('id')
      .single()
    if (error) return { error: `Erro ao atualizar: ${error.message}` }
    revalidatePath('/dashboard/registry')
    return { id: data.id as string }
  }

  const { data, error } = await admin
    .from('partner_clinics')
    .insert(payload)
    .select('id')
    .single()
  if (error) return { error: `Erro ao cadastrar: ${error.message}` }
  revalidatePath('/dashboard/registry')
  return { id: data.id as string }
}

export async function setPartnerClinicActive(
  id: string,
  is_active: boolean,
): Promise<{ ok: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }
  if (!CAN_MANAGE.includes(ctx.role))
    return { error: 'Sem permissão' }
  const admin = createAdminClient()
  const { error } = await admin
    .from('partner_clinics')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('clinic_id', ctx.clinic_id)
  if (error) return { error: `Erro: ${error.message}` }
  revalidatePath('/dashboard/registry')
  return { ok: true }
}

// Tabelas de preço da clínica (para o seletor no modal da parceira).
export async function listPriceTablesLite(): Promise<{ id: string; name: string; slot: number }[]> {
  const ctx = await getCtx()
  if ('error' in ctx) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('price_tables')
    .select('id, name, slot')
    .eq('clinic_id', ctx.clinic_id)
    .eq('is_active', true)
    .order('slot', { ascending: true })
  return (data ?? []) as { id: string; name: string; slot: number }[]
}
