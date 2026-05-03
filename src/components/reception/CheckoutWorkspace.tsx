'use client'

import { useState, useCallback } from 'react'
import { Receipt, RefreshCw, ShoppingBag } from 'lucide-react'
import { getPendingInvoices, type InvoiceWithDetails } from '@/lib/actions/billing'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import CheckoutModal from '@/components/reception/CheckoutModal'
import { Toast } from '@/components/ui/toast'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐶', cat: '🐱', bird: '🐦', exotic: '🦜',
  rabbit: '🐰', rodent: '🐹', reptile: '🦎', fish: '🐟',
}

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ─── Invoice Card ─────────────────────────────────────────────────────────────

function InvoiceCard({
  invoice,
  onCheckout,
}: {
  invoice: InvoiceWithDetails
  onCheckout: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 hover:shadow-sm hover:border-slate-300 transition-all">
      {/* Avatar */}
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-amber-50 text-2xl">
        {SPECIES_EMOJI[invoice.patient.species] ?? '🐾'}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-slate-900">{invoice.patient.name}</p>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500">{invoice.tutor.name}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-3">
          <span className="text-xs text-slate-400">Alta às {fmtTime(invoice.created_at)}</span>
          {invoice.tutor.phone && (
            <span className="text-xs text-slate-400">{invoice.tutor.phone}</span>
          )}
        </div>
      </div>

      {/* Total + Ação */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="text-right">
          <p className="text-xs text-slate-400">Total</p>
          <p className="text-lg font-bold text-slate-900">{fmt(invoice.total_amount)}</p>
        </div>
        <button
          onClick={() => onCheckout(invoice.id)}
          className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors shadow-sm"
        >
          <Receipt className="h-4 w-4" />
          Receber
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  initialInvoices: InvoiceWithDetails[]
  clinicId: string
}

export default function CheckoutWorkspace({ initialInvoices, clinicId }: Props) {
  const [invoices,        setInvoices]        = useState<InvoiceWithDetails[]>(initialInvoices)
  const [refreshing,      setRefreshing]       = useState(false)
  const [activeInvoiceId, setActiveInvoiceId]  = useState<string | null>(null)
  const [toast,           setToast]            = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const res = await getPendingInvoices()
    setRefreshing(false)
    if (!('error' in res)) setInvoices(res)
  }, [])

  useRealtimeSync({ table: 'invoices', clinicId, onEvent: refresh })

  function handleSuccess(petName: string, total: number) {
    setActiveInvoiceId(null)
    setInvoices(prev => prev.filter(inv => inv.id !== activeInvoiceId))
    setToast({
      type: 'success',
      message: `Pagamento de ${petName} recebido! ${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
    })
  }

  return (
    <>
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {activeInvoiceId && (
        <CheckoutModal
          invoiceId={activeInvoiceId}
          onClose={() => setActiveInvoiceId(null)}
          onSuccess={handleSuccess}
        />
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Caixa</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {invoices.length === 0
              ? 'Nenhuma fatura pendente'
              : `${invoices.length} fatura${invoices.length !== 1 ? 's' : ''} aguardando pagamento`}
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

      {/* Lista de Faturas */}
      {invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-slate-300 bg-white">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <ShoppingBag className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-500">Nenhuma fatura pendente no momento</p>
          <p className="mt-1 text-xs text-slate-400">
            As faturas aparecem aqui automaticamente ao dar alta no consultório
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
        </div>
      )}
    </>
  )
}
