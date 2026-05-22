import { requireModuleAccess } from '@/lib/server/require-module'
import { listPurchaseOrders } from '@/lib/actions/purchases'
import { listSuppliers } from '@/lib/actions/suppliers'
import PurchasesWorkspace from '@/components/purchases/PurchasesWorkspace'

export const metadata = { title: 'Compras | SysVetMax' }

export default async function PurchasesPage() {
  await requireModuleAccess('purchases')

  const [ordersResult, suppliersResult] = await Promise.all([
    listPurchaseOrders(),
    listSuppliers({ is_active: true }),
  ])

  const orders    = Array.isArray(ordersResult)    ? ordersResult    : []
  const suppliers = Array.isArray(suppliersResult) ? suppliersResult : []

  return <PurchasesWorkspace initialOrders={orders} initialSuppliers={suppliers} />
}
