'use client'

import { useState, useEffect } from 'react'
import { Loader2, Plus, Trash2, Link2, Sparkles, ArrowRight } from 'lucide-react'
import {
  listAnalytes, upsertAnalyte, deleteAnalyte, listMappings, upsertMapping, deleteMapping,
  listUnmappedCodes, seedDefaultAnalytes,
  type Analyte, type Mapping, type UnmappedCode,
} from '@/lib/actions/lab-analytes'

export default function AnalyteMappingPanel() {
  const [analytes, setAnalytes] = useState<Analyte[]>([])
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [unmapped, setUnmapped] = useState<UnmappedCode[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [na, setNa] = useState({ code: '', name: '', unit: '', panel: '' })

  async function reload() {
    const [a, m, u] = await Promise.all([listAnalytes(), listMappings(), listUnmappedCodes()])
    setAnalytes(a); setMappings(m); setUnmapped(u); setLoading(false)
  }
  useEffect(() => { reload() }, [])

  async function seed() { setBusy('seed'); await seedDefaultAnalytes(); setBusy(null); reload() }
  async function addAnalyte() {
    if (!na.code.trim() || !na.name.trim()) { setError('Código e nome obrigatórios.'); return }
    setBusy('na'); setError(null)
    const r = await upsertAnalyte(na); setBusy(null)
    if ('error' in r) { setError(r.error); return }
    setNa({ code: '', name: '', unit: '', panel: '' }); reload()
  }
  async function delAnalyte(id: string) { setBusy(id); await deleteAnalyte(id); setBusy(null); reload() }
  async function map(deviceCode: string | null, deviceName: string, analyteId: string) {
    if (!analyteId) return
    setBusy('map:' + (deviceCode ?? deviceName)); setError(null)
    const r = await upsertMapping({ deviceCode: deviceCode ?? undefined, deviceName, analyteId }); setBusy(null)
    if ('error' in r) { setError(r.error); return }
    reload()
  }
  async function delMap(id: string) { setBusy(id); await deleteMapping(id); setBusy(null); reload() }

  if (loading) return <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>

  const inp = 'rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm'
  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-rose-600">{error}</p>}

      {/* Códigos recebidos sem mapeamento (auto-descoberta) */}
      {unmapped.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5"><Sparkles className="h-4 w-4" />Códigos recebidos sem mapeamento ({unmapped.length})</p>
          <p className="text-[11px] text-amber-600 mb-3">O aparelho enviou estes códigos; ligue cada um a um analito do catálogo.</p>
          <div className="space-y-2">
            {unmapped.map(u => (
              <div key={`${u.code}|${u.name}`} className="flex items-center gap-2 rounded-lg bg-white border border-amber-100 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-xs text-slate-700">{u.code ?? '—'}</span>
                  <span className="text-slate-400 text-xs"> · {u.name}{u.unit ? ` (${u.unit})` : ''} · {u.count}×</span>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                <select defaultValue="" onChange={e => map(u.code, u.name, e.target.value)} className={inp}>
                  <option value="" disabled>Ligar a…</option>
                  {analytes.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Catálogo de analitos */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-slate-700">Catálogo de analitos ({analytes.length})</p>
          {analytes.length === 0 && <button onClick={seed} disabled={busy === 'seed'} className="text-xs text-emerald-700 flex items-center gap-1 hover:underline">{busy === 'seed' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}Semear comuns (hemograma + bioquímico)</button>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {analytes.map(a => (
            <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
              <span className="text-slate-700"><span className="font-mono text-xs text-slate-500">{a.code}</span> · {a.name}{a.unit ? <span className="text-slate-400"> ({a.unit})</span> : ''}{a.panel ? <span className="text-slate-300 text-xs"> · {a.panel}</span> : ''}</span>
              <button onClick={() => delAnalyte(a.id)} className="text-slate-300 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input value={na.code} onChange={e => setNa(s => ({ ...s, code: e.target.value }))} placeholder="Código (WBC)" className={`${inp} w-28`} />
          <input value={na.name} onChange={e => setNa(s => ({ ...s, name: e.target.value }))} placeholder="Nome (Leucócitos)" className={`${inp} flex-1 min-w-[140px]`} />
          <input value={na.unit} onChange={e => setNa(s => ({ ...s, unit: e.target.value }))} placeholder="Unidade" className={`${inp} w-24`} />
          <input value={na.panel} onChange={e => setNa(s => ({ ...s, panel: e.target.value }))} placeholder="Painel" className={`${inp} w-28`} />
          <button onClick={addAnalyte} disabled={busy === 'na'} className="rounded-lg bg-slate-800 text-white px-2.5 py-1.5 text-sm hover:bg-slate-700 flex items-center gap-1">{busy === 'na' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}</button>
        </div>
      </div>

      {/* De-para existente */}
      {mappings.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5"><Link2 className="h-4 w-4 text-slate-400" />Mapeamentos ({mappings.length})</p>
          <div className="space-y-1.5">
            {mappings.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                <span className="text-slate-600"><span className="font-mono text-xs">{m.deviceCode ?? m.deviceName}</span> <ArrowRight className="inline h-3 w-3 text-slate-300" /> {m.analyteName}</span>
                <button onClick={() => delMap(m.id)} className="text-slate-300 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
