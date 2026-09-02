'use client'

import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import {
  listClinicTutorCredits, listTutorCredits,
  type ClinicCreditSummary, type TutorCreditMovement,
} from '@/lib/actions/tutor-credits'

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(',', '')

type Filter = 'all' | 'open' | 'used'

export default function CreditsTab() {
  const [rows, setRows]       = useState<ClinicCreditSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<Filter>('all')
  const [search, setSearch]   = useState('')
  const [detail, setDetail]   = useState<{ tutor: ClinicCreditSummary; mode: 'in' | 'out' } | null>(null)

  useEffect(() => {
    listClinicTutorCredits().then(r => { if (!('error' in r)) setRows(r); setLoading(false) })
  }, [])

  const filtered = rows
    .filter(r => filter === 'all' ? true : filter === 'open' ? r.available > 0.005 : (r.available <= 0.005 && r.total_used > 0.005))
    .filter(r => !search.trim() || r.tutor_name.toLowerCase().includes(search.trim().toLowerCase()))
  const totals = filtered.reduce((a, r) => ({ ins: a.ins + r.total_inserted, used: a.used + r.total_used, avail: a.avail + r.available }), { ins: 0, used: 0, avail: 0 })

  if (loading) return <div className="p-8 flex items-center justify-center gap-2 text-slate-400 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Carregando créditos…</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex gap-2">
          {([['all', 'Todos'], ['open', 'Em aberto'], ['used', 'Utilizados']] as [Filter, string][]).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === v ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}</button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente…"
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm w-56 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total inserido"  value={totals.ins}   color="text-slate-800" />
        <Stat label="Total utilizado" value={totals.used}  color="text-rose-600" />
        <Stat label="Disponível"      value={totals.avail} color="text-emerald-600" />
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5">Cliente</th>
              <th className="text-right px-4 py-2.5">Total inserido</th>
              <th className="text-right px-4 py-2.5">Total utilizado</th>
              <th className="text-right px-4 py-2.5">Disponível</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Nenhum crédito de cliente neste filtro.</td></tr>}
            {filtered.map(r => (
              <tr key={r.tutor_id} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 text-slate-800 font-medium">{r.tutor_name}</td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => setDetail({ tutor: r, mode: 'in' })} title="Ver de onde vieram os créditos"
                    className="font-mono tabular-nums font-semibold text-slate-700 hover:text-teal-700 hover:underline">{BRL(r.total_inserted)}</button>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => setDetail({ tutor: r, mode: 'out' })} title="Ver onde os créditos foram usados"
                    className="font-mono tabular-nums font-semibold text-rose-600 hover:text-rose-800 hover:underline">{BRL(r.total_used)}</button>
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-emerald-700">{BRL(r.available)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && <DetailModal tutor={detail.tutor} mode={detail.mode} onClose={() => setDetail(null)} />}
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold font-mono tabular-nums ${color}`}>{BRL(value)}</p>
    </div>
  )
}

function DetailModal({ tutor, mode, onClose }: { tutor: ClinicCreditSummary; mode: 'in' | 'out'; onClose: () => void }) {
  const [movs, setMovs]       = useState<TutorCreditMovement[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { listTutorCredits(tutor.tutor_id).then(r => { if (!('error' in r)) setMovs(r); setLoading(false) }) }, [tutor.tutor_id])
  const isIn = mode === 'in'
  // Só entradas/usos reais — transfer_in/transfer_out são internos (entre CNPJs).
  const list = movs.filter(m => isIn ? m.kind === 'advance' : m.kind === 'usage')
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl my-4 flex flex-col max-h-[90vh]">
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-900">{isIn ? 'Créditos inseridos' : 'Créditos utilizados'}</h3>
            <p className="text-xs text-slate-500">{tutor.tutor_name}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">
          {loading
            ? <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
            : list.length === 0
              ? <p className="text-slate-400 text-sm text-center py-4">Nenhum movimento.</p>
              : <ul className="divide-y divide-slate-100">
                  {list.map(m => (
                    <li key={m.id} className="py-2.5 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-800">{m.reference ?? m.kind}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{fmtDate(m.created_at)}</p>
                      </div>
                      <span className={`text-sm font-bold font-mono tabular-nums flex-shrink-0 ${isIn ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {isIn ? '+' : '−'}{BRL(Math.abs(Number(m.amount)))}
                      </span>
                    </li>
                  ))}
                </ul>}
        </div>
      </div>
    </div>
  )
}
