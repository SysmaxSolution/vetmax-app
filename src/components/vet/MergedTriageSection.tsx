'use client'

import { useState, useEffect } from 'react'
import { Weight, Thermometer, Heart, Wind, Save, Loader2, Stethoscope } from 'lucide-react'
import { updateTriageVitalSigns } from '@/lib/actions/triage'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TriageVitals = {
  weight:            number
  temperature:       number
  heart_rate:        number
  respiratory_rate:  number
  mucous_color:      string
  crt:               string
  chief_complaint:   string
}

const DEFAULT_VITALS: TriageVitals = {
  weight: 0, temperature: 0, heart_rate: 0, respiratory_rate: 0,
  mucous_color: 'pink', crt: '2s', chief_complaint: '',
}

const MUCOUS_OPTIONS = [
  { value: 'pink',     label: 'Rosa (Normal)', dot: 'bg-pink-300' },
  { value: 'pale',     label: 'Pálida',        dot: 'bg-slate-300' },
  { value: 'icteric',  label: 'Ictérica',      dot: 'bg-yellow-300' },
  { value: 'cyanotic', label: 'Cianótica',     dot: 'bg-blue-400' },
]

const CRT_OPTIONS = [
  { value: '2s', label: '< 2s (Normal)' },
  { value: '3s', label: '2–3s' },
  { value: '4s', label: '> 3s' },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  consultationId: string
  initialVitals?: Partial<TriageVitals> | null
  /** Controlled externally when voice AI extracts vitals */
  externalVitals?: Partial<TriageVitals> | null
  onSaved?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MergedTriageSection({
  consultationId,
  initialVitals,
  externalVitals,
  onSaved,
}: Props) {
  const [vitals, setVitals] = useState<TriageVitals>({
    ...DEFAULT_VITALS,
    ...(initialVitals ?? {}),
    ...(externalVitals ?? {}),
  })
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  // Merge external vitals (from voice AI) via useEffect to avoid render-loop
  useEffect(() => {
    if (!externalVitals) return
    const updates: Partial<TriageVitals> = {}
    for (const [k, v] of Object.entries(externalVitals)) {
      if (v != null && v !== 0 && v !== '') {
        (updates as any)[k] = v
      }
    }
    if (Object.keys(updates).length > 0) {
      setVitals(prev => ({ ...prev, ...updates }))
      setSaved(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(externalVitals)])

  function set<K extends keyof TriageVitals>(k: K, v: TriageVitals[K]) {
    setVitals(prev => ({ ...prev, [k]: v }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    const res = await updateTriageVitalSigns(consultationId, {
      weight:           vitals.weight,
      temperature:      vitals.temperature,
      heart_rate:       vitals.heart_rate,
      respiratory_rate: vitals.respiratory_rate,
      mucous_color:     vitals.mucous_color as any,
      crt:              vitals.crt as any,
      chief_complaint:  vitals.chief_complaint,
    })
    setSaving(false)
    if (!('error' in res)) { setSaved(true); onSaved?.() }
  }

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 overflow-hidden">
      <div className="border-b border-teal-200 px-5 py-3 flex items-center gap-2 bg-teal-50">
        <Stethoscope className="h-4 w-4 text-teal-600" />
        <h3 className="text-sm font-semibold text-teal-800">Triagem — Sinais Vitais</h3>
        <span className="ml-auto text-xs text-teal-600 bg-teal-100 px-2 py-0.5 rounded-full">Fluxo Contínuo</span>
      </div>

      <div className="px-5 py-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Peso */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
            <Weight className="h-3 w-3" /> Peso (kg)
          </label>
          <input
            type="number" min={0} step={0.1}
            value={vitals.weight || ''}
            onChange={e => set('weight', parseFloat(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            placeholder="0.0"
          />
        </div>

        {/* Temperatura */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
            <Thermometer className="h-3 w-3" /> Temp. (°C)
          </label>
          <input
            type="number" min={35} max={43} step={0.1}
            value={vitals.temperature || ''}
            onChange={e => set('temperature', parseFloat(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            placeholder="38.5"
          />
        </div>

        {/* FC */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
            <Heart className="h-3 w-3" /> FC (bpm)
          </label>
          <input
            type="number" min={0} step={1}
            value={vitals.heart_rate || ''}
            onChange={e => set('heart_rate', parseInt(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            placeholder="80"
          />
        </div>

        {/* FR */}
        <div>
          <label className="flex items-center gap-1 text-xs font-medium text-slate-600 mb-1">
            <Wind className="h-3 w-3" /> FR (mrpm)
          </label>
          <input
            type="number" min={0} step={1}
            value={vitals.respiratory_rate || ''}
            onChange={e => set('respiratory_rate', parseInt(e.target.value) || 0)}
            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            placeholder="20"
          />
        </div>
      </div>

      <div className="px-5 pb-4 grid grid-cols-2 gap-3">
        {/* Mucosa */}
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">Mucosa</label>
          <div className="flex flex-wrap gap-1.5">
            {MUCOUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => set('mucous_color', opt.value)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  vitals.mucous_color === opt.value
                    ? 'border-teal-500 bg-teal-50 text-teal-800'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${opt.dot}`} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* TPC */}
        <div>
          <label className="text-xs font-medium text-slate-600 mb-1 block">TPC</label>
          <div className="flex flex-wrap gap-1.5">
            {CRT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => set('crt', opt.value)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  vitals.crt === opt.value
                    ? 'border-teal-500 bg-teal-50 text-teal-800'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Queixa principal */}
      <div className="px-5 pb-4">
        <label className="text-xs font-medium text-slate-600 mb-1 block">Queixa Principal</label>
        <input
          type="text"
          value={vitals.chief_complaint}
          onChange={e => set('chief_complaint', e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          placeholder="Descreva a queixa principal..."
        />
      </div>

      <div className="px-5 pb-5">
        <button
          onClick={handleSave}
          disabled={saving}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
            saved
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-teal-600 text-white hover:bg-teal-700'
          } disabled:opacity-50`}
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
          ) : saved ? (
            <><span>✓</span> Sinais Salvos</>
          ) : (
            <><Save className="h-4 w-4" /> Salvar Sinais Vitais</>
          )}
        </button>
      </div>
    </div>
  )
}
