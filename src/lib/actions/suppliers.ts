'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type SupplierCategory =
  | 'medicamentos' | 'alimentos' | 'equipamentos'
  | 'servicos' | 'limpeza' | 'escritorio' | 'outros'

export interface Supplier {
  id:             string
  clinic_id:      string
  name:           string
  document:       string | null
  category:       SupplierCategory
  phone:          string | null
  email:          string | null
  address:        string | null
  contact_person: string | null
  notes:          string | null
  is_active:      boolean
  created_at:     string
  created_by:     string | null
  updated_at:     string
}

export interface SupplierInput {
  id?:            string
  name:           string
  document?:      string
  category:       SupplierCategory
  phone?:         string
  email?:         string
  address?:       string
  contact_person?:string
  notes?:         string
  is_active?:     boolean
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

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
  return { clinic_id: profile.clinic_id, user_id: user.id, role: profile.role as string, supabase }
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listSuppliers(filters?: {
  q?:         string
  category?:  SupplierCategory
  is_active?: boolean
}): Promise<Supplier[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  let query = ctx.supabase
    .from('suppliers')
    .select('id, clinic_id, name, document, category, phone, email, address, contact_person, notes, is_active, created_at, created_by, updated_at')
    .eq('clinic_id', ctx.clinic_id)

  if (filters?.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active)
  }
  if (filters?.category) {
    query = query.eq('category', filters.category)
  }
  if (filters?.q && filters.q.trim()) {
    query = query.ilike('name', `%${filters.q.trim()}%`)
  }

  const { data, error } = await query.order('name', { ascending: true })
  if (error) return { error: `Erro ao listar fornecedores: ${error.message}` }
  return (data ?? []) as Supplier[]
}

// ─── Search (autocomplete) ────────────────────────────────────────────────────

export async function searchSuppliers(query: string): Promise<Supplier[] | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  const term = query.trim()
  if (term.length < 2) return []

  const { data, error } = await ctx.supabase
    .from('suppliers')
    .select('id, clinic_id, name, document, category, phone, email, address, contact_person, notes, is_active, created_at, created_by, updated_at')
    .eq('clinic_id', ctx.clinic_id)
    .eq('is_active', true)
    .ilike('name', `%${term}%`)
    .order('name')
    .limit(10)

  if (error) return { error: error.message }
  return (data ?? []) as Supplier[]
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

export async function upsertSupplier(
  input: SupplierInput,
): Promise<{ id: string } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  if (!['admin','owner','manager'].includes(ctx.role)) {
    return { error: 'Apenas administradores e gerentes podem cadastrar fornecedores' }
  }

  const name = input.name.trim()
  if (name.length < 2) return { error: 'Nome do fornecedor deve ter ao menos 2 caracteres' }

  const VALID_CATS: SupplierCategory[] = ['medicamentos','alimentos','equipamentos','servicos','limpeza','escritorio','outros']
  if (!VALID_CATS.includes(input.category)) {
    return { error: 'Categoria inválida' }
  }

  const payload = {
    clinic_id:      ctx.clinic_id,
    name,
    document:       input.document?.trim() || null,
    category:       input.category,
    phone:          input.phone?.trim() || null,
    email:          input.email?.trim() || null,
    address:        input.address?.trim() || null,
    contact_person: input.contact_person?.trim() || null,
    notes:          input.notes?.trim() || null,
    is_active:      input.is_active !== false,
  }

  if (input.id) {
    const { data, error } = await ctx.supabase
      .from('suppliers')
      .update(payload)
      .eq('id', input.id)
      .eq('clinic_id', ctx.clinic_id)
      .select('id')
      .single()

    if (error) {
      if (error.message.includes('suppliers_unique_per_clinic')) {
        return { error: `Já existe um fornecedor com o nome "${name}"` }
      }
      return { error: `Erro ao atualizar: ${error.message}` }
    }

    revalidatePath('/dashboard/registry')
    return { id: data.id }
  }

  const { data, error } = await ctx.supabase
    .from('suppliers')
    .insert({ ...payload, created_by: ctx.user_id })
    .select('id')
    .single()

  if (error) {
    if (error.message.includes('suppliers_unique_per_clinic')) {
      return { error: `Já existe um fornecedor com o nome "${name}"` }
    }
    return { error: `Erro ao cadastrar: ${error.message}` }
  }

  revalidatePath('/dashboard/registry')
  return { id: data.id }
}

// ─── Deactivate (soft delete) ─────────────────────────────────────────────────

export async function deactivateSupplier(
  supplierId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  if (!['admin','owner','manager'].includes(ctx.role)) {
    return { error: 'Apenas administradores e gerentes podem desativar fornecedores' }
  }

  const { error } = await ctx.supabase
    .from('suppliers')
    .update({ is_active: false })
    .eq('id', supplierId)
    .eq('clinic_id', ctx.clinic_id)

  if (error) return { error: `Erro ao desativar: ${error.message}` }

  revalidatePath('/dashboard/registry')
  return { success: true }
}

// ─── Reactivate ───────────────────────────────────────────────────────────────

export async function reactivateSupplier(
  supplierId: string,
): Promise<{ success: true } | { error: string }> {
  const ctx = await getCtx()
  if ('error' in ctx) return { error: ctx.error as string }

  if (!['admin','owner','manager'].includes(ctx.role)) {
    return { error: 'Apenas administradores e gerentes podem reativar fornecedores' }
  }

  const { error } = await ctx.supabase
    .from('suppliers')
    .update({ is_active: true })
    .eq('id', supplierId)
    .eq('clinic_id', ctx.clinic_id)

  if (error) return { error: `Erro ao reativar: ${error.message}` }

  revalidatePath('/dashboard/registry')
  return { success: true }
}
