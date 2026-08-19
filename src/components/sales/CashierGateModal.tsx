'use client'

import { useState, useTransition } from 'react'
import { X, Lock, Unlock, AlertTriangle } from 'lucide-react'
import { openCashierSession, linkOrphanSalesToSession } from '@/lib/actions/cashier-sessions'

interface CashierGateModalProps {
  onSessionOpened: (sessionId: string) => void
  onClose:         () => void
}

export default function CashierGateModal({ onSessionOpened, onClose }: CashierGateModalProps) {
  const [showForm,   setShowForm]   = useState(false)
  const [balance,    setBalance]    = useState('')
  const [notes,      setNotes]      = useState('')
  const [error,      setError]      = useState('')
  const [isPending,  startTransition] = useTransition()

  function handleOpen() {
    setError('')
    const val = parseFloat(balance.replace(',', '.'))
    const openingBalance = isNaN(val) || val < 0 ? 0 : val

    startTransition(async () => {
      const result = await openCashierSession(openingBalance, notes.trim() || undefined)

      if ('error' in result) {
        setError(result.error)
        return
      }

      // Vincular vendas órfãs do dia à nova sessão
      await linkOrphanSalesToSession(result.id)

      onSessionOpened(result.id)
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 overflow-hidden animate-scale-in">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-red-500" />
            <h2 className="text-base font-semibold text-slate-900">Caixa Fechado</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isPending}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Aviso */}
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Nenhum caixa aberto hoje</p>
              <p className="text-xs text-amber-600 mt-0.5">
                Abra o caixa antes de registrar vendas. Vendas realizadas antes da abertura
                serão vinculadas automaticamente.
              </p>
            </div>
          </div>

          {/* Formulário de abertura */}
          {showForm ? (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Saldo de Abertura (R$)
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">R$</span>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={balance}
                    onChange={e => setBalance(e.target.value)}
                    autoFocus
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">Valor em cédulas no cofre (fundo de troco)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Observação (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: início do expediente"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500 text-center">
              Clique em <strong>Abrir Caixa Agora</strong> para definir o saldo inicial e liberar o PDV.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex-1 border border-slate-200 bg-white rounded-lg py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>

          {showForm ? (
            <button
              type="button"
              onClick={handleOpen}
              disabled={isPending}
              className="flex-1 bg-teal-600 text-white rounded-lg py-2.5 text-sm font-bold hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Unlock className="h-4 w-4" />
              {isPending ? 'Abrindo...' : 'Abrir Caixa'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex-1 bg-teal-600 text-white rounded-lg py-2.5 text-sm font-bold hover:bg-teal-700 transition-colors flex items-center justify-center gap-2"
            >
              <Unlock className="h-4 w-4" />
              Abrir Caixa Agora
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
