'use client'

import { useState, useTransition } from 'react'
import { X, Loader2, Trash2, CheckCircle, AlertCircle } from 'lucide-react'
import {
  createEntry, updateEntry, deleteEntry, baixarTitulo,
  type FinancialEntry, type EntryType,
} from '@/lib/actions/financial'

// ─── Payment methods (static — G-10 adicionará gestão dinâmica) ───────────────

const PAYMENT_METHODS = [
  'Dinheiro', 'PIX', 'Cartão de Crédito', 'Cartão de Débito',
  'Boleto', 'Transferência', 'Cheque', 'Outros',
]

const CATEGORIES_RECEIVABLE = [
  'Consulta', 'Exame', 'Internação', 'Banho e Tosa', 'Cirurgia',
  'Vacina', 'Medicamento', 'Plano de Saúde', 'Outros',
]
const CATEGORIES_PAYABLE = [
  'Aluguel', 'Energia', 'Água', 'Internet', 'Folha de Pagamento',
  'Fornecedor', 'Medicamentos', 'Material', 'Equipamento', 'Impostos', 'Outros',
]

// ─── Types ────────────────────────────────────────────────────────────────────

type ModalMode = 'create' | 'edit' | 'baixar'

interface Props {
  mode:      ModalMode
  entryType: EntryType
  entry?:    FinancialEntry
  onClose:   () => void
  onSuccess: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(v: string): string {
  const digits = v.replace(/\D/g, '')
  const num = Number(digits) / 100
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseCurrency(v: string): number {
  return Number(v.replace(/\./g, '').replace(',', '.'))
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TituloModal({ mode, entryType, entry, onClose, onSuccess }: Props) {
  const [innerMode, setInnerMode] = useState<ModalMode>(mode)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Campos do formulário
  const [description, setDescription] = useState(entry?.description ?? '')
  const [amountStr,   setAmountStr]   = useState(entry ? fmtCurrency(String(Math.round(entry.amount * 100))) : '')
  const [dueDate,     setDueDate]     = useState(entry?.due_date ?? todayStr())
  const [category,    setCategory]    = useState(entry?.category ?? '')
  const [notes,       setNotes]       = useState(entry?.notes ?? '')

  // Campos de baixa
  const [paymentDate,   setPaymentDate]   = useState(todayStr())
  const [paymentMethod, setPaymentMethod] = useState(entry?.payment_method ?? '')

  const isReceivable = entryType === 'receivable'
  const categories   = isReceivable ? CATEGORIES_RECEIVABLE : CATEGORIES_PAYABLE
  const title = {
    create: isReceivable ? 'Novo Título a Receber' : 'Novo Título a Pagar',
    edit:   'Editar Título',
    baixar: isReceivable ? 'Baixar / Receber' : 'Baixar / Pagar',
  }[innerMode]

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '')
    if (!raw) { setAmountStr(''); return }
    setAmountStr(fmtCurrency(raw))
  }

  // ── Submit criar/editar ───────────────────────────────────────────────────
  function handleSave() {
    setError(null)
    const amount = parseCurrency(amountStr)
    if (!description.trim()) { setError('Informe a descrição.'); return }
    if (amount <= 0)          { setError('Informe um valor válido.'); return }
    if (!dueDate)             { setError('Informe a data de vencimento.'); return }

    startTransition(async () => {
      const data = {
        type: entryType, description: description.trim(),
        amount, due_date: dueDate,
        category: category || undefined,
        notes:    notes    || undefined,
      }
      const res = innerMode === 'create'
        ? await createEntry(data)
        : await updateEntry(entry!.id, data)

      if (res && 'error' in res) { setError(res.error ?? 'Erro desconhecido'); return }
      onSuccess()
    })
  }

  // ── Submit baixar ─────────────────────────────────────────────────────────
  function handleBaixar() {
    setError(null)
    if (!paymentDate)   { setError('Informe a data de recebimento.'); return }
    if (!paymentMethod) { setError('Informe a modalidade de recebimento.'); return }

    startTransition(async () => {
      const res = await baixarTitulo(entry!.id, { payment_date: paymentDate, payment_method: paymentMethod })
      if (res?.error) { setError(res.error); return }
      onSuccess()
    })
  }

  // ── Submit excluir ────────────────────────────────────────────────────────
  function handleDelete() {
    startTransition(async () => {
      const res = await deleteEntry(entry!.id)
      if (res?.error) { setError(res.error); return }
      onSuccess()
    })
  }

  const fieldClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20'
  const labelClass = 'block text-xs font-semibold text-slate-500 uppercase mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">

          {/* ── Modo: CRIAR / EDITAR ─────────────────────────────────────── */}
          {innerMode !== 'baixar' && (
            <>
              <div>
                <label className={labelClass}>Descrição</label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className={fieldClass}
                  placeholder={isReceivable ? 'Ex: Consulta — Rex' : 'Ex: Aluguel setembro'}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Valor (R$)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">R$</span>
                    <input
                      value={amountStr}
                      onChange={handleAmountChange}
                      className={`${fieldClass} pl-9`}
                      placeholder="0,00"
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Vencimento</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Categoria</label>
                <select value={category} onChange={e => setCategory(e.target.value)} className={fieldClass}>
                  <option value="">— Sem categoria —</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className={labelClass}>Observações</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className={`${fieldClass} resize-none`}
                  placeholder="Informações adicionais..."
                />
              </div>
            </>
          )}

          {/* ── Modo: BAIXAR ─────────────────────────────────────────────── */}
          {innerMode === 'baixar' && entry && (
            <>
              <div className="rounded-xl bg-teal-50 border border-teal-200 px-4 py-3">
                <p className="text-sm font-semibold text-teal-900">{entry.description}</p>
                <p className="text-xs text-teal-600 mt-0.5">
                  Vencimento: {formatDate(entry.due_date)} &nbsp;·&nbsp;
                  Valor: {formatCurrency(entry.amount)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{isReceivable ? 'Data de Recebimento' : 'Data de Pagamento'}</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Modalidade</label>
                  <select
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">— Selecione —</option>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Erro */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Confirmação de exclusão */}
          {confirmDelete && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-red-700">Confirmar exclusão do título?</p>
              <p className="text-xs text-red-500">Esta ação não pode ser desfeita.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Confirmar Exclusão'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!confirmDelete && (
          <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-4">
            {/* Ações de edição: baixar + excluir */}
            {innerMode === 'edit' && entry?.status === 'pending' && (
              <button
                onClick={() => { setInnerMode('baixar'); setError(null) }}
                className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                {isReceivable ? 'Receber' : 'Pagar'}
              </button>
            )}
            {innerMode === 'edit' && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Excluir
              </button>
            )}
            {innerMode === 'baixar' && (
              <button
                onClick={() => { setInnerMode('edit'); setError(null) }}
                className="text-sm text-slate-500 hover:text-slate-700 transition-colors px-1"
              >
                ← Voltar
              </button>
            )}

            <div className="flex-1" />

            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>

            {innerMode === 'baixar' ? (
              <button
                onClick={handleBaixar}
                disabled={isPending}
                className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60 transition-colors"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {isReceivable ? 'Confirmar Recebimento' : 'Confirmar Pagamento'}
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={isPending}
                className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60 transition-colors"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {innerMode === 'create' ? 'Criar Título' : 'Salvar Alterações'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function formatCurrency(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}
