'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneCall, Clock, RefreshCcw, Users } from 'lucide-react'
import { getReceptionQueue, moveToTriage, moveDirectToVet, type ReceptionQueueItem } from '@/lib/actions/consultations'

const SPECIES_EMOJI: Record<string, string> = { dog: '🐕', cat: '🐱', bird: '🐦', rabbit: '🐰', rodent: '🐭', reptile: '🦎', fish: '🐠', exotic: '✨' }
const URGENCY_DOT: Record<string, string> = { red: 'bg-red-500', orange: 'bg-orange-500', yellow: 'bg-yellow-400', green: 'bg-emerald-500', blue: 'bg-sky-500' }

function waitedMin(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`
}

/**
 * Painel "Aguardando na recepção" para as rotinas Triagem e Consultório.
 * Fluxo orgânico: além de a recepção enviar, o profissional VÊ quem chegou e
 * CHAMA — para a Triagem (mode='triage' → status 'triage') ou direto para o
 * Consultório (mode='vet' → status 'in_progress').
 */
export default function ReceptionWaitingPanel({ mode }: { mode: 'triage' | 'vet' }) {
  const [items, setItems]   = useState<ReceptionQueueItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [callingId, setCallingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const load = useCallback(async () => {
    const res = await getReceptionQueue()
    if (Array.isArray(res)) setItems(res.filter(c => c.status === 'reception' || c.status === 'scheduled'))
    setLoaded(true)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 20000)   // acompanha novas chegadas
    return () => clearInterval(t)
  }, [load])

  function call(id: string) {
    if (callingId) return
    setCallingId(id)
    startTransition(async () => {
      const err = mode === 'triage' ? await moveToTriage(id) : await moveDirectToVet(id)
      setCallingId(null)
      if (err) return
      setItems(prev => prev.filter(c => c.id !== id))
      router.refresh()   // atualiza a fila da tela atual
    })
  }

  if (loaded && items.length === 0) return null

  const label = mode === 'triage' ? 'Chamar p/ Triagem' : 'Chamar p/ Consultório'
  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-teal-600" />
          <h2 className="text-sm font-bold text-teal-800">Aguardando na recepção · {items.length}</h2>
        </div>
        <button onClick={load} className="text-teal-600 hover:text-teal-800" title="Atualizar">
          <RefreshCcw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="space-y-2">
        {items.map(c => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-100 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              {c.urgency && <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${URGENCY_DOT[c.urgency] ?? 'bg-slate-300'}`} title={`Urgência ${c.urgency}`} />}
              <span className="text-lg shrink-0">{SPECIES_EMOJI[c.patient.species] ?? '🐾'}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{c.patient.name}</p>
                <p className="text-xs text-slate-500 truncate">{c.tutor.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400"><Clock className="h-3 w-3" /> {waitedMin(c.created_at)}</span>
              <button onClick={() => call(c.id)} disabled={callingId === c.id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                {callingId === c.id ? <RefreshCcw className="h-3.5 w-3.5 animate-spin" /> : <PhoneCall className="h-3.5 w-3.5" />} {label}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
