'use client'

import { useState, useEffect } from 'react'
import { Scissors, Clock, CheckCircle2, Loader2, X, Calendar, DollarSign, CheckCheck, Trash2, Ban } from 'lucide-react'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { BehaviorTagsBadges } from '@/components/ui/BehaviorTagsBadges'
import { PetAvatar } from '@/components/ui/PetAvatar'
import {
  updateGroomingStatus,
  confirmGroomingArrival,
  cancelGroomingSession,
  updateGroomingPaymentStatus,
  archiveGroomingSession,
  type GroomingBoard,
  type GroomingCard,
  type GroomingStatus,
} from '@/lib/actions/grooming'
import GroomingDetailModal from './GroomingDetailModal'
import WhatsAppNotificationModal from '@/components/whatsapp/WhatsAppNotificationModal'
import type { WhatsAppTrigger } from '@/lib/actions/whatsapp'

// ─── Colunas do Kanban ────────────────────────────────────────────────────────

const COLUMNS: {
  status:      keyof GroomingBoard
  label:       string
  emoji:       string
  bg:          string
  border:      string
  badge:       string
  headerColor: string
}[] = [
  { status: 'scheduled',      label: 'Agendados',          emoji: '📅', bg: 'bg-indigo-50',   border: 'border-indigo-200',  badge: 'bg-indigo-100 text-indigo-700',  headerColor: 'bg-indigo-500'  },
  { status: 'received',       label: 'Recebido',           emoji: '📋', bg: 'bg-slate-50',    border: 'border-slate-200',   badge: 'bg-slate-100 text-slate-700',    headerColor: 'bg-slate-500'   },
  { status: 'grooming',       label: 'Em Tosa',            emoji: '✂️', bg: 'bg-violet-50',   border: 'border-violet-200',  badge: 'bg-violet-100 text-violet-700',  headerColor: 'bg-violet-500'  },
  { status: 'bathing',        label: 'Em Banho',           emoji: '🛁', bg: 'bg-blue-50',     border: 'border-blue-200',    badge: 'bg-blue-100 text-blue-700',      headerColor: 'bg-blue-500'    },
  { status: 'waiting_pickup', label: 'Aguardando Retirada',emoji: '⏳', bg: 'bg-amber-50',    border: 'border-amber-200',   badge: 'bg-amber-100 text-amber-700',    headerColor: 'bg-amber-500'   },
  { status: 'delivered',      label: 'Entregue',           emoji: '✅', bg: 'bg-emerald-50',  border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700',headerColor: 'bg-emerald-500' },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialBoard: GroomingBoard
  clinicId:     string
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function GroomingKanban({ initialBoard, clinicId }: Props) {
  const [board, setBoard]               = useState<GroomingBoard>(initialBoard)
  const [dragOverCol, setDragOverCol]   = useState<GroomingStatus | null>(null)
  const [selectedCard, setSelectedCard] = useState<GroomingCard | null>(null)
  const [pendingDeliver, setPendingDeliver] = useState<GroomingCard | null>(null)
  const [isDelivering, setIsDelivering] = useState(false)
  const [confirmingArrival, setConfirmingArrival] = useState<string | null>(null)
  const [deliverySuccess, setDeliverySuccess] = useState(false)
  const [cancellingId, setCancellingId]       = useState<string | null>(null)
  const [cancelTarget, setCancelTarget]       = useState<GroomingCard | null>(null)
  const [archiveTarget, setArchiveTarget]     = useState<GroomingCard | null>(null)
  const [waiveTarget, setWaiveTarget]         = useState<GroomingCard | null>(null)
  const [isActionLoading, setIsActionLoading] = useState(false)

  // WhatsApp suggestion após mudança de coluna
  const [waSuggestion, setWaSuggestion] = useState<{
    card:    GroomingCard
    trigger: WhatsAppTrigger
  } | null>(null)

  useRealtimeSync({ table: 'grooming_sessions', clinicId })

  // Sincroniza o state local quando router.refresh() (Realtime) atualiza initialBoard
  useEffect(() => { setBoard(initialBoard) }, [initialBoard])

  // ─── Drag & Drop ───────────────────────────────────────────────────────────

  const handleDragStart = (e: React.DragEvent, card: GroomingCard) => {
    e.dataTransfer.setData('cardId', card.id)
    e.dataTransfer.setData('currentStatus', card.status)
  }

  const handleDragOver = (e: React.DragEvent, status: GroomingStatus) => {
    e.preventDefault()
    setDragOverCol(status)
  }

  const handleDrop = async (e: React.DragEvent, newStatus: GroomingStatus) => {
    e.preventDefault()
    setDragOverCol(null)

    const cardId    = e.dataTransfer.getData('cardId')
    const oldStatus = e.dataTransfer.getData('currentStatus') as GroomingStatus
    if (oldStatus === newStatus) return

    // Cards da coluna "scheduled" têm oldStatus 'received' internamente
    const fromBucket = (oldStatus === 'received' && board.scheduled.find(c => c.id === cardId))
      ? 'scheduled'
      : oldStatus as keyof GroomingBoard

    const card = board[fromBucket]?.find(c => c.id === cardId)
    if (!card) return

    // "Entregue" pede confirmação
    if (newStatus === 'delivered') {
      setPendingDeliver(card)
      return
    }

    await moveCard(card, fromBucket as GroomingStatus, newStatus)
  }

  const moveCard = async (card: GroomingCard, from: GroomingStatus, to: GroomingStatus) => {
    const snapshot = board
    setBoard(prev => {
      const next = { ...prev }
      next[from] = prev[from].filter(c => c.id !== card.id)
      next[to]   = [...prev[to], { ...card, status: to }]
      return next
    })

    const result = await updateGroomingStatus(card.id, to)
    if ('error' in result) {
      setBoard(snapshot)
      alert(result.error)
      return
    }

    // Sugerir WhatsApp ao mover para "Aguardando Retirada" ou "Entregue"
    if (card.tutor?.phone) {
      if (to === 'waiting_pickup') {
        setWaSuggestion({ card: { ...card, status: to }, trigger: 'grooming_ready_for_pickup' })
      } else if (to === 'delivered') {
        setWaSuggestion({ card: { ...card, status: to }, trigger: 'grooming_delivered' })
      }
    }
  }

  const confirmDeliver = async () => {
    if (!pendingDeliver || isDelivering) return
    setIsDelivering(true)
    const card = pendingDeliver

    // Move para "Entregue" — o pagamento é coletado no Caixa Central
    const from = board.scheduled.find(c => c.id === card.id) ? 'scheduled' as GroomingStatus : card.status
    await moveCard(card, from, 'delivered')

    setIsDelivering(false)
    setPendingDeliver(null)
    setDeliverySuccess(true)
    setTimeout(() => setDeliverySuccess(false), 4000)
  }

  const confirmArchiveCard = async () => {
    if (!archiveTarget || isActionLoading) return
    setIsActionLoading(true)
    const result = await archiveGroomingSession(archiveTarget.id)
    setIsActionLoading(false)
    if ('error' in result) {
      alert(result.error)
    } else {
      setBoard(prev => ({
        ...prev,
        delivered: prev.delivered.filter(c => c.id !== archiveTarget.id),
      }))
    }
    setArchiveTarget(null)
  }

  const confirmWaiveCard = async () => {
    if (!waiveTarget || isActionLoading) return
    setIsActionLoading(true)
    const result = await updateGroomingPaymentStatus(waiveTarget.id, 'waived')
    setIsActionLoading(false)
    if ('error' in result) {
      alert(result.error)
    } else {
      setBoard(prev => ({
        ...prev,
        delivered: prev.delivered.filter(c => c.id !== waiveTarget.id),
      }))
    }
    setWaiveTarget(null)
  }

  const handleConfirmArrival = async (card: GroomingCard) => {
    setConfirmingArrival(card.id)
    const result = await confirmGroomingArrival(card.id)
    if ('error' in result) alert(result.error)
    else {
      // Move da coluna scheduled → received
      setBoard(prev => ({
        ...prev,
        scheduled: prev.scheduled.filter(c => c.id !== card.id),
        received:  [...prev.received, { ...card, scheduled_at: null }],
      }))
    }
    setConfirmingArrival(null)
  }

  const handleCancelSession = (card: GroomingCard) => {
    setCancelTarget(card)
  }

  const confirmCancelSession = async () => {
    if (!cancelTarget) return
    const card = cancelTarget
    setCancellingId(card.id)
    setCancelTarget(null)
    const result = await cancelGroomingSession(card.id)
    if ('error' in result) {
      alert(result.error)
    } else {
      setBoard(prev => ({
        ...prev,
        scheduled: prev.scheduled.filter(c => c.id !== card.id),
      }))
    }
    setCancellingId(null)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Scissors className="h-6 w-6 text-teal-600" />
          Banho e Tosa
        </h1>
        <p className="text-sm text-slate-500">
          Acompanhe o fluxo dos pets em tempo real. Arraste para mover, clique no card para registrar evolução.
        </p>
      </div>

      <div className="overflow-x-auto -mx-2 px-2 md:mx-0 md:px-0 pb-1">
      <div data-mentor-step="grooming-queue" className="flex gap-3 min-w-[1080px] md:min-w-0 md:grid md:grid-cols-3 lg:grid-cols-6 min-h-[500px] pb-2 md:pb-0 snap-x snap-mandatory md:snap-none">
        {COLUMNS.map(col => {
          const cards      = board[col.status]
          const isDragOver = dragOverCol === col.status
          const isScheduled = col.status === 'scheduled'

          return (
            <div
              key={col.status}
              onDragOver={e => handleDragOver(e, col.status as GroomingStatus)}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={e => handleDrop(e, col.status as GroomingStatus)}
              className={`w-44 md:w-auto flex-none md:flex-auto snap-start flex flex-col rounded-2xl border-2 transition-all ${col.bg} ${
                isDragOver ? `${col.border} ring-2 ring-teal-400 ring-offset-2 scale-[1.01]` : 'border-transparent'
              }`}
            >
              {/* Header */}
              <div className={`p-3 rounded-t-[14px] flex items-center justify-between ${col.headerColor} text-white shadow-sm`}>
                <div className="flex items-center gap-1.5">
                  <span className="text-base">{col.emoji}</span>
                  <h3 className="font-bold text-[11px] tracking-wide uppercase leading-tight">{col.label}</h3>
                </div>
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold">
                  {cards.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 p-2 space-y-2">
                {cards.length === 0 ? (
                  <div className={`flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed ${col.border} text-center`}>
                    <span className="text-xl mb-1 opacity-30">{col.emoji}</span>
                    <p className="text-xs text-slate-400">Vazio</p>
                  </div>
                ) : (
                  cards.map(card => (
                    <GroomingKanbanCard
                      key={card.id}
                      card={card}
                      isScheduled={isScheduled}
                      isConfirmingArrival={confirmingArrival === card.id || cancellingId === card.id}
                      onDragStart={handleDragStart}
                      onOpen={() => setSelectedCard(card)}
                      onDeliver={() => setPendingDeliver(card)}
                      onConfirmArrival={() => handleConfirmArrival(card)}
                      onCancel={() => handleCancelSession(card)}
                      onArchive={() => setArchiveTarget(card)}
                      onWaive={() => setWaiveTarget(card)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>{/* fim grid/inner */}
      </div>{/* fim scroll container */}

      {/* Legenda */}
      <p className="text-xs text-slate-400 text-center">
        💡 No celular, deslize ← → para ver todas as etapas · Clique no card para registrar evolução
      </p>

      {/* Modal de Detalhe */}
      {selectedCard && (
        <GroomingDetailModal
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onSaved={() => {}}
          onStatusChange={(newStatus) => {
            // Atualização otimista: move o card localmente sem esperar Realtime
            setBoard(prev => {
              const from = selectedCard.status as GroomingStatus
              const next = { ...prev }
              next[from]      = prev[from].filter(c => c.id !== selectedCard.id)
              next[newStatus] = [...prev[newStatus], { ...selectedCard, status: newStatus }]
              return next
            })
          }}
        />
      )}

      {/* WhatsApp Suggestion Modal (pós drag & drop) */}
      {waSuggestion && waSuggestion.card.tutor?.phone && (
        <WhatsAppNotificationModal
          isOpen={!!waSuggestion}
          onClose={() => setWaSuggestion(null)}
          trigger={waSuggestion.trigger}
          context={{
            petName:          waSuggestion.card.patient.name,
            tutorName:        waSuggestion.card.tutor.name,
            tutorPhone:       waSuggestion.card.tutor.phone,
            species:          waSuggestion.card.patient.species,
            breed:            waSuggestion.card.patient.breed ?? undefined,
            groomingServices: waSuggestion.card.services_requested,
            groomingBox:      waSuggestion.card.box_number ?? undefined,
          }}
          patientId={waSuggestion.card.patient.id}
        />
      )}

      {/* Modal de Confirmação de Cancelamento */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <X className="h-5 w-5 text-red-500" />
                  Cancelar Agendamento
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Esta ação não pode ser desfeita.
                </p>
              </div>
              <button
                onClick={() => setCancelTarget(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
              <PetAvatar name={cancelTarget.patient.name} species={cancelTarget.patient.species} photoUrl={cancelTarget.patient.photo_url} size="sm" className="rounded-xl" />
              <div>
                <p className="font-semibold text-slate-900 text-sm">{cancelTarget.patient.name}</p>
                <p className="text-xs text-slate-500">
                  {cancelTarget.patient.breed ?? 'SRD'} · Tutor: {cancelTarget.tutor.name}
                </p>
                {cancelTarget.scheduled_at && (
                  <p className="text-xs text-red-500 font-medium mt-0.5">
                    {new Date(cancelTarget.scheduled_at).toLocaleString('pt-BR', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                )}
              </div>
            </div>

            <p className="text-sm text-slate-600">
              Tem certeza que deseja cancelar o agendamento de{' '}
              <span className="font-semibold">Banho e Tosa</span> de{' '}
              <span className="font-semibold text-slate-900">{cancelTarget.patient.name}</span>?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setCancelTarget(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Manter Agendamento
              </button>
              <button
                onClick={confirmCancelSession}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
              >
                <X className="h-4 w-4" />
                Cancelar Agendamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast de sucesso na entrega */}
      {deliverySuccess && (
        <div role="status" className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Pet entregue! Realize o pagamento no Caixa Central.
        </div>
      )}

      {/* Modal de Confirmação de Cortesia */}
      {waiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Ban className="h-5 w-5 text-amber-500" />
                  Marcar como Cortesia
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Nenhum valor será cobrado.
                </p>
              </div>
              <button onClick={() => setWaiveTarget(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Confirma que o serviço de <strong>{waiveTarget.patient.name}</strong> será registrado como <strong>cortesia</strong>, sem cobrança?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setWaiveTarget(null)}
                disabled={isActionLoading}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={confirmWaiveCard}
                disabled={isActionLoading}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                Confirmar Cortesia
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Remoção da Fila */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-red-500" />
                  Remover da Fila
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  O registro do serviço é mantido.
                </p>
              </div>
              <button onClick={() => setArchiveTarget(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Remover <strong>{archiveTarget.patient.name}</strong> da fila <em>Entregue</em>? O histórico do atendimento é preservado.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setArchiveTarget(null)}
                disabled={isActionLoading}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Manter na Fila
              </button>
              <button
                onClick={confirmArchiveCard}
                disabled={isActionLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Entrega */}
      {pendingDeliver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  Confirmar Entrega
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {pendingDeliver.patient.name} foi entregue ao tutor?
                </p>
              </div>
              <button
                onClick={() => !isDelivering && setPendingDeliver(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <PetAvatar name={pendingDeliver.patient.name} species={pendingDeliver.patient.species} photoUrl={pendingDeliver.patient.photo_url} size="sm" className="rounded-xl" />
              <div>
                <p className="font-semibold text-slate-900 text-sm">{pendingDeliver.patient.name}</p>
                <p className="text-xs text-slate-500">{pendingDeliver.patient.breed ?? 'SRD'} · Tutor: {pendingDeliver.tutor.name}</p>
              </div>
            </div>

            {pendingDeliver.price_total && pendingDeliver.price_total > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700 font-medium">
                <DollarSign className="h-3.5 w-3.5 flex-shrink-0" />
                O pagamento de <strong className="mx-1">R$ {pendingDeliver.price_total.toFixed(2)}</strong> deve ser realizado no Caixa Central.
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setPendingDeliver(null)}
                disabled={isDelivering}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeliver}
                disabled={isDelivering}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDelivering
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Entregando...</>
                  : <><CheckCircle2 className="h-4 w-4" /> Confirmar Entrega</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Card do Kanban ───────────────────────────────────────────────────────────

interface CardProps {
  card:                  GroomingCard
  isScheduled:           boolean
  isConfirmingArrival:   boolean
  onDragStart:           (e: React.DragEvent, card: GroomingCard) => void
  onOpen:                () => void
  onDeliver:             () => void
  onConfirmArrival:      () => void
  onCancel:              () => void
  onArchive:             () => void
  onWaive:               () => void
}

function GroomingKanbanCard({ card, isScheduled, isConfirmingArrival, onDragStart, onOpen, onDeliver, onConfirmArrival, onCancel, onArchive, onWaive }: CardProps) {
  const minutes = Math.floor((Date.now() - new Date(card.created_at).getTime()) / (1000 * 60))
  const duration = minutes < 60
    ? `${minutes}min`
    : `${Math.floor(minutes / 60)}h${minutes % 60 > 0 ? `${minutes % 60}min` : ''}`

  const scheduledDate = card.scheduled_at ? new Date(card.scheduled_at) : null
  const scheduledLabel = scheduledDate
    ? scheduledDate.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null

  const paymentBadge = card.payment_status === 'paid'
    ? { label: 'Pago', cls: 'bg-emerald-100 text-emerald-700' }
    : card.payment_status === 'waived'
      ? { label: 'Isento', cls: 'bg-slate-100 text-slate-500' }
      : card.price_total
        ? { label: `R$${card.price_total.toFixed(0)}`, cls: 'bg-amber-100 text-amber-700' }
        : null

  return (
    <div
      data-testid={`session-card-${card.id}`}
      draggable
      onDragStart={e => onDragStart(e, card)}
      onClick={onOpen}
      className="group relative p-3 rounded-xl border bg-white shadow-sm hover:shadow-md hover:border-teal-300 transition-all cursor-pointer active:scale-95"
    >
      <div className="flex items-start gap-2">
        <PetAvatar name={card.patient.name} species={card.patient.species} photoUrl={card.patient.photo_url} size="xs" className="rounded-lg border border-slate-200" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <h4 className="font-bold text-slate-900 text-xs truncate">{card.patient.name}</h4>
            {card.status === 'waiting_pickup' && (
              <button
                onClick={e => { e.stopPropagation(); onDeliver() }}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors flex-shrink-0 text-[10px] font-semibold"
                title="Confirmar Entrega ao Tutor"
              >
                <CheckCircle2 className="h-3 w-3" />
                Entregar
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-500 truncate">{card.patient.breed || 'SRD'}</p>
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

      {/* Data de agendamento */}
      {isScheduled && scheduledLabel && (
        <div className="mt-2 flex items-center gap-1 text-indigo-600">
          <Calendar className="h-3 w-3 flex-shrink-0" />
          <span className="text-[10px] font-bold">{scheduledLabel}</span>
        </div>
      )}

      {card.services_requested.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.services_requested.slice(0, 2).map(svc => (
            <span key={svc} className="bg-teal-50 border border-teal-200 text-teal-700 rounded-full px-1.5 py-0.5 text-[9px] font-semibold">
              {svc}
            </span>
          ))}
          {card.services_requested.length > 2 && (
            <span className="bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5 text-[9px]">
              +{card.services_requested.length - 2}
            </span>
          )}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        <BehaviorTagsBadges tags={card.patient.behavior_tags} size="xs" />
      </div>

      <div className="mt-2 pt-2 border-t border-slate-50 flex items-center gap-1 text-slate-400">
        {!isScheduled && (
          <>
            <Clock className="h-3 w-3" />
            <span className="text-[10px] font-bold">{duration}</span>
          </>
        )}
        {paymentBadge && (
          <span className={`ml-auto flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${paymentBadge.cls}`}>
            <DollarSign className="h-2.5 w-2.5" />
            {paymentBadge.label}
          </span>
        )}
        {!paymentBadge && card.box_number && (
          <span className="ml-auto text-[10px] text-slate-400">{card.box_number}</span>
        )}
      </div>

      {/* Ações da coluna Agendados */}
      {isScheduled && (
        <div className="mt-2 flex gap-1.5">
          <button
            onClick={e => { e.stopPropagation(); onConfirmArrival() }}
            disabled={isConfirmingArrival}
            className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {isConfirmingArrival
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <><CheckCheck className="h-3 w-3" /> Confirmar Chegada</>}
          </button>
          <button
            onClick={e => { e.stopPropagation(); onCancel() }}
            disabled={isConfirmingArrival}
            className="py-1.5 px-2.5 rounded-lg border border-slate-200 text-slate-400 text-[10px] font-bold hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50 flex items-center justify-center"
            title="Cancelar agendamento"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Ações da coluna Entregue */}
      {card.status === 'delivered' && (
        <div className="mt-2 flex gap-1.5">
          <button
            onClick={e => { e.stopPropagation(); onWaive() }}
            className="flex-1 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 text-[10px] font-bold hover:bg-amber-50 hover:border-amber-200 hover:text-amber-600 transition-colors flex items-center justify-center gap-1"
            title="Marcar como Cortesia"
          >
            <Ban className="h-3 w-3" /> Cortesia
          </button>
          <button
            onClick={e => { e.stopPropagation(); onArchive() }}
            className="py-1.5 px-2.5 rounded-lg border border-slate-200 text-slate-400 text-[10px] font-bold hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors flex items-center justify-center"
            title="Remover da fila"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}
