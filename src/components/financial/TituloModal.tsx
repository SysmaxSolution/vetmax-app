'use client'

import { useState, useTransition } from 'react'
import { X, Loader2, Trash2, CheckCircle, AlertCircle, RotateCcw, Hash } from 'lucide-react'
import {
  createEntry, updateEntry, deleteEntry, baixarTitulo, reverseFinancialEntry,
  type FinancialEntry, type EntryType, type BaixarTituloData,
} from '@/lib/actions/financial'

// ─── Static lists ─────────────────────────────────────────────────────────────

const CATEGORIES_RECEIVABLE = [
  'Consulta', 'Exame', 'Internação', 'Banho e Tosa', 'Cirurgia',
  'Vacina', 'Medicamento', 'Plano de Saúde', 'Outros',
]
const CATEGORIES_PAYABLE = [
  'Aluguel', 'Energia', 'Água', 'Internet', 'Folha de Pagamento',
  'Fornecedor', 'Medicamentos', 'Material', 'Equipamento', 'Impostos', 'Outros',
]

const PAYMENT_METHODS = [
  'Dinheiro', 'PIX', 'Cartão de Crédito', 'Cartão de Débito',
  'Boleto', 'Transferência', 'Cheque', 'Outros',
]

// ─── Types ────────────────────────────────────────────────────────────────────

type ModalMode = 'create' | 'edit' | 'baixar'

export interface TituloModalProps {
  mode:           ModalMode
  entryType:      EntryType
  entry?:         FinancialEntry
  onClose:        () => void
  onSuccess:      () => void
  bankAccounts:   { id: string; name: string }[]
  chartAccounts:  { id: string; code: string; name: string }[]
  clinicProfiles: { id: string; full_name: string; role: string }[]
  currentUserId:  string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(v: string): string {
  const digits = v.replace(/\D/g, '')
  const num = Number(digits) / 100
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseCurrency(v: string): number {
  return Number(v.replace(/\./g, '').replace(',', '.')) || 0
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function formatCurrency(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(d: string): string {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TituloModal({
  mode, entryType, entry, onClose, onSuccess,
  bankAccounts, chartAccounts, clinicProfiles, currentUserId,
}: TituloModalProps) {
  const [innerMode, setInnerMode] = useState<ModalMode>(mode)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [deleteStep, setDeleteStep] = useState<'none' | 'confirm_reversal' | 'confirm_delete'>('none')

  const isReceivable = entryType === 'receivable'
  const categories   = isReceivable ? CATEGORIES_RECEIVABLE : CATEGORIES_PAYABLE

  // ── Campos do título ───────────────────────────────────────────────────────
  const [description,       setDescription]       = useState(entry?.description ?? '')
  const [amountStr,         setAmountStr]          = useState(entry ? fmtCurrency(String(Math.round(entry.amount * 100))) : '')
  const [discountStr,       setDiscountStr]        = useState(entry ? fmtCurrency(String(Math.round((entry.discount ?? 0) * 100))) : '0,00')
  const [dueDate,           setDueDate]            = useState(entry?.due_date ?? todayStr())
  const [category,          setCategory]           = useState(entry?.category ?? '')
  const [chartAccountsId,   setChartAccountsId]   = useState(entry?.chart_of_accounts_id ?? '')
  const [professionalId,    setProfessionalId]     = useState(entry?.professional_id ?? currentUserId ?? '')
  const [notes,             setNotes]              = useState(entry?.notes ?? '')

  // ── Campos da baixa ────────────────────────────────────────────────────────
  const [paymentDate,       setPaymentDate]        = useState(entry?.payment_date ?? todayStr())
  const [paymentMethod,     setPaymentMethod]      = useState(entry?.payment_method ?? '')
  const [settleBankId,      setSettleBankId]       = useState(entry?.settlement_bank_id ?? '')
  const [interestStr,       setInterestStr]        = useState('0,00')
  const [discountBaixaStr,  setDiscountBaixaStr]   = useState(
    entry ? fmtCurrency(String(Math.round((entry.discount ?? 0) * 100))) : '0,00'
  )

  const title = {
    create: isReceivable ? 'Novo Título a Receber' : 'Novo Título a Pagar',
    edit:   'Editar Título',
    baixar: isReceivable ? 'Baixar / Receber' : 'Baixar / Pagar',
  }[innerMode]

  // Valor líquido na baixa
  const faceValue  = parseCurrency(amountStr)
  const discBaixa  = parseCurrency(discountBaixaStr)
  const interest   = parseCurrency(interestStr)
  const netAmount  = (entry?.amount ?? faceValue) - discBaixa + interest

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '')
    setAmountStr(raw ? fmtCurrency(raw) : '')
  }

  function handleDiscountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '')
    setDiscountStr(raw ? fmtCurrency(raw) : '0,00')
  }

  function handleDiscountBaixaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '')
    setDiscountBaixaStr(raw ? fmtCurrency(raw) : '0,00')
  }

  function handleInterestChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '')
    setInterestStr(raw ? fmtCurrency(raw) : '0,00')
  }

  // ── Salvar título ──────────────────────────────────────────────────────────
  function handleSave() {
    setError(null)
    const amount   = parseCurrency(amountStr)
    const discount = parseCurrency(discountStr)

    if (!description.trim()) { setError('Informe a descrição.'); return }
    if (amount <= 0)          { setError('Informe um valor válido.'); return }
    if (!dueDate)             { setError('Informe a data de vencimento.'); return }
    if (discount > amount)    { setError('Desconto não pode ser maior que o valor.'); return }

    startTransition(async () => {
      const data = {
        type:                 entryType,
        description:          description.trim(),
        amount,
        discount,
        due_date:             dueDate,
        category:             category             || undefined,
        notes:                notes                || undefined,
        professional_id:      professionalId       || undefined,
        chart_of_accounts_id: chartAccountsId      || undefined,
      }
      const res = innerMode === 'create'
        ? await createEntry(data)
        : await updateEntry(entry!.id, data)

      if (res && 'error' in res) { setError(res.error ?? 'Erro desconhecido'); return }
      onSuccess()
    })
  }

  // ── Baixar título ──────────────────────────────────────────────────────────
  function handleBaixar() {
    setError(null)
    if (!paymentDate)   { setError('Informe a data de recebimento.'); return }
    if (!paymentMethod) { setError('Informe a modalidade de recebimento.'); return }

    startTransition(async () => {
      const data: BaixarTituloData = {
        payment_date:        paymentDate,
        payment_method:      paymentMethod,
        settlement_bank_id:  settleBankId || undefined,
        interest:            parseCurrency(interestStr),
        discount:            parseCurrency(discountBaixaStr),
      }
      const res = await baixarTitulo(entry!.id, data)
      if (res?.error) { setError(res.error); return }
      onSuccess()
    })
  }

  // ── Estorno / Exclusão ─────────────────────────────────────────────────────
  function handleDeleteClick() {
    setError(null)
    if (entry?.status === 'paid') {
      setDeleteStep('confirm_reversal')
    } else {
      setDeleteStep('confirm_delete')
    }
  }

  function handleReversal() {
    startTransition(async () => {
      const res = await reverseFinancialEntry(entry!.id)
      if ('error' in res) { setError(res.error); return }
      setDeleteStep('confirm_delete')
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteEntry(entry!.id)
      if (res?.error) { setError(res.error); return }
      onSuccess()
    })
  }

  const fc  = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20'
  const lc  = 'block text-xs font-semibold text-slate-500 uppercase mb-1.5'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-800">{title}</h2>
            {entry?.document_number && innerMode !== 'baixar' && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-500">
                <Hash className="h-3 w-3" />
                {entry.document_number}
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">

          {/* ── Modo criar / editar ───────────────────────────────────── */}
          {innerMode !== 'baixar' && (
            <>
              {/* Descrição */}
              <div>
                <label className={lc}>Descrição do Documento</label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className={fc}
                  placeholder={isReceivable ? 'Ex: Consulta — Rex' : 'Ex: Aluguel setembro'}
                />
              </div>

              {/* Valor + Desconto + Vencimento */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={lc}>Valor (R$)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">R$</span>
                    <input
                      value={amountStr}
                      onChange={handleAmountChange}
                      className={`${fc} pl-9`}
                      placeholder="0,00"
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <div>
                  <label className={lc}>Desconto (R$)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">R$</span>
                    <input
                      value={discountStr}
                      onChange={handleDiscountChange}
                      className={`${fc} pl-9`}
                      placeholder="0,00"
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <div>
                  <label className={lc}>Vencimento</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className={fc}
                  />
                </div>
              </div>

              {/* Data cadastro (somente leitura no edit) */}
              {innerMode === 'edit' && entry && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lc}>Data de Cadastro</label>
                    <input
                      readOnly
                      value={formatDate(entry.created_at.split('T')[0])}
                      className={`${fc} cursor-not-allowed bg-slate-100 text-slate-400`}
                    />
                  </div>
                  {entry.payment_date && (
                    <div>
                      <label className={lc}>Data da Baixa</label>
                      <input
                        readOnly
                        value={formatDate(entry.payment_date)}
                        className={`${fc} cursor-not-allowed bg-slate-100 text-slate-400`}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Categoria + Plano de Contas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={lc}>Categoria</label>
                  <select value={category} onChange={e => setCategory(e.target.value)} className={fc}>
                    <option value="">— Sem categoria —</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lc}>Plano de Contas</label>
                  <select value={chartAccountsId} onChange={e => setChartAccountsId(e.target.value)} className={fc}>
                    <option value="">— Nenhum —</option>
                    {chartAccounts.map(c => (
                      <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pet/Tutor (display only se já vinculado) + Profissional */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(entry?.tutor_name || entry?.patient_name) && (
                  <div>
                    <label className={lc}>Pet / Tutor</label>
                    <input
                      readOnly
                      value={[entry.patient_name, entry.tutor_name].filter(Boolean).join(' · ')}
                      className={`${fc} cursor-not-allowed bg-slate-100 text-slate-400`}
                    />
                  </div>
                )}
                <div className={(entry?.tutor_name || entry?.patient_name) ? '' : 'sm:col-span-2'}>
                  <label className={lc}>Profissional Responsável</label>
                  <select value={professionalId} onChange={e => setProfessionalId(e.target.value)} className={fc}>
                    <option value="">— Nenhum —</option>
                    {clinicProfiles.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className={lc}>Observação</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  className={`${fc} resize-none`}
                  placeholder="Informações adicionais..."
                />
              </div>
            </>
          )}

          {/* ── Modo baixar ───────────────────────────────────────────── */}
          {innerMode === 'baixar' && entry && (
            <>
              {/* Card resumo do título */}
              <div className="rounded-xl bg-teal-50 border border-teal-200 px-4 py-3 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-teal-900">{entry.description}</p>
                  {entry.document_number && (
                    <span className="text-xs font-mono text-teal-600">{entry.document_number}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-teal-700">
                  <span>Vencimento: {formatDate(entry.due_date)}</span>
                  <span>Valor face: {formatCurrency(entry.amount)}</span>
                </div>
              </div>

              {/* Data + Banco */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={lc}>{isReceivable ? 'Data de Recebimento' : 'Data de Pagamento'}</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    className={fc}
                  />
                </div>
                <div>
                  <label className={lc}>Banco Recebido</label>
                  <select value={settleBankId} onChange={e => setSettleBankId(e.target.value)} className={fc}>
                    <option value="">— Selecione —</option>
                    {bankAccounts.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Desconto + Juros */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lc}>Desconto (R$)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">R$</span>
                    <input
                      value={discountBaixaStr}
                      onChange={handleDiscountBaixaChange}
                      className={`${fc} pl-9`}
                      inputMode="numeric"
                    />
                  </div>
                </div>
                <div>
                  <label className={lc}>Juros / Multa (R$)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">R$</span>
                    <input
                      value={interestStr}
                      onChange={handleInterestChange}
                      className={`${fc} pl-9`}
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </div>

              {/* Modalidade */}
              <div>
                <label className={lc}>Modalidade de Pagamento</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={fc}>
                  <option value="">— Selecione —</option>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Valor líquido calculado */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-slate-600">Valor {isReceivable ? 'Recebido' : 'Pago'}</span>
                <span className={`text-lg font-bold ${netAmount < 0 ? 'text-red-600' : 'text-teal-700'}`}>
                  {formatCurrency(netAmount)}
                </span>
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

          {/* Confirmar estorno */}
          {deleteStep === 'confirm_reversal' && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <RotateCcw className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    Este título está {isReceivable ? 'Recebido' : 'Pago'} (Baixado).
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Para excluir é necessário fazer o estorno primeiro. Deseja fazer o estorno?
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleReversal} disabled={isPending}
                  className="flex-1 rounded-xl bg-amber-600 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 transition-colors">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Sim, Fazer Estorno'}
                </button>
                <button onClick={() => setDeleteStep('none')} disabled={isPending}
                  className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Confirmar exclusão */}
          {deleteStep === 'confirm_delete' && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-3">
              <p className="text-sm font-semibold text-red-700">Deseja excluir o título?</p>
              <p className="text-xs text-red-500">Esta ação não pode ser desfeita.</p>
              <div className="flex gap-2">
                <button onClick={handleDelete} disabled={isPending}
                  className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors">
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Sim, Excluir'}
                </button>
                <button onClick={() => { setDeleteStep('none'); onSuccess() }} disabled={isPending}
                  className="flex-1 rounded-xl border border-slate-200 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 transition-colors">
                  Não, Manter
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {deleteStep === 'none' && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 sm:px-5 py-4 flex-shrink-0">
            {/* Ações secundárias */}
            <div className="flex items-center gap-2">
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
                  onClick={handleDeleteClick}
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
            </div>

            {/* Ações primárias */}
            <div className="flex items-center gap-2">
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
                  {innerMode === 'create' ? 'Criar Título' : 'Salvar'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
