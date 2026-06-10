'use client'

import { useMemo, useState, useTransition } from 'react'
import {
  Pill, X, Loader2, Check, Pause, CircleStop, AlertTriangle, Plus, Clock, ClockAlert, FileStack,
} from 'lucide-react'
import ProtocolPicker from './ProtocolPicker'
import { formatClinicTime, nowLocalInputValue } from '@/lib/time'
import {
  applyHospitalizationDose,
  createHospitalizationPrescription,
  updateHospitalizationPrescriptionStatus,
  type HospPrescription,
  type PrescriptionStatus,
} from '@/lib/actions/hospitalization-prescriptions'
import { useMedicationScheduler, type MedicationAlert } from '@/hooks/useMedicationScheduler'
import { medicationTickStore } from '@/lib/medication-tick'
import StockItemSelector from './StockItemSelector'
import type { StockItemLite } from '@/lib/actions/stock-consumption'

/**
 * Modal de controle de medicação do paciente internado.
 *
 * Operações:
 *  - Aplicar agora (UX otimista: spinner + disabled durante a request).
 *  - Pausar (status='paused' — preserva histórico, hook ignora).
 *  - Finalizar (status='finished' — encerra ciclo permanentemente).
 *  - Aplicar SOS (frequency_hours=null — só registra o log, sem agendamento).
 *  - Criar nova prescrição (form embedded com dropdown de frequência).
 *
 * Após qualquer mutação:
 *  - chama onUpdate() para o parent re-listar prescriptions.
 *  - dispara medicationTickStore.forceTick() para todos os cards do Kanban
 *    re-renderizarem instantaneamente (não espera o setInterval de 15s).
 */

interface Props {
  hospitalizationId: string
  patientName:       string
  prescriptions:     HospPrescription[]
  onClose:           () => void
  onUpdate?:         () => void | Promise<void>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FREQUENCY_OPTIONS: { value: number | null; label: string }[] = [
  { value: 4,    label: '4 em 4h (QID)' },
  { value: 6,    label: '6 em 6h' },
  { value: 8,    label: '8 em 8h (TID)' },
  { value: 12,   label: '12 em 12h (BID)' },
  { value: 24,   label: '1× ao dia (SID)' },
  { value: 48,   label: '2 em 2 dias' },
  { value: null, label: 'SOS / Dose única' },
]

const ROUTES = ['IV', 'IM', 'SC', 'Oral', 'Tópica', 'Inalatória', 'Retal']

function formatRelative(ms: number): string {
  const abs = Math.abs(ms)
  const minutes = Math.round(abs / 60_000)
  if (minutes < 1)  return 'agora'
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  const rem   = minutes % 60
  return rem === 0 ? `${hours}h` : `${hours}h${rem}min`
}

function formatTime(iso: string): string {
  return formatClinicTime(iso)
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MedicationApplicationModal({
  hospitalizationId, patientName, prescriptions, onClose, onUpdate,
}: Props) {
  const scheduler = useMedicationScheduler(prescriptions)
  const [pendingId, setPendingId] = useState<{ id: string; action: 'apply' | 'pause' | 'finish' } | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showProtocols, setShowProtocols] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ tone: 'amber' | 'rose' | 'slate'; msg: string } | null>(null)
  // Lançamento retroativo: id da prescrição com o seletor de horário aberto.
  const [timePickerFor, setTimePickerFor] = useState<string | null>(null)
  const [customTime, setCustomTime] = useState('')

  // Mapa rápido prescriptionId → alerta (para mostrar urgência por linha).
  const alertByPresc = useMemo(() => {
    const map = new Map<string, MedicationAlert>()
    for (const a of scheduler.alerts) map.set(a.prescription.id, a)
    return map
  }, [scheduler])

  // Ordena: atrasadas → imminentes → no horário → pausadas
  const sortedPrescriptions = useMemo(() => {
    const score = (p: HospPrescription): number => {
      if (p.status === 'paused') return -1000
      const a = alertByPresc.get(p.id)
      if (a?.isOverdue)  return 100 + a.deltaMs / 60_000   // mais atrasadas primeiro
      if (a?.isImminent) return 50  - Math.abs(a.deltaMs) / 60_000
      return 0
    }
    return [...prescriptions].sort((a, b) => score(b) - score(a))
  }, [prescriptions, alertByPresc])

  async function finalizeUpdate() {
    await onUpdate?.()
    medicationTickStore.forceTick()
  }

  function handleApply(presc: HospPrescription, scheduledFor?: Date, appliedAt?: Date) {
    if (pendingId) return
    setPendingId({ id: presc.id, action: 'apply' })
    setError(null)
    setFeedback(null)
    startTransition(async () => {
      const res = await applyHospitalizationDose(presc.id, {
        applied_at:    appliedAt?.toISOString(),
        scheduled_for: scheduledFor?.toISOString(),
      })
      if ('error' in res) { setError(res.error); setPendingId(null); return }

      // Toast diferenciado conforme o resultado da baixa de estoque (Bloco 3).
      const stock = res.stock
      if (stock && 'error' in stock) {
        setFeedback({ tone: 'slate', msg: `Dose registrada. Estoque não foi atualizado: ${stock.error}` })
      } else if (stock?.requires_reconciliation) {
        setFeedback(stock.matched
          ? { tone: 'rose',  msg: `Dose registrada. Estoque insuficiente em ${presc.medication_name} — marcado para reconciliação.` }
          : { tone: 'slate', msg: 'Dose registrada. Sem vínculo com estoque — conciliar manualmente.' })
      } else if (stock?.below_minimum) {
        setFeedback({ tone: 'amber', msg: `Estoque baixo em ${presc.medication_name}: ${stock.quantity_after} restante(s).` })
      }

      await finalizeUpdate()
      setPendingId(null)
    })
  }

  // Confirma o lançamento retroativo: valida o horário escolhido antes de aplicar.
  function handleApplyAt(presc: HospPrescription, scheduledFor?: Date) {
    const dt = customTime ? new Date(customTime) : null
    if (!dt || Number.isNaN(dt.getTime())) { setError('Informe um horário válido.'); return }
    if (dt.getTime() > Date.now() + 60_000) { setError('O horário de aplicação não pode estar no futuro.'); return }
    setTimePickerFor(null)
    handleApply(presc, scheduledFor, dt)
  }

  function handleStatusChange(presc: HospPrescription, status: PrescriptionStatus) {
    if (pendingId) return
    if (status === 'finished' && !confirm(`Finalizar prescrição de ${presc.medication_name}? Esta ação remove a prescrição da lista ativa permanentemente.`)) return
    setPendingId({ id: presc.id, action: status === 'paused' ? 'pause' : 'finish' })
    setError(null)
    startTransition(async () => {
      const res = await updateHospitalizationPrescriptionStatus(presc.id, status)
      if ('error' in res) { setError(res.error); setPendingId(null); return }
      await finalizeUpdate()
      setPendingId(null)
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/65 p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-violet-50/50">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-600">
              <Pill className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Medicações · {patientName}</h2>
              <p className="text-[11px] text-slate-500">
                {sortedPrescriptions.length} {sortedPrescriptions.length !== 1 ? 'prescrições' : 'prescrição'} ·{' '}
                {scheduler.isAlerting && <span className="text-rose-600 font-semibold">{scheduler.alerts.filter(a => a.isOverdue).length} atrasada(s)</span>}
                {!scheduler.isAlerting && scheduler.hasImminent && <span className="text-amber-600 font-semibold">{scheduler.alerts.filter(a => a.isImminent).length} chegando</span>}
                {!scheduler.isAlerting && !scheduler.hasImminent && <span>tudo no horário</span>}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {sortedPrescriptions.length === 0 && !showCreate && (
            <div className="flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-slate-200">
              <Pill className="h-10 w-10 text-slate-200 mb-2" />
              <p className="text-sm font-medium text-slate-500">Nenhuma prescrição ativa</p>
              <p className="text-xs text-slate-400 mt-0.5">Clique em "Nova Prescrição" para criar.</p>
            </div>
          )}

          {sortedPrescriptions.map((p) => {
            const alert      = alertByPresc.get(p.id)
            const isSOS      = p.frequency_hours === null || p.frequency_hours <= 0
            const isPaused   = p.status === 'paused'
            const isApplying = pendingId?.id === p.id && pendingId.action === 'apply'
            const isPausing  = pendingId?.id === p.id && pendingId.action === 'pause'
            const isFinishing = pendingId?.id === p.id && pendingId.action === 'finish'
            const isAnyPending = isApplying || isPausing || isFinishing

            // Cor da borda lateral
            const borderClass = isPaused
              ? 'border-l-slate-300'
              : alert?.isOverdue
                ? 'border-l-rose-500'
                : alert?.isImminent
                  ? 'border-l-amber-500'
                  : 'border-l-emerald-500'

            return (
              <div
                key={p.id}
                className={`rounded-xl border border-slate-200 bg-white border-l-4 ${borderClass} ${isPaused ? 'opacity-60' : ''}`}
              >
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-sm leading-tight">
                        {p.medication_name}
                        {isPaused && <span className="ml-2 text-[10px] font-bold text-slate-500 uppercase">Pausada</span>}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {p.dose && <span>{p.dose}</span>}
                        {p.dose && p.route && <span className="text-slate-300 mx-1">·</span>}
                        {p.route && <span>{p.route}</span>}
                        {(p.dose || p.route) && <span className="text-slate-300 mx-1">·</span>}
                        {isSOS
                          ? <span className="text-violet-600 font-semibold">SOS / Dose única</span>
                          : <span>a cada {p.frequency_hours}h</span>}
                      </p>
                    </div>

                    {/* Badge de urgência */}
                    {!isPaused && alert && (
                      <span className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full whitespace-nowrap ${
                        alert.isOverdue
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {alert.isOverdue ? <AlertTriangle className="h-3 w-3" /> : <ClockAlert className="h-3 w-3" />}
                        {alert.isOverdue
                          ? `atrasada ${formatRelative(alert.deltaMs)}`
                          : `em ${formatRelative(-alert.deltaMs)}`}
                      </span>
                    )}
                  </div>

                  {/* Linha de informação adicional */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {p.last_applied_at
                        ? <>Última: <span className="font-semibold text-slate-700">{formatTime(p.last_applied_at)}</span> · {p.doses_applied} aplicada{p.doses_applied !== 1 ? 's' : ''}</>
                        : <>Ainda não aplicada · iniciada {formatTime(p.started_at)}</>}
                    </span>
                    {!isSOS && !isPaused && alert && (
                      <span className="text-slate-400">Próxima: {formatTime(alert.nextDoseAt.toISOString())}</span>
                    )}
                  </div>

                  {/* Botões de ação */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isAnyPending || isPaused}
                      onClick={() => handleApply(p, alert?.nextDoseAt)}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isApplying
                        ? <><Loader2 className="h-3 w-3 animate-spin" /> Aplicando...</>
                        : <><Check className="h-3 w-3" /> {isSOS ? 'Aplicar SOS' : 'Aplicar agora'}</>}
                    </button>

                    <button
                      type="button"
                      disabled={isAnyPending || isPaused}
                      onClick={() => {
                        if (timePickerFor === p.id) { setTimePickerFor(null); return }
                        setCustomTime(nowLocalInputValue())
                        setTimePickerFor(p.id)
                      }}
                      className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50 transition-colors ${
                        timePickerFor === p.id
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                      title="Registrar dose já aplicada informando o horário"
                    >
                      <Clock className="h-3 w-3" /> Outro horário
                    </button>

                    {!isPaused && (
                      <button
                        type="button"
                        disabled={isAnyPending}
                        onClick={() => handleStatusChange(p, 'paused')}
                        className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-50"
                        title="Pausa a prescrição preservando histórico"
                      >
                        {isPausing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
                        Pausar
                      </button>
                    )}

                    {isPaused && (
                      <button
                        type="button"
                        disabled={isAnyPending}
                        onClick={() => handleStatusChange(p, 'active')}
                        className="flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 hover:bg-violet-100 px-2.5 py-1.5 text-xs font-semibold text-violet-700 disabled:opacity-50"
                      >
                        {isPausing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pill className="h-3 w-3" />}
                        Retomar
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isAnyPending}
                      onClick={() => handleStatusChange(p, 'finished')}
                      className="ml-auto flex items-center gap-1 rounded-lg border border-slate-200 hover:bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50"
                      title="Encerra a prescrição permanentemente"
                    >
                      {isFinishing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CircleStop className="h-3 w-3" />}
                      Finalizar
                    </button>
                  </div>

                  {/* Lançamento retroativo: a equipe medica primeiro e registra depois */}
                  {timePickerFor === p.id && !isPaused && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 space-y-1.5">
                      <label className="block text-[10px] font-bold text-emerald-700 uppercase">
                        Horário em que a dose foi aplicada
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="datetime-local"
                          value={customTime}
                          max={nowLocalInputValue()}
                          onChange={(e) => setCustomTime(e.target.value)}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={isAnyPending}
                          onClick={() => handleApplyAt(p, alert?.nextDoseAt)}
                          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          <Check className="h-3 w-3" /> Confirmar
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Use quando a medicação já foi administrada e o registro está sendo feito depois.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Form de nova prescrição */}
          {showCreate && (
            <NewPrescriptionForm
              hospitalizationId={hospitalizationId}
              onCancel={() => setShowCreate(false)}
              onCreated={async () => { setShowCreate(false); await finalizeUpdate() }}
            />
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          {feedback && (
            <div className={`rounded-xl border px-4 py-2.5 text-xs flex items-start gap-2 ${
              feedback.tone === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-700' :
              feedback.tone === 'rose'  ? 'bg-rose-50 border-rose-200 text-rose-700'   :
                                          'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <span className="font-semibold">⚠</span>
              <span className="flex-1">{feedback.msg}</span>
              <button onClick={() => setFeedback(null)} className="text-current opacity-60 hover:opacity-100">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex gap-2 px-5 py-3 border-t border-slate-100">
          {!showCreate && (
            <>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 hover:bg-violet-100 px-3 py-2 text-xs font-semibold text-violet-700"
              >
                <Plus className="h-3.5 w-3.5" /> Nova Prescrição
              </button>
              <button
                type="button"
                onClick={() => setShowProtocols(true)}
                data-testid="open-protocols-btn"
                className="flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 px-3 py-2 text-xs font-semibold text-indigo-700"
              >
                <FileStack className="h-3.5 w-3.5" /> Aplicar Protocolo
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Protocolos de prescrição (Fase 2) — unroll 1-clique no Mapa de Execução */}
      {showProtocols && (
        <ProtocolPicker
          hospitalizationId={hospitalizationId}
          onClose={() => setShowProtocols(false)}
          onApplied={finalizeUpdate}
        />
      )}
    </div>
  )
}

// ─── Sub-form: nova prescrição ───────────────────────────────────────────────

function NewPrescriptionForm({
  hospitalizationId, onCancel, onCreated,
}: {
  hospitalizationId: string
  onCancel:  () => void
  onCreated: () => void | Promise<void>
}) {
  const [medication,   setMedication]   = useState('')
  const [dose,         setDose]         = useState('')
  const [route,        setRoute]        = useState<string>('IV')
  const [frequency,    setFrequency]    = useState<number | null>(8)
  const [duration,     setDuration]     = useState('')
  const [startAt,      setStartAt]      = useState(nowLocalInputValue())
  const [notes,        setNotes]        = useState('')
  const [stockItem,    setStockItem]    = useState<StockItemLite | null>(null)
  const [qtyPerDose,   setQtyPerDose]   = useState<string>('1')
  const [saving,       setSaving]       = useState(false)
  const [err,          setErr]          = useState<string | null>(null)

  async function handleSave() {
    setErr(null)
    if (!medication.trim()) { setErr('Informe o medicamento.'); return }
    const startDate = startAt ? new Date(startAt) : null
    if (!startDate || Number.isNaN(startDate.getTime())) {
      setErr('Informe o horário de início do tratamento.')
      return
    }
    const qtyNum = parseFloat(qtyPerDose.replace(',', '.'))
    if (stockItem && !(qtyNum > 0)) {
      setErr('Informe a quantidade consumida por dose (> 0).')
      return
    }
    setSaving(true)
    const res = await createHospitalizationPrescription({
      hospitalization_id: hospitalizationId,
      medication_name:    medication.trim(),
      dose:               dose.trim() || null,
      route:              route || null,
      frequency_hours:    frequency,
      duration_hours:     duration ? parseInt(duration, 10) || null : null,
      started_at:         startDate.toISOString(),
      notes:              notes.trim() || null,
      stock_item_id:      stockItem?.id ?? null,
      quantity_per_dose:  stockItem ? qtyNum : null,
    })
    setSaving(false)
    if ('error' in res) { setErr(res.error); return }
    await onCreated()
  }

  // Quando o vet seleciona o item, sugere o nome dele se o campo "medication"
  // ainda estiver vazio (UX: evita ter que digitar duas vezes).
  function handlePickStockItem(item: StockItemLite | null) {
    setStockItem(item)
    if (item && !medication.trim()) setMedication(item.name)
  }

  return (
    <div className="rounded-xl border-2 border-violet-300 bg-violet-50/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-violet-700 uppercase tracking-wide">Nova Prescrição</h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Medicação *</label>
        <input
          value={medication}
          onChange={(e) => setMedication(e.target.value)}
          placeholder="Ex: Dipirona, Tramadol, Soro Fisiológico..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Dose</label>
          <input
            value={dose}
            onChange={(e) => setDose(e.target.value)}
            placeholder="Ex: 2 mg/kg"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Via</label>
          <select
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-violet-500 focus:outline-none"
          >
            {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Frequência *</label>
          <select
            value={frequency === null ? 'null' : String(frequency)}
            onChange={(e) => setFrequency(e.target.value === 'null' ? null : parseFloat(e.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-violet-500 focus:outline-none"
          >
            {FREQUENCY_OPTIONS.map((o) => (
              <option key={o.label} value={o.value === null ? 'null' : String(o.value)}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Duração total (horas)</label>
          <input
            type="number"
            min="1"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="48 (vazio = até alta)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Início do tratamento (1ª dose) *</label>
        <input
          type="datetime-local"
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
        />
        <p className="text-[10px] text-slate-400 mt-1">
          A próxima dose é calculada a partir deste horário. Use um horário passado se o pet já está medicado.
        </p>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Observações</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Ex: Diluir em 10ml de soro · Administrar lentamente..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-none focus:border-violet-500 focus:outline-none"
        />
      </div>

      {/* ── Vínculo com estoque (opcional, fecha o ciclo de auditoria) ── */}
      <div className="pt-2 border-t border-violet-200/60 space-y-2">
        <p className="text-[10px] font-bold text-violet-700 uppercase tracking-wide">Baixa Automática de Estoque (opcional)</p>
        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Item do Estoque</label>
          <StockItemSelector value={stockItem?.id ?? null} onChange={handlePickStockItem} />
        </div>
        {stockItem && (
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
              Quantidade por dose ({stockItem.unit}) *
            </label>
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={qtyPerDose}
              onChange={(e) => setQtyPerDose(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Cada aplicação decrementa {qtyPerDose || '?'} {stockItem.unit} de "{stockItem.name}" automaticamente.
            </p>
          </div>
        )}
      </div>

      {err && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">{err}</div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="flex-1 rounded-lg bg-violet-600 hover:bg-violet-700 py-2 text-xs font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Salvando...</> : <><Plus className="h-3 w-3" /> Criar Prescrição</>}
        </button>
      </div>
    </div>
  )
}
