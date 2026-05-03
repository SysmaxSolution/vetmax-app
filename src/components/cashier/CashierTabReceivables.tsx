'use client'

import { useState, useCallback } from 'react'
import { Receipt, RefreshCw, ShoppingBag, Scissors } from 'lucide-react'
import { getPendingInvoices, type InvoiceWithDetails } from '@/lib/actions/billing'
import {
  getPendingGroomingSessions,
  processGroomingPaymentFromCashier,
  type PendingGroomingPayment,
} from '@/lib/actions/grooming'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import CheckoutModal from '@/components/reception/CheckoutModal'

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐶', cat: '🐱', bird: '🐦', exotic: '🦜',
  rabbit: '🐰', rodent: '🐹', reptile: '🦎', fish: '🐟',
}

const PAYMENT_LABEL: Record<string, string> = {
  pix: 'PIX', credit: 'Cartão Crédito', debit: 'Cartão Débito', cash: 'Dinheiro',
}

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ─── Invoice card (consultas) ─────────────────────────────────────────────────

function InvoiceCard({
  invoice,
  onCheckout,
}: {
  invoice: InvoiceWithDetails
  onCheckout: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 hover:shadow-sm hover:border-slate-300 transition-all">
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-amber-50 text-2xl">
        {SPECIES_EMOJI[invoice.patient.species] ?? '🐾'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-slate-900">{invoice.patient.name}</p>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500">{invoice.tutor.name}</span>
          <span className="rounded-full bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5">Consulta</span>
        </div>
        <div className="mt-0.5 flex items-center gap-3">
          <span className="text-xs text-slate-400">Alta às {fmtTime(invoice.created_at)}</span>
          {invoice.tutor.phone && (
            <span className="text-xs text-slate-400">{invoice.tutor.phone}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="text-right">
          <p className="text-xs text-slate-400">Total</p>
          <p className="text-lg font-bold text-slate-900">{fmt(invoice.total_amount)}</p>
        </div>
        <button
          onClick={() => onCheckout(invoice.id)}
          data-mentor-step="cashier-receive-invoice-btn"
          className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors shadow-sm"
        >
          <Receipt className="h-4 w-4" />
          Receber
        </button>
      </div>
    </div>
  )
}

// ─── Grooming card (banho e tosa) ─────────────────────────────────────────────

function GroomingPaymentCard({
  session,
  onReceive,
}: {
  session: PendingGroomingPayment
  onReceive: (session: PendingGroomingPayment) => void
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-violet-100 bg-white px-5 py-4 hover:shadow-sm hover:border-violet-200 transition-all">
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-violet-50 text-2xl">
        {SPECIES_EMOJI[session.patient_species] ?? '🐾'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-slate-900">{session.patient_name}</p>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500">{session.tutor_name}</span>
          <span className="rounded-full bg-violet-50 text-violet-700 text-xs font-medium px-2 py-0.5 flex items-center gap-1">
            <Scissors className="h-3 w-3" />
            Banho e Tosa
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 flex-wrap">
          {session.services_requested.slice(0, 3).map(s => (
            <span key={s} className="text-xs text-slate-400 bg-slate-50 rounded px-1.5 py-0.5">{s}</span>
          ))}
          {session.services_requested.length > 3 && (
            <span className="text-xs text-slate-400">+{session.services_requested.length - 3}</span>
          )}
          {session.discount_percent > 0 && (
            <span className="text-xs text-emerald-600 font-medium">{session.discount_percent}% desc.</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="text-right">
          <p className="text-xs text-slate-400">Total</p>
          <p className="text-lg font-bold text-slate-900">{fmt(session.price_total)}</p>
        </div>
        <button
          onClick={() => onReceive(session)}
          data-mentor-step="cashier-receive-grooming-btn"
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors shadow-sm"
        >
          <Receipt className="h-4 w-4" />
          Receber
        </button>
      </div>
    </div>
  )
}

// ─── Grooming payment modal ───────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { key: 'pix',    label: 'PIX' },
  { key: 'credit', label: 'Cartão Crédito' },
  { key: 'debit',  label: 'Cartão Débito' },
  { key: 'cash',   label: 'Dinheiro' },
] as const

function GroomingPaymentModal({
  session,
  onClose,
  onSuccess,
}: {
  session: PendingGroomingPayment
  onClose: () => void
  onSuccess: (petName: string, total: number) => void
}) {
  const [method,    setMethod]    = useState<'pix' | 'credit' | 'debit' | 'cash'>('pix')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    const res = await processGroomingPaymentFromCashier(session.id, method)
    setLoading(false)
    if ('error' in res) { setError(res.error); return }
    onSuccess(session.patient_name, session.price_total)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100">
            <Scissors className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Receber — Banho e Tosa</h3>
            <p className="text-sm text-slate-500">{session.patient_name} · {session.tutor_name}</p>
          </div>
        </div>

        {session.services_requested.length > 0 && (
          <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500 font-medium mb-1">Serviços</p>
            <p className="text-sm text-slate-700">{session.services_requested.join(', ')}</p>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between rounded-lg bg-violet-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-700">Total a receber</span>
          <span className="text-xl font-bold text-violet-700">{fmt(session.price_total)}</span>
        </div>

        <div className="mb-5">
          <p className="text-sm font-medium text-slate-700 mb-2">Forma de pagamento</p>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map(pm => (
              <button
                key={pm.key}
                onClick={() => setMethod(pm.key)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                  method === pm.key
                    ? 'border-violet-500 bg-violet-50 text-violet-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {pm.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            data-mentor-step="cashier-grooming-confirm-btn"
            className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Processando...' : `Confirmar ${PAYMENT_LABEL[method]}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  initialInvoices:        InvoiceWithDetails[]
  initialGroomingSessions: PendingGroomingPayment[]
  clinicId:               string
  onToast: (msg: string, type: 'success' | 'error') => void
}

export default function CashierTabReceivables({
  initialInvoices,
  initialGroomingSessions,
  clinicId,
  onToast,
}: Props) {
  const [invoices,          setInvoices]          = useState<InvoiceWithDetails[]>(initialInvoices)
  const [groomingSessions,  setGroomingSessions]   = useState<PendingGroomingPayment[]>(initialGroomingSessions)
  const [refreshing,        setRefreshing]         = useState(false)
  const [activeInvoiceId,   setActiveInvoiceId]    = useState<string | null>(null)
  const [activeGrooming,    setActiveGrooming]     = useState<PendingGroomingPayment | null>(null)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const [invRes, grRes] = await Promise.all([
      getPendingInvoices(),
      getPendingGroomingSessions(),
    ])
    setRefreshing(false)
    if (!('error' in invRes)) setInvoices(invRes)
    if (!('error' in grRes)) setGroomingSessions(grRes)
  }, [])

  useRealtimeSync({ table: 'invoices',          clinicId, onEvent: refresh })
  useRealtimeSync({ table: 'grooming_sessions', clinicId, onEvent: refresh })

  function handleInvoiceSuccess(petName: string, total: number) {
    setActiveInvoiceId(null)
    setInvoices(prev => prev.filter(inv => inv.id !== activeInvoiceId))
    onToast(
      `Pagamento de ${petName} recebido! ${fmt(total)}`,
      'success'
    )
  }

  function handleGroomingSuccess(petName: string, total: number) {
    setActiveGrooming(null)
    setGroomingSessions(prev => prev.filter(s => s.id !== activeGrooming?.id))
    onToast(
      `Banho e Tosa de ${petName} recebido! ${fmt(total)}`,
      'success'
    )
  }

  const totalPending = invoices.length + groomingSessions.length

  return (
    <>
      {activeInvoiceId && (
        <CheckoutModal
          invoiceId={activeInvoiceId}
          onClose={() => setActiveInvoiceId(null)}
          onSuccess={handleInvoiceSuccess}
        />
      )}

      {activeGrooming && (
        <GroomingPaymentModal
          session={activeGrooming}
          onClose={() => setActiveGrooming(null)}
          onSuccess={handleGroomingSuccess}
        />
      )}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Recebimentos Pendentes</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {totalPending === 0
              ? 'Nenhum recebimento pendente'
              : `${totalPending} recebimento${totalPending !== 1 ? 's' : ''} aguardando pagamento`}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {totalPending === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-slate-300 bg-white">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <ShoppingBag className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-500">Nenhum recebimento pendente no momento</p>
          <p className="mt-1 text-xs text-slate-400">
            Consultas e Banho e Tosa com cobrança configurada aparecem aqui automaticamente
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              onCheckout={setActiveInvoiceId}
            />
          ))}
          {groomingSessions.map(session => (
            <GroomingPaymentCard
              key={session.id}
              session={session}
              onReceive={setActiveGrooming}
            />
          ))}
        </div>
      )}
    </>
  )
}
