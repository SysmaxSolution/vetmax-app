'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save, Biohazard, BedDouble, ClipboardList } from 'lucide-react'
import {
  getHospitalizationClinicalData, updateHospitalizationClinicalData,
  type HospClinicalData,
} from '@/lib/actions/hospitalizations'
import { getRooms, type Room } from '@/lib/actions/rooms'

/**
 * Aba "Dados Clínicos" do card de internação (Internação Completa) — ficha
 * enriquecida: leito/box, previsão de alta, dieta, jejum, isolamento, peso,
 * pertences. Os toggles (jejum/isolamento) persistem na hora; o isolamento
 * acende o badge no Kanban/Mapa imediatamente via onSaved.
 */

interface Props {
  hospitalizationId: string
  /** Propaga ao board para o badge/leito refletirem instantaneamente. */
  onSaved?: (patch: { isolation_required?: boolean; box_id?: string | null; estimated_discharge?: string | null }) => void
}

// 'YYYY-MM-DDTHH:mm' (datetime-local) ↔ ISO
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function DadosClinicosTab({ hospitalizationId, onSaved }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [busyToggle, setBusyToggle] = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [toast, setToast]     = useState<string | null>(null)
  const [rooms, setRooms]     = useState<Room[]>([])
  const [d, setD] = useState<HospClinicalData>({
    box_id: null, estimated_discharge: null, diet_notes: null, fasting: false,
    isolation_required: false, weight_at_admission: null, personal_belongings: null,
  })

  useEffect(() => {
    let cancelled = false
    Promise.all([getHospitalizationClinicalData(hospitalizationId), getRooms()]).then(([cd, rs]) => {
      if (cancelled) return
      if (!('error' in cd)) setD(cd)
      if (Array.isArray(rs)) setRooms(rs.filter(r => r.active))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [hospitalizationId])

  // Toggle booleano com persistência imediata (jejum/isolamento).
  async function toggleBool(field: 'fasting' | 'isolation_required') {
    const next = !d[field]
    setD(prev => ({ ...prev, [field]: next }))
    setBusyToggle(field)
    const res = await updateHospitalizationClinicalData(hospitalizationId, { [field]: next })
    setBusyToggle(null)
    if ('error' in res) { setError(res.error); setD(prev => ({ ...prev, [field]: !next })); return }
    if (field === 'isolation_required') onSaved?.({ isolation_required: next })
  }

  async function handleSave() {
    setSaving(true); setError(null)
    const res = await updateHospitalizationClinicalData(hospitalizationId, {
      box_id:              d.box_id || null,
      estimated_discharge: d.estimated_discharge || null,
      diet_notes:          d.diet_notes,
      weight_at_admission: d.weight_at_admission,
      personal_belongings: d.personal_belongings,
    })
    setSaving(false)
    if ('error' in res) { setError(res.error); return }
    onSaved?.({ box_id: d.box_id, estimated_discharge: d.estimated_discharge })
    setToast('Dados clínicos salvos.')
    setTimeout(() => setToast(null), 2500)
  }

  if (loading) return <div className="flex-1 flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4" data-testid="dados-clinicos-tab">
      {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
      {toast && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{toast}</p>}

      {/* Toggles que persistem na hora */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button type="button" onClick={() => toggleBool('isolation_required')} disabled={busyToggle !== null}
          data-testid="toggle-isolamento"
          className={`flex items-center justify-between gap-2 rounded-xl border-2 px-4 py-3 transition-colors ${d.isolation_required ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white'}`}>
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Biohazard className={`h-4 w-4 ${d.isolation_required ? 'text-rose-600' : 'text-slate-400'}`} /> Isolamento (EPI)</span>
          <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${d.isolation_required ? 'bg-rose-500' : 'bg-slate-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${d.isolation_required ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </span>
        </button>
        <button type="button" onClick={() => toggleBool('fasting')} disabled={busyToggle !== null}
          data-testid="toggle-jejum"
          className={`flex items-center justify-between gap-2 rounded-xl border-2 px-4 py-3 transition-colors ${d.fasting ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><ClipboardList className={`h-4 w-4 ${d.fasting ? 'text-amber-600' : 'text-slate-400'}`} /> Jejum</span>
          <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${d.fasting ? 'bg-amber-500' : 'bg-slate-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${d.fasting ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </span>
        </button>
      </div>

      {/* Campos editáveis (Salvar) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><BedDouble className="h-3 w-3" /> Leito / Box</span>
          <select value={d.box_id ?? ''} onChange={e => setD(p => ({ ...p, box_id: e.target.value || null }))}
            className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none">
            <option value="">— Sem leito —</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}{r.type === 'hospitalization' ? '' : ` (${r.type})`}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Previsão de Alta</span>
          <input type="datetime-local" value={toLocalInput(d.estimated_discharge)}
            onChange={e => setD(p => ({ ...p, estimated_discharge: e.target.value ? new Date(e.target.value).toISOString() : null }))}
            className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Peso de Admissão (kg)</span>
          <input type="number" inputMode="decimal" step="0.001" value={d.weight_at_admission ?? ''}
            onChange={e => setD(p => ({ ...p, weight_at_admission: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) }))}
            className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Pertences do Pet</span>
          <input value={d.personal_belongings ?? ''} onChange={e => setD(p => ({ ...p, personal_belongings: e.target.value }))} placeholder="Coleira, cobertor…"
            className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none" />
        </label>
      </div>
      <label className="block">
        <span className="text-[10px] font-bold text-slate-500 uppercase">Dieta / Observações alimentares</span>
        <textarea value={d.diet_notes ?? ''} onChange={e => setD(p => ({ ...p, diet_notes: e.target.value }))} rows={2} placeholder="Ex.: Ração úmida 3×/dia; jejum até 8h…"
          className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none resize-y" />
      </label>

      <button onClick={handleSave} disabled={saving}
        className="flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar Dados Clínicos
      </button>
    </div>
  )
}
