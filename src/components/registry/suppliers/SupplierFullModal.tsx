'use client'

import { useState, useTransition } from 'react'
import { X, Save, Loader2, Building2, Trash2, RefreshCcw } from 'lucide-react'
import {
  upsertSupplier, deactivateSupplier, reactivateSupplier,
  type Supplier, type SupplierCategory, type SupplierInput,
} from '@/lib/actions/suppliers'

const CATEGORIES: { value: SupplierCategory; label: string }[] = [
  { value: 'medicamentos',  label: 'Medicamentos'  },
  { value: 'alimentos',     label: 'Alimentos'     },
  { value: 'equipamentos',  label: 'Equipamentos'  },
  { value: 'servicos',      label: 'Serviços'      },
  { value: 'limpeza',       label: 'Limpeza'       },
  { value: 'escritorio',    label: 'Escritório'    },
  { value: 'outros',        label: 'Outros'        },
]

function formatDocument(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) {
    if (d.length <= 3) return d
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  }
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

interface Props {
  supplier?:    Supplier
  prefillName?: string
  onClose:      () => void
  onSuccess:    (id: string) => void
}

export default function SupplierFullModal({ supplier, prefillName, onClose, onSuccess }: Props) {
  const isEdit = !!supplier
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName]               = useState(supplier?.name ?? prefillName ?? '')
  const [document, setDocument]       = useState(supplier?.document ?? '')
  const [category, setCategory]       = useState<SupplierCategory>(supplier?.category ?? 'outros')
  const [phone, setPhone]             = useState(supplier?.phone ?? '')
  const [email, setEmail]             = useState(supplier?.email ?? '')
  const [address, setAddress]         = useState(supplier?.address ?? '')
  const [contactPerson, setContact]   = useState(supplier?.contact_person ?? '')
  const [notes, setNotes]             = useState(supplier?.notes ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (name.trim().length < 2) {
      setError('Nome deve ter ao menos 2 caracteres')
      return
    }

    const payload: SupplierInput = {
      id:             supplier?.id,
      name:           name.trim(),
      document:       document.replace(/\D/g, '') || undefined,
      category,
      phone:          phone.replace(/\D/g, '') || undefined,
      email:          email.trim() || undefined,
      address:        address.trim() || undefined,
      contact_person: contactPerson.trim() || undefined,
      notes:          notes.trim() || undefined,
    }

    startTransition(async () => {
      const res = await upsertSupplier(payload)
      if ('error' in res) {
        setError(res.error)
        return
      }
      onSuccess(res.id)
    })
  }

  function handleDeactivate() {
    if (!supplier) return
    if (!confirm(`Desativar fornecedor "${supplier.name}"? Ele deixará de aparecer no autocomplete do Caixa.`)) return
    startTransition(async () => {
      const res = await deactivateSupplier(supplier.id)
      if ('error' in res) { setError(res.error); return }
      onSuccess(supplier.id)
    })
  }

  function handleReactivate() {
    if (!supplier) return
    startTransition(async () => {
      const res = await reactivateSupplier(supplier.id)
      if ('error' in res) { setError(res.error); return }
      onSuccess(supplier.id)
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-100">
              <Building2 className="h-5 w-5 text-teal-700" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {isEdit ? 'Editar Fornecedor' : 'Novo Fornecedor'}
              </h2>
              <p className="text-xs text-slate-500">
                {isEdit ? 'Atualize as informações cadastrais' : 'Preencha os dados do fornecedor'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Nome + Categoria */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Nome / Razão Social <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoFocus
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Categoria <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as SupplierCategory)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 bg-white"
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* CNPJ/CPF + Telefone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">CNPJ ou CPF</label>
              <input
                type="text"
                value={formatDocument(document)}
                onChange={e => setDocument(e.target.value.replace(/\D/g, ''))}
                placeholder="00.000.000/0000-00"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Telefone</label>
              <input
                type="text"
                value={formatPhone(phone)}
                onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="(00) 00000-0000"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          </div>

          {/* Email + Pessoa de contato */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="contato@fornecedor.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Pessoa de contato</label>
              <input
                type="text"
                value={contactPerson}
                onChange={e => setContact(e.target.value)}
                placeholder="Nome do responsável"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
          </div>

          {/* Endereço */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Endereço</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Rua, número, bairro, cidade — UF"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Observações</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Condições comerciais, prazo de entrega, etc."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-none"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4 flex-shrink-0 bg-slate-50">
          <div>
            {isEdit && supplier?.is_active && (
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Desativar
              </button>
            )}
            {isEdit && supplier && !supplier.is_active && (
              <button
                type="button"
                onClick={handleReactivate}
                disabled={pending}
                className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                Reativar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={pending}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {pending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4" />}
              {isEdit ? 'Salvar' : 'Cadastrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
