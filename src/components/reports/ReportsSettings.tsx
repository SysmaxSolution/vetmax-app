'use client'

import { useState, useTransition } from 'react'
import { saveReportsEnabled, type ReportsEnabled } from '@/lib/actions/reports-g13'

interface Props {
  enabled:  ReportsEnabled
  onSave:   (v: ReportsEnabled) => void
}

const LABELS: Record<keyof ReportsEnabled, string> = {
  pet_frequency: 'Periodicidade por Pet',
  productivity:  'Produtividade por Profissional',
  financial:     'Financeiro (Receber/Pagar)',
  dre:           'DRE — Demonstração de Resultado',
  curva_abc:     'Curva ABC',
  whatsapp:      'WhatsApp (Campanhas)',
  operational:   'Relatórios Operacionais',
}

export default function ReportsSettings({ enabled, onSave }: Props) {
  const [local,   setLocal]   = useState<ReportsEnabled>({ ...enabled })
  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startT]     = useTransition()

  function toggle(key: keyof ReportsEnabled) {
    setLocal(prev => ({ ...prev, [key]: !prev[key] }))
    setSuccess(false)
  }

  function save() {
    startT(async () => {
      setError(null)
      setSuccess(false)
      const res = await saveReportsEnabled(local)
      if ('error' in res) { setError(res.error); return }
      setSuccess(true)
      onSave(local)
    })
  }

  return (
    <div className="space-y-4 max-w-lg">
      <p className="text-sm text-slate-600">
        Ative ou desative os tipos de relatório visíveis no menu lateral para todos os usuários desta clínica.
      </p>

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
        {(Object.entries(LABELS) as [keyof ReportsEnabled, string][]).map(([key, label]) => (
          <div key={key} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
            <label htmlFor={`toggle-${key}`} className="text-sm font-medium text-slate-700 cursor-pointer select-none">
              {label}
            </label>
            <button
              id={`toggle-${key}`}
              role="switch"
              aria-checked={local[key]}
              onClick={() => toggle(key)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                local[key] ? 'bg-violet-600' : 'bg-slate-200'
              }`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                local[key] ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          Configurações salvas com sucesso.
        </div>
      )}

      <button
        onClick={save}
        disabled={pending}
        className="rounded-lg bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
      >
        {pending ? 'Salvando…' : 'Salvar configurações'}
      </button>
    </div>
  )
}
