'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import type { StockCategory } from '@/lib/stock-constants'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CatalogItemType = 'consultation' | 'medication' | 'exam' | 'other' | 'grooming'

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

// ─── Catálogo Global de Produtos Veterinários ─────────────────────────────────

export interface GlobalCatalogSuggestion {
  id:          string
  name:        string
  brand:       string
  category:    StockCategory
  unit:        string
  price_avg:   number | null
  ncm:         string | null
  barcode:     string | null
}

// Base curada de produtos veterinários comuns (substituída por tabela no Supabase se existir)
const GLOBAL_VET_CATALOG: GlobalCatalogSuggestion[] = [
  // Antibióticos
  { id: 'g-001', name: 'Amoxicilina 500mg',          brand: 'Ceva Saúde Animal',  category: 'medication', unit: 'comprimido', price_avg: 48.90, ncm: '3004.20.99', barcode: null },
  { id: 'g-002', name: 'Amoxicilina 500mg',          brand: 'Syntec',             category: 'medication', unit: 'comprimido', price_avg: 42.50, ncm: '3004.20.99', barcode: null },
  { id: 'g-003', name: 'Amoxicilina 500mg',          brand: 'Chemitec',           category: 'medication', unit: 'comprimido', price_avg: 39.90, ncm: '3004.20.99', barcode: null },
  { id: 'g-004', name: 'Amoxicilina 250mg',          brand: 'Ceva Saúde Animal',  category: 'medication', unit: 'comprimido', price_avg: 28.50, ncm: '3004.20.99', barcode: null },
  { id: 'g-005', name: 'Amoxicilina + Clavulanato',  brand: 'Clavamox',           category: 'medication', unit: 'comprimido', price_avg: 85.00, ncm: '3004.20.99', barcode: null },
  { id: 'g-006', name: 'Metronidazol 250mg',         brand: 'Genérico',           category: 'medication', unit: 'comprimido', price_avg: 22.00, ncm: '3004.90.99', barcode: null },
  { id: 'g-007', name: 'Doxiciclina 100mg',          brand: 'Chemitec',           category: 'medication', unit: 'comprimido', price_avg: 35.00, ncm: '3004.20.99', barcode: null },
  { id: 'g-008', name: 'Enrofloxacino 50mg',         brand: 'Baytril',            category: 'medication', unit: 'comprimido', price_avg: 68.00, ncm: '3004.20.99', barcode: null },
  { id: 'g-009', name: 'Enrofloxacino 150mg',        brand: 'Baytril',            category: 'medication', unit: 'comprimido', price_avg: 95.00, ncm: '3004.20.99', barcode: null },
  // Anti-inflamatórios
  { id: 'g-010', name: 'Meloxicam 1mg',              brand: 'Mobic Vet',          category: 'medication', unit: 'comprimido', price_avg: 45.00, ncm: '3004.90.99', barcode: null },
  { id: 'g-011', name: 'Meloxicam 2mg',              brand: 'Ceva Saúde Animal',  category: 'medication', unit: 'comprimido', price_avg: 58.00, ncm: '3004.90.99', barcode: null },
  { id: 'g-012', name: 'Carprofeno 25mg',            brand: 'Rimadyl',            category: 'medication', unit: 'comprimido', price_avg: 72.00, ncm: '3004.90.99', barcode: null },
  { id: 'g-013', name: 'Carprofeno 100mg',           brand: 'Rimadyl',            category: 'medication', unit: 'comprimido', price_avg: 128.00, ncm: '3004.90.99', barcode: null },
  { id: 'g-014', name: 'Prednisolona 5mg',           brand: 'Genérico',           category: 'medication', unit: 'comprimido', price_avg: 18.00, ncm: '3004.32.90', barcode: null },
  { id: 'g-015', name: 'Dexametasona 2mg/mL inj.',  brand: 'Vetnil',             category: 'medication', unit: 'frasco',     price_avg: 32.00, ncm: '3004.32.90', barcode: null },
  // Antiparasitários
  { id: 'g-016', name: 'Ivermectina 1% inj.',        brand: 'Ivergen',            category: 'medication', unit: 'frasco',     price_avg: 28.00, ncm: '3004.90.99', barcode: null },
  { id: 'g-017', name: 'Praziquantel + Pamoato Pirantel', brand: 'Drontal',      category: 'medication', unit: 'comprimido', price_avg: 18.50, ncm: '3004.90.99', barcode: null },
  { id: 'g-018', name: 'Milbemicina + Praziquantel', brand: 'Milbemax',           category: 'medication', unit: 'comprimido', price_avg: 65.00, ncm: '3004.90.99', barcode: null },
  { id: 'g-019', name: 'Fluralaner 112,5mg',         brand: 'Bravecto',           category: 'medication', unit: 'comprimido', price_avg: 185.00, ncm: '3004.90.99', barcode: null },
  { id: 'g-020', name: 'Afoxolaner 28,3mg',          brand: 'NexGard',            category: 'medication', unit: 'comprimido', price_avg: 95.00, ncm: '3004.90.99', barcode: null },
  // Analgésicos / Sedativos
  { id: 'g-021', name: 'Tramadol 100mg/2mL inj.',   brand: 'Genérico',           category: 'controlled_medication', unit: 'ampola', price_avg: 8.50, ncm: '3004.90.99', barcode: null },
  { id: 'g-022', name: 'Butorfanol 10mg/mL inj.',   brand: 'Torbugesic',         category: 'controlled_medication', unit: 'frasco', price_avg: 95.00, ncm: '3004.90.99', barcode: null },
  { id: 'g-023', name: 'Diazepam 5mg/mL inj.',      brand: 'Genérico',           category: 'controlled_medication', unit: 'ampola', price_avg: 5.00, ncm: '3004.32.90', barcode: null },
  // Vacinas
  { id: 'g-024', name: 'Vacina V8 (Polivalente)',   brand: 'Duramune',           category: 'clinic_product', unit: 'dose', price_avg: 35.00, ncm: '3002.20.19', barcode: null },
  { id: 'g-025', name: 'Vacina V10 (Polivalente)',  brand: 'Vanguard Plus 10',   category: 'clinic_product', unit: 'dose', price_avg: 45.00, ncm: '3002.20.19', barcode: null },
  { id: 'g-026', name: 'Vacina Antirrábica',        brand: 'Nobivac Rabia',      category: 'clinic_product', unit: 'dose', price_avg: 28.00, ncm: '3002.20.19', barcode: null },
  // Fluidos / Soros
  { id: 'g-027', name: 'Soro Fisiológico 0,9% 500mL', brand: 'Fresenius',       category: 'clinic_product', unit: 'frasco', price_avg: 8.00,  ncm: '3004.90.99', barcode: null },
  { id: 'g-028', name: 'Ringer Lactato 500mL',      brand: 'Fresenius',          category: 'clinic_product', unit: 'frasco', price_avg: 9.50,  ncm: '3004.90.99', barcode: null },
  { id: 'g-029', name: 'Glicose 5% 500mL',          brand: 'Fresenius',          category: 'clinic_product', unit: 'frasco', price_avg: 9.00,  ncm: '3004.90.99', barcode: null },
  // Suplementos
  { id: 'g-030', name: 'Suplemento Vitamínico B12', brand: 'Vetnil',             category: 'medication', unit: 'frasco',     price_avg: 25.00, ncm: '3004.50.90', barcode: null },
  { id: 'g-031', name: 'Omega 3 Cão e Gato',        brand: 'Avert',              category: 'petshop',    unit: 'frasco',     price_avg: 48.00, ncm: '2106.90.90', barcode: null },
  // Grooming / Higiene
  { id: 'g-032', name: 'Shampoo Dermatológico',     brand: 'Dermadog',           category: 'grooming_supply', unit: 'frasco', price_avg: 38.00, ncm: '3305.10.00', barcode: null },
  { id: 'g-033', name: 'Shampoo Antipulgas',        brand: 'Frontline',          category: 'grooming_supply', unit: 'frasco', price_avg: 42.00, ncm: '3305.10.00', barcode: null },
  { id: 'g-034', name: 'Condicionador Pelo Longo',  brand: 'Petshamp',           category: 'grooming_supply', unit: 'frasco', price_avg: 28.00, ncm: '3305.90.00', barcode: null },
  // Insumos clínicos
  { id: 'g-035', name: 'Luva Descartável M (cx 100)', brand: 'Nugard',           category: 'clinic_product', unit: 'caixa',  price_avg: 35.00, ncm: '3926.20.00', barcode: null },
  { id: 'g-036', name: 'Seringa 3mL c/ agulha (cx 100)', brand: 'BD',           category: 'clinic_product', unit: 'caixa',  price_avg: 45.00, ncm: '9018.31.10', barcode: null },
  { id: 'g-037', name: 'Gaze Estéril (cx 25)',      brand: 'Cremer',             category: 'clinic_product', unit: 'caixa',  price_avg: 22.00, ncm: '3005.90.19', barcode: null },
]

/**
 * Busca no catálogo global veterinário curado.
 * Retorna até `limit` sugestões que correspondem ao termo de busca.
 * Não requer autenticação pois são dados públicos.
 */
export async function searchGlobalCatalog(
  query: string,
  limit = 6,
): Promise<GlobalCatalogSuggestion[]> {
  if (!query || query.trim().length < 3) return []

  const q = query.trim().toLowerCase()

  const results = GLOBAL_VET_CATALOG.filter(item =>
    item.name.toLowerCase().includes(q) ||
    item.brand.toLowerCase().includes(q)
  )

  return results.slice(0, limit)
}
