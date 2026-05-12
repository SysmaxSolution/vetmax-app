import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { listPurchaseOrders } from '@/lib/actions/purchases'
import { listSuppliers } from '@/lib/actions/suppliers'
import PurchasesWorkspace from '@/components/purchases/PurchasesWorkspace'

export const metadata = { title: 'Compras | SysVetMax' }

export default async function PurchasesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  const [ordersResult, suppliersResult] = await Promise.all([
    listPurchaseOrders(),
    listSuppliers({ is_active: true }),
  ])

  const orders    = Array.isArray(ordersResult)    ? ordersResult    : []
  const suppliers = Array.isArray(suppliersResult) ? suppliersResult : []

  return <PurchasesWorkspace initialOrders={orders} initialSuppliers={suppliers} />
}
