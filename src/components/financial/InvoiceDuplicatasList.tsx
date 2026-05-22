'use client'

import { useEffect, useState, useTransition } from 'react'
import { CheckCircle2, Clock, Loader2, RotateCcw, Wallet, Scissors } from 'lucide-react'
import { listInvoiceDuplicatas, reversePartialPayment, type InvoiceDuplicata } from '@/lib/actions/billing'

interface Props {
  invoiceId:        string
  totalAmount:      number
  paidAmount:       number
  /** Permite estorno (só admin/manager). Default true. */
  canReverse?:      boolean
  /** Disparado quando uma baixa é estornada — para o pai recarregar. */
  onReversed?:      () => void
}

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtBR = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/**
 * Lista as duplicatas (financial_entries) vinculadas a uma invoice.
 * Mostra cada baixa registrada + saldo pendente + entries de desconto/ajuste.
 * Permite estornar baixas (admin/manager).
 */
export default function InvoiceDuplicatasList({ invoiceId, totalAmount, paidAmount, canReverse = true, onReversed }: Props) {
  const [duplicatas, setDuplicatas] = useState<InvoiceDuplicata[]>([])
  const [loading, setLoading]       = useState(true)
  const [reversingId, setReversingId] = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [, startReverse]            = useTransition()

  async function load() {
    setLoading(true)
    const res = await listInvoiceDuplicatas(invoiceId)
    if ('error' in res) setError(res.error)
    else                setDuplicatas(res)
    setLoading(false)
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [invoiceId])

  function handleReverse(id: string) {
    if (reversingId) return
    if (!confirm('Estornar esta baixa? O valor voltará para o saldo a receber.')) return
    setReversingId(id)
    setError(null)
    startReverse(async () => {
      const res = await reversePartialPayment(id)
      setReversingId(null)
      if ('error' in res) { setError(res.error); return }
      await load()
      onReversed?.()
    })
  }

  const balance = Math.max(0, totalAmount - paidAmount)
  const paidDuplicatas    = duplicatas.filter(d => d.status === 'paid' && !d.is_clinic_discount)
  const pendingDuplicatas = duplicatas.filter(d => d.status === 'pending')
  const discountEntries   = duplicatas.filter(d => d.is_clinic_discount)

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 flex items-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando duplicatas…
      </div>
    )
  }

  if (duplicatas.length === 0) {
    return null
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Duplicatas da fatura</h4>
        <div className="text-[11px] text-slate-500">
          Total <strong className="text-slate-800 tabular-nums">{BRL(totalAmount)}</strong>
          {' · '}
          Recebido <strong className="text-emerald-700 tabular-nums">{BRL(paidAmount)}</strong>
          {' · '}
          Saldo <strong className="text-amber-700 tabular-nums">{BRL(balance)}</strong>
        </div>
      </div>

      <ul className="divide-y divide-slate-100">
        {paidDuplicatas.map(d => (
          <li key={d.id} className="px-4 py-2 flex items-center justify-between gap-2 text-xs hover:bg-emerald-50/30">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-slate-800 truncate">{d.description}</p>
                <p className="text-[10px] text-slate-500">
                  Baixado em {fmtBR(d.payment_date)}
                  {d.payment_method && ` · ${d.payment_method.toUpperCase()}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-sm font-bold text-emerald-700 tabular-nums">{BRL(d.amount)}</span>
              {canReverse && (
                <button
                  onClick={() => handleReverse(d.id)}
                  disabled={reversingId === d.id}
                  title="Estornar baixa"
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md text-rose-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                >
                  {reversingId === d.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <RotateCcw className="h-3.5 w-3.5" />}
                </button>
              )}
            </div>
          </li>
        ))}
        {pendingDuplicatas.map(d => (
          <li key={d.id} className="px-4 py-2 flex items-center justify-between gap-2 text-xs hover:bg-amber-50/30">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {d.source === 'petlove_open'
                ? <Wallet className="h-3.5 w-3.5 text-sky-600 flex-shrink-0" />
                : <Clock className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />}
              <div className="min-w-0">
                <p className="text-slate-800 truncate">{d.description}</p>
                <p className="text-[10px] text-slate-500">
                  {d.source === 'petlove_open' ? 'A Receber Petlove' : 'Saldo a receber'}
                  {' · vence '}{fmtBR(d.due_date)}
                </p>
              </div>
            </div>
            <span className={`text-sm font-bold tabular-nums ${d.source === 'petlove_open' ? 'text-sky-700' : 'text-amber-700'}`}>{BRL(d.amount)}</span>
          </li>
        ))}
        {discountEntries.map(d => (
          <li key={d.id} className="px-4 py-2 flex items-center justify-between gap-2 text-xs text-slate-500 bg-rose-50/30">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Scissors className="h-3.5 w-3.5 text-rose-500 flex-shrink-0" />
              <span className="truncate italic">{d.description}</span>
            </div>
            <span className="text-sm font-semibold text-rose-600 tabular-nums">−{BRL(d.amount)}</span>
          </li>
        ))}
      </ul>

      {error && (
        <div className="px-4 py-2 border-t border-rose-100 bg-rose-50 text-xs text-rose-700">
          {error}
        </div>
      )}
    </div>
  )
}
