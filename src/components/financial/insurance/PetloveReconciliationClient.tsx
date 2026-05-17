'use client'

import { useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, Clock, ArrowRight } from 'lucide-react'
import { uploadAndStagePetloveRemittance, type ImportedRemittanceSummary } from '@/lib/actions/petlove-import'

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading'; filename: string }
  | { kind: 'success';   remittanceId: string; linesCount: number }
  | { kind: 'error';     message: string }

const STATUS_STYLES: Record<string, string> = {
  imported:    'bg-amber-50 text-amber-700 border-amber-200',
  reviewed:    'bg-blue-50 text-blue-700 border-blue-200',
  reconciled:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  reversed:    'bg-rose-50 text-rose-700 border-rose-200',
}

const STATUS_LABELS: Record<string, string> = {
  imported:   'Importada',
  reviewed:   'Em revisão',
  reconciled: 'Conciliada',
  reversed:   'Estornada',
}

export default function PetloveReconciliationClient({
  initialRemittances,
}: {
  initialRemittances: ImportedRemittanceSummary[]
}) {
  const [status, setStatus]           = useState<Status>({ kind: 'idle' })
  const [remittances, setRemittances] = useState(initialRemittances)
  const [isDragging, setIsDragging]   = useState(false)
  const inputRef                      = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!/\.xlsx$/i.test(file.name)) {
      setStatus({ kind: 'error', message: 'Apenas arquivos .xlsx da Petlove são aceitos.' })
      return
    }
    setStatus({ kind: 'uploading', filename: file.name })

    const formData = new FormData()
    formData.append('file', file)

    const result = await uploadAndStagePetloveRemittance(formData)
    if ('error' in result) {
      setStatus({ kind: 'error', message: result.error })
      return
    }

    setStatus({ kind: 'success', remittanceId: result.remittance_id, linesCount: result.lines_count })

    // Refresh list (otimista — recarrega via página depois)
    setRemittances(prev => [{
      id:                result.remittance_id,
      remittance_number: '(nova)',
      period_start:      '',
      period_end:        '',
      status:            'imported',
      total_gross_value: 0,
      lines_count:       result.lines_count,
      imported_at:       new Date().toISOString(),
    }, ...prev])
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  return (
    <div className="space-y-6">
      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative rounded-2xl border-2 border-dashed p-10 cursor-pointer transition-all
          ${isDragging
            ? 'border-purple-500 bg-purple-50'
            : 'border-purple-200 bg-purple-50/40 hover:border-purple-400 hover:bg-purple-50'}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          onChange={onSelect}
          className="hidden"
        />

        <div className="flex flex-col items-center text-center gap-3">
          {status.kind === 'uploading' ? (
            <>
              <Loader2 className="h-10 w-10 text-purple-500 animate-spin" />
              <p className="text-sm font-medium text-purple-800">
                Processando {status.filename}…
              </p>
              <p className="text-xs text-purple-600">
                Lendo as abas Resumo e Extrato. Isso leva alguns segundos.
              </p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-xl bg-purple-100 flex items-center justify-center">
                <Upload className="h-7 w-7 text-purple-600" />
              </div>
              <p className="text-base font-semibold text-purple-900">
                Arraste a planilha da Petlove aqui
              </p>
              <p className="text-sm text-purple-600">
                ou clique para selecionar um arquivo (.xlsx, até 10 MB)
              </p>
            </>
          )}
        </div>
      </div>

      {/* Feedback do último upload */}
      {status.kind === 'success' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-emerald-900">Remessa importada com sucesso!</p>
            <p className="text-sm text-emerald-700 mt-0.5">
              {status.linesCount} procedimento{status.linesCount !== 1 ? 's' : ''} gravado{status.linesCount !== 1 ? 's' : ''} em estado <strong>importada</strong>.
              O motor de matching e a tela de revisão entram na Sprint 2.
            </p>
            <p className="text-xs text-emerald-600 mt-2 font-mono">
              ID: {status.remittanceId}
            </p>
          </div>
        </div>
      )}

      {status.kind === 'error' && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-rose-900">Não foi possível importar</p>
            <p className="text-sm text-rose-700 mt-0.5">{status.message}</p>
            <button
              onClick={() => setStatus({ kind: 'idle' })}
              className="text-xs text-rose-700 underline mt-2 hover:text-rose-900"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Histórico de remessas */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-slate-400" />
            Últimas remessas importadas
          </h2>
          <span className="text-xs text-slate-400">{remittances.length} registro{remittances.length !== 1 ? 's' : ''}</span>
        </header>

        {remittances.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <Clock className="h-8 w-8 text-slate-200 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Nenhuma remessa importada ainda</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {remittances.map(r => (
              <div key={r.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">
                    Remessa #{r.remittance_number}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {r.period_start ? `${formatDate(r.period_start)} – ${formatDate(r.period_end)}` : 'Período indisponível'}
                    {' · '}
                    {r.lines_count} procedimento{r.lines_count !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-semibold text-slate-900 tabular-nums">
                    {r.total_gross_value > 0 ? formatBRL(r.total_gross_value) : '—'}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[r.status] ?? STATUS_STYLES.imported}`}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                  <Link
                    href={`/dashboard/financial/insurance-reconciliation/${r.id}/review`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-900 hover:underline"
                  >
                    Revisar
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function formatDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
