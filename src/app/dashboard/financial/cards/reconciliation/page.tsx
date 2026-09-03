import { requireModuleAccess } from '@/lib/server/require-module'
import CardReconciliation from '@/components/financial/CardReconciliation'

export const metadata = { title: 'Conciliação de Cartões — Financeiro | SysVetMax' }

export default async function CardReconciliationPage() {
  await requireModuleAccess('financial')
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-4">
        <a href="/dashboard/financial/cards" className="text-xs text-slate-500 hover:text-slate-700">← Recebíveis de Cartão</a>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 mt-1">Conciliação de Cartões</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Importe o extrato da adquirente e cruze com os títulos do sistema (NSU, valor bruto/líquido, taxa, data).
        </p>
      </div>
      <CardReconciliation />
    </div>
  )
}
