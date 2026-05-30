'use client'

import { useState, useTransition } from 'react'
import {
  listCreditCards, createCreditCard, updateCreditCard, deleteCreditCard,
  type CreditCard, type CreateCreditCardData,
} from '@/lib/actions/financial'
import { Plus, Pencil, Trash2, X, Loader2, AlertCircle, CreditCard as CardIcon, ToggleLeft, ToggleRight } from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const BRANDS = [
  { value: 'visa',      label: 'Visa' },
  { value: 'master',    label: 'Mastercard' },
  { value: 'elo',       label: 'Elo' },
  { value: 'amex',      label: 'American Express' },
  { value: 'hipercard', label: 'Hipercard' },
  { value: 'other',     label: 'Outro' },
] as const

const TYPES = [
  { value: 'credit', label: 'Crédito' },
  { value: 'debit',  label: 'Débito' },
  { value: 'both',   label: 'Crédito + Débito' },
] as const

const BRAND_COLORS: Record<string, string> = {
  visa: 'bg-blue-100 text-blue-700',
  master: 'bg-red-100 text-red-700',
  elo: 'bg-amber-100 text-amber-700',
  amex: 'bg-emerald-100 text-emerald-700',
  hipercard: 'bg-purple-100 text-purple-700',
  other: 'bg-slate-100 text-slate-600',
}

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20'
const labelClass = 'block text-xs font-semibold text-slate-500 uppercase mb-1.5'

// ─── Types ────────────────────────────────────────────────name ───────────────

interface Props {
  initialCards: CreditCard[]
}

const emptyForm = (): CreateCreditCardData => ({
  name: '', administrator: '', brand: 'other', type: 'credit',
  installments_max: 1, fee_percent: 0, days_to_receive: 30, requires_nsu: false,
})

// ─── Modal ────────────────────────────────────────────────────────────────────

function CardModal({
  mode,
  card,
  onClose,
  onSuccess,
}: {
  mode: 'create' | 'edit'
  card?: CreditCard
  onClose: () => void
  onSuccess: (cards: CreditCard[]) => void
}) {
  const [form, setForm] = useState<CreateCreditCardData>(
    card
      ? {
          name: card.name, administrator: card.administrator ?? '',
          brand: card.brand, type: card.type,
          installments_max: card.installments_max,
          fee_percent: card.fee_percent,
          days_to_receive: card.days_to_receive,
          requires_nsu: card.requires_nsu ?? false,
        }
      : emptyForm()
  )
  // Campos numéricos como string para permitir edição livre (apagar o 0, usar vírgula).
  const [feePercent,     setFeePercent]     = useState<string>(card ? String(card.fee_percent).replace('.', ',') : '')
  const [daysToReceive,  setDaysToReceive]  = useState<string>(card ? String(card.days_to_receive) : '30')
  const [maxInstallments, setMaxInstallments] = useState<string>(card ? String(card.installments_max) : '1')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [confirmDel, setConfirmDel] = useState(false)

  function handleSave() {
    setError(null)
    const feeVal   = feePercent.trim()     === '' ? 0 : parseFloat(feePercent.replace(',', '.'))
    const daysVal  = daysToReceive.trim()  === '' ? 0 : parseInt(daysToReceive, 10)
    const instaVal = maxInstallments.trim() === '' ? 1 : parseInt(maxInstallments, 10)

    if (!form.name.trim()) { setError('Nome obrigatório.'); return }
    if (!Number.isFinite(feeVal) || feeVal < 0 || feeVal > 100) { setError('Taxa deve ser entre 0% e 100%.'); return }
    if (!Number.isFinite(instaVal) || instaVal < 1) { setError('Máximo de parcelas deve ser >= 1.'); return }
    if (!Number.isFinite(daysVal) || daysVal < 0) { setError('Prazo (dias) inválido.'); return }

    const payload: CreateCreditCardData = {
      ...form, fee_percent: feeVal, days_to_receive: daysVal, installments_max: instaVal,
      requires_nsu: form.requires_nsu ?? false,
    }

    startTransition(async () => {
      const res = mode === 'create'
        ? await createCreditCard(payload)
        : await updateCreditCard(card!.id, payload)

      if ('error' in res) { setError((res as { error: string }).error); return }
      const listRes = await listCreditCards()
      onSuccess(Array.isArray(listRes) ? listRes : [])
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteCreditCard(card!.id)
      if (res?.error) { setError(res.error); return }
      const listRes = await listCreditCards()
      onSuccess(Array.isArray(listRes) ? listRes : [])
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-800">
            {mode === 'create' ? 'Novo Cartão / Maquininha' : 'Editar Cartão'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className={labelClass}>Nome / Apelido *</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className={fieldClass} placeholder="Ex: Cielo Visa Crédito" />
          </div>

          <div>
            <label className={labelClass}>Administradora</label>
            <input value={form.administrator ?? ''} onChange={e => setForm(f => ({ ...f, administrator: e.target.value }))}
              className={fieldClass} placeholder="Ex: Cielo, Stone, PagSeguro..." />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Bandeira</label>
              <select value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value as CreditCard['brand'] }))} className={fieldClass}>
                {BRANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Tipo</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as CreditCard['type'] }))} className={fieldClass}>
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Taxa (%)</label>
              <input
                type="text" inputMode="decimal"
                value={feePercent}
                onChange={e => setFeePercent(e.target.value.replace(/[^0-9.,]/g, ''))}
                className={fieldClass} placeholder="2,50"
              />
            </div>
            <div>
              <label className={labelClass}>Prazo (dias)</label>
              <input
                type="text" inputMode="numeric"
                value={daysToReceive}
                onChange={e => setDaysToReceive(e.target.value.replace(/[^0-9]/g, ''))}
                className={fieldClass} placeholder="30"
              />
            </div>
            <div>
              <label className={labelClass}>Máx. Parcelas</label>
              <input
                type="text" inputMode="numeric"
                value={maxInstallments}
                onChange={e => setMaxInstallments(e.target.value.replace(/[^0-9]/g, ''))}
                className={fieldClass} placeholder="12"
              />
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 cursor-pointer hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={form.requires_nsu ?? false}
              onChange={e => setForm(f => ({ ...f, requires_nsu: e.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="flex-1">
              <span className="text-sm font-semibold text-slate-800">Exigir NSU e Nº de Liberação</span>
              <span className="block text-xs text-slate-500 mt-0.5">
                Marcado: o caixa/PDV obriga NSU e Nº de Liberação no recebimento (típico de POS Cielo, Stone, Rede).
                Desmarcado: ambos opcionais — útil para link de pagamento, cartão tokenizado in-app e vouchers.
              </span>
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {confirmDel && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-red-700">Excluir este cartão?</p>
              <div className="flex gap-2">
                <button onClick={handleDelete} disabled={isPending}
                  className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Confirmar'}
                </button>
                <button onClick={() => setConfirmDel(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-4">
          {mode === 'edit' && !confirmDel && (
            <button onClick={() => setConfirmDel(true)}
              className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100">
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
          )}
          <div className="flex-1" />
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={handleSave} disabled={isPending}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === 'create' ? 'Criar Cartão' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CreditCardsTab({ initialCards }: Props) {
  const [cards, setCards] = useState<CreditCard[]>(initialCards)
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; card?: CreditCard } | null>(null)
  const [isPending, startTransition] = useTransition()

  function toggleActive(card: CreditCard) {
    startTransition(async () => {
      await updateCreditCard(card.id, {} as CreateCreditCardData)
      // Optimistic toggle
      setCards(prev => prev.map(c => c.id === card.id ? { ...c, is_active: !c.is_active } : c))
    })
  }

  function handleModalSuccess(updated: CreditCard[]) {
    setCards(updated)
    setModal(null)
  }

  const brandLabel = (brand: string) => BRANDS.find(b => b.value === brand)?.label ?? brand
  const typeLabel  = (type: string)  => TYPES.find(t => t.value === type)?.label ?? type

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{cards.length} cartão/maquininha{cards.length !== 1 ? 's' : ''} cadastrado{cards.length !== 1 ? 's' : ''}</p>
        <button
          onClick={() => setModal({ mode: 'create' })}
          className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" /> Novo Cartão
        </button>
      </div>

      {/* List */}
      {cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-slate-200 bg-white">
          <CardIcon className="h-10 w-10 text-slate-200 mb-3" />
          <p className="text-sm text-slate-400 font-medium">Nenhum cartão cadastrado.</p>
          <button onClick={() => setModal({ mode: 'create' })}
            className="mt-3 text-sm text-teal-600 font-semibold hover:text-teal-700">
            + Adicionar cartão
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto -mx-px">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Nome</th>
                  <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Bandeira</th>
                  <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Tipo</th>
                  <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase">Taxa</th>
                  <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase hidden md:table-cell">Prazo</th>
                  <th className="py-3 px-4 text-left text-xs font-bold text-slate-500 uppercase hidden md:table-cell">Parcelas</th>
                  <th className="py-3 px-4 text-center text-xs font-bold text-slate-500 uppercase">Ativo</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {cards.map(card => (
                  <tr key={card.id} className={`border-b border-slate-100 hover:bg-teal-50/40 transition-colors ${!card.is_active ? 'opacity-50' : ''}`}>
                    <td className="py-3 px-4">
                      <p className="text-sm font-semibold text-slate-800">{card.name}</p>
                      {card.administrator && <p className="text-xs text-slate-400">{card.administrator}</p>}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BRAND_COLORS[card.brand]}`}>
                        {brandLabel(card.brand)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">{typeLabel(card.type)}</td>
                    <td className="py-3 px-4 text-sm text-slate-600">{card.fee_percent.toFixed(2)}%</td>
                    <td className="py-3 px-4 text-sm text-slate-600 hidden md:table-cell">{card.days_to_receive}d</td>
                    <td className="py-3 px-4 text-sm text-slate-600 hidden md:table-cell">até {card.installments_max}x</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => toggleActive(card)}
                        disabled={isPending}
                        className="text-slate-400 hover:text-teal-600 transition-colors min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                      >
                        {card.is_active
                          ? <ToggleRight className="h-5 w-5 text-teal-600" />
                          : <ToggleLeft className="h-5 w-5" />}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <button onClick={() => setModal({ mode: 'edit', card })}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-teal-600 transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <CardModal
          mode={modal.mode}
          card={modal.card}
          onClose={() => setModal(null)}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  )
}
