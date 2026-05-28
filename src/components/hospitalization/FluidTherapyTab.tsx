'use client'

import { useEffect, useMemo, useState } from 'react'
import { Droplets, Loader2, Plus, Calculator, Trash2, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import {
  getFluidBalance, recordFluid, deleteFluidEntry,
  type FluidBalanceSummary, type FluidKind, type FluidDirection,
} from '@/lib/actions/hospitalization-fluids'

/**
 * Aba "Fluidoterapia" do card de internação (Internação Completa).
 *  - Calculadora: peso → manutenção + déficit + perdas → ml/h e gotas/min.
 *  - Entradas (fluido) e Saídas (urina/êmese/sangramento/outros) em mL.
 *  - Saldo Hídrico Final = Entradas − Saídas, em destaque (Regra 3).
 */

interface Props {
  hospitalizationId: string
  admissionWeight?: number | null
}

const KIND_LABEL: Record<FluidKind, string> = {
  fluid: 'Fluido', urine: 'Urina', emesis: 'Êmese', bleeding: 'Sangramento', other: 'Outro',
}
const OUT_KINDS: { kind: FluidKind; label: string }[] = [
  { kind: 'urine', label: 'Urina' },
  { kind: 'emesis', label: 'Êmese' },
  { kind: 'bleeding', label: 'Sangramento' },
  { kind: 'other', label: 'Outro' },
]

// Equipos: gotas por mL.
const DROP_FACTORS = { macro: 20, micro: 60 } as const

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function FluidTherapyTab({ hospitalizationId, admissionWeight }: Props) {
  const [summary, setSummary] = useState<FluidBalanceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // ── Calculadora ──
  const [weight,    setWeight]    = useState<string>(admissionWeight != null ? String(admissionWeight) : '')
  const [rate,      setRate]      = useState<string>('3')   // ml/kg/h (manutenção)
  const [dehydration, setDehydration] = useState<string>('0') // % desidratação (déficit)
  const [losses,    setLosses]    = useState<string>('0')   // perdas estimadas (ml/dia)
  const [equipo,    setEquipo]    = useState<'macro' | 'micro'>('macro')

  // ── Registro ──
  const [inVolume,  setInVolume]  = useState<string>('')
  const [outVolume, setOutVolume] = useState<string>('')
  const [outKind,   setOutKind]   = useState<FluidKind>('urine')

  async function reload() {
    const res = await getFluidBalance(hospitalizationId)
    if (!('error' in res)) setSummary(res)
    setLoading(false)
  }
  useEffect(() => { void reload() }, [hospitalizationId]) // eslint-disable-line react-hooks/exhaustive-deps

  const calc = useMemo(() => {
    const w = parseFloat((weight || '').replace(',', '.'))
    const r = parseFloat((rate || '').replace(',', '.'))
    const deh = parseFloat((dehydration || '0').replace(',', '.')) || 0
    const ls = parseFloat((losses || '0').replace(',', '.')) || 0
    if (!(w > 0) || !(r > 0)) return null
    const maintenancePerDay = r * w * 24           // ml/dia
    const deficit = w * (deh / 100) * 1000          // ml (kg × % × 1000)
    const totalPerDay = maintenancePerDay + deficit + ls
    const mlPerHour = totalPerDay / 24
    const gttPerMin = (mlPerHour * DROP_FACTORS[equipo]) / 60
    return { mlPerHour, gttPerMin, totalPerDay, deficit, maintenancePerDay }
  }, [weight, rate, dehydration, losses, equipo])

  async function addEntry(direction: FluidDirection, kind: FluidKind, volStr: string) {
    setError(null)
    const vol = parseFloat((volStr || '').replace(',', '.'))
    if (!(vol > 0)) { setError('Informe um volume (mL) maior que zero.'); return }
    setBusy(true)
    const res = await recordFluid({ hospitalization_id: hospitalizationId, direction, kind, volume_ml: vol })
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    if (direction === 'in') setInVolume(''); else setOutVolume('')
    await reload()
  }

  async function remove(id: string) {
    setBusy(true)
    await deleteFluidEntry(id)
    setBusy(false)
    await reload()
  }

  const balance = summary?.balance_ml ?? 0
  const balanceTone = balance > 0 ? 'text-sky-700 bg-sky-50 border-sky-200'
    : balance < 0 ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-slate-700 bg-slate-50 border-slate-200'

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5" data-testid="fluids-tab">

      {/* Saldo Hídrico Final — destaque */}
      <div className={`rounded-2xl border-2 px-4 py-3 ${balanceTone}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">Saldo Hídrico (Entradas − Saídas)</p>
            <p className="text-2xl font-bold tabular-nums">{balance > 0 ? '+' : ''}{Math.round(balance)} mL</p>
          </div>
          <div className="text-right text-xs">
            <p className="flex items-center gap-1 justify-end"><ArrowDownToLine className="h-3 w-3" /> Entradas: <span className="font-bold tabular-nums">{Math.round(summary?.total_in ?? 0)} mL</span></p>
            <p className="flex items-center gap-1 justify-end"><ArrowUpFromLine className="h-3 w-3" /> Saídas: <span className="font-bold tabular-nums">{Math.round(summary?.total_out ?? 0)} mL</span></p>
          </div>
        </div>
        {balance > 0 && <p className="text-[11px] mt-1 opacity-90">⚠ Saldo positivo — atenção a sinais de hiper-hidratação.</p>}
      </div>

      {/* Calculadora */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
          <Calculator className="h-4 w-4 text-cyan-600" /> Calculadora de Fluidoterapia
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Peso <span className="font-normal text-slate-400">kg</span></span>
            <input type="number" inputMode="decimal" step="0.001" value={weight} onChange={e => setWeight(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none" />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Manutenção <span className="font-normal text-slate-400">ml/kg/h</span></span>
            <input type="number" inputMode="decimal" step="0.1" value={rate} onChange={e => setRate(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none" />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Desidratação <span className="font-normal text-slate-400">%</span></span>
            <input type="number" inputMode="decimal" step="1" value={dehydration} onChange={e => setDehydration(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none" />
          </label>
          <label className="block">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Perdas <span className="font-normal text-slate-400">ml/dia</span></span>
            <input type="number" inputMode="decimal" step="1" value={losses} onChange={e => setLosses(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-cyan-500 focus:outline-none" />
          </label>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase">Equipo:</span>
          {(['macro', 'micro'] as const).map(eq => (
            <button key={eq} onClick={() => setEquipo(eq)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition-colors ${equipo === eq ? 'bg-cyan-600 border-cyan-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              {eq === 'macro' ? 'Macro (20 gtt/mL)' : 'Micro (60 gtt/mL)'}
            </button>
          ))}
        </div>
        {calc ? (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-cyan-50 border border-cyan-200 py-2">
              <p className="text-[10px] font-bold text-cyan-700 uppercase">Vazão</p>
              <p className="text-lg font-bold text-cyan-900 tabular-nums">{calc.mlPerHour.toFixed(1)}<span className="text-xs"> ml/h</span></p>
            </div>
            <div className="rounded-xl bg-cyan-50 border border-cyan-200 py-2">
              <p className="text-[10px] font-bold text-cyan-700 uppercase">Gotejamento</p>
              <p className="text-lg font-bold text-cyan-900 tabular-nums">{calc.gttPerMin.toFixed(0)}<span className="text-xs"> gtt/min</span></p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 py-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Total/dia</p>
              <p className="text-lg font-bold text-slate-800 tabular-nums">{calc.totalPerDay.toFixed(0)}<span className="text-xs"> mL</span></p>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-slate-400">Informe peso e taxa de manutenção para calcular ml/h e gotas/min.</p>
        )}
      </div>

      {/* Registro de Entradas e Saídas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Entrada */}
        <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4">
          <h3 className="text-sm font-bold text-sky-800 flex items-center gap-2 mb-2"><ArrowDownToLine className="h-4 w-4" /> Registrar Entrada</h3>
          <div className="flex items-center gap-2">
            <input type="number" inputMode="decimal" step="1" value={inVolume} onChange={e => setInVolume(e.target.value)} placeholder="Volume (mL)"
              className="flex-1 rounded-lg border border-sky-300 px-2.5 py-1.5 text-sm focus:border-sky-500 focus:outline-none" />
            <button onClick={() => addEntry('in', 'fluid', inVolume)} disabled={busy}
              className="flex items-center gap-1 rounded-lg bg-sky-600 hover:bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" /> Entrada
            </button>
          </div>
          <p className="text-[10px] text-sky-700/70 mt-1">Fluido administrado (soro, transfusão, etc.).</p>
        </div>

        {/* Saída */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4">
          <h3 className="text-sm font-bold text-amber-800 flex items-center gap-2 mb-2"><ArrowUpFromLine className="h-4 w-4" /> Registrar Saída</h3>
          <div className="flex items-center gap-2">
            <select value={outKind} onChange={e => setOutKind(e.target.value as FluidKind)}
              className="rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-xs focus:border-amber-500 focus:outline-none">
              {OUT_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
            </select>
            <input type="number" inputMode="decimal" step="1" value={outVolume} onChange={e => setOutVolume(e.target.value)} placeholder="mL"
              className="flex-1 min-w-0 rounded-lg border border-amber-300 px-2.5 py-1.5 text-sm focus:border-amber-500 focus:outline-none" />
            <button onClick={() => addEntry('out', outKind, outVolume)} disabled={busy}
              className="flex items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              <Plus className="h-3.5 w-3.5" /> Saída
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}

      {/* Histórico */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-1"><Droplets className="h-3.5 w-3.5" /> Movimentações</h3>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : !summary || summary.entries.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-4">Nenhuma movimentação hídrica registrada.</p>
        ) : (
          <div className="space-y-1.5">
            {summary.entries.map(e => (
              <div key={e.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full ${e.direction === 'in' ? 'bg-sky-100 text-sky-600' : 'bg-amber-100 text-amber-600'}`}>
                  {e.direction === 'in' ? <ArrowDownToLine className="h-3 w-3" /> : <ArrowUpFromLine className="h-3 w-3" />}
                </span>
                <span className="font-semibold text-slate-700 w-24">{KIND_LABEL[e.kind]}</span>
                <span className="font-bold tabular-nums text-slate-900">{e.direction === 'in' ? '+' : '−'}{Math.round(e.volume_ml)} mL</span>
                <span className="text-slate-400 ml-auto">{fmtTime(e.recorded_at)}</span>
                <button onClick={() => remove(e.id)} disabled={busy} className="text-slate-300 hover:text-rose-500 disabled:opacity-50" title="Remover lançamento">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
