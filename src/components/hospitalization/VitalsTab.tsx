'use client'

import { useEffect, useMemo, useState } from 'react'
import { Activity, Loader2, Plus, Thermometer, HeartPulse, Wind, Scale, Droplet, TrendingUp } from 'lucide-react'
import { formatClinicShort } from '@/lib/time'
import {
  listClinicalVitals, recordClinicalVital,
  type ClinicalVital, type RecordVitalPayload,
} from '@/lib/actions/vitals'

/**
 * Aba "Sinais Vitais" do card de internação (Internação Completa).
 * Entrada rápida + histórico + mini-gráficos de tendência (sparklines).
 * Grava em clinical_vitals (compartilhada com Centro Cirúrgico).
 */

interface Props {
  hospitalizationId: string
  /** Peso de admissão para pré-preencher o campo (kg). */
  admissionWeight?: number | null
}

type FieldKey = 'temperature' | 'heart_rate' | 'resp_rate' | 'weight' | 'spo2' | 'glucose' | 'pain_score'

const NUMERIC_FIELDS: { key: FieldKey; label: string; unit: string; step: string; icon: React.ReactNode }[] = [
  { key: 'temperature', label: 'Temperatura', unit: '°C',    step: '0.1', icon: <Thermometer className="h-3.5 w-3.5" /> },
  { key: 'heart_rate',  label: 'FC',          unit: 'bpm',   step: '1',   icon: <HeartPulse  className="h-3.5 w-3.5" /> },
  { key: 'resp_rate',   label: 'FR',          unit: 'mpm',   step: '1',   icon: <Wind        className="h-3.5 w-3.5" /> },
  { key: 'weight',      label: 'Peso',        unit: 'kg',    step: '0.001', icon: <Scale     className="h-3.5 w-3.5" /> },
  { key: 'spo2',        label: 'SpO₂',        unit: '%',     step: '0.1', icon: <Droplet     className="h-3.5 w-3.5" /> },
  { key: 'glucose',     label: 'Glicemia',    unit: 'mg/dL', step: '1',   icon: <Activity    className="h-3.5 w-3.5" /> },
  { key: 'pain_score',  label: 'Dor',         unit: '0–10',  step: '1',   icon: <Activity    className="h-3.5 w-3.5" /> },
]

// Sparklines de tendência exibidos (do mais antigo ao mais recente).
const TREND_FIELDS: { key: FieldKey; label: string; unit: string; color: string }[] = [
  { key: 'temperature', label: 'Temperatura', unit: '°C',  color: '#e11d48' },
  { key: 'heart_rate',  label: 'FC',          unit: 'bpm', color: '#7c3aed' },
  { key: 'resp_rate',   label: 'FR',          unit: 'mpm', color: '#0891b2' },
  { key: 'weight',      label: 'Peso',        unit: 'kg',  color: '#059669' },
]

function fmtTime(iso: string): string {
  return formatClinicShort(iso)
}

// ─── Sparkline SVG (sem libs) ──────────────────────────────────────────────────
function Sparkline({ points, color }: { points: number[]; color: string }) {
  const W = 120, H = 32, P = 3
  if (points.length === 0) return <div className="h-8 text-[10px] text-slate-300 flex items-center">sem dados</div>
  if (points.length === 1) {
    return (
      <svg width={W} height={H} className="overflow-visible">
        <circle cx={W / 2} cy={H / 2} r={2.5} fill={color} />
      </svg>
    )
  }
  const min = Math.min(...points), max = Math.max(...points)
  const range = max - min || 1
  const stepX = (W - 2 * P) / (points.length - 1)
  const coords = points.map((v, i) => {
    const x = P + i * stepX
    const y = H - P - ((v - min) / range) * (H - 2 * P)
    return [x, y] as const
  })
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const [lx, ly] = coords[coords.length - 1]
  return (
    <svg width={W} height={H} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={2.5} fill={color} />
    </svg>
  )
}

export default function VitalsTab({ hospitalizationId, admissionWeight }: Props) {
  const [vitals, setVitals]   = useState<ClinicalVital[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({
    weight: admissionWeight != null ? String(admissionWeight) : '',
  })

  async function reload() {
    const res = await listClinicalVitals(hospitalizationId)
    if (Array.isArray(res)) setVitals(res)
    setLoading(false)
  }
  useEffect(() => { void reload() }, [hospitalizationId]) // eslint-disable-line react-hooks/exhaustive-deps

  function setField(k: string, v: string) { setForm(prev => ({ ...prev, [k]: v })) }

  const num = (k: string): number | null => {
    const raw = (form[k] ?? '').trim().replace(',', '.')
    if (raw === '') return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }

  async function handleSave() {
    setError(null)
    const payload: RecordVitalPayload = {
      hospitalization_id: hospitalizationId,
      temperature:    num('temperature'),
      heart_rate:     num('heart_rate'),
      resp_rate:      num('resp_rate'),
      weight:         num('weight'),
      spo2:           num('spo2'),
      glucose:        num('glucose'),
      pain_score:     num('pain_score'),
      blood_pressure: (form.blood_pressure ?? '').trim() || null,
      mucosa:         (form.mucosa ?? '').trim() || null,
      tpc_seconds:    num('tpc_seconds'),
      hydration_pct:  num('hydration_pct'),
      notes:          (form.notes ?? '').trim() || null,
      source:         'manual',
    }
    setSaving(true)
    const res = await recordClinicalVital(payload)
    setSaving(false)
    if ('error' in res) { setError(res.error); return }
    setForm({ weight: admissionWeight != null ? String(admissionWeight) : '' })
    await reload()
  }

  // Séries temporais (mais antigo → mais recente) para os sparklines.
  const series = useMemo(() => {
    const asc = [...vitals].reverse()
    const out: Record<string, number[]> = {}
    for (const f of TREND_FIELDS) {
      out[f.key] = asc.map(v => v[f.key]).filter((n): n is number => n != null)
    }
    return out
  }, [vitals])

  const latest = vitals[0]

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5" data-testid="vitals-tab">
      {/* Entrada rápida */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-rose-600" /> Nova Aferição
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {NUMERIC_FIELDS.map(f => (
            <label key={f.key} className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">{f.icon}{f.label} <span className="text-slate-400 font-normal lowercase">{f.unit}</span></span>
              <input
                type="number" inputMode="decimal" step={f.step}
                value={form[f.key] ?? ''}
                onChange={e => setField(f.key, e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-rose-500 focus:outline-none"
              />
            </label>
          ))}
          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase">PA <span className="text-slate-400 font-normal">mmHg</span></span>
            <input value={form.blood_pressure ?? ''} onChange={e => setField('blood_pressure', e.target.value)} placeholder="120/80"
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-rose-500 focus:outline-none" />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase">TPC <span className="text-slate-400 font-normal">s</span></span>
            <input type="number" inputMode="decimal" step="0.1" value={form.tpc_seconds ?? ''} onChange={e => setField('tpc_seconds', e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-rose-500 focus:outline-none" />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Hidratação <span className="text-slate-400 font-normal">%</span></span>
            <input type="number" inputMode="decimal" step="0.1" value={form.hydration_pct ?? ''} onChange={e => setField('hydration_pct', e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-rose-500 focus:outline-none" />
          </label>
          <label className="block col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Mucosa</span>
            <input value={form.mucosa ?? ''} onChange={e => setField('mucosa', e.target.value)} placeholder="Normocorada"
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-rose-500 focus:outline-none" />
          </label>
        </div>
        <input value={form.notes ?? ''} onChange={e => setField('notes', e.target.value)} placeholder="Observações da aferição..."
          className="mt-2 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-rose-500 focus:outline-none" />
        {error && <p className="mt-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
        <button onClick={handleSave} disabled={saving}
          className="mt-3 flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : <><Plus className="h-4 w-4" /> Registrar Sinais Vitais</>}
        </button>
      </div>

      {/* Tendências */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-violet-600" /> Tendência
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {TREND_FIELDS.map(f => {
            const pts = series[f.key] ?? []
            const last = latest?.[f.key]
            return (
              <div key={f.key} className="rounded-xl border border-slate-100 p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-slate-600">{f.label}</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: f.color }}>
                    {last != null ? `${last} ${f.unit}` : '—'}
                  </span>
                </div>
                <Sparkline points={pts} color={f.color} />
              </div>
            )
          })}
        </div>
      </div>

      {/* Histórico */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Histórico de Aferições</h3>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : vitals.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-4">Nenhuma aferição registrada.</p>
        ) : (
          <div className="space-y-2">
            {vitals.map(v => (
              <div key={v.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-700">{fmtTime(v.recorded_at)}</span>
                  {v.source !== 'manual' && <span className="text-[10px] uppercase text-violet-500 font-bold">{v.source}</span>}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-600">
                  {v.temperature != null && <span>T {v.temperature}°C</span>}
                  {v.heart_rate  != null && <span>FC {v.heart_rate}</span>}
                  {v.resp_rate   != null && <span>FR {v.resp_rate}</span>}
                  {v.weight      != null && <span>{v.weight}kg</span>}
                  {v.spo2        != null && <span>SpO₂ {v.spo2}%</span>}
                  {v.glucose     != null && <span>Glic {v.glucose}</span>}
                  {v.blood_pressure && <span>PA {v.blood_pressure}</span>}
                  {v.tpc_seconds != null && <span>TPC {v.tpc_seconds}s</span>}
                  {v.hydration_pct != null && <span>Hidr {v.hydration_pct}%</span>}
                  {v.pain_score  != null && <span>Dor {v.pain_score}</span>}
                  {v.mucosa && <span>Muc: {v.mucosa}</span>}
                </div>
                {v.notes && <p className="mt-1 text-slate-500">{v.notes}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
