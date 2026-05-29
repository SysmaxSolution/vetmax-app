'use client'

import { useEffect, useMemo, useState } from 'react'
import { BedDouble, Wrench, Loader2, Biohazard, PawPrint, Plus, GripVertical } from 'lucide-react'
import { getRooms, type Room } from '@/lib/actions/rooms'
import type { HospitalizationCard } from '@/lib/actions/hospitalizations'

/**
 * Mapa de Ocupação de Leitos (Internação Completa) — central de comando.
 *
 * Painel visual de blocos por Box (rooms type=hospitalization), colorido por
 * status (🟢 Livre / 🔵 Parcial / 🔴 Ocupado / 🟡 Manutenção). Interativo:
 *   - Drag & drop: arrasta um paciente (sem leito ou de outro box) para um box
 *     Livre/Parcial → realoca o box_id em tempo real (onAssign).
 *   - Clique num box Livre/Parcial → admissão direta com o leito pré-selecionado
 *     (onAdmitToBox).
 */

interface Props {
  cards: HospitalizationCard[]
  /** Realoca o paciente para o box (atualiza box_id no banco + board). */
  onAssign?: (hospitalizationId: string, boxId: string) => void
  /** Abre o modal de admissão com o leito pré-selecionado. */
  onAdmitToBox?: (box: { id: string; name: string }) => void
}

type BoxState = 'free' | 'partial' | 'full' | 'maintenance'

const STATE_STYLE: Record<BoxState, { ring: string; head: string; label: string; dot: string }> = {
  free:        { ring: 'border-emerald-300 bg-emerald-50', head: 'text-emerald-700', label: 'Livre',      dot: 'bg-emerald-500' },
  partial:     { ring: 'border-sky-300 bg-sky-50',         head: 'text-sky-700',     label: 'Parcial',    dot: 'bg-sky-500' },
  full:        { ring: 'border-rose-400 bg-rose-50',       head: 'text-rose-700',    label: 'Ocupado',    dot: 'bg-rose-500' },
  maintenance: { ring: 'border-amber-300 bg-amber-50',     head: 'text-amber-700',   label: 'Manutenção', dot: 'bg-amber-500' },
}

function internedFor(createdAt: string): string {
  const h = Math.floor((Date.now() - new Date(createdAt).getTime()) / 3_600_000)
  if (h < 1) return 'recém-internado'
  if (h < 24) return `${h}h internado`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h internado`
}

export default function OccupancyMapView({ cards, onAssign, onAdmitToBox }: Props) {
  const [boxes, setBoxes] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [dragOver, setDragOver] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getRooms().then(rs => {
      if (cancelled) return
      if (Array.isArray(rs)) setBoxes(rs.filter(r => r.type === 'hospitalization' && r.active))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  const { byBox, unassigned } = useMemo(() => {
    const map = new Map<string, HospitalizationCard[]>()
    const none: HospitalizationCard[] = []
    for (const c of cards) {
      if (c.box_id) { const arr = map.get(c.box_id) ?? []; arr.push(c); map.set(c.box_id, arr) }
      else none.push(c)
    }
    return { byBox: map, unassigned: none }
  }, [cards])

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>

  if (boxes.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center">
        <BedDouble className="h-10 w-10 text-slate-200 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-500">Nenhum box cadastrado</p>
        <p className="text-xs text-slate-400 mt-1">Cadastre os leitos/boxes em <span className="font-semibold">Cadastros → Boxes</span> para ver a ocupação.</p>
      </div>
    )
  }

  function stateOf(box: Room, occ: number): BoxState {
    if (box.operational_status === 'maintenance') return 'maintenance'
    if (occ >= box.capacity) return 'full'
    if (occ > 0) return 'partial'
    return 'free'
  }

  const totalCap = boxes.reduce((s, b) => s + (b.operational_status === 'maintenance' ? 0 : b.capacity), 0)
  const totalOcc = boxes.reduce((s, b) => s + (byBox.get(b.id)?.length ?? 0), 0)

  // Chip de paciente arrastável (ocupante ou sem leito).
  function PatientChip({ c, compact }: { c: HospitalizationCard; compact?: boolean }) {
    return (
      <div
        draggable
        data-testid={`occ-patient-${c.id}`}
        onDragStart={e => { e.dataTransfer.setData('hospId', c.id); e.dataTransfer.effectAllowed = 'move' }}
        onClick={e => e.stopPropagation()}
        className={compact
          ? 'inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 cursor-grab active:cursor-grabbing'
          : 'rounded-lg bg-white/70 border border-white px-2 py-1 cursor-grab active:cursor-grabbing'}
        title="Arraste para um box livre/parcial"
      >
        {compact ? (
          <><GripVertical className="h-3 w-3 text-slate-300" /><PawPrint className="h-3 w-3 text-slate-400" /> {c.patient.name}</>
        ) : (
          <>
            <p className="text-xs font-semibold text-slate-800 truncate flex items-center gap-1">
              {c.isolation_required && <Biohazard className="h-3 w-3 text-rose-600 flex-shrink-0" />}
              <GripVertical className="h-3 w-3 text-slate-300 flex-shrink-0" /> {c.patient.name}
            </p>
            <p className="text-[10px] text-slate-500 truncate">{c.patient.species}{c.patient.breed ? ` • ${c.patient.breed}` : ''} • {internedFor(c.created_at)}</p>
            {c.tutor?.name && <p className="text-[10px] text-slate-400 truncate">Tutor: {c.tutor.name}</p>}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4" data-testid="occupancy-map">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-emerald-500" /> Livre</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-sky-500" /> Parcial</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-rose-500" /> Ocupado</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-amber-500" /> Manutenção</span>
        </div>
        <span className="text-xs font-semibold text-slate-600 tabular-nums">Ocupação: {totalOcc}/{totalCap} vagas</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {boxes.map(box => {
          const occupants = byBox.get(box.id) ?? []
          const st = stateOf(box, occupants.length)
          const style = STATE_STYLE[st]
          const droppable = st === 'free' || st === 'partial'
          const isOver = dragOver === box.id
          return (
            <div
              key={box.id}
              data-testid={`occ-box-${box.id}`}
              data-state={st}
              onClick={() => droppable && onAdmitToBox?.({ id: box.id, name: box.name })}
              onDragOver={e => { if (droppable) { e.preventDefault(); setDragOver(box.id) } }}
              onDragLeave={() => setDragOver(prev => (prev === box.id ? null : prev))}
              onDrop={e => {
                e.preventDefault(); setDragOver(null)
                const hid = e.dataTransfer.getData('hospId')
                if (hid && droppable && !occupants.some(o => o.id === hid)) onAssign?.(hid, box.id)
              }}
              className={`rounded-2xl border-2 ${style.ring} p-3 flex flex-col min-h-[120px] transition-all ${droppable ? 'cursor-pointer hover:shadow-md' : ''} ${isOver ? 'ring-2 ring-violet-400 ring-offset-1 scale-[1.02]' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-900 text-sm truncate flex items-center gap-1.5">
                  {st === 'maintenance' ? <Wrench className="h-3.5 w-3.5" /> : <BedDouble className="h-3.5 w-3.5" />} {box.name}
                </span>
                <span className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
              </div>
              <div className={`text-[11px] font-bold uppercase tracking-wide ${style.head}`}>
                {style.label}
                {st !== 'maintenance' && box.capacity > 1 && <span className="ml-1 tabular-nums">· {occupants.length}/{box.capacity}</span>}
              </div>

              {st === 'maintenance' ? (
                <p className="mt-2 text-[11px] text-amber-600">Box inoperante.</p>
              ) : occupants.length === 0 ? (
                <div className="mt-auto pt-2 flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                  <Plus className="h-3 w-3" /> Admitir aqui{box.capacity > 1 ? ` (${box.capacity} vagas)` : ''}
                </div>
              ) : (
                <div className="mt-2 space-y-1.5 flex-1">
                  {occupants.map(c => <PatientChip key={c.id} c={c} />)}
                  {st === 'partial' && (
                    <div className="flex items-center gap-1 text-[10px] text-sky-600 font-semibold"><Plus className="h-2.5 w-2.5" /> {box.capacity - occupants.length} vaga(s) — clique/arraste p/ alocar</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {unassigned.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3"
          data-testid="occ-unassigned">
          <p className="text-[11px] font-bold text-slate-500 uppercase mb-1.5">Sem leito atribuído ({unassigned.length}) — arraste para um box</p>
          <div className="flex flex-wrap gap-1.5">
            {unassigned.map(c => <PatientChip key={c.id} c={c} compact />)}
          </div>
        </div>
      )}
    </div>
  )
}
