'use client'

import { useState } from 'react'
import { Loader2, Upload, CheckCircle2, XCircle, PlusCircle, CalendarClock, FileDown } from 'lucide-react'
import { parseDdaCsv } from '@/lib/parsers/ddaParser'
import {
  matchDdaBoletos, insertPayablesFromDda, schedulePayments, generatePagforRemittance,
  type DdaBoleto, type DdaMatchResult,
} from '@/lib/actions/pagfor'

const BRL = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const fmtD = (iso: string | null) => { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}` }

export default function PagforTab() {
  const [parsed, setParsed]   = useState<DdaBoleto[]>([])
  const [result, setResult]   = useState<DdaMatchResult | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [scheduleDate, setScheduleDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy]       = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [done, setDone]       = useState<string | null>(null)

  async function runMatch(boletos: DdaBoleto[]) {
    const res = await matchDdaBoletos(boletos)
    if ('error' in res) { setError(res.error); return }
    setResult(res); setSelected(new Set())
  }

  async function handleFile(file: File) {
    setError(null); setDone(null); setResult(null); setLoading(true)
    try {
      const text = await file.text()
      const { rows, errors } = parseDdaCsv(text)
      if (rows.length === 0) { setError(errors.join(' ') || 'Nenhum boleto reconhecido.'); return }
      if (errors.length) setError(errors.join(' '))
      setParsed(rows)
      await runMatch(rows)
    } catch (e) { setError(`Falha ao processar: ${(e as Error).message}`) }
    finally { setLoading(false) }
  }

  function toggle(i: number) {
    setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  }

  const selRows = () => [...selected].map(i => result?.rows[i]).filter(Boolean) as NonNullable<DdaMatchResult['rows'][number]>[]
  const selRed = () => selRows().filter(r => r.status === 'not_in_system')
  const selGreenIds = () => selRows().filter(r => r.entry_id).map(r => r.entry_id!) as string[]

  async function handleInsert() {
    const red = selRed(); if (!red.length) return
    setBusy('insert'); setError(null)
    const res = await insertPayablesFromDda(red.map(r => r.boleto))
    setBusy(null)
    if ('error' in res) { setError(res.error); return }
    setDone(`${res.inserted} título(s) lançado(s) em contas a pagar.`)
    await runMatch(parsed)
  }

  async function handleSchedule() {
    const ids = selGreenIds(); if (!ids.length) { setError('Selecione títulos já lançados (verdes) para agendar.'); return }
    setBusy('schedule'); setError(null)
    const res = await schedulePayments({ entry_ids: ids, scheduled_date: scheduleDate || null })
    setBusy(null)
    if ('error' in res) { setError(res.error); return }
    setDone(`${res.scheduled} pagamento(s) agendado(s)${scheduleDate ? ` para ${fmtD(scheduleDate)}` : ' no vencimento'}.`)
    await runMatch(parsed)
  }

  async function handleRemittance() {
    const ids = selGreenIds(); if (!ids.length) { setError('Selecione títulos lançados (verdes) para gerar a remessa.'); return }
    setBusy('remit'); setError(null)
    const res = await generatePagforRemittance(ids)
    setBusy(null)
    if ('error' in res) { setError(res.error); return }
    const blob = new Blob([res.content], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = res.filename; a.click(); URL.revokeObjectURL(url)
    setDone(`Remessa gerada com ${res.count} pagamento(s). CNAB 240 / API do banco entram com o convênio.`)
  }

  return (
    <div className="space-y-4">
      {/* Importar DDA */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 cursor-pointer">
          <Upload className="h-4 w-4" /> Importar DDA (boletos contra o CNPJ)
          <input type="file" accept=".csv,.txt,.ret" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = '' }} />
        </label>
        <span className="text-[11px] text-slate-400">Verde = já lançado · Vermelho = falta lançar. CNAB/API do banco entram com o convênio.</span>
      </div>

      {loading && <div className="p-6 flex items-center justify-center gap-2 text-slate-400 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Cruzando o DDA com contas a pagar…</div>}
      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-700">{error}</div>}
      {done && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {done}</div>}

      {result && (
        <>
          {/* resumo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3">
              <div className="flex items-center gap-1.5 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /><span className="text-[11px] font-semibold uppercase tracking-wide">Já no sistema</span></div>
              <p className="text-xl font-bold tabular-nums text-emerald-700">{result.summary.in_system}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3">
              <div className="flex items-center gap-1.5 text-rose-700"><XCircle className="h-3.5 w-3.5" /><span className="text-[11px] font-semibold uppercase tracking-wide">Não lançados</span></div>
              <p className="text-xl font-bold tabular-nums text-rose-700">{result.summary.not_in_system}</p>
            </div>
          </div>

          {/* tabela */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 w-8"></th>
                    <th className="text-left px-3 py-2">Beneficiário</th>
                    <th className="text-left px-3 py-2">Documento</th>
                    <th className="text-left px-3 py-2">Código de barras</th>
                    <th className="text-right px-3 py-2">Valor</th>
                    <th className="text-left px-3 py-2">Vencimento</th>
                    <th className="text-left px-3 py-2">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.rows.map((r, i) => {
                    const green = r.status === 'in_system'
                    return (
                      <tr key={i} className={green ? 'bg-emerald-50/40' : 'bg-rose-50/40'}>
                        <td className="px-3 py-2"><input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} /></td>
                        <td className="px-3 py-2 font-medium text-slate-700">{r.boleto.beneficiary ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{r.boleto.document ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-slate-400">{r.boleto.barcode ? r.boleto.barcode.replace(/\D/g, '').slice(0, 12) + '…' : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-700">{BRL(r.boleto.amount)}</td>
                        <td className="px-3 py-2 font-mono">{fmtD(r.boleto.due_date)}</td>
                        <td className="px-3 py-2">
                          {green
                            ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3 w-3" /> no sistema{r.entry_scheduled ? ` · agendado ${fmtD(r.entry_scheduled)}` : ''}</span>
                            : <span className="inline-flex items-center gap-1 text-rose-700"><XCircle className="h-3 w-3" /> não lançado</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ações */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <label className="text-[11px] text-slate-500">Pagar em:</label>
              <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <span className="text-[10px] text-slate-400">(vazio = no vencimento)</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={handleInsert} disabled={busy !== null || selRed().length === 0}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2">
                {busy === 'insert' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />} Lançar selecionados
              </button>
              <button onClick={handleSchedule} disabled={busy !== null || selGreenIds().length === 0}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                {busy === 'schedule' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} Agendar pagamento
              </button>
              <button onClick={handleRemittance} disabled={busy !== null || selGreenIds().length === 0}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
                {busy === 'remit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Gerar remessa
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
