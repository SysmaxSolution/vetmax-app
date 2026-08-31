'use client'

import { Pencil, Building2, Percent, Tag } from 'lucide-react'
import type { PartnerClinic } from '@/lib/actions/partner-clinics'

function formatCnpj(doc: string | null): string {
  if (!doc) return ''
  const d = doc.replace(/\D/g, '')
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}

interface Props {
  clinic:       PartnerClinic
  priceTableName?: string
  canEdit:      boolean
  onEdit:       (c: PartnerClinic) => void
}

export default function PartnerClinicCard({ clinic, priceTableName, canEdit, onEdit }: Props) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-xl border bg-white px-4 sm:px-5 py-4 hover:shadow-sm transition-all ${
      clinic.is_active
        ? 'border-slate-200 hover:border-slate-300'
        : 'border-slate-200 bg-slate-50/50 opacity-70'
    }`}>
      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
        {/* Avatar */}
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
          <Building2 className="h-5 w-5" />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-900 truncate">{clinic.name}</p>
            {clinic.commission_enabled && clinic.commission_percent != null && (
              <span className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">
                <Percent className="h-3 w-3" />
                {Number(clinic.commission_percent).toLocaleString('pt-BR')}% comissão
              </span>
            )}
            {priceTableName && (
              <span className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 bg-teal-100 text-teal-700">
                <Tag className="h-3 w-3" />
                {priceTableName}
              </span>
            )}
            {!clinic.is_active && (
              <span className="text-xs rounded-full bg-slate-200 text-slate-600 px-2 py-0.5 font-medium">
                Inativa
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 truncate">
            {clinic.cnpj && (
              <>
                <span className="text-slate-400">CNPJ:</span>{' '}
                <span className="font-medium text-slate-700">{formatCnpj(clinic.cnpj)}</span>
              </>
            )}
            {clinic.contact_name && (
              <span className="ml-1.5 text-slate-400">· {clinic.contact_name}</span>
            )}
            {clinic.phone && (
              <span className="ml-1.5 text-slate-400">· {clinic.phone}</span>
            )}
          </p>
        </div>
      </div>

      {/* Ações */}
      {canEdit && (
        <div className="flex-shrink-0 flex items-center gap-2 pl-14 sm:pl-0">
          <button
            type="button"
            onClick={() => onEdit(clinic)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            title="Editar clínica parceira"
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
