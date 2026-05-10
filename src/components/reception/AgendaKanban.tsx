'use client'

import { useState, useEffect } from 'react'
import { Clock, CheckCircle2, Stethoscope, Users, Calendar, AlertCircle } from 'lucide-react'
import { PetAvatar } from '@/components/ui/PetAvatar'
import { moveAgendaCard, type AgendaColumn, type AgendaCard } from '@/lib/actions/agenda'
import type { ConsultationStatus } from '@/types'

// ─── Column Config ───────────────────────────────────────────────────────────

const COLUMN_STYLES: Record<string, { bg: string; border: string; badge: string; headerColor: string; icon: typeof Calendar }> = {
  scheduled:   { bg: 'bg-indigo-50',  border: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-700', headerColor: 'bg-indigo-500',  icon: Calendar },
  reception:   { bg: 'bg-amber-50',   border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700',  headerColor: 'bg-amber-500',   icon: Clock },
  triage:      { bg: 'bg-blue-50',    border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',    headerColor: 'bg-blue-500',    icon: Users },
  in_progress: { bg: 'bg-green-50',   border: 'border-green-200',  badge: 'bg-green-100 text-green-700',  headerColor: 'bg-green-500',   icon: Stethoscope },
  completed:   { bg: 'bg-slate-50',   border: 'border-slate-200',  badge: 'bg-slate-100 text-slate-600',  headerColor: 'bg-slate-500',   icon: CheckCircle2 },
}

const VISIT_REASON_LABELS: Record<string, string> = {
  consultation: 'Consulta',
  follow_up:    'Retorno',
  emergency:    'Emergência',
  vaccination:  'Vacinação',
  exam:         'Exame',
  surgery:      'Cirurgia',
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  initialColumns: AgendaColumn[]
  clinicId: string
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AgendaKanban({ initialColumns, clinicId }: Props) {
  const [columns, setColumns] = useState<AgendaColumn[]>(initialColumns)
  const [dragOverCol, setDragOverCol] = useState<ConsultationStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checkingInId, setCheckingInId] = useState<string | null>(null)
  const [successId, setSuccessId] = useState<string | null>(null)

  useEffect(() => { setColumns(initialColumns) }, [initialColumns])

  // ─── Drag & Drop ─────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, card: AgendaCard) {
    e.dataTransfer.setData('cardId', card.id)
    e.dataTransfer.setData('currentStatus', card.status)
  }

  function handleDragOver(e: React.DragEvent, status: ConsultationStatus) {
    e.preventDefault()
    setDragOverCol(status)
  }

  function handleDragLeave() {
    setDragOverCol(null)
  }

  async function handleDoubleClickCheckIn(card: AgendaCard) {
    if (navigator.maxTouchPoints > 0) return  // não disparar em touch
    if (card.status !== 'scheduled') return
    if (checkingInId) return

    setCheckingInId(card.id)
    const result = await moveAgendaCard(card.id, 'reception')
    if ('error' in result) {
      setError(result.error)
      setTimeout(() => setError(null), 3000)
    } else {
      setColumns(prev => prev.map(col => ({
        ...col,
        cards: col.key === 'scheduled'
          ? col.cards.filter(c => c.id !== card.id)
          : col.key === 'reception'
            ? [...col.cards, { ...card, status: 'reception' as ConsultationStatus }]
            : col.cards,
      })))
      setSuccessId(card.id)
      setTimeout(() => setSuccessId(null), 1500)
    }
    setCheckingInId(null)
  }

  async function handleDrop(e: React.DragEvent, targetStatus: ConsultationStatus) {
    e.preventDefault()
    setDragOverCol(null)

    const cardId = e.dataTransfer.getData('cardId')
    const currentStatus = e.dataTransfer.getData('currentStatus') as ConsultationStatus

    if (currentStatus === targetStatus) return

    // Optimistic update
    setColumns(prev => {
      const card = prev.flatMap(c => c.cards).find(c => c.id === cardId)
      if (!card) return prev
      return prev.map(col => ({
        ...col,
        cards: col.key === currentStatus
          ? col.cards.filter(c => c.id !== cardId)
          : col.key === targetStatus
            ? [...col.cards, { ...card, status: targetStatus }]
            : col.cards,
      }))
    })

    const result = await moveAgendaCard(cardId, targetStatus)
    if ('error' in result) {
      setError(result.error)
      // Revert
      setColumns(initialColumns)
      setTimeout(() => setError(null), 3000)
    }
  }

  function formatTime(dateStr: string) {
    try {
      const d = new Date(dateStr)
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return '—'
    }
  }

  return (
    <div data-mentor-step="kanban-board" className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2 text-sm text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map(col => {
          const style = COLUMN_STYLES[col.key] ?? COLUMN_STYLES.completed
          const Icon = style.icon

          return (
            <div
              key={col.key}
              {...(col.key === 'completed' ? { 'data-mentor-step': 'kanban-col-completed' } : {})}
              onDragOver={e => handleDragOver(e, col.key)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, col.key)}
              className={`flex-shrink-0 w-56 rounded-xl border ${style.border} ${
                dragOverCol === col.key ? 'ring-2 ring-teal-400' : ''
              } transition-all`}
            >
              {/* Column Header */}
              <div className={`${style.headerColor} rounded-t-xl px-3 py-2 flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-white" />
                  <span className="text-xs font-bold text-white">{col.label}</span>
                </div>
                <span className="text-[10px] font-bold text-white/80 bg-white/20 rounded-full px-1.5 py-0.5">
                  {col.cards.length}
                </span>
              </div>

              {/* Cards */}
              <div className={`${style.bg} rounded-b-xl p-2 space-y-2 min-h-[120px]`}>
                {col.cards.length === 0 ? (
                  <p className="text-[10px] text-slate-400 text-center py-6 italic">Nenhum atendimento</p>
                ) : (
                  col.cards.map(card => (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={e => handleDragStart(e, card)}
                      onDoubleClick={() => handleDoubleClickCheckIn(card)}
                      title={col.key === 'scheduled' ? 'Duplo clique para fazer check-in' : undefined}
                      className={`bg-white rounded-lg border p-2.5 shadow-sm hover:shadow transition-all ${
                        col.key === 'scheduled' ? 'cursor-pointer hover:border-amber-400 hover:bg-amber-50' : 'cursor-grab active:cursor-grabbing border-slate-200'
                      } ${checkingInId === card.id ? 'opacity-50 animate-pulse' : ''} ${successId === card.id ? 'border-emerald-400 bg-emerald-50' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <PetAvatar
                          name={card.patient.name}
                          species={card.patient.species}
                          photoUrl={card.patient.photo_url}
                          size="xs"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-900 truncate">{card.patient.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">{card.tutor.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${style.badge}`}>
                          {VISIT_REASON_LABELS[card.visit_reason] ?? card.visit_reason}
                        </span>
                        <span className="text-[10px] text-slate-400">{formatTime(card.created_at)}</span>
                      </div>
                      {col.key === 'scheduled' && (
                        <p className="text-[10px] text-indigo-400 mt-1 text-center font-medium">2× clique = check-in</p>
                      )}
                      {card.vet && (
                        <p className="text-[10px] text-teal-600 mt-1 truncate">
                          Dr(a). {card.vet.full_name}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
