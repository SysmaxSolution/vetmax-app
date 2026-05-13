'use client'

import { useState, useTransition } from 'react'
import { X, Download, Loader2, AlertCircle } from 'lucide-react'
import { exportNFeZip } from '@/lib/actions/purchases'

interface Props {
  onClose: () => void
}

const MONTHS = [
  { value: 1,  label: 'Janeiro' },
  { value: 2,  label: 'Fevereiro' },
  { value: 3,  label: 'Março' },
  { value: 4,  label: 'Abril' },
  { value: 5,  label: 'Maio' },
  { value: 6,  label: 'Junho' },
  { value: 7,  label: 'Julho' },
  { value: 8,  label: 'Agosto' },
  { value: 9,  label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
]

function buildYearOptions(): number[] {
  const currentYear = new Date().getFullYear()
  return [currentYear, currentYear - 1, currentYear - 2]
}

export function ExportXmlModal({ onClose }: Props) {
  const now          = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year,  setYear]  = useState(now.getFullYear())
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const years = buildYearOptions()

  function handleExport() {
    setError(null)
    startTransition(async () => {
      const result = await exportNFeZip({ month, year })

      if ('error' in result) {
        setError(result.error)
        return
      }

      // Decode base64 and trigger download
      const byteChars = atob(result.data)
      const byteNums  = new Uint8Array(byteChars.length)
      for (let i = 0; i < byteChars.length; i++) {
        byteNums[i] = byteChars.charCodeAt(i)
      }
      const blob = new Blob([byteNums], { type: 'application/zip' })
      const url  = URL.createObjectURL(blob)

      const anchor    = document.createElement('a')
      anchor.href     = url
      anchor.download = result.filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)

      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-slate-800">Exportar XMLs NF-e</h2>
            <p className="text-xs text-slate-500 mt-0.5">Gera um arquivo ZIP para contabilidade</p>
          </div>
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Mês</label>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              disabled={isPending}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:opacity-50"
            >
              {MONTHS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ano</label>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              disabled={isPending}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:opacity-50"
            >
              {years.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 mb-4">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleExport}
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-purple-700 disabled:opacity-60"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Exportar ZIP
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
