'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, Plus, Truck } from 'lucide-react'
import { listSuppliers, type Supplier } from '@/lib/actions/suppliers'
import SupplierCard from './SupplierCard'
import SupplierFullModal from './SupplierFullModal'

interface Props {
  initialSuppliers: Supplier[]
  userRole:         string
}

export default function SuppliersTab({ initialSuppliers, userRole }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>(initialSuppliers)
  const [query, setQuery]         = useState('')
  const [searching, setSearching] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null)
  const [showInactive, setShowInactive] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const canManage = ['admin', 'owner', 'manager'].includes(userRole)

  // Busca debounced
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)

    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      const result = await listSuppliers({
        q: query.trim() || undefined,
        is_active: showInactive ? undefined : true,
      })
      setSearching(false)
      if (!('error' in result)) setSuppliers(result)
    }, 350)

    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query, showInactive])

  const refresh = async () => {
    const result = await listSuppliers({
      q: query.trim() || undefined,
      is_active: showInactive ? undefined : true,
    })
    if (!('error' in result)) setSuppliers(result)
  }

  return (
    <>
      {/* Add Modal */}
      {showAddModal && (
        <SupplierFullModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false)
            refresh()
          }}
        />
      )}

      {/* Edit Modal */}
      {editSupplier && (
        <SupplierFullModal
          supplier={editSupplier}
          onClose={() => setEditSupplier(null)}
          onSuccess={() => {
            setEditSupplier(null)
            refresh()
          }}
        />
      )}

      {/* Sub-header com botão + e toggle inativos */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500">
            {suppliers.length} fornecedor{suppliers.length !== 1 ? 'es' : ''}
            {!showInactive && ' ativo' + (suppliers.length !== 1 ? 's' : '')}
          </p>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={e => setShowInactive(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            Mostrar inativos
          </label>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors shadow-sm flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
            Novo Fornecedor
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
          {searching ? (
            <svg className="h-4 w-4 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <Search className="h-4 w-4 text-slate-400" />
          )}
        </div>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar fornecedor por nome..."
          className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 shadow-sm"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute inset-y-0 right-4 flex items-center text-slate-400 hover:text-slate-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* List */}
      {suppliers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-slate-300 bg-white">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <Truck className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-500">
            {query ? `Nenhum fornecedor encontrado para "${query}"` : 'Nenhum fornecedor cadastrado'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {query ? 'Tente um nome diferente' : 'Cadastre o primeiro fornecedor da sua clínica'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {suppliers.map(s => (
            <SupplierCard
              key={s.id}
              supplier={s}
              canEdit={canManage}
              onEdit={setEditSupplier}
            />
          ))}
        </div>
      )}
    </>
  )
}
