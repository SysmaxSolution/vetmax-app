'use client'

import { useState } from 'react'
import { CreditCard, Loader2, Check, X } from 'lucide-react'

/**
 * Coleta os dados de cartão para conciliação com a maquininha:
 *   - Administradora (Cielo, Stone, Rede, GetNet, ...)
 *   - NSU
 *   - Número de Liberação (autorização)
 *
 * Aparece como passo extra no checkout quando o método é credit/debit.
 */

const COMMON_ACQUIRERS = ['Cielo', 'Stone', 'Rede', 'GetNet', 'PagSeguro', 'SafraPay', 'Mercado Pago']

interface CardDetails {
  acquirer:      string
  nsu:           string
  authorization: string
}

interface Props {
  paymentMethod: 'credit' | 'debit'
  amount:        number
  onCancel:      () => void
  onConfirm:     (details: CardDetails) => void
}

export default function CardPaymentDetailsModal({ paymentMethod, amount, onCancel, onConfirm }: Props) {
  const [acquirer,      setAcquirer]      = useState('')
  const [nsu,           setNsu]           = useState('')
  const [authorization, setAuthorization] = useState('')
  const [error,         setError]         = useState<string | null>(null)
  const [submitting,    setSubmitting]    = useState(false)

  function handleConfirm() {
    setError(null)
    if (!acquirer.trim())      { setError('Selecione ou informe a administradora.'); return }
    if (!nsu.trim())           { setError('Informe o NSU.'); return }
    if (!authorization.trim()) { setError('Informe o número de liberação.'); return }
    setSubmitting(true)
    onConfirm({ acquirer: acquirer.trim(), nsu: nsu.trim(), authorization: authorization.trim() })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-900/65 p-3"
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-indigo-50/50">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600">
              <CreditCard className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Dados de Cartão {paymentMethod === 'credit' ? '(Crédito)' : '(Débito)'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · para conciliação com a maquininha
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Administradora <span className="text-rose-500">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {COMMON_ACQUIRERS.map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAcquirer(a)}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                    acquirer === a
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <input
              value={acquirer}
              onChange={e => setAcquirer(e.target.value)}
              placeholder="Ou digite outra administradora"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                NSU <span className="text-rose-500">*</span>
              </label>
              <input
                value={nsu}
                onChange={e => setNsu(e.target.value.replace(/\s/g, ''))}
                placeholder="Ex: 123456789"
                inputMode="text"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Liberação <span className="text-rose-500">*</span>
              </label>
              <input
                value={authorization}
                onChange={e => setAuthorization(e.target.value.replace(/\s/g, ''))}
                placeholder="Ex: 987654"
                inputMode="text"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-mono focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Voltar
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirm}
            className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 py-2.5 text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Confirmando...</>
              : <><Check className="h-4 w-4" /> Confirmar</>}
          </button>
        </div>
      </div>
    </div>
  )
}
