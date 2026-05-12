'use client'

import { useState, useTransition } from 'react'
import { MODULE_THEME } from '@/lib/module-theme'
import type { PurchaseOrder } from '@/lib/actions/purchases'
import type { Supplier } from '@/lib/actions/suppliers'
import { NFXMLImporter } from './NFXMLImporter'
import { PurchaseOrderCard } from './PurchaseOrderCard'
import { SupplierFormModal } from './SupplierFormModal'
import { listSuppliers } from '@/lib/actions/suppliers'
import { listPurchaseOrders } from '@/lib/actions/purchases'
import { Package, Upload, Users, RefreshCcw } from 'lucide-react'

type Tab = 'entradas' | 'fornecedores'

interface Props {
  initialOrders:    PurchaseOrder[]
  initialSuppliers: Supplier[]
}

export default function PurchasesWorkspace({ initialOrders, initialSuppliers }: Props) {
  const theme = MODULE_THEME.purchases
  const [tab, setTab]               = useState<Tab>('entradas')
  const [orders, setOrders]         = useState<PurchaseOrder[]>(initialOrders)
  const [suppliers, setSuppliers]   = useState<Supplier[]>(initialSuppliers)
  const [showImporter, setShowImporter] = useState(false)
  const [showSupplierForm, setShowSupplierForm] = useState(false)
  const [editingSupplier, setEditingSupplier]   = useState<Supplier | null>(null)
  const [isPending, startTransition]            = useTransition()

  function refreshOrders() {
    startTransition(async () => {
      const res = await listPurchaseOrders()
      if (Array.isArray(res)) setOrders(res)
    })
  }

  function refreshSuppliers() {
    startTransition(async () => {
      const res = await listSuppliers({ is_active: true })
      if (Array.isArray(res)) setSuppliers(res)
    })
  }

  function onOrderImported(order: PurchaseOrder) {
    setOrders(prev => [order, ...prev])
    setShowImporter(false)
  }

  function onSupplierSaved() {
    setShowSupplierForm(false)
    setEditingSupplier(null)
    refreshSuppliers()
  }

  return (
    <div className={`min-h-screen ${theme.bg} pb-10`}>
      {/* Header */}
      <div className={`${theme.bgIntense} border-b border-purple-200 px-4 py-4`}>
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-purple-900">Compras</h1>
            <p className="text-sm text-purple-600">Importação de NF-e e gestão de fornecedores</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { tab === 'entradas' ? refreshOrders() : refreshSuppliers() }}
              disabled={isPending}
              className="flex items-center gap-1.5 rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50 disabled:opacity-50"
            >
              <RefreshCcw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            {tab === 'entradas' && (
              <button
                onClick={() => setShowImporter(true)}
                className={`flex items-center gap-1.5 rounded-lg ${theme.active} px-3 py-2 text-sm font-bold text-white shadow hover:opacity-90`}
              >
                <Upload className="h-4 w-4" />
                Importar NF-e
              </button>
            )}
            {tab === 'fornecedores' && (
              <button
                onClick={() => { setEditingSupplier(null); setShowSupplierForm(true) }}
                className={`flex items-center gap-1.5 rounded-lg ${theme.active} px-3 py-2 text-sm font-bold text-white shadow hover:opacity-90`}
              >
                <Users className="h-4 w-4" />
                Novo Fornecedor
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mx-auto max-w-5xl px-4 pt-4">
        <div className="flex gap-1 rounded-xl bg-purple-100 p-1 w-fit">
          {([
            { key: 'entradas',     label: 'Entradas',     icon: Package },
            { key: 'fornecedores', label: 'Fornecedores', icon: Users },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                tab === key
                  ? 'bg-white text-purple-800 shadow-sm font-semibold'
                  : 'text-purple-600 hover:text-purple-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              {key === 'entradas' && orders.length > 0 && (
                <span className="ml-1 rounded-full bg-purple-200 px-1.5 py-0.5 text-xs font-bold text-purple-800">
                  {orders.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 pt-4">
        {tab === 'entradas' && (
          <div>
            {orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-purple-200 bg-white py-16 text-center">
                <Package className="mb-3 h-12 w-12 text-purple-300" />
                <p className="text-base font-medium text-slate-600">Nenhuma entrada registrada</p>
                <p className="mt-1 text-sm text-slate-400">Importe uma NF-e XML ou registre manualmente</p>
                <button
                  onClick={() => setShowImporter(true)}
                  className={`mt-4 flex items-center gap-2 rounded-lg ${theme.active} px-4 py-2 text-sm font-bold text-white`}
                >
                  <Upload className="h-4 w-4" />
                  Importar NF-e
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map(order => (
                  <PurchaseOrderCard
                    key={order.id}
                    order={order}
                    onStatusChange={refreshOrders}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'fornecedores' && (
          <div>
            {suppliers.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-purple-200 bg-white py-16 text-center">
                <Users className="mb-3 h-12 w-12 text-purple-300" />
                <p className="text-base font-medium text-slate-600">Nenhum fornecedor cadastrado</p>
                <button
                  onClick={() => { setEditingSupplier(null); setShowSupplierForm(true) }}
                  className={`mt-4 flex items-center gap-2 rounded-lg ${theme.active} px-4 py-2 text-sm font-bold text-white`}
                >
                  <Users className="h-4 w-4" />
                  Novo Fornecedor
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {suppliers.map(s => (
                  <div key={s.id} className="flex items-start justify-between rounded-xl border border-purple-100 bg-white p-4 shadow-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{s.name}</p>
                      {s.document && (
                        <p className="text-xs text-slate-500 mt-0.5">CNPJ/CPF: {s.document}</p>
                      )}
                      <p className="text-xs text-purple-600 mt-1 capitalize">{s.category}</p>
                    </div>
                    <button
                      onClick={() => { setEditingSupplier(s); setShowSupplierForm(true) }}
                      className="ml-2 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-purple-300 hover:text-purple-700 shrink-0"
                    >
                      Editar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showImporter && (
        <NFXMLImporter
          onClose={() => setShowImporter(false)}
          onImported={onOrderImported}
        />
      )}

      {showSupplierForm && (
        <SupplierFormModal
          supplier={editingSupplier}
          onClose={() => { setShowSupplierForm(false); setEditingSupplier(null) }}
          onSaved={onSupplierSaved}
        />
      )}
    </div>
  )
}
