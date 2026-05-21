'use client'

import { useState, useCallback, useRef, useTransition } from 'react'
import Link from 'next/link'
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, Clock, ArrowRight, Trash2 } from 'lucide-react'
import { uploadAndStagePetloveRemittance, type ImportedRemittanceSummary } from '@/lib/actions/petlove-import'
import { deleteRemittance } from '@/lib/actions/petlove-reconciliation'

type PreviewSummary = {
  matched:          number
  patients_updated: number
  prices_updated:   number
  errors:           string[]
}

type Status =
  | { kind: 'idle' }
  | { kind: 'uploading'; filename: string }
  | { kind: 'success';    remittanceId: string; linesCount: number; sourceFormat: 'closed' | 'open'; previewSideEffects?: PreviewSummary }
  | { kind: 'duplicate';  message: string; existingRemittanceId?: string }
  | { kind: 'error';      message: string }

type DeleteRequest = {
  id:                string
  remittanceNumber:  string
  linesCount:        number
  isReconciled:      boolean
} | null

const STATUS_STYLES: Record<string, string> = {
  open:        'bg-sky-50 text-sky-700 border-sky-200',
  imported:    'bg-amber-50 text-amber-700 border-amber-200',
  reviewed:    'bg-blue-50 text-blue-700 border-blue-200',
  reconciled:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  reversed:    'bg-rose-50 text-rose-700 border-rose-200',
}

const STATUS_LABELS: Record<string, string> = {
  open:       'Em aberto (prévia)',
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
  const [deletingId, setDeletingId]   = useState<string | null>(null)
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest>(null)
  const [deleteError, setDeleteError]     = useState<string | null>(null)
  const [, startDelete]               = useTransition()
  const inputRef                      = useRef<HTMLInputElement>(null)

  function requestDelete(id: string, remittanceNumber: string, isReconciled: boolean) {
    const lines = remittances.find(r => r.id === id)?.lines_count ?? 0
    setDeleteRequest({ id, remittanceNumber, linesCount: lines, isReconciled })
    setDeleteError(null)
  }

  function confirmDelete() {
    if (!deleteRequest) return
    const { id } = deleteRequest
    setDeletingId(id)
    setDeleteError(null)
    startDelete(async () => {
      const res = await deleteRemittance(id)
      setDeletingId(null)
      if ('error' in res) {
        setDeleteError(res.error)
        return
      }
      setRemittances(prev => prev.filter(r => r.id !== id))
      setDeleteRequest(null)
      setStatus({ kind: 'idle' })
    })
  }

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
      if ('code' in result && result.code === 'DUPLICATE_REMITTANCE') {
        setStatus({
          kind: 'duplicate',
          message: result.error,
          existingRemittanceId: result.existing_remittance_id,
        })
      } else {
        setStatus({ kind: 'error', message: result.error })
      }
      return
    }

    setStatus({
      kind:                'success',
      remittanceId:        result.remittance_id,
      linesCount:          result.lines_count,
      sourceFormat:        result.source_format,
      previewSideEffects:  result.preview_side_effects,
    })

    // Refresh list (otimista — substitui se já existe, senão prepend)
    const isPreview = result.source_format === 'open'
    setRemittances(prev => {
      const filtered = prev.filter(r => r.id !== result.remittance_id)
      return [{
        id:                result.remittance_id,
        remittance_number: isPreview ? 'OPEN — em aberto' : '(nova)',
        period_start:      '',
        period_end:        '',
        status:            isPreview ? 'open' : 'imported',
        total_gross_value: 0,
        lines_count:       result.lines_count,
        imported_at:       new Date().toISOString(),
        is_preview:        isPreview,
        source_format:     result.source_format,
      }, ...filtered]
    })
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
                Identificando o formato (Resumo+Extrato ou Worksheet em aberto). Pode levar alguns segundos.
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
              <p className="text-[11px] text-purple-500 max-w-md mt-1">
                Aceita tanto a remessa fechada (Resumo + Extrato) quanto o extrato em aberto (aba única Worksheet) — esta gera uma prévia atualizável.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Feedback do último upload */}
      {status.kind === 'success' && status.sourceFormat === 'closed' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-emerald-900">Remessa importada com sucesso!</p>
            <p className="text-sm text-emerald-700 mt-0.5">
              {status.linesCount} procedimento{status.linesCount !== 1 ? 's' : ''} gravado{status.linesCount !== 1 ? 's' : ''} em estado <strong>importada</strong>.
              Abra a revisão para rodar o matching e concluir a conciliação.
            </p>
            <p className="text-xs text-emerald-600 mt-2 font-mono">
              ID: {status.remittanceId}
            </p>
          </div>
        </div>
      )}

      {status.kind === 'success' && status.sourceFormat === 'open' && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-sky-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-sky-900">Prévia em aberto registrada</p>
            <p className="text-sm text-sky-700 mt-0.5">
              {status.linesCount} atendimento{status.linesCount !== 1 ? 's' : ''} em aberto carregado{status.linesCount !== 1 ? 's' : ''}. Esta remessa fica em estado <strong>Em aberto</strong> e pode ser sobrescrita reimportando o mesmo período.
            </p>
            {status.previewSideEffects && (
              <ul className="text-xs text-sky-800 mt-2 space-y-0.5 ml-1">
                <li>• <strong>{status.previewSideEffects.matched}</strong> linha{status.previewSideEffects.matched !== 1 ? 's' : ''} casada{status.previewSideEffects.matched !== 1 ? 's' : ''} com pets já cadastrados</li>
                <li>• <strong>{status.previewSideEffects.patients_updated}</strong> cadastro{status.previewSideEffects.patients_updated !== 1 ? 's' : ''} de pet enriquecido{status.previewSideEffects.patients_updated !== 1 ? 's' : ''} (chip / sexo / raça quando vazios)</li>
                <li>• <strong>{status.previewSideEffects.prices_updated}</strong> preço{status.previewSideEffects.prices_updated !== 1 ? 's' : ''} fixado{status.previewSideEffects.prices_updated !== 1 ? 's' : ''} em patient_custom_prices</li>
                {status.previewSideEffects.errors.length > 0 && (
                  <li className="text-rose-700">• {status.previewSideEffects.errors.length} aviso{status.previewSideEffects.errors.length !== 1 ? 's' : ''} durante o processamento</li>
                )}
              </ul>
            )}
            <p className="text-xs text-sky-600 mt-2 font-mono">
              ID: {status.remittanceId}
            </p>
          </div>
        </div>
      )}

      {status.kind === 'duplicate' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900">Planilha já importada anteriormente</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Esta remessa já está no sistema. Para reprocessar, abra a remessa existente e use
              <strong> Excluir Remessa</strong> antes de subir novamente.
            </p>
            <div className="flex items-center gap-3 mt-2">
              {status.existingRemittanceId && (
                <Link
                  href={`/dashboard/financial/insurance-reconciliation/${status.existingRemittanceId}/review`}
                  className="text-xs text-amber-800 font-semibold underline hover:text-amber-900 inline-flex items-center gap-1"
                >
                  Abrir remessa existente <ArrowRight className="h-3 w-3" />
                </Link>
              )}
              <button
                onClick={() => setStatus({ kind: 'idle' })}
                className="text-xs text-amber-700 underline hover:text-amber-900"
              >
                Escolher outro arquivo
              </button>
            </div>
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
                  <button
                    onClick={() => requestDelete(r.id, r.remittance_number, r.status === 'reconciled')}
                    disabled={deletingId === r.id}
                    title="Excluir remessa"
                    className="inline-flex items-center justify-center h-7 w-7 rounded-md text-rose-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 transition-colors"
                  >
                    {deletingId === r.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Modal de Confirmação de Exclusão */}
      {deleteRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
          onClick={() => !deletingId && setDeleteRequest(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 flex-shrink-0">
                <AlertCircle className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Excluir remessa #{deleteRequest.remittanceNumber}?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">A ação não pode ser desfeita.</p>
              </div>
            </div>

            {deleteRequest.isReconciled ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <p className="text-xs font-semibold text-amber-900 mb-1">A exclusão também vai apagar:</p>
                <ul className="text-xs text-amber-800 space-y-0.5 ml-1">
                  <li>• Os <strong>{deleteRequest.linesCount}</strong> lançamentos financeiros criados</li>
                  <li>• Os preços fixados dos pets que vieram desta remessa</li>
                  <li>• Os eventos do histórico de conciliação dos pets</li>
                  <li>• As baixas no extrato bancário ligadas a esta remessa</li>
                </ul>
                <p className="text-xs text-amber-700 mt-2 italic">
                  Pets e tutores criados pela importação <strong>permanecem</strong> no cadastro.
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-600 mb-4">
                A remessa será removida do sistema com todas as suas linhas de procedimento.
              </p>
            )}

            {deleteError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 mb-3 text-xs text-rose-700">
                {deleteError}
              </div>
            )}

            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setDeleteRequest(null)}
                disabled={!!deletingId}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                disabled={!!deletingId}
                className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 disabled:cursor-wait text-white font-semibold px-4 py-2 rounded-lg text-sm"
              >
                {deletingId
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Excluindo…</>
                  : <><Trash2 className="h-4 w-4" /> Excluir definitivamente</>}
              </button>
            </div>
          </div>
        </div>
      )}
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
