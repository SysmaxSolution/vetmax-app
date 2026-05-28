'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, BedDouble, LogOut, Loader2, Sparkles, X, Stethoscope, FileText, Plus, Bell, BellRing, Biohazard, LayoutGrid, CalendarClock } from 'lucide-react'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { useInternacaoCompleta } from '@/components/providers/ClinicConfigProvider'
import { useMedicationAlarm } from '@/hooks/useMedicationAlarm'
import ExecutionMapView from './ExecutionMapView'
import {
  updateHospitalizationStatus,
  addHospitalizationLog,
  confirmDischarge,
  sendToVetReview,
  createHospitalization,
  type HospitalizationBoard,
  type HospitalizationCard,
  type HospitalizationStatus
} from '@/lib/actions/hospitalizations'
import { searchPatientsForTriage, type TriagePatientSearchResult } from '@/lib/actions/triage'
import { BehaviorTagsBadges } from '@/components/ui/BehaviorTagsBadges'
import { useKanbanEdgeScroll } from '@/hooks/useKanbanEdgeScroll'
import { PetAvatar } from '@/components/ui/PetAvatar'
import { generateDischargeSummary, type DischargeSummary } from '@/lib/actions/reports'
import HospitalizationDetailModal from './HospitalizationDetailModal'
import WhatsAppNotificationModal from '@/components/whatsapp/WhatsAppNotificationModal'
import MedicationAlertBadge from './MedicationAlertBadge'
import MedicationApplicationModal from './MedicationApplicationModal'
import { useMedicationScheduler } from '@/hooks/useMedicationScheduler'
import {
  listHospitalizationPrescriptions,
  type HospPrescription,
} from '@/lib/actions/hospitalization-prescriptions'

const WARD_LABELS: Record<string, string> = {
  observation: 'Observação',
  ward:        'Enfermaria',
  icu:         'UTA',
}

// ─── Status padrão de evolução por ala ───────────────────────────────────────

const MOVE_STATUS_PREFILL: Record<string, 'piorou' | 'estavel' | 'melhorou'> = {
  icu:         'piorou',
  ward:        'melhorou',
  observation: 'estavel',
}

// ─── Configuração das Colunas ─────────────────────────────────────────────────

const COLUMNS: {
  status:      keyof HospitalizationBoard
  label:       string
  emoji:       string
  bg:          string
  border:      string
  badge:       string
  headerColor: string
}[] = [
  {
    status:      'observation',
    label:       'Observação',
    emoji:       '👁️',
    bg:          'bg-amber-50',
    border:      'border-amber-200',
    badge:       'bg-amber-100 text-amber-700',
    headerColor: 'bg-amber-500',
  },
  {
    status:      'ward',
    label:       'Enfermaria',
    emoji:       '🏥',
    bg:          'bg-blue-50',
    border:      'border-blue-200',
    badge:       'bg-blue-100 text-blue-700',
    headerColor: 'bg-blue-500',
  },
  {
    status:      'icu',
    label:       'UTA',
    emoji:       '🚨',
    bg:          'bg-rose-50',
    border:      'border-rose-200',
    badge:       'bg-rose-100 text-rose-700',
    headerColor: 'bg-rose-500',
  },
  {
    status:      'ready_for_discharge',
    label:       'Pronto para Alta',
    emoji:       '🏠',
    bg:          'bg-emerald-50',
    border:      'border-emerald-200',
    badge:       'bg-emerald-100 text-emerald-700',
    headerColor: 'bg-emerald-500',
  },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialBoard: HospitalizationBoard
  clinicId:     string
  isFreePlan?:  boolean
}

// Constante estável: cards sem prescrição compartilham a mesma referência —
// evita re-render no useMedicationScheduler por mudança falsa de identidade.
const EMPTY_PRESCRIPTIONS: HospPrescription[] = []

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function HospitalizationKanban({ initialBoard, clinicId, isFreePlan = false }: Props) {
  const router = useRouter()
  const internacaoCompleta = useInternacaoCompleta()
  const [view, setView] = useState<'kanban' | 'execution'>('kanban')
  const [board, setBoard]                   = useState<HospitalizationBoard>(initialBoard)
  const boardRef = useRef<HospitalizationBoard>(initialBoard)
  const [showAdmitModal, setShowAdmitModal] = useState(false)
  const [admitSuccessMsg, setAdmitSuccessMsg] = useState('')
  const [dischargeSuccessMsg, setDischargeSuccessMsg] = useState('')
  const [dragOverCol, setDragOverCol]       = useState<HospitalizationStatus | null>(null)
  const [selectedCard, setSelectedCard]     = useState<HospitalizationCard | null>(null)
  const [pendingDischarge, setPendingDischarge] = useState<{
    card:       HospitalizationCard
    fromStatus: HospitalizationStatus
  } | null>(null)
  const [pendingMove, setPendingMove] = useState<{
    card:       HospitalizationCard
    fromStatus: HospitalizationStatus
    toStatus:   HospitalizationStatus
  } | null>(null)
  const [isModalProcessing, setIsModalProcessing] = useState(false)

  // WhatsApp pós-movimentação
  const [whatsappMove, setWhatsappMove] = useState<{
    card:       HospitalizationCard
    fromStatus: HospitalizationStatus
    toStatus:   HospitalizationStatus
  } | null>(null)
  const [whatsappReview,     setWhatsappReview]     = useState<HospitalizationCard | null>(null)
  const [whatsappDischarge,  setWhatsappDischarge]  = useState<HospitalizationCard | null>(null)

  // ─── Prescrições ativas agrupadas por hospitalization_id ────────────────
  // 1 fetch único; cada card usa useMedicationScheduler com seu slice.
  const [prescriptionsByHosp, setPrescriptionsByHosp] = useState<Map<string, HospPrescription[]>>(new Map())
  const [medModalCard, setMedModalCard] = useState<HospitalizationCard | null>(null)

  const refreshPrescriptions = useCallback(async () => {
    if (isFreePlan) return   // plano free não persiste internação
    const res = await listHospitalizationPrescriptions()
    if (Array.isArray(res)) {
      const map = new Map<string, HospPrescription[]>()
      for (const p of res) {
        const arr = map.get(p.hospitalization_id) ?? []
        arr.push(p)
        map.set(p.hospitalization_id, arr)
      }
      setPrescriptionsByHosp(map)
    }
  }, [isFreePlan])

  useEffect(() => { void refreshPrescriptions() }, [refreshPrescriptions])

  // Alertas Ativos de Enfermagem — som + push quando uma dose vence (só sob
  // a flag Internação Completa). Roda no nível da ala (todas as prescrições).
  const allPrescriptions = useMemo(
    () => Array.from(prescriptionsByHosp.values()).flat(),
    [prescriptionsByHosp],
  )
  const alarm = useMedicationAlarm(allPrescriptions, internacaoCompleta)

  // Todos os cards ativos (para o Mapa de Execução).
  const allCards = useMemo(
    () => [...board.observation, ...board.ward, ...board.icu, ...board.ready_for_discharge],
    [board],
  )

  useRealtimeSync({ table: 'hospitalizations', clinicId })
  useRealtimeSync({ table: 'hospitalization_dose_administrations', clinicId, onEvent: refreshPrescriptions })
  useRealtimeSync({ table: 'hospitalization_prescriptions',        clinicId, onEvent: refreshPrescriptions })

  // Keep boardRef in sync for native DOM event handlers
  useEffect(() => { boardRef.current = board }, [board])

  // ─── Native DOM drag listeners (Playwright CDP compatibility) ──────────────
  // React synthetic events may not fire when Playwright dispatches CDP drag events.
  // Native listeners on the document catch the events regardless.
  const processDrop = useCallback(async (cardId: string, oldStatus: HospitalizationStatus, newStatus: HospitalizationStatus) => {
    if (!cardId || !oldStatus || oldStatus === newStatus) return
    const currentBoard = boardRef.current
    const card = currentBoard[oldStatus as keyof HospitalizationBoard]?.find(c => c.id === cardId)
    if (!card) return
    if (newStatus === 'ready_for_discharge') {
      setPendingDischarge({ card, fromStatus: oldStatus })
      return
    }
    const snapshot = currentBoard
    setBoard(prev => {
      const next = { ...prev }
      next[oldStatus as keyof HospitalizationBoard] = prev[oldStatus as keyof HospitalizationBoard].filter(c => c.id !== cardId)
      next[newStatus as keyof HospitalizationBoard] = [...prev[newStatus as keyof HospitalizationBoard], { ...card, status: newStatus }]
      return next
    })
    const [moveResult] = await Promise.all([
      updateHospitalizationStatus(card.id, newStatus),
      addHospitalizationLog({ hospitalization_id: card.id, from_status: oldStatus, to_status: newStatus }),
    ])
    if ('error' in moveResult) {
      setBoard(snapshot)
      return
    }
    setPendingMove({ card, fromStatus: oldStatus, toStatus: newStatus })
  }, [])

  useEffect(() => {
    // ── HTML5 drag events (real browser) ───────────────────────────────────
    const onDragStartNative = (e: DragEvent) => {
      const target = (e.target as HTMLElement).closest('[data-testid^="hospitalization-card-"]') as HTMLElement | null
      if (!target) return
      const cardId = target.dataset.testid?.replace('hospitalization-card-', '') ?? ''
      const col = target.closest('[data-column]') as HTMLElement | null
      const status = (col?.dataset.column ?? '') as HospitalizationStatus
      if (cardId && status) draggingCardRef.current = { id: cardId, status }
    }
    const onDropNative = (e: DragEvent) => {
      const target = (e.target as HTMLElement).closest('[data-column]') as HTMLElement | null
      if (!target) return
      const newStatus = target.dataset.column as HospitalizationStatus
      if (!newStatus) return
      const ref = draggingCardRef.current
      if (!ref) return
      draggingCardRef.current = null
      processDrop(ref.id, ref.status, newStatus)
    }
    const onDragOverNative = (e: DragEvent) => {
      if ((e.target as HTMLElement).closest('[data-column]')) e.preventDefault()
    }

    // ── Pointer/mouse events (Playwright CDP dragTo simulation) ────────────
    const onPointerDown = (e: PointerEvent) => {
      const target = (e.target as HTMLElement).closest('[data-testid^="hospitalization-card-"]') as HTMLElement | null
      if (!target) return
      const cardId = target.dataset.testid?.replace('hospitalization-card-', '') ?? ''
      const col = target.closest('[data-column]') as HTMLElement | null
      const status = (col?.dataset.column ?? '') as HospitalizationStatus
      if (cardId && status) draggingCardRef.current = { id: cardId, status }
    }
    const onPointerUp = (e: PointerEvent) => {
      const ref = draggingCardRef.current
      if (!ref) return
      const target = (e.target as HTMLElement).closest('[data-column]') as HTMLElement | null
      if (!target) {
        draggingCardRef.current = null
        return
      }
      const newStatus = target.dataset.column as HospitalizationStatus
      if (!newStatus) { draggingCardRef.current = null; return }
      draggingCardRef.current = null
      processDrop(ref.id, ref.status, newStatus)
    }

    document.addEventListener('dragstart', onDragStartNative, true)
    document.addEventListener('drop',      onDropNative,      true)
    document.addEventListener('dragover',  onDragOverNative,  true)
    document.addEventListener('pointerdown', onPointerDown,   true)
    document.addEventListener('pointerup',   onPointerUp,     true)
    return () => {
      document.removeEventListener('dragstart', onDragStartNative, true)
      document.removeEventListener('drop',      onDropNative,      true)
      document.removeEventListener('dragover',  onDragOverNative,  true)
      document.removeEventListener('pointerdown', onPointerDown,   true)
      document.removeEventListener('pointerup',   onPointerUp,     true)
    }
  }, [processDrop])

  // ─── Drag & Drop ───────────────────────────────────────────────────────────

  const draggingCardRef = useRef<{ id: string; status: HospitalizationStatus } | null>(null)
  const boardScrollRef  = useRef<HTMLElement | null>(null) as React.MutableRefObject<HTMLDivElement | null>

  // Auto-scroll horizontal quando o usuário arrasta um card próximo às bordas
  // (mobile primário — em desktop o layout vira grid e o hook fica no-op).
  useKanbanEdgeScroll(boardScrollRef, draggingCardRef)

  const handleDragStart = (e: React.DragEvent, card: HospitalizationCard) => {
    try {
      e.dataTransfer.setData('cardId', card.id)
      e.dataTransfer.setData('currentStatus', card.status)
    } catch { /* dataTransfer may be read-only in some environments */ }
    draggingCardRef.current = { id: card.id, status: card.status as HospitalizationStatus }
  }

  const handleDragEnd = () => {
    draggingCardRef.current = null
  }

  const handleDragOver = (e: React.DragEvent, status: HospitalizationStatus) => {
    e.preventDefault()
    setDragOverCol(status)
  }

  const handleDrop = async (e: React.DragEvent, newStatus: HospitalizationStatus) => {
    e.preventDefault()
    setDragOverCol(null)

    // Use dataTransfer with fallback to ref (Playwright compatibility)
    const cardId    = e.dataTransfer.getData('cardId') || draggingCardRef.current?.id || ''
    const oldStatus = (e.dataTransfer.getData('currentStatus') || draggingCardRef.current?.status || '') as HospitalizationStatus

    draggingCardRef.current = null

    if (!cardId || !oldStatus || oldStatus === newStatus) return

    const card = board[oldStatus as keyof HospitalizationBoard]?.find(c => c.id === cardId)
    if (!card) return

    // Coluna Alta → intercepta com modal de decisão
    if (newStatus === 'ready_for_discharge') {
      setPendingDischarge({ card, fromStatus: oldStatus })
      return
    }

    // Colunas clínicas → persiste diretamente e depois abre modal de Evolução opcional
    const snapshot = board
    setBoard(prev => {
      const next = { ...prev }
      next[oldStatus as keyof HospitalizationBoard] = prev[oldStatus as keyof HospitalizationBoard].filter(c => c.id !== card.id)
      next[newStatus as keyof HospitalizationBoard] = [...prev[newStatus as keyof HospitalizationBoard], { ...card, status: newStatus }]
      return next
    })

    const [moveResult] = await Promise.all([
      updateHospitalizationStatus(card.id, newStatus),
      addHospitalizationLog({ hospitalization_id: card.id, from_status: oldStatus, to_status: newStatus }),
    ])

    if ('error' in moveResult) {
      setBoard(snapshot)
      alert(moveResult.error)
      return
    }

    // Dispara WA se tutor tem telefone e destino é ala clínica
    if (card.tutor?.phone && newStatus in WARD_LABELS) {
      setWhatsappMove({ card: { ...card, status: newStatus }, fromStatus: oldStatus, toStatus: newStatus })
    }

    // Abre modal de Evolução opcional para registrar notas
    setPendingMove({ card, fromStatus: oldStatus, toStatus: newStatus })
  }

  const handleMoveSaved = () => {
    // Status já foi persistido no drop — apenas fecha o modal de evolução
    setPendingMove(null)
  }

  // ─── Handlers do Modal de Alta ─────────────────────────────────────────────

  const handleDischargeRequest = (card: HospitalizationCard) => {
    setPendingDischarge({ card, fromStatus: 'ready_for_discharge' })
  }

  const removeCardFromBoard = (cardId: string) => {
    setBoard(prev => {
      const next = { ...prev }
      ;(Object.keys(next) as (keyof HospitalizationBoard)[]).forEach(col => {
        next[col] = next[col].filter(c => c.id !== cardId)
      })
      return next
    })
  }

  const onConfirmDischarge = async () => {
    if (!pendingDischarge || isModalProcessing) return
    const { card, fromStatus } = pendingDischarge
    setIsModalProcessing(true)

    const snapshot = board
    removeCardFromBoard(card.id)

    const [result] = await Promise.all([
      confirmDischarge(card.id, card.consultation_id),
      addHospitalizationLog({ hospitalization_id: card.id, from_status: fromStatus, to_status: 'discharged' }),
    ])

    if ('error' in result) {
      setBoard(snapshot)
      alert(result.error)
    } else {
      setDischargeSuccessMsg(`Alta concedida! Paciente ${card.patient.name} recebeu alta com sucesso.`)
      setTimeout(() => setDischargeSuccessMsg(''), 5000)
      if (card.tutor?.phone) setWhatsappDischarge(card)
    }

    setIsModalProcessing(false)
    setPendingDischarge(null)
  }

  const onSendToVetReview = async () => {
    if (!pendingDischarge || isModalProcessing) return
    const { card, fromStatus } = pendingDischarge
    setIsModalProcessing(true)

    const snapshot = board
    removeCardFromBoard(card.id)

    const [result] = await Promise.all([
      sendToVetReview(card.id, card.consultation_id),
      addHospitalizationLog({ hospitalization_id: card.id, from_status: fromStatus, to_status: 'discharged' }),
    ])

    if ('error' in result) {
      setBoard(snapshot)
      alert(result.error)
      setIsModalProcessing(false)
      return
    }

    setIsModalProcessing(false)
    setPendingDischarge(null)

    // Dispara WA se tutor tem telefone
    if (card.tutor?.phone) {
      setWhatsappReview(card)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="space-y-6">
      {isFreePlan && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold">i</div>
          <div className="flex-1 text-sm">
            <p className="font-semibold text-amber-900">Modo Demonstrativo · Plano Free</p>
            <p className="text-amber-800 mt-0.5">
              A internação está disponível apenas para visualização. Para admitir pacientes, registrar evolução clínica
              e dar alta, faça upgrade para um plano pago.
            </p>
          </div>
          <a
            href="/dashboard/management?tab=subscription"
            className="self-center rounded-xl bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
          >
            Fazer upgrade
          </a>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BedDouble className="h-6 w-6 text-violet-600" />
            Mapa de Internação
          </h1>
          <p className="text-sm text-slate-500">Gerencie o fluxo de pacientes críticos e observações em tempo real.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (isFreePlan) { alert('Funcionalidade disponível em planos pagos. Faça upgrade para admitir pacientes.'); return }
            setShowAdmitModal(true)
          }}
          aria-hidden={showAdmitModal ? 'true' : undefined}
          tabIndex={showAdmitModal ? -1 : undefined}
          title={isFreePlan ? 'Recurso bloqueado no plano Free — use para conhecer a tela.' : undefined}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm flex-shrink-0 transition-colors ${
            isFreePlan ? 'bg-violet-300 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700'
          }`}
        >
          <Plus className="h-4 w-4" />
          Admitir Paciente
        </button>
      </div>
      {admitSuccessMsg && (
        <div role="status" className="fixed bottom-6 right-6 z-50 bg-violet-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-semibold">
          {admitSuccessMsg}
        </div>
      )}
      {dischargeSuccessMsg && (
        <div role="status" className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-semibold">
          {dischargeSuccessMsg}
        </div>
      )}

      {/* Barra de controle (Internação Completa): alternância de visão + sino de alertas */}
      {internacaoCompleta && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setView('kanban')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === 'kanban' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Mapa de Internação
            </button>
            <button
              type="button"
              onClick={() => setView('execution')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === 'execution' ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <CalendarClock className="h-3.5 w-3.5" /> Mapa de Execução
            </button>
          </div>

          <button
            type="button"
            onClick={() => { void alarm.enableAlarms() }}
            title={alarm.permission === 'granted' && alarm.soundReady
              ? 'Alertas de medicação ativos (som + notificação)'
              : 'Ativar alertas sonoros e notificações de medicação'}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border transition-colors ${
              alarm.hasOverdue
                ? 'bg-rose-600 border-rose-600 text-white animate-pulse'
                : alarm.permission === 'granted' && alarm.soundReady
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {alarm.permission === 'granted' && alarm.soundReady
              ? <BellRing className="h-3.5 w-3.5" />
              : <Bell className="h-3.5 w-3.5" />}
            {alarm.hasOverdue
              ? `${alarm.overdueCount} dose${alarm.overdueCount !== 1 ? 's' : ''} atrasada${alarm.overdueCount !== 1 ? 's' : ''}`
              : alarm.permission === 'granted' && alarm.soundReady
                ? 'Alertas ativos'
                : 'Ativar alertas'}
          </button>
        </div>
      )}

      {view === 'execution' && internacaoCompleta && (
        <ExecutionMapView cards={allCards} prescriptionsByHosp={prescriptionsByHosp} />
      )}

      {view === 'kanban' && (
      <>
      <section
        ref={boardScrollRef}
        data-mentor-step="hospitalization-list"
        className="flex md:grid md:grid-cols-2 lg:grid-cols-4 gap-4 min-h-[600px] overflow-x-auto md:overflow-visible snap-x snap-mandatory md:snap-none -mx-3 px-3 md:mx-0 md:px-0 pb-2"
      >
        {COLUMNS.map(col => {
          const cards      = board[col.status]
          const isDragOver = dragOverCol === col.status

          return (
            <div
              key={col.status}
              data-testid={`column-${col.status}`}
              data-column={col.status}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(e) => handleDrop(e, col.status)}
              className={`flex flex-col rounded-2xl border-2 transition-all snap-center md:snap-align-none min-w-[85vw] md:min-w-0 flex-shrink-0 md:flex-shrink ${col.bg} ${
                isDragOver ? `${col.border} ring-2 ring-violet-400 ring-offset-2 scale-[1.01]` : 'border-transparent'
              }`}
            >
              {/* Header da Coluna */}
              <div className={`p-3 rounded-t-[14px] flex items-center justify-between ${col.headerColor} text-white shadow-sm`}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{col.emoji}</span>
                  <h3 className="font-bold text-sm tracking-wide uppercase">{col.label}</h3>
                </div>
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold">
                  {cards.length}
                </span>
              </div>

              {/* Lista de Cards */}
              <div className="flex-1 p-3 space-y-3">
                {cards.length === 0 ? (
                  <div className={`flex flex-col items-center justify-center py-10 rounded-xl border-2 border-dashed ${col.border} text-center`}>
                    <span className="text-2xl mb-1 opacity-30">{col.emoji}</span>
                    <p className="text-xs text-slate-400">Sem pacientes aqui</p>
                  </div>
                ) : (
                  cards.map(card => (
                    <KanbanCard
                      key={card.id}
                      card={card}
                      prescriptions={prescriptionsByHosp.get(card.id) ?? EMPTY_PRESCRIPTIONS}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      onOpenMedAlert={() => setMedModalCard(card)}
                      onDischarge={handleDischargeRequest}
                      onOpen={() => setSelectedCard(card)}
                    />
                  ))
                )}

                {isDragOver && cards.length > 0 && (
                  <div className={`h-16 rounded-xl border-2 border-dashed ${col.border} flex items-center justify-center bg-white/50`}>
                    <p className="text-xs font-semibold text-slate-500">Solte aqui</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </section>


      {/* Legenda */}
      <div className="flex flex-wrap gap-3 justify-center pt-2">
        <p className="text-xs text-slate-400">
          💡 Arraste os cards para mover • Clique no card para ver a evolução • Coluna Alta abre o fluxo de alta inteligente
        </p>
      </div>
      </>
      )}

      {/* Modal de Evolução Clínica (click no card) */}
      {selectedCard && !pendingMove && (
        <HospitalizationDetailModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
        />
      )}

      {/* Modal de Medicação (click no badge de alerta) */}
      {medModalCard && (
        <MedicationApplicationModal
          hospitalizationId={medModalCard.id}
          patientName={medModalCard.patient.name}
          prescriptions={prescriptionsByHosp.get(medModalCard.id) ?? EMPTY_PRESCRIPTIONS}
          onClose={() => setMedModalCard(null)}
          onUpdate={refreshPrescriptions}
        />
      )}

      {/* Modal de Evolução obrigatório ao mover entre alas */}
      {pendingMove && (
        <HospitalizationDetailModal
          card={{ ...pendingMove.card, status: pendingMove.toStatus }}
          prefilledStatus={MOVE_STATUS_PREFILL[pendingMove.toStatus] ?? 'estavel'}
          onSaved={handleMoveSaved}
          onClose={() => setPendingMove(null)}
        />
      )}

      {/* Modal de Alta Inteligente */}
      {pendingDischarge && (
        <DischargeModal
          card={pendingDischarge.card}
          isProcessing={isModalProcessing}
          onConfirm={onConfirmDischarge}
          onSendToReview={onSendToVetReview}
          onCancel={() => !isModalProcessing && setPendingDischarge(null)}
        />
      )}

      {/* WhatsApp — Mudança de Ala */}
      {whatsappMove && whatsappMove.card.tutor?.phone && (
        <WhatsAppNotificationModal
          isOpen
          onClose={() => setWhatsappMove(null)}
          trigger="hospitalization_status_changed"
          context={{
            petName:    whatsappMove.card.patient.name,
            tutorName:  whatsappMove.card.tutor.name,
            tutorPhone: whatsappMove.card.tutor.phone,
            species:    whatsappMove.card.patient.species,
            breed:      whatsappMove.card.patient.breed ?? undefined,
            fromWard:   WARD_LABELS[whatsappMove.fromStatus] ?? whatsappMove.fromStatus,
            toWard:     WARD_LABELS[whatsappMove.toStatus]   ?? whatsappMove.toStatus,
          }}
          hospitalizationId={whatsappMove.card.id}
          patientId={whatsappMove.card.patient.id}
        />
      )}

      {/* WhatsApp — Enviado para Revisão Clínica */}
      {whatsappReview && whatsappReview.tutor?.phone && (
        <WhatsAppNotificationModal
          isOpen
          onClose={() => setWhatsappReview(null)}
          trigger="sent_to_review"
          context={{
            petName:    whatsappReview.patient.name,
            tutorName:  whatsappReview.tutor.name,
            tutorPhone: whatsappReview.tutor.phone,
            species:    whatsappReview.patient.species,
            breed:      whatsappReview.patient.breed ?? undefined,
          }}
          hospitalizationId={whatsappReview.id}
          patientId={whatsappReview.patient.id}
        />
      )}

      {/* I-02: WhatsApp — Alta da Internação */}
      {whatsappDischarge && whatsappDischarge.tutor?.phone && (
        <WhatsAppNotificationModal
          isOpen
          onClose={() => setWhatsappDischarge(null)}
          trigger="hospitalization_discharge"
          context={{
            petName:    whatsappDischarge.patient.name,
            tutorName:  whatsappDischarge.tutor.name,
            tutorPhone: whatsappDischarge.tutor.phone,
            species:    whatsappDischarge.patient.species,
            breed:      whatsappDischarge.patient.breed ?? undefined,
          }}
          hospitalizationId={whatsappDischarge.id}
          patientId={whatsappDischarge.patient.id}
        />
      )}

      {/* Modal de Admissão */}
      {showAdmitModal && (
        <AdmitModal
          onClose={() => setShowAdmitModal(false)}
          onSuccess={(msg) => {
            setAdmitSuccessMsg(msg)
            setTimeout(() => { setAdmitSuccessMsg(''); router.refresh() }, 3000)
          }}
        />
      )}
    </section>
  )
}

// ─── Componente Interno: KanbanCard ───────────────────────────────────────────

interface CardProps {
  card:          HospitalizationCard
  prescriptions: HospPrescription[]
  onDragStart:   (e: React.DragEvent, card: HospitalizationCard) => void
  onDragEnd:     () => void
  onDischarge:   (card: HospitalizationCard) => void
  onOpen:        () => void
  onOpenMedAlert?: (card: HospitalizationCard) => void
}

function KanbanCard({ card, prescriptions, onDragStart, onDragEnd, onDischarge, onOpen, onOpenMedAlert }: CardProps) {
  const hours = Math.floor((Date.now() - new Date(card.created_at).getTime()) / (1000 * 60 * 60))
  const scheduler = useMedicationScheduler(prescriptions)

  // Classe de pulse no card inteiro — apenas border + box-shadow (sem reflow).
  const pulseClass = scheduler.isAlerting
    ? 'med-card-overdue'
    : scheduler.hasImminent
      ? 'med-card-imminent'
      : ''

  return (
    <div
      draggable
      data-testid={`hospitalization-card-${card.id}`}
      onDragStart={(e) => onDragStart(e, card)}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`group relative p-4 rounded-2xl border bg-white shadow-sm hover:shadow-md transition-all cursor-pointer mb-3 active:scale-95 ${pulseClass} ${
        card.isolation_required
          ? 'border-rose-400 ring-2 ring-rose-300 hover:border-rose-500'
          : 'hover:border-violet-300'
      }`}
    >
      {card.isolation_required && (
        <div className="mb-2 flex items-center gap-1 rounded-lg bg-rose-100 border border-rose-300 px-2 py-1 text-[10px] font-bold uppercase text-rose-700">
          <Biohazard className="h-3 w-3" /> Isolamento — EPI obrigatório
        </div>
      )}
      <div className="flex items-start gap-3">
        <PetAvatar name={card.patient.name} species={card.patient.species} photoUrl={card.patient.photo_url} size="sm" className="rounded-xl border border-slate-200" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <h4 className="font-bold text-slate-900 text-sm truncate">{card.patient.name}</h4>
            <MedicationAlertBadge
              scheduler={scheduler}
              onClick={() => onOpenMedAlert?.(card)}
            />
            {card.status === 'ready_for_discharge' && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDischarge(card) }}
                onPointerDown={(e) => e.stopPropagation()}
                draggable={false}
                data-mentor-step="hosp-discharge-btn"
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors text-xs font-semibold"
                title="Dar Alta"
              >
                <LogOut className="h-3 w-3" />
                Dar Alta
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-500 font-medium truncate uppercase">
            {card.patient.breed || 'SRD'}
          </p>
          <div className="flex flex-wrap gap-x-2 mt-0.5">
            {card.patient.gender && card.patient.gender !== 'unknown' && (
              <span className="text-[10px] text-slate-400">{card.patient.gender === 'male' ? 'Macho' : 'Fêmea'}</span>
            )}
            {card.patient.neutered && (
              <span className="text-[10px] text-slate-400">Castrado(a)</span>
            )}
            {card.patient.coat_color && (
              <span className="text-[10px] text-slate-400">{card.patient.coat_color}</span>
            )}
            {card.patient.birth_date && (() => {
              const m = Math.floor((Date.now() - new Date(card.patient.birth_date).getTime()) / (1000*60*60*24*30.5))
              const label = m < 1 ? '< 1 mês' : m < 12 ? `${m}m` : `${Math.floor(m/12)}a`
              return <span className="text-[10px] text-slate-400">{label}</span>
            })()}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        <BehaviorTagsBadges tags={card.patient.behavior_tags} />
      </div>

      <div className="mt-3 pt-3 border-t border-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-1 text-slate-400">
          <Clock className="h-3 w-3" />
          <span className="text-[10px] font-bold">
            {hours === 0 ? 'Recém chegado' : `${hours}h internado`}
          </span>
        </div>
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-50 group-hover:bg-violet-50 transition-colors">
          <Sparkles className="h-3 w-3 text-slate-300 group-hover:text-violet-400" />
        </div>
      </div>
    </div>
  )
}

// ─── Helper: Geração de PDF de Alta via Print ────────────────────────────────

function printDischargePdf(s: DischargeSummary) {
  const statusLabels: Record<string, string> = {
    observation: 'Observação', ward: 'Enfermaria', icu: 'UTA',
    ready_for_discharge: 'Aguardando Alta', discharged: 'Alta',
  }
  const levelColor: Record<string, string> = {
    piorou: '#ef4444', estavel: '#f59e0b', melhorou: '#10b981',
  }
  const fmt  = (iso: string) => new Date(iso).toLocaleString('pt-BR')
  const fmtd = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')
  const dischargedLabel = s.discharged_at ? fmt(s.discharged_at) : fmt(new Date().toISOString())

  const medsHtml = (meds: DischargeSummary['records'][0]['medications']) =>
    meds.length === 0 ? '' : `<div style="margin-top:6px">${meds.map(m =>
      `<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:4px;padding:4px 8px;margin:3px 0;font-size:10px">
        <strong style="color:#5b21b6">${m.name}</strong> — ${m.dose} via ${m.route}${m.notes ? ` (${m.notes})` : ''}
      </div>`).join('')}</div>`

  const recordsHtml = s.records.length === 0
    ? '<p style="color:#94a3b8;font-size:10px">Nenhuma evolução registada.</p>'
    : s.records.map(r => `
      <div style="border-left:3px solid ${levelColor[r.improvement_level] ?? '#94a3b8'};padding-left:10px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:10px;font-weight:bold">${r.user_name}</span>
          <span style="font-size:10px;color:#64748b">${fmt(r.created_at)}</span>
          <span style="font-size:9px;font-weight:bold;background:${levelColor[r.improvement_level] ?? '#94a3b8'};color:#fff;padding:1px 6px;border-radius:10px">${r.improvement_level}</span>
        </div>
        ${r.notes ? `<p style="font-size:11px;margin:0 0 4px">${r.notes}</p>` : ''}
        ${medsHtml(r.medications)}
      </div>`).join('')

  const logsHtml = s.logs.length === 0 ? '' : `
    <h2 style="font-size:12px;color:#334155;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin:16px 0 8px">Movimentações</h2>
    ${s.logs.map(l => `
      <div style="display:flex;gap:8px;font-size:10px;color:#475569;margin-bottom:4px">
        <span>${fmt(l.created_at)}</span><span>${l.user_name}:</span>
        <span>${statusLabels[l.from_status] ?? l.from_status} → ${statusLabels[l.to_status] ?? l.to_status}</span>
      </div>`).join('')}`

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
    <title>Alta — ${s.patient.name}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:28px}
    h2{font-size:12px;color:#334155;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin:16px 0 8px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.f label{font-size:9px;font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:.05em}
    .f span{display:block;font-size:11px}</style></head>
  <body>
    <div style="display:flex;justify-content:space-between;border-bottom:2px solid #7c3aed;padding-bottom:10px;margin-bottom:14px">
      <div><div style="font-size:16px;font-weight:bold;color:#7c3aed">${s.clinic_name}</div>
        <div style="font-size:10px;color:#64748b">Relatório de Alta Hospitalar — Prontuário Veterinário</div></div>
      <div style="text-align:right"><div style="font-size:9px;color:#64748b">Emissão</div>
        <div style="font-weight:bold">${fmtd(new Date().toISOString())}</div></div>
    </div>
    <h2>Identificação do Animal</h2>
    <div class="grid">
      <div class="f"><label>Animal</label><span>${s.patient.name}</span></div>
      <div class="f"><label>Espécie / Raça</label><span>${s.patient.species}${s.patient.breed ? ` — ${s.patient.breed}` : ' (SRD)'}</span></div>
      <div class="f"><label>Tutor</label><span>${s.tutor.name}</span></div>
      <div class="f"><label>Contacto</label><span>${s.tutor.phone ?? '—'}</span></div>
    </div>
    <h2>Internação</h2>
    <div class="grid">
      <div class="f"><label>Motivo</label><span>${s.reason ?? '—'}</span></div>
      <div class="f"><label>Admissão</label><span>${fmt(s.admitted_at)}</span></div>
      <div class="f"><label>Alta</label><span>${dischargedLabel}</span></div>
      ${s.notes ? `<div class="f" style="grid-column:1/-1"><label>Obs. Gerais</label><span>${s.notes}</span></div>` : ''}
    </div>
    <h2>Evoluções Clínicas (${s.records.length})</h2>
    ${recordsHtml}
    ${logsHtml}
    <div style="margin-top:28px;border-top:1px solid #e2e8f0;padding-top:10px;text-align:center;color:#94a3b8;font-size:9px">
      Gerado em ${fmt(new Date().toISOString())} · SysVetMax — Sistema de Gestão Veterinária · CFMV
    </div>
  </body></html>`

  const w = window.open('', '_blank')
  if (!w) { alert('Permita pop-ups para gerar o PDF.'); return }
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 250)
}

// ─── Componente Interno: DischargeModal ───────────────────────────────────────

interface DischargeModalProps {
  card:           HospitalizationCard
  isProcessing:   boolean
  onConfirm:      () => void
  onSendToReview: () => void
  onCancel:       () => void
}

function DischargeModal({ card, isProcessing, onConfirm, onSendToReview, onCancel }: DischargeModalProps) {
  const [isPdfLoading, setIsPdfLoading] = useState(false)

  const handleGeneratePdf = async () => {
    setIsPdfLoading(true)
    const summary = await generateDischargeSummary(card.id)
    setIsPdfLoading(false)
    if ('error' in summary) { alert('Erro ao gerar relatório: ' + summary.error); return }
    printDischargePdf(summary)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <LogOut className="h-5 w-5 text-emerald-600" />
              Alta de {card.patient.name}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">Como deseja proceder com a internação?</p>
          </div>
          <button
            onClick={onCancel}
            disabled={isProcessing}
            className="text-slate-400 hover:text-slate-600 p-1 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Info do Pet */}
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
          <PetAvatar name={card.patient.name} species={card.patient.species} photoUrl={card.patient.photo_url} size="sm" className="rounded-xl" />
          <div>
            <p className="font-semibold text-slate-900 text-sm">{card.patient.name}</p>
            <p className="text-xs text-slate-500">{card.patient.breed ?? 'SRD'}{card.reason ? ` • ${card.reason}` : ''}</p>
          </div>
        </div>

        {/* Opções */}
        <div className="space-y-3">
          {/* [A] Alta Definitiva */}
          <button
            onClick={onConfirm}
            disabled={isProcessing}
            data-mentor-step="hosp-confirm-discharge-btn"
            className="w-full p-4 text-left rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                A
              </div>
              <div className="flex-1">
                <p className="font-semibold text-emerald-900 text-sm">Confirmar Alta Definitiva</p>
                <p className="text-xs text-emerald-700 mt-0.5">Encerra a internação e fecha a consulta vinculada.</p>
              </div>
              {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-emerald-600 flex-shrink-0" />}
            </div>
          </button>

          {/* [B] Revisão Clínica */}
          <button
            onClick={onSendToReview}
            disabled={isProcessing}
            className="w-full p-4 text-left rounded-xl border-2 border-violet-200 bg-violet-50 hover:bg-violet-100 hover:border-violet-400 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-violet-500 text-white flex items-center justify-center flex-shrink-0">
                <Stethoscope className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-violet-900 text-sm">Enviar para Revisão Clínica</p>
                <p className="text-xs text-violet-700 mt-0.5">Devolve o animal para a fila do MV com status <span className="font-mono">revisao_pos_internacao</span>.</p>
              </div>
            </div>
          </button>
        </div>

        {/* [C] Relatório de Alta PDF */}
        <button
          onClick={handleGeneratePdf}
          disabled={isProcessing || isPdfLoading}
          className="w-full p-3 text-left rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
              {isPdfLoading ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : <FileText className="h-4 w-4 text-slate-500" />}
            </div>
            <div>
              <p className="font-semibold text-slate-700 text-sm">Gerar Relatório de Alta (PDF)</p>
              <p className="text-xs text-slate-400 mt-0.5">Abre janela de impressão com o prontuário completo.</p>
            </div>
          </div>
        </button>

        {/* Cancelar */}
        <button
          onClick={onCancel}
          disabled={isProcessing}
          className="w-full py-2 text-sm font-medium text-slate-400 hover:text-slate-600 disabled:opacity-40 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─── Componente Interno: AdmitModal ───────────────────────────────────────────

function AdmitModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (msg: string) => void }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<TriagePatientSearchResult[]>([])
  const [selected, setSelected] = useState<TriagePatientSearchResult | null>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSearch(q: string) {
    setSearch(q)
    setSelected(null)
    if (q.trim().length < 2) { setResults([]); return }
    const r = await searchPatientsForTriage(q)
    setResults(Array.isArray(r) ? r : [])
  }

  async function handleConfirm() {
    if (!selected || !reason.trim()) return
    setLoading(true)
    setError('')
    const result = await createHospitalization({
      patient_id: selected.id,
      status: 'observation',
      reason: reason.trim(),
    })
    setLoading(false)
    if ('error' in result) { setError(result.error); return }
    onSuccess('Paciente admitido! Internação registrada com sucesso.')
    onClose()
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <BedDouble className="h-5 w-5 text-violet-600" />
              Nova Internação
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <div className="space-y-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar por tutor ou pet..."
              value={selected ? selected.tutor.name + ' — ' + selected.name : search}
              onChange={e => handleSearch(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            {results.length > 0 && !selected && (
              <div className="absolute z-10 top-full left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                {results.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { setSelected(r); setResults([]) }}
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm"
                  >
                    <span className="font-semibold">{r.name}</span>
                    <span className="text-slate-500 ml-2">Tutor: {r.tutor.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            type="text"
            placeholder="Motivo de internação"
            value={reason}
            onChange={e => setReason(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!selected || !reason.trim() || loading}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirmar Admissão
          </button>
        </div>
      </div>
    </div>
  )
}
