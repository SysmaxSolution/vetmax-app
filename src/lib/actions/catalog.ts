'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CatalogItemType = 'consultation' | 'medication' | 'exam' | 'other' | 'grooming'

export interface CatalogSuggestion {
  id:           string
  name:         string
  category:     string
  subcategory:  string | null
  unit:         string | null
  species:      string[] | null
  common_brand: string | null
  brand:        string | null
  ncm:          string | null
  price_avg:    number | null
  barcode:      string | null
}

export interface CatalogItem {
  id:         string
  clinic_id:  string
  item_type:  CatalogItemType
  name:       string
  price:      number
  is_active:  boolean
  created_at: string
}

export interface SaveCatalogPayload {
  id?:       string              // se presente → update; senão → insert
  item_type: CatalogItemType
  name:      string
  price:     number
}

const REVALIDATE_PATH = '/dashboard/management'

// ─── Listar itens do catálogo ─────────────────────────────────────────────────

export async function getCatalog(): Promise<CatalogItem[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }

  const { data, error } = await supabase
    .from('clinic_catalog')
    .select('id, clinic_id, item_type, name, price, is_active, created_at')
    .eq('clinic_id', profile.clinic_id)
    .order('item_type')
    .order('name')

  if (error) return { error: 'Erro ao buscar catálogo: ' + error.message }
  return (data ?? []) as CatalogItem[]
}

// ─── Salvar (criar ou atualizar) ──────────────────────────────────────────────

export async function saveCatalogItem(
  payload: SaveCatalogPayload
): Promise<CatalogItem | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  if (profile.role !== 'admin') return { error: 'Sem permissão.' }

  if (!payload.name.trim()) return { error: 'Nome é obrigatório.' }
  if (payload.price < 0)    return { error: 'Preço não pode ser negativo.' }

  const admin = createAdminClient()
  const record = {
    clinic_id:  profile.clinic_id,
    item_type:  payload.item_type,
    name:       payload.name.trim(),
    price:      payload.price,
    updated_at: new Date().toISOString(),
  }

  let result
  if (payload.id) {
    const { data, error } = await admin
      .from('clinic_catalog')
      .update(record)
      .eq('id', payload.id)
      .eq('clinic_id', profile.clinic_id)
      .select('id, clinic_id, item_type, name, price, is_active, created_at')
      .single()
    if (error || !data) return { error: 'Erro ao atualizar: ' + (error?.message ?? '') }
    result = data
  } else {
    const { data, error } = await admin
      .from('clinic_catalog')
      .insert({ ...record, is_active: true })
      .select('id, clinic_id, item_type, name, price, is_active, created_at')
      .single()
    if (error || !data) return { error: 'Erro ao criar item: ' + (error?.message ?? '') }
    result = data
  }

  revalidatePath(REVALIDATE_PATH)
  return result as CatalogItem
}

// ─── Alternar ativo/inativo ───────────────────────────────────────────────────

export async function toggleCatalogItem(
  id: string,
  is_active: boolean
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  if (profile.role !== 'admin') return { error: 'Sem permissão.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('clinic_catalog')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao atualizar: ' + error.message }
  revalidatePath(REVALIDATE_PATH)
  return { success: true }
}

// ─── Deletar ──────────────────────────────────────────────────────────────────

export async function deleteCatalogItem(
  id: string
): Promise<{ success: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return { error: 'Perfil sem clínica.' }
  if (profile.role !== 'admin') return { error: 'Sem permissão.' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('clinic_catalog')
    .delete()
    .eq('id', id)
    .eq('clinic_id', profile.clinic_id)

  if (error) return { error: 'Erro ao deletar: ' + error.message }
  revalidatePath(REVALIDATE_PATH)
  return { success: true }
}

// ─── Seed defaults (chamado ao criar clínica, se catálogo estiver vazio) ──────

export async function seedDefaultCatalog(
  clinicId: string
): Promise<void> {
  const admin = createAdminClient()

  const { count } = await admin
    .from('clinic_catalog')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)

  if ((count ?? 0) > 0) return // já tem itens

  const defaults: Omit<CatalogItem, 'id' | 'created_at'>[] = [
    { clinic_id: clinicId, item_type: 'consultation', name: 'Consulta Veterinária', price: 150.00, is_active: true },
    { clinic_id: clinicId, item_type: 'consultation', name: 'Retorno / Consulta de Acompanhamento', price: 80.00, is_active: true },
    { clinic_id: clinicId, item_type: 'exam',         name: 'Hemograma Completo', price: 90.00,  is_active: true },
    { clinic_id: clinicId, item_type: 'exam',         name: 'Radiografia (por incidência)', price: 120.00, is_active: true },
    { clinic_id: clinicId, item_type: 'medication',   name: 'Aplicação de Medicamento', price: 35.00,  is_active: true },
    // Banho e Tosa — preços de referência
    { clinic_id: clinicId, item_type: 'grooming', name: 'Banho Simples', price: 50.00, is_active: true },
    { clinic_id: clinicId, item_type: 'grooming', name: 'Banho Completo', price: 70.00, is_active: true },
    { clinic_id: clinicId, item_type: 'grooming', name: 'Tosa Higiênica', price: 40.00, is_active: true },
    { clinic_id: clinicId, item_type: 'grooming', name: 'Tosa Completa', price: 80.00, is_active: true },
    { clinic_id: clinicId, item_type: 'grooming', name: 'Banho + Tosa Completa', price: 120.00, is_active: true },
    { clinic_id: clinicId, item_type: 'grooming', name: 'Hidratação', price: 30.00, is_active: true },
    { clinic_id: clinicId, item_type: 'grooming', name: 'Escovação', price: 25.00, is_active: true },
    { clinic_id: clinicId, item_type: 'grooming', name: 'Corte de Unhas', price: 20.00, is_active: true },
  ]

  await admin.from('clinic_catalog').insert(defaults)
}

// ─── Busca no catálogo global (autocomplete) ──────────────────────────────────

export async function searchGlobalCatalog(
  query: string,
  category?: string,
  limit = 20
): Promise<CatalogSuggestion[] | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado.' }

  const term = query.trim()
  if (!term || term.length < 2) return []

  let q = supabase
    .from('product_catalog_global')
    .select('id, name, category, subcategory, unit, species, common_brand, brand, ncm, price_avg, barcode')
    .or(`name.ilike.%${term}%,common_brand.ilike.%${term}%,brand.ilike.%${term}%,barcode.eq.${term}`)
    .order('brand', { ascending: false, nullsFirst: false })
    .order('name')
    .limit(limit)

  if (category) {
    q = q.eq('category', category)
  }

  const { data, error } = await q
  if (error) return { error: 'Erro ao buscar catálogo global: ' + error.message }
  return (data ?? []) as CatalogSuggestion[]
}
