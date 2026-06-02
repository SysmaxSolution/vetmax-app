'use client'

import { useState } from 'react'
import { X, Receipt, FlaskConical, Loader2, AlertCircle } from 'lucide-react'
import { generatePartialInvoice } from '@/lib/actions/billing'

interface Props {
  consultationId: string
  patientName:    string
  onClose:        () => void
  /** Continua o fluxo de pedir exame (abre ExamRequestModal). */
  onProceed:      (charged: { invoiceId: string; total: number; items: number } | null) => void
}

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ChargeBeforeExamsModal({ consultationId, patientName, onClose, onProceed }: Props) {
  const [busy, setBusy] = useState<'partial' | 'skip' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleChargeNow() {
    setBusy('partial')
    setError(null)
    const res = await generatePartialInvoice(consultationId)
    setBusy(null)
    if ('error' in res) { setError(res.error); return }
    onProceed({ invoiceId: res.id, total: res.total, items: res.items_count })
  }

  function handleSkip() {
    setBusy('skip')
    onProceed(null)
  }

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Cobrar consulta agora?</h2>
              <p className="text-xs text-slate-500">{patientName}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-slate-600">
            Antes de encaminhar para exames, você pode cobrar o que já foi feito (consulta, medicações aplicadas etc.) no caixa.
            Os exames pedidos a seguir ficam em uma <strong>fatura separada</strong>, gerada quando você encerrar o atendimento.
          </p>
          <ul className="text-xs text-slate-500 space-y-1.5 list-disc list-inside">
            <li><strong className="text-emerald-700">Cobrar agora:</strong> o tutor paga a consulta no balcão enquanto o pet vai pra exames.</li>
            <li><strong className="text-slate-700">Cobrar tudo no final:</strong> uma única fatura sai quando os exames chegarem e você fechar a consulta.</li>
          </ul>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={handleSkip}
            disabled={busy !== null}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            {busy === 'skip' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cobrar tudo no final'}
          </button>
          <button
            type="button"
            onClick={handleChargeNow}
            disabled={busy !== null}
            className="flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy === 'partial'
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando…</>
              : <><Receipt className="h-4 w-4" /> Cobrar consulta agora</>}
          </button>
        </div>
      </div>
    </div>
  )
}
