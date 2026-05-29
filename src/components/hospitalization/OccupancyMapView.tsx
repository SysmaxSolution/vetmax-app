'use client'

import { useEffect, useMemo, useState } from 'react'
import { BedDouble, Wrench, Loader2, Biohazard, PawPrint } from 'lucide-react'
import { getRooms, type Room } from '@/lib/actions/rooms'
import type { HospitalizationCard } from '@/lib/actions/hospitalizations'

/**
 * Mapa de Ocupação de Leitos (Internação Completa).
 *
 * Painel visual de blocos: cada Box cadastrado (rooms type=hospitalization) é um
 * card colorido por status:
 *   🟢 Livre        — operacional e vazio
 *   🔵 Parcial      — ocupado abaixo da capacidade (mostra X/Y, aceita mais)
 *   🔴 Ocupado      — atingiu a capacidade máxima
 *   🟡 Manutenção   — inoperante (operational_status='maintenance')
 * Boxes ocupados mostram paciente(s), espécie e tempo de internação.
 */

interface Props {
  cards: HospitalizationCard[]
}

type BoxState = 'free' | 'partial' | 'full' | 'maintenance'

const STATE_STYLE: Record<BoxState, { ring: string; head: string; label: string; dot: string }> = {
  free:        { ring: 'border-emerald-300 bg-emerald-50', head: 'text-emerald-700', label: 'Livre',        dot: 'bg-emerald-500' },
  partial:     { ring: 'border-sky-300 bg-sky-50',         head: 'text-sky-700',     label: 'Parcial',      dot: 'bg-sky-500' },
  full:        { ring: 'border-rose-400 bg-rose-50',       head: 'text-rose-700',    label: 'Ocupado',      dot: 'bg-rose-500' },
  maintenance: { ring: 'border-amber-300 bg-amber-50',     head: 'text-amber-700',   label: 'Manutenção',   dot: 'bg-amber-500' },
}

function internedFor(createdAt: string): string {
  const h = Math.floor((Date.now() - new Date(createdAt).getTime()) / 3_600_000)
  if (h < 1) return 'recém-internado'
  if (h < 24) return `${h}h internado`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h internado`
}

export default function OccupancyMapView({ cards }: Props) {
  const [boxes, setBoxes] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getRooms().then(rs => {
      if (cancelled) return
      if (Array.isArray(rs)) setBoxes(rs.filter(r => r.type === 'hospitalization' && r.active))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  // Ocupantes por box + pacientes sem leito atribuído.
  const { byBox, unassigned } = useMemo(() => {
    const map = new Map<string, HospitalizationCard[]>()
    const none: HospitalizationCard[] = []
    for (const c of cards) {
      if (c.box_id) {
        const arr = map.get(c.box_id) ?? []
        arr.push(c); map.set(c.box_id, arr)
      } else {
        none.push(c)
      }
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

  // Resumo para a legenda/contadores.
  const totalCap = boxes.reduce((s, b) => s + (b.operational_status === 'maintenance' ? 0 : b.capacity), 0)
  const totalOcc = boxes.reduce((s, b) => s + (byBox.get(b.id)?.length ?? 0), 0)

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
          return (
            <div key={box.id} data-testid={`occ-box-${box.id}`} data-state={st}
              className={`rounded-2xl border-2 ${style.ring} p-3 flex flex-col min-h-[120px]`}>
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
                <p className="mt-auto pt-2 text-[11px] text-emerald-600">Disponível{box.capacity > 1 ? ` (${box.capacity} vagas)` : ''}.</p>
              ) : (
                <div className="mt-2 space-y-1.5 flex-1">
                  {occupants.map(c => (
                    <div key={c.id} className="rounded-lg bg-white/70 border border-white px-2 py-1">
                      <p className="text-xs font-semibold text-slate-800 truncate flex items-center gap-1">
                        {c.isolation_required && <Biohazard className="h-3 w-3 text-rose-600 flex-shrink-0" />}
                        <PawPrint className="h-3 w-3 text-slate-400 flex-shrink-0" /> {c.patient.name}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">{c.patient.species}{c.patient.breed ? ` • ${c.patient.breed}` : ''} • {internedFor(c.created_at)}</p>
                    </div>
                  ))}
                  {st === 'partial' && (
                    <p className="text-[10px] text-sky-600 font-semibold">{box.capacity - occupants.length} vaga(s) livre(s)</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {unassigned.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
          <p className="text-[11px] font-bold text-slate-500 uppercase mb-1.5">Sem leito atribuído ({unassigned.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {unassigned.map(c => (
              <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600">
                <PawPrint className="h-3 w-3 text-slate-400" /> {c.patient.name}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Atribua o leito na aba "Dados Clínicos" do card.</p>
        </div>
      )}
    </div>
  )
}
