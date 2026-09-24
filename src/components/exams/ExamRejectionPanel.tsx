'use client'

// Painel do LABORATÓRIO: para cada exame da OS, informar se foi realizado ou
// não realizado (com motivo). O não realizado dispara o aviso automático a quem
// encaminhou e sai da cobrança na mesma operação.
//
// Só é renderizado quando a clínica tem flow_config.usa_fluxo_rejeicao_exame.

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { FlaskConical, CheckCircle2, XCircle, Loader2, AlertTriangle, RotateCw, Ban, X, Link2 } from 'lucide-react'
import {
  listExamLines, listRejectionReasons, rejectExamLine, markExamPerformed,
  recordExamDecisionByStaff, isBilledReversalOn, type ExamLine, type RejectionReason,
} from '@/lib/actions/exam-rejection'
import { STATE_LABEL, type ExamState } from '@/lib/exams/rejection-flow'

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDateTime = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '')
  : '—'

const STATE_STYLE: Record<ExamState, string> = {
  pending:             'bg-slate-100 text-slate-600',
  performed:           'bg-emerald-100 text-emerald-700',
  rejected:            'bg-amber-100 text-amber-800',
  recollect_requested: 'bg-sky-100 text-sky-700',
  closed_no_recollect: 'bg-rose-100 text-rose-700',
}

interface Props {
  consultationId: string
  onToast: (type: 'success' | 'error', msg: string) => void
}

export default function ExamRejectionPanel({ consultationId, onToast }: Props) {
  const [lines, setLines]     = useState<ExamLine[]>([])
  const [reasons, setReasons] = useState<RejectionReason[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId]   = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<ExamLine | null>(null)
  // Tarefa 0, item 7: com o estorno automático ligado, a linha JÁ FATURADA
  // também pode ser marcada como não realizada — o sistema estorna a fatura em
  // aberto e registra a trilha. Desligado (padrão), o botão continua oculto.
  const [billedReversal, setBilledReversal] = useState(false)

  const load = useCallback(async () => {
    const [l, r, b] = await Promise.all([
      listExamLines(consultationId), listRejectionReasons(), isBilledReversalOn(),
    ])
    setLoading(false)
    if (!('error' in l)) setLines(l)
    if (!('error' in r)) setReasons(r)
    setBilledReversal(b)
  }, [consultationId])

  useEffect(() => { void load() }, [load])

  async function perform(line: ExamLine) {
    setBusyId(line.id)
    const res = await markExamPerformed(line.id)
    setBusyId(null)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', `${line.name} marcado como realizado — liberado para cobrança.`)
    void load()
  }

  async function decide(line: ExamLine, decision: 'recollect' | 'no_recollect') {
    setBusyId(line.id)
    const res = await recordExamDecisionByStaff({ serviceLineId: line.id, decision })
    setBusyId(null)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', decision === 'recollect'
      ? 'Recoleta aberta. A primeira coleta foi preservada com o motivo.'
      : 'Exame encerrado sem recoleta — não será cobrado.')
    void load()
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-400">
        Carregando exames da OS…
      </div>
    )
  }
  if (lines.length === 0) return null

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
          <FlaskConical className="h-4 w-4 text-amber-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Realização dos exames</h2>
          <p className="text-xs text-slate-500">
            Exame não realizado não é cobrado e o cliente é avisado automaticamente com o motivo.
          </p>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {lines.map(line => {
          const state = line.exam_state
          const busy  = busyId === line.id
          return (
            <div key={line.id} className="px-6 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{line.name}</span>
                    {state && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATE_STYLE[state]}`}>
                        {STATE_LABEL[state]}
                      </span>
                    )}
                    {line.attempt_no && line.attempt_no > 1 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                        <Link2 className="h-3 w-3" /> {line.attempt_no}ª coleta
                      </span>
                    )}
                    {line.billing_on_hold && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                        fora da cobrança
                      </span>
                    )}
                    {line.billed && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        já faturado
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {line.quantity > 1 ? `${line.quantity} × ` : ''}{BRL(line.price)}
                  </p>

                  {line.reason_label && (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-xs font-semibold text-amber-900">
                        Não realizado: {line.reason_label}
                      </p>
                      {line.rejection_note && <p className="mt-0.5 text-xs text-amber-800">{line.rejection_note}</p>}
                      <p className="mt-1 text-[11px] text-amber-700">
                        {line.rejected_by_name ? `${line.rejected_by_name} · ` : ''}{fmtDateTime(line.rejected_at)}
                      </p>
                      {line.client_decision && (
                        <p className="mt-1 text-[11px] font-medium text-amber-900">
                          Cliente decidiu: {line.client_decision === 'recollect' ? 'recoletar' : 'não recoletar'}
                          {line.decided_by_label ? ` (${line.decided_by_label})` : ''} · {fmtDateTime(line.decided_at)}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-shrink-0 flex-wrap gap-2">
                  {(state === null || state === 'pending') && (!line.billed || billedReversal) && (
                    <>
                      <button onClick={() => perform(line)} disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Realizado
                      </button>
                      <button onClick={() => setRejectTarget(line)} disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
                        <XCircle className="h-3.5 w-3.5" /> Não realizado
                      </button>
                    </>
                  )}
                  {state === 'rejected' && (
                    <>
                      <button onClick={() => decide(line, 'recollect')} disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />} Cliente pediu recoleta
                      </button>
                      <button onClick={() => decide(line, 'no_recollect')} disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                        <Ban className="h-3.5 w-3.5" /> Não recoletar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {rejectTarget && (
        <RejectExamModal
          line={rejectTarget}
          reasons={reasons}
          onClose={() => setRejectTarget(null)}
          onDone={(msg) => { setRejectTarget(null); onToast('success', msg); void load() }}
          onError={(msg) => onToast('error', msg)}
        />
      )}
    </div>
  )
}

// ─── Modal (sempre via portal para o body) ───────────────────────────────────

function RejectExamModal({ line, reasons, onClose, onDone, onError }: {
  line:    ExamLine
  reasons: RejectionReason[]
  onClose: () => void
  onDone:  (msg: string) => void
  onError: (msg: string) => void
}) {
  const [reasonId, setReasonId] = useState('')
  const [note, setNote]         = useState('')
  const [busy, setBusy]         = useState(false)

  const selected = reasons.find(r => r.id === reasonId)

  async function submit() {
    if (!reasonId) { onError('Selecione o motivo.'); return }
    setBusy(true)
    const res = await rejectExamLine({ serviceLineId: line.id, reasonId, note })
    setBusy(false)
    if ('error' in res) { onError(res.error); return }
    const who = res.notified > 0 ? `${res.notified} aviso(s) enviado(s).` : 'Nenhum contato pôde ser avisado automaticamente — avise o cliente.'
    onDone(`Exame marcado como não realizado e retirado da cobrança. ${who}`)
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4"
         onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Exame não realizado</h3>
            <p className="mt-0.5 text-xs text-slate-500">{line.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {line.billed && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600" />
              <p className="text-xs leading-relaxed text-rose-900">
                <strong>Este exame já está numa fatura.</strong> Como a clínica ativou o estorno automático,
                o valor será abatido da fatura <strong>em aberto</strong> e tudo fica registrado na trilha de
                auditoria com o seu nome. Fatura já paga/baixada não é alterada — nesse caso o sistema recusa
                e pede o estorno manual no Financeiro.
              </p>
            </div>
          )}
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <p className="text-xs leading-relaxed text-amber-900">
              Este exame sairá da cobrança (não será cobrado nem valor reduzido) e quem encaminhou será
              avisado automaticamente com o motivo, para decidir se quer recoletar.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Motivo</label>
            <select value={reasonId} onChange={e => setReasonId(e.target.value)} autoFocus
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">Selecione…</option>
              {reasons.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            {reasons.length === 0 && (
              <p className="mt-1 text-xs text-rose-600">
                Nenhum motivo cadastrado. Configure em Gestão &gt; Configurações &gt; Geral.
              </p>
            )}
            {selected?.description && <p className="mt-1 text-xs text-slate-500">{selected.description}</p>}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Observação (opcional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
              placeholder="Detalhe que ajude o cliente a evitar a repetição."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={submit} disabled={busy || !reasonId}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Registrar e avisar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
