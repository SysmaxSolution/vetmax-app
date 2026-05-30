'use client'

import { useState, useTransition } from 'react'
import { X, Sparkles, AlertCircle } from 'lucide-react'
import { createQuickService } from '@/lib/actions/services'
import type { SelectedService } from './ServiceComboBox'

const CATEGORIES: { value: string; label: string; isService: boolean }[] = [
  { value: 'vet_service',        label: 'Consulta / Serviço Veterinário', isService: true  },
  { value: 'exam',               label: 'Exame',                          isService: true  },
  { value: 'surgery',            label: 'Cirurgia',                       isService: true  },
  { value: 'grooming_service',   label: 'Banho e Tosa',                   isService: true  },
  { value: 'aesthetics_service', label: 'Estética',                       isService: true  },
  { value: 'clinic_product',     label: 'Produto da Clínica',             isService: false },
  { value: 'petshop',            label: 'Petshop',                        isService: false },
  { value: 'medication',         label: 'Medicação',                      isService: false },
]

interface Props {
  /** Texto inicial pré-preenchido (vem do search do combobox). */
  initialName?: string
  onClose:      () => void
  onCreated:    (item: SelectedService) => void
}

export default function QuickServiceModal({ initialName, onClose, onCreated }: Props) {
  const [name,       setName]       = useState(initialName ?? '')
  const [price,      setPrice]      = useState<string>('')
  const [category,   setCategory]   = useState<string>('vet_service')
  const [unit,       setUnit]       = useState<string>('un')
  const [error,      setError]      = useState<string | null>(null)
  const [pending, startTransition]  = useTransition()

  const isService = CATEGORIES.find(c => c.value === category)?.isService ?? true

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const parsedPrice = parseFloat(price.replace(',', '.'))
    if (!name.trim())                                   { setError('Nome obrigatório.'); return }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) { setError('Preço inválido.'); return }

    startTransition(async () => {
      const res = await createQuickService({
        name:       name.trim(),
        unit_price: parsedPrice,
        category,
        unit:       unit.trim() || 'un',
        is_service: isService,
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      onCreated({ ...res, quantity: 1 })
      onClose()
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cadastro rápido de item"
      className="fixed inset-0 z-[10010] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4 bg-gradient-to-r from-teal-50 to-emerald-50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Cadastro rápido</h2>
              <p className="text-xs text-slate-500">Cria e já adiciona ao atendimento</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div>
            <label htmlFor="qs-name" className="block text-xs font-semibold text-slate-600 mb-1.5">
              Nome <span className="text-red-500">*</span>
            </label>
            <input
              id="qs-name"
              autoFocus
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex.: Consulta Geriátrica, Vacina V8…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>

          <div>
            <label htmlFor="qs-category" className="block text-xs font-semibold text-slate-600 mb-1.5">
              Categoria
            </label>
            <select
              id="qs-category"
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="qs-price" className="block text-xs font-semibold text-slate-600 mb-1.5">
                Preço (R$) <span className="text-red-500">*</span>
              </label>
              <input
                id="qs-price"
                required
                value={price}
                onChange={e => setPrice(e.target.value.replace(/[^0-9.,]/g, ''))}
                inputMode="decimal"
                placeholder="0,00"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
            <div>
              <label htmlFor="qs-unit" className="block text-xs font-semibold text-slate-600 mb-1.5">
                Unidade
              </label>
              <input
                id="qs-unit"
                value={unit}
                onChange={e => setUnit(e.target.value)}
                placeholder="un"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
              />
            </div>
          </div>

          {!isService && (
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              Produto cadastrado com saldo zero. Para entrada de estoque, use Farmácia &gt; Estoque depois.
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || !name.trim() || !price.trim()}
              className="flex-1 rounded-lg bg-teal-600 hover:bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 transition-colors"
            >
              {pending ? 'Salvando…' : 'Salvar e usar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
