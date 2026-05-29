'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, Pencil, X, Trash2, Receipt, CheckCircle2 } from 'lucide-react'
import {
  listDailyRates, createDailyRate, updateDailyRate, deleteDailyRate,
  type DailyRate, type CareLevel, type AnimalSize,
} from '@/lib/actions/hospitalization-rates'

/**
 * Cadastro de tarifas de diária por (categoria, espécie, porte). O cron de
 * diárias da Internação resolve a tarifa em cascata: mais específico primeiro,
 * depois curinga (species/size NULL), depois fallback p/ rooms.daily_rate.
 */

const CATEGORIES: { value: CareLevel; label: string }[] = [
  { value: 'enfermaria',     label: 'Enfermaria' },
  { value: 'semi_intensiva', label: 'Semi-Intensiva' },
  { value: 'uti',            label: 'UTI' },
  { value: 'isolamento',     label: 'Isolamento' },
]
const SIZES: { value: AnimalSize; label: string }[] = [
  { value: 'small',  label: 'Pequeno' },
  { value: 'medium', label: 'Médio' },
  { value: 'large',  label: 'Grande' },
]
const CAT_LABEL: Record<CareLevel, string> = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label])) as Record<CareLevel, string>
const SIZE_LABEL: Record<AnimalSize, string> = Object.fromEntries(SIZES.map(s => [s.value, s.label])) as Record<AnimalSize, string>

function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

interface Draft { id?: string; category: CareLevel; species: string; size: '' | AnimalSize; rate: string; active: boolean }

export default function RatesTab() {
  const [rates, setRates] = useState<DailyRate[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  async function reload() {
    const res = await listDailyRates()
    if (Array.isArray(res)) setRates(res)
    setLoading(false)
  }
  useEffect(() => { void reload() }, [])

  function newDraft() {
    setError(null)
    setDraft({ category: 'enfermaria', species: '', size: '', rate: '', active: true })
  }
  function editDraft(r: DailyRate) {
    setError(null)
    setDraft({ id: r.id, category: r.category, species: r.species ?? '', size: r.size ?? '', rate: String(r.rate), active: r.active })
  }

  async function save() {
    if (!draft) return
    const rate = parseFloat((draft.rate || '0').replace(',', '.'))
    if (!(rate >= 0)) { setError('Tarifa inválida.'); return }
    setBusy(true); setError(null)
    const payload = { category: draft.category, species: draft.species.trim() || null, size: draft.size || null, rate }
    const res = draft.id
      ? await updateDailyRate(draft.id, { ...payload, active: draft.active })
      : await createDailyRate(payload)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    setDraft(null); await reload()
  }

  async function remove(id: string) {
    if (!confirm('Remover esta tarifa? O cron passará a usar a próxima da cascata.')) return
    setBusy(true); await deleteDailyRate(id); setBusy(false); await reload()
  }

  return (
    <div className="space-y-4" data-testid="rates-tab">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Tarifas de diária por (categoria, espécie, porte). Cascata: mais específico → curinga → diária do box.</p>
        <button onClick={newDraft} data-testid="rate-new"
          className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" /> Nova Tarifa
        </button>
      </div>

      {draft && (
        <div className="rounded-2xl border-2 border-teal-200 bg-teal-50/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">{draft.id ? 'Editar' : 'Nova'} Tarifa</h3>
            <button onClick={() => setDraft(null)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Categoria</span>
              <select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value as CareLevel })}
                className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none">
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Espécie (vazio = todas)</span>
              <input value={draft.species} onChange={e => setDraft({ ...draft, species: e.target.value })} placeholder="Ex.: dog, cat"
                className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Porte (vazio = todos)</span>
              <select value={draft.size} onChange={e => setDraft({ ...draft, size: e.target.value as Draft['size'] })}
                className="mt-0.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none">
                <option value="">Todos</option>
                {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Diária (R$)</span>
              <input type="number" min="0" step="0.01" value={draft.rate} onChange={e => setDraft({ ...draft, rate: e.target.value })} placeholder="Ex.: 350,00"
                className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
            </label>
          </div>
          {draft.id && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} />
              Ativa
            </label>
          )}
          {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
          <button onClick={save} disabled={busy} data-testid="rate-save"
            className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Salvar
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : rates.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center">
          <Receipt className="h-10 w-10 text-slate-200 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-500">Nenhuma tarifa cadastrada</p>
          <p className="text-xs text-slate-400 mt-1">Sem tarifas, o cron usa rooms.daily_rate (comportamento legado).</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {rates.map(r => (
            <div key={r.id} data-testid={`rate-row-${r.id}`} className={`flex items-center gap-3 rounded-xl border bg-white px-4 py-3 ${r.active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><Receipt className="h-4 w-4" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{CAT_LABEL[r.category]} {r.species && <span className="text-slate-400">· {r.species}</span>} {r.size && <span className="text-slate-400">· {SIZE_LABEL[r.size]}</span>}</p>
                <p className="text-[11px] text-slate-500"><span className="font-bold text-emerald-700 tabular-nums">{fmtBRL(r.rate)}</span> por diária{!r.active && <span className="ml-2 text-slate-400">• Inativa</span>}</p>
              </div>
              <button onClick={() => editDraft(r)} disabled={busy} className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => remove(r.id)} disabled={busy} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
