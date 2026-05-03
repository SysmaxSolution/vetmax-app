import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getPharmacyStock, getLowStockItems, getPharmacyStockV2, getLowStockItemsV2 } from '@/lib/actions/stock'
import type { StockItem } from '@/lib/actions/stock'
import PharmacyWorkspace from '@/components/pharmacy/PharmacyWorkspace'

export default async function PharmacyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, clinic_id')
    .eq('id', user.id)
    .single()

  // Apenas admin/vet pode gerenciar estoque
  if (!profile || !['admin', 'vet'].includes(profile.role)) {
    redirect('/dashboard')
  }

  if (profile.clinic_id) {
    const { data: clinicRow } = await supabase.from('clinics').select('active_modules').eq('id', profile.clinic_id).single()
    const mods = clinicRow?.active_modules as string[] | null
    if (mods && !mods.includes('pharmacy')) redirect('/dashboard')
  }

  const [stockResult, lowResult, stockV2Result, lowV2Result] = await Promise.all([
    getPharmacyStock(),
    getLowStockItems(),
    getPharmacyStockV2(),
    getLowStockItemsV2(),
  ])

  const stock = Array.isArray(stockResult) ? stockResult : []
  const lowStock = Array.isArray(lowResult) ? lowResult : []

  // Converte itens de stock_items para o formato StockItem (pharmacy_stock) e funde
  const stockV2 = Array.isArray(stockV2Result) ? stockV2Result : []
  const lowV2 = Array.isArray(lowV2Result) ? lowV2Result : []

  const convertV2 = (items: typeof stockV2): StockItem[] =>
    items.map(i => ({
      id: i.id,
      clinic_id: i.clinic_id,
      medication_name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      min_stock_level: i.min_quantity,
      last_restock: i.last_restock,
      created_at: i.created_at,
      updated_at: i.updated_at,
    }))

  const existingIds = new Set(stock.map(s => s.id))
  const mergedStock = [...stock, ...convertV2(stockV2).filter(i => !existingIds.has(i.id))]
    .sort((a, b) => a.medication_name.localeCompare(b.medication_name))

  const existingLowIds = new Set(lowStock.map(s => s.id))
  const mergedLow = [...lowStock, ...convertV2(lowV2).filter(i => !existingLowIds.has(i.id))]

  return <PharmacyWorkspace stock={mergedStock} lowStockItems={mergedLow} userRole={profile.role as 'admin' | 'vet'} />
}
