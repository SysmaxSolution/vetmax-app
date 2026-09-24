'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { getStaleOpenSession } from '@/lib/actions/cashier-manual'
import { closeCashierSession } from '@/lib/actions/cashier-sessions'

interface Props {
  /** Quando o alerta resolve (caixa fechado ou ignorado), o pai pode dar refresh. */
  onResolved?: () => void
}

interface StaleSession {
  id:              string
  opened_at:       string
  opening_balance: number
  days_open:       number
}

export default function PreviousDayCashierAlert({ onResolved }: Props) {
  const [session,   setSession]   = useState<StaleSession | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [closing,   setClosing]   = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      const res = await getStaleOpenSession()
      if (!mounted) return
      setLoading(false)
      if ('error' in res) { setError(res.error); return }
      if (res.has_stale && res.session) setSession(res.session)
    }
    void load()
    return () => { mounted = false }
  }, [])

  if (loading || dismissed || !session) return null

  async function handleClose() {
    if (!session) return
    setClosing(true)
    setError(null)
    const res = await closeCashierSession(session.id)
    setClosing(false)
    if ('error' in res) { setError(res.error); return }
    setSession(null)
    setDismissed(true)
    onResolved?.()
  }

  const openedAt = new Date(session.opened_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-5 py-4 shadow-sm space-y-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-200 flex-shrink-0">
          <AlertTriangle className="h-5 w-5 text-amber-800" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-amber-900">
            Caixa do dia anterior ainda aberto
          </h3>
          <p className="text-xs text-amber-800 mt-0.5">
            A sessão aberta em <strong className="font-mono tabular-nums">{openedAt}</strong>{' '}
            {session.days_open === 1 ? '(ontem)' : `há ${session.days_open} dias`} ainda não foi fechada.
            Para iniciar o caixa de hoje você precisa fechar a sessão anterior primeiro.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="rounded-full p-1.5 text-amber-700 hover:bg-amber-200"
          title="Ignorar agora"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-100 border border-red-300 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleClose}
          disabled={closing}
          className="flex items-center gap-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {closing ? <Spinner size="sm" /> : <AlertTriangle className="h-3 w-3" />}
          Fechar sessão de {openedAt}
        </button>
        <button
          onClick={() => setDismissed(true)}
          disabled={closing}
          className="rounded-lg border border-amber-300 bg-white hover:bg-amber-100 px-4 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50"
        >
          Decidir mais tarde
        </button>
      </div>
    </div>
  )
}
