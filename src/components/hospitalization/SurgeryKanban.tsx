'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Syringe, Plus, X, Loader2, Activity } from 'lucide-react'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { PetAvatar } from '@/components/ui/PetAvatar'
import { searchPatientsForTriage, type TriagePatientSearchResult } from '@/lib/actions/triage'
import {
  createSurgery, updateSurgeryStatus,
  type SurgeryBoard, type SurgeryCard, type SurgeryStatus,
} from '@/lib/actions/surgeries'
import SurgeryFichaModal from './SurgeryFichaModal'

const COLUMNS: { status: keyof SurgeryBoard; label: string; emoji: string; bg: string; border: string; header: string }[] = [
  { status: 'preparo', label: 'Preparo',          emoji: '🧼', bg: 'bg-amber-50',   border: 'border-amber-200',   header: 'bg-amber-500' },
  { status: 'sala',    label: 'Sala Cirúrgica',   emoji: '🔪', bg: 'bg-rose-50',    border: 'border-rose-200',    header: 'bg-rose-500' },
  { status: 'rpa',     label: 'RPA (Recuperação)', emoji: '🛌', bg: 'bg-emerald-50', border: 'border-emerald-200', header: 'bg-emerald-500' },
]

interface Props {
  initialBoard: SurgeryBoard
  clinicId:     string
}

export default function SurgeryKanban({ initialBoard, clinicId }: Props) {
  const router = useRouter()
  const [board, setBoard] = useState<SurgeryBoard>(initialBoard)
  const boardRef = useRef<SurgeryBoard>(initialBoard)
  const [dragOverCol, setDragOverCol] = useState<SurgeryStatus | null>(null)
  const [selected, setSelected] = useState<SurgeryCard | null>(null)
  const [showAdmit, setShowAdmit] = useState(false)
  const draggingRef = useRef<{ id: string; status: SurgeryStatus } | null>(null)

  useEffect(() => { boardRef.current = board }, [board])
  useEffect(() => { setBoard(initialBoard) }, [initialBoard])
  useRealtimeSync({ table: 'surgeries', clinicId })

  const move = useCallback(async (cardId: string, from: SurgeryStatus, to: SurgeryStatus) => {
    if (!cardId || !from || from === to) return
    const cur = boardRef.current
    const card = cur[from as keyof SurgeryBoard]?.find(c => c.id === cardId)
    if (!card) return
    const snapshot = cur
    setBoard(prev => {
      const next = { ...prev }
      next[from as keyof SurgeryBoard] = prev[from as keyof SurgeryBoard].filter(c => c.id !== cardId)
      next[to   as keyof SurgeryBoard] = [...prev[to as keyof SurgeryBoard], { ...card, status: to }]
      return next
    })
    const res = await updateSurgeryStatus(cardId, to)
    if ('error' in res) { setBoard(snapshot); alert(res.error) }
  }, [])

  // Drag nativo (browser) + pointer (Playwright CDP), igual ao Kanban de Internação.
  useEffect(() => {
    const onDragStart = (e: DragEvent) => {
      const t = (e.target as HTMLElement).closest('[data-testid^="surgery-card-"]') as HTMLElement | null
      if (!t) return
      const id = t.dataset.testid?.replace('surgery-card-', '') ?? ''
      const col = (t.closest('[data-column]') as HTMLElement | null)?.dataset.column as SurgeryStatus
      if (id && col) draggingRef.current = { id, status: col }
    }
    const onDrop = (e: DragEvent) => {
      const col = (e.target as HTMLElement).closest('[data-column]') as HTMLElement | null
      const to = col?.dataset.column as SurgeryStatus
      const ref = draggingRef.current
      if (to && ref) { draggingRef.current = null; void move(ref.id, ref.status, to) }
    }
    const onDragOver = (e: DragEvent) => { if ((e.target as HTMLElement).closest('[data-column]')) e.preventDefault() }
    const onPointerDown = (e: PointerEvent) => {
      const t = (e.target as HTMLElement).closest('[data-testid^="surgery-card-"]') as HTMLElement | null
      if (!t) return
      const id = t.dataset.testid?.replace('surgery-card-', '') ?? ''
      const col = (t.closest('[data-column]') as HTMLElement | null)?.dataset.column as SurgeryStatus
      if (id && col) draggingRef.current = { id, status: col }
    }
    const onPointerUp = (e: PointerEvent) => {
      const ref = draggingRef.current
      if (!ref) return
      const col = (e.target as HTMLElement).closest('[data-column]') as HTMLElement | null
      const to = col?.dataset.column as SurgeryStatus
      draggingRef.current = null
      if (to) void move(ref.id, ref.status, to)
    }
    document.addEventListener('dragstart', onDragStart, true)
    document.addEventListener('drop', onDrop, true)
    document.addEventListener('dragover', onDragOver, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('pointerup', onPointerUp, true)
    return () => {
      document.removeEventListener('dragstart', onDragStart, true)
      document.removeEventListener('drop', onDrop, true)
      document.removeEventListener('dragover', onDragOver, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('pointerup', onPointerUp, true)
    }
  }, [move])

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-600 text-white shadow-lg shadow-red-200">
            <Syringe className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Centro Cirúrgico</h1>
            <p className="text-sm text-slate-500">Fluxo do bloco: Preparo → Sala Cirúrgica → RPA.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowAdmit(true)}
          data-testid="surgery-new-btn"
          className="flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm"
        >
          <Plus className="h-4 w-4" /> Nova Cirurgia
        </button>
      </div>

      <section className="flex md:grid md:grid-cols-3 gap-4 min-h-[600px] overflow-x-auto md:overflow-visible -mx-3 px-3 md:mx-0 md:px-0 pb-2">
        {COLUMNS.map(col => {
          const cards = board[col.status]
          const isOver = dragOverCol === col.status
          return (
            <div
              key={col.status}
              data-testid={`surgery-column-${col.status}`}
              data-column={col.status}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.status) }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => setDragOverCol(null)}
              className={`flex flex-col rounded-2xl border-2 transition-all min-w-[85vw] md:min-w-0 flex-shrink-0 md:flex-shrink ${col.bg} ${isOver ? `${col.border} ring-2 ring-red-400 ring-offset-2` : 'border-transparent'}`}
            >
              <div className={`p-3 rounded-t-[14px] flex items-center justify-between ${col.header} text-white shadow-sm`}>
                <div className="flex items-center gap-2"><span className="text-lg">{col.emoji}</span><h3 className="font-bold text-sm uppercase tracking-wide">{col.label}</h3></div>
                <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold">{cards.length}</span>
              </div>
              <div className="flex-1 p-3 space-y-3">
                {cards.length === 0 ? (
                  <div className={`flex flex-col items-center justify-center py-10 rounded-xl border-2 border-dashed ${col.border} text-center`}>
                    <span className="text-2xl mb-1 opacity-30">{col.emoji}</span>
                    <p className="text-xs text-slate-400">Sem cirurgias aqui</p>
                  </div>
                ) : cards.map(card => (
                  <div
                    key={card.id}
                    draggable
                    data-testid={`surgery-card-${card.id}`}
                    onClick={() => setSelected(card)}
                    className="group p-4 rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-red-300 transition-all cursor-pointer active:scale-95"
                  >
                    <div className="flex items-start gap-3">
                      <PetAvatar name={card.patient.name} species={card.patient.species} photoUrl={card.patient.photo_url} size="sm" className="rounded-xl border border-slate-200" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-900 text-sm truncate">{card.patient.name}</h4>
                        <p className="text-[11px] text-slate-500 truncate">{card.procedure_name}</p>
                        <div className="mt-1 flex items-center gap-1.5">
                          {card.asa_risk && <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 rounded">ASA {card.asa_risk}</span>}
                          <span className="text-[10px] text-slate-400 uppercase">{card.patient.species}{card.patient.breed ? ` • ${card.patient.breed}` : ''}</span>
                        </div>
                      </div>
                      <Activity className="h-3.5 w-3.5 text-slate-300 group-hover:text-red-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </section>
      <p className="text-xs text-slate-400 text-center">💡 Arraste para mover entre as fases • Clique no card para abrir a ficha cirúrgica</p>

      {selected && (
        <SurgeryFichaModal
          surgeryId={selected.id}
          onClose={() => setSelected(null)}
          onChanged={() => router.refresh()}
        />
      )}

      {showAdmit && (
        <AdmitSurgeryModal
          onClose={() => setShowAdmit(false)}
          onSuccess={() => { setShowAdmit(false); router.refresh() }}
        />
      )}
    </section>
  )
}

// ─── Modal: Nova Cirurgia ─────────────────────────────────────────────────────

function AdmitSurgeryModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<TriagePatientSearchResult[]>([])
  const [selected, setSelected] = useState<TriagePatientSearchResult | null>(null)
  const [procedure, setProcedure] = useState('')
  const [asa, setAsa] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSearch(q: string) {
    setSearch(q); setSelected(null)
    if (q.trim().length < 2) { setResults([]); return }
    const r = await searchPatientsForTriage(q)
    setResults(Array.isArray(r) ? r : [])
  }

  async function handleConfirm() {
    if (!selected || !procedure.trim()) return
    setLoading(true); setError('')
    const res = await createSurgery({ patient_id: selected.id, procedure_name: procedure.trim(), asa_risk: asa || null })
    setLoading(false)
    if ('error' in res) { setError(res.error); return }
    onSuccess()
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Syringe className="h-5 w-5 text-red-600" /> Nova Cirurgia</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X className="h-5 w-5" /></button>
        </div>
        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <div className="relative">
          <input
            type="text" placeholder="Buscar por tutor ou pet..."
            value={selected ? `${selected.tutor.name} — ${selected.name}` : search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          {results.length > 0 && !selected && (
            <div className="absolute z-10 top-full left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
              {results.map(r => (
                <button key={r.id} type="button" onClick={() => { setSelected(r); setResults([]) }} className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm">
                  <span className="font-semibold">{r.name}</span><span className="text-slate-500 ml-2">Tutor: {r.tutor.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input type="text" placeholder="Procedimento (ex.: Castração, OSH)" value={procedure} onChange={e => setProcedure(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase">Risco ASA</label>
          <select value={asa} onChange={e => setAsa(e.target.value)} className="mt-0.5 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500">
            <option value="">—</option>
            {['I', 'II', 'III', 'IV', 'V'].map(a => <option key={a} value={a}>ASA {a}</option>)}
          </select>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
          <button onClick={handleConfirm} disabled={!selected || !procedure.trim() || loading}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Iniciar Preparo
          </button>
        </div>
      </div>
    </div>
  )
}
