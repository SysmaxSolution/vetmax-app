'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  RefreshCw, Clock, AlertTriangle, Heart, Zap,
  Dog, Cat, Bird, Rabbit, Fish, User, Stethoscope,
  DollarSign, ClipboardList, Activity, ChevronRight,
} from 'lucide-react'
import type { KanbanItem, KanbanColumn } from '@/lib/actions/kanban'

// ─── Types ────────────────────────────────────────────────────────────────────

type BehaviorTag = 'aggressive' | 'allergic' | 'cardiac' | 'stress'

interface KanbanCard {
  consultationId: string
  column: KanbanColumn
  petName: string
  species: string
  breed: string | null
  photo_url: string | null
  tutorName: string
  visitReason: string
  waitingMinutes: number
  vetName: string | null
  tags: BehaviorTag[]
  paymentStatus: 'pending' | 'paid' | 'courtesy' | null
  invoiceTotal: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toWaitingMinutes(createdAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000))
}

function toKnownTags(raw: string[]): BehaviorTag[] {
  const VALID: BehaviorTag[] = ['aggressive', 'allergic', 'cardiac', 'stress']
  return raw.filter((t): t is BehaviorTag => VALID.includes(t as BehaviorTag))
}

function mapItem(item: KanbanItem): KanbanCard {
  return {
    consultationId: item.consultationId,
    column:         item.column,
    petName:        item.petName,
    species:        item.species,
    breed:          item.breed,
    photo_url:      item.photo_url,
    tutorName:      item.tutorName,
    visitReason:    item.visitReason,
    waitingMinutes: toWaitingMinutes(item.createdAt),
    vetName:        item.vetName,
    tags:           toKnownTags(item.behaviorTags),
    paymentStatus:  item.paymentStatus,
    invoiceTotal:   item.invoiceTotal,
  }
}

// ─── Column Config ────────────────────────────────────────────────────────────

const COLUMNS: {
  key: KanbanColumn
  label: string
  icon: React.ElementType
  headerBg: string
  headerText: string
  countBg: string
  borderTop: string
  borderLeft: string
  colBg: string
}[] = [
  {
    key: 'reception',
    label: 'Recepção',
    icon: ClipboardList,
    headerBg: 'bg-blue-50',
    headerText: 'text-blue-700',
    countBg: 'bg-blue-100 text-blue-700',
    borderTop: 'border-t-blue-500',
    borderLeft: 'border-l-blue-500',
    colBg: 'bg-blue-50/40',
  },
  {
    key: 'triage',
    label: 'Triagem',
    icon: Activity,
    headerBg: 'bg-amber-50',
    headerText: 'text-amber-700',
    countBg: 'bg-amber-100 text-amber-700',
    borderTop: 'border-t-amber-500',
    borderLeft: 'border-l-amber-500',
    colBg: 'bg-amber-50/40',
  },
  {
    key: 'consultation',
    label: 'Consultório',
    icon: Stethoscope,
    headerBg: 'bg-teal-50',
    headerText: 'text-teal-700',
    countBg: 'bg-teal-100 text-teal-700',
    borderTop: 'border-t-teal-500',
    borderLeft: 'border-l-teal-500',
    colBg: 'bg-teal-50/40',
  },
  {
    key: 'billing',
    label: 'Faturamento',
    icon: DollarSign,
    headerBg: 'bg-violet-50',
    headerText: 'text-violet-700',
    countBg: 'bg-violet-100 text-violet-700',
    borderTop: 'border-t-violet-500',
    borderLeft: 'border-l-violet-500',
    colBg: 'bg-violet-50/40',
  },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

const SPECIES_ICON: Record<string, React.ElementType> = {
  dog: Dog, cat: Cat, rabbit: Rabbit, bird: Bird, fish: Fish,
  rodent: Zap, reptile: Zap, exotic: Zap,
}

const TAG_CFG: Record<BehaviorTag, { label: string; className: string; icon: React.ElementType }> = {
  aggressive: { label: 'Agressivo',  className: 'bg-red-100 text-red-700',       icon: AlertTriangle },
  allergic:   { label: 'Alérgico',   className: 'bg-orange-100 text-orange-700', icon: AlertTriangle },
  cardiac:    { label: 'Cardiopata', className: 'bg-pink-100 text-pink-700',     icon: Heart },
  stress:     { label: 'Estressado', className: 'bg-yellow-100 text-yellow-700', icon: AlertTriangle },
}

function WaitingBadge({ minutes }: { minutes: number }) {
  const urgent  = minutes >= 60
  const warning = minutes >= 30
  const cls = urgent
    ? 'text-red-600 bg-red-50'
    : warning
    ? 'text-amber-600 bg-amber-50'
    : 'text-slate-500 bg-slate-100'

  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const label = h > 0 ? `${h}h ${m}min` : `${m}min`

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${cls}`}>
      <Clock className="w-3 h-3" />
      {label}
    </span>
  )
}

function PetCard({ card }: { card: KanbanCard }) {
  const SpeciesIcon = SPECIES_ICON[card.species] ?? Zap

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-3 space-y-2.5 cursor-default">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden">
            {card.photo_url
              ? <img src={card.photo_url} alt={card.petName} className="w-full h-full object-cover" />
              : <SpeciesIcon className="w-4 h-4 text-slate-500" />
            }
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm leading-tight truncate">
              {card.petName}
            </p>
            <p className="text-xs text-slate-400 truncate">{card.breed ?? '—'}</p>
          </div>
        </div>
        <WaitingBadge minutes={card.waitingMinutes} />
      </div>

      {/* Tutor */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <User className="w-3 h-3 flex-shrink-0" />
        <span className="truncate">{card.tutorName}</span>
      </div>

      {/* Motivo */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <ChevronRight className="w-3 h-3 flex-shrink-0 text-slate-300" />
        <span className="truncate">{card.visitReason}</span>
      </div>

      {/* MV responsável (apenas Consultório) */}
      {card.vetName && (
        <div className="flex items-center gap-1.5 text-xs text-teal-700 bg-teal-50 rounded-md px-2 py-1">
          <Stethoscope className="w-3 h-3 flex-shrink-0" />
          <span className="truncate font-medium">{card.vetName}</span>
        </div>
      )}

      {/* Badge de pagamento — apenas coluna Faturamento */}
      {card.column === 'billing' && card.paymentStatus && (
        <div className={`flex items-center justify-between rounded-md px-2 py-1 text-xs font-medium ${
          card.paymentStatus === 'paid'
            ? 'bg-emerald-50 text-emerald-700'
            : card.paymentStatus === 'courtesy'
            ? 'bg-blue-50 text-blue-700'
            : 'bg-amber-50 text-amber-700'
        }`}>
          <span>
            {card.paymentStatus === 'paid' ? 'Pago' : card.paymentStatus === 'courtesy' ? 'Cortesia' : 'Aguardando pagamento'}
          </span>
          {card.invoiceTotal !== null && (
            <span className="font-semibold">
              {card.invoiceTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          )}
        </div>
      )}

      {/* Tags comportamentais — só renderiza se existirem */}
      {card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {card.tags.map(tag => {
            const cfg = TAG_CFG[tag]
            const Icon = cfg.icon
            return (
              <span
                key={tag}
                className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.className}`}
              >
                <Icon className="w-3 h-3" />
                {cfg.label}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

function KanbanColumn({ col, cards }: { col: (typeof COLUMNS)[number]; cards: KanbanCard[] }) {
  const Icon = col.icon
  return (
    <div className="flex flex-col min-w-[260px] w-full">
      <div
        className={`flex items-center justify-between px-3 py-2.5 rounded-t-xl border border-b-0 border-slate-200 ${col.headerBg} border-t-4 ${col.borderTop}`}
      >
        <div className={`flex items-center gap-2 font-semibold text-sm ${col.headerText}`}>
          <Icon className="w-4 h-4" />
          {col.label}
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${col.countBg}`}>
          {cards.length}
        </span>
      </div>

      <div
        className={`flex-1 border border-t-0 border-slate-200 rounded-b-xl p-2 space-y-2 min-h-[420px] ${col.colBg}`}
      >
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400 text-xs gap-1">
            <Icon className="w-6 h-6 opacity-30" />
            <span>Nenhum pet</span>
          </div>
        ) : (
          cards.map(card => <PetCard key={card.consultationId} card={card} />)
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  initialCards: KanbanItem[]
}

export default function KanbanBoard({ initialCards }: Props) {
  const router = useRouter()
  const [spinning, setSpinning] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(() =>
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  )

  const cards = useMemo(() => initialCards.map(mapItem), [initialCards])
  const total = cards.length

  function handleRefresh() {
    setSpinning(true)
    router.refresh()
    setTimeout(() => {
      setLastRefresh(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
      setSpinning(false)
    }, 800)
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Radar Kanban</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Visão macro em tempo real —{' '}
            <span className="font-medium text-slate-700">{total} pet{total !== 1 ? 's' : ''}</span>{' '}
            na clínica hoje
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">Atualizado às {lastRefresh}</span>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-teal-700 bg-white border border-slate-200 hover:border-teal-300 rounded-lg px-3 py-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-4 gap-3">
        {COLUMNS.map(col => {
          const count = cards.filter(c => c.column === col.key).length
          const Icon = col.icon
          return (
            <div
              key={col.key}
              className={`flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3 border-l-4 ${col.borderLeft}`}
            >
              <div className={`p-2 rounded-lg ${col.headerBg}`}>
                <Icon className={`w-4 h-4 ${col.headerText}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-800 leading-none">{count}</p>
                <p className="text-xs text-slate-500 mt-0.5">{col.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Board */}
      <div data-mentor-step="kanban-board" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMNS.map(col => (
          <div key={col.key} data-mentor-step={`kanban-col-${col.key}`}>
            <KanbanColumn
              col={col}
              cards={cards.filter(c => c.column === col.key)}
            />
          </div>
        ))}
      </div>

      {total === 0 && (
        <p className="text-center text-sm text-slate-400 py-4">
          Nenhum atendimento registrado hoje.
        </p>
      )}
    </div>
  )
}
