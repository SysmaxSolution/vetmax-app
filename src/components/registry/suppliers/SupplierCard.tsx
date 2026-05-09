'use client'

import { Pencil, Pill, UtensilsCrossed, Wrench, Briefcase, SprayCan, FileText, Package } from 'lucide-react'
import type { Supplier, SupplierCategory } from '@/lib/actions/suppliers'

const CATEGORY_META: Record<SupplierCategory, { label: string; icon: React.ElementType; color: string }> = {
  medicamentos:  { label: 'Medicamentos', icon: Pill,             color: 'bg-rose-100 text-rose-700'       },
  alimentos:     { label: 'Alimentos',    icon: UtensilsCrossed,  color: 'bg-amber-100 text-amber-700'     },
  equipamentos:  { label: 'Equipamentos', icon: Wrench,           color: 'bg-blue-100 text-blue-700'       },
  servicos:      { label: 'Serviços',     icon: Briefcase,        color: 'bg-purple-100 text-purple-700'   },
  limpeza:       { label: 'Limpeza',      icon: SprayCan,         color: 'bg-cyan-100 text-cyan-700'       },
  escritorio:    { label: 'Escritório',   icon: FileText,         color: 'bg-slate-100 text-slate-700'     },
  outros:        { label: 'Outros',       icon: Package,          color: 'bg-emerald-100 text-emerald-700' },
}

function formatDocument(doc: string | null): string {
  if (!doc) return ''
  const d = doc.replace(/\D/g, '')
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}

interface Props {
  supplier:  Supplier
  canEdit:   boolean
  onEdit:    (s: Supplier) => void
}

export default function SupplierCard({ supplier, canEdit, onEdit }: Props) {
  const meta = CATEGORY_META[supplier.category] ?? CATEGORY_META.outros
  const Icon = meta.icon

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-xl border bg-white px-4 sm:px-5 py-4 hover:shadow-sm transition-all ${
      supplier.is_active
        ? 'border-slate-200 hover:border-slate-300'
        : 'border-slate-200 bg-slate-50/50 opacity-70'
    }`}>
      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
        {/* Avatar */}
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${meta.color}`}>
          <Icon className="h-5 w-5" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-900 truncate">{supplier.name}</p>
            <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${meta.color}`}>
              {meta.label}
            </span>
            {!supplier.is_active && (
              <span className="text-xs rounded-full bg-slate-200 text-slate-600 px-2 py-0.5 font-medium">
                Inativo
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 truncate">
            {supplier.document && (
              <>
                <span className="text-slate-400">Doc:</span>{' '}
                <span className="font-medium text-slate-700">{formatDocument(supplier.document)}</span>
              </>
            )}
            {supplier.contact_person && (
              <span className="ml-1.5 text-slate-400">· {supplier.contact_person}</span>
            )}
            {supplier.phone && (
              <span className="ml-1.5 text-slate-400">· {supplier.phone}</span>
            )}
          </p>
        </div>
      </div>

      {/* Ações */}
      {canEdit && (
        <div className="flex-shrink-0 flex items-center gap-2 pl-14 sm:pl-0">
          <button
            type="button"
            onClick={() => onEdit(supplier)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            title="Editar fornecedor"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="hidden xs:inline">Editar Cadastro</span>
            <span className="xs:hidden">Editar</span>
          </button>
        </div>
      )}
    </div>
  )
}
