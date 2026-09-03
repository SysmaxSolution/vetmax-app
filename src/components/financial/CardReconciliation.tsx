'use client'

import { useState } from 'react'
import { Loader2, Upload, CheckCircle2, AlertTriangle, HelpCircle, Link2, PlusCircle, Printer, FileDown } from 'lucide-react'
import {
  parseCardStatement, matchCardStatement, reconcileCardInstallments, includeCardMovements,
  detectUnregisteredCards, registerCardsFromStatement,
  type CardMatchResult, type MatchedRow, type StatementRow, type SuggestedCard,
} from '@/lib/actions/card-reconciliation'

const BRL = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const fmtD = (iso: string | null) => { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}` }

type Format = 'csv' | 'sipag_edi' | 'finpet'

export default function CardReconciliation() {
  const [format, setFormat]   = useState<Format>('csv')
  const [result, setResult]   = useState<CardMatchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [including, setIncluding] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [done, setDone]       = useState<string | null>(null)
  // seleção por installment_id; divergentes marcados = aplicar dados do extrato
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // seleção dos "não encontrados" por índice global em result.rows (não têm installment_id)
  const [selectedNf, setSelectedNf] = useState<Set<number>>(new Set())
  // cartões (bandeira/tipo) usados no extrato que não estão cadastrados
  const [unregistered, setUnregistered] = useState<SuggestedCard[]>([])
  const [selCards, setSelCards] = useState<Set<number>>(new Set())
  const [registering, setRegistering] = useState(false)

  async function handleFile(file: File) {
    setError(null); setDone(null); setResult(null); setLoading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      let parsed: StatementRow[]
      if (ext === 'xlsx' || ext === 'xlsm' || ext === 'xls') {
        // relatório de vendas da Sipag (planilha) — parser dedicado no cliente
        const { parseSipagCardXlsx } = await import('@/lib/parsers/sipagCardParser')
        const res = await parseSipagCardXlsx(file)
        if (res.rows.length === 0) { setError(res.errors.join(' ') || 'Nenhuma venda reconhecida na planilha.'); return }
        if (res.errors.length) setError(res.errors.join(' '))
        parsed = res.rows
      } else {
        const text = await file.text()
        const p = await parseCardStatement(text, format)
        if ('error' in p) { setError(p.error); return }
        parsed = p
      }
      if (parsed.length === 0) { setError('Nenhuma linha reconhecida no arquivo.'); return }
      const matched = await matchCardStatement(parsed)
      if ('error' in matched) { setError(matched.error); return }
      setResult(matched)
      // pré-seleciona os vinculados (exatos)
      setSelected(new Set(matched.rows.filter(r => r.status === 'linked' && r.installment_id).map(r => r.installment_id!)))
      setSelectedNf(new Set())
      // detecta cartões (bandeira/tipo) usados no extrato que não estão cadastrados
      const unreg = await detectUnregisteredCards(parsed)
      if (Array.isArray(unreg)) { setUnregistered(unreg); setSelCards(new Set(unreg.map((_, i) => i))) }
    } catch (e) {
      setError(`Falha ao processar: ${(e as Error).message}`)
    } finally { setLoading(false) }
  }

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleNf(gi: number) {
    setSelectedNf(prev => { const n = new Set(prev); n.has(gi) ? n.delete(gi) : n.add(gi); return n })
  }
  // marcar/desmarcar todos de um grupo (vinculados/divergentes → selected por installment_id)
  function toggleAllGroup(status: MatchedRow['status']) {
    if (!result) return
    const ids = result.rows.filter(r => r.status === status && r.installment_id).map(r => r.installment_id!)
    setSelected(prev => { const allIn = ids.length > 0 && ids.every(id => prev.has(id)); const n = new Set(prev); ids.forEach(id => allIn ? n.delete(id) : n.add(id)); return n })
  }
  // marcar/desmarcar todos os não encontrados (selectedNf por índice global)
  function toggleAllNf() {
    if (!result) return
    const gis = result.rows.map((r, i) => ({ r, i })).filter(x => x.r.status === 'not_found').map(x => x.i)
    setSelectedNf(prev => { const allIn = gis.length > 0 && gis.every(i => prev.has(i)); const n = new Set(prev); gis.forEach(i => allIn ? n.delete(i) : n.add(i)); return n })
  }

  // ── relatório prévio (imprimível/salvável) ──
  const GROUP_LABEL: Record<MatchedRow['status'], string> = { linked: 'Vinculado', divergent: 'Divergente', not_found: 'Não encontrado', already: 'Já conciliado' }
  function reportRows() {
    if (!result) return [] as string[][]
    return result.rows.map(r => {
      const st = r.statement
      return [
        GROUP_LABEL[r.status],
        st.nsu ?? '', st.brand ?? '',
        `${st.installment ?? ''}${st.total_installments ? '/' + st.total_installments : ''}`,
        st.gross != null ? st.gross.toFixed(2).replace('.', ',') : '',
        st.net != null ? st.net.toFixed(2).replace('.', ',') : '',
        st.fee != null ? st.fee.toFixed(2).replace('.', ',') : '',
        st.settlement_date ? fmtD(st.settlement_date) : '',
        r.status === 'divergent' ? `difere: ${r.diffs.join(', ')}` : (r.system?.patient_name ?? ''),
      ]
    })
  }
  function downloadReport() {
    const head = ['Situação', 'NSU', 'Bandeira', 'Parcela', 'Bruto', 'Líquido', 'Taxa', 'Repasse', 'Obs.']
    const csv = [head, ...reportRows()].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a')
    a.href = url; a.download = `conciliacao_cartoes_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }
  function printReport() {
    if (!result) return
    const head = ['Situação', 'NSU', 'Bandeira', 'Parc.', 'Bruto', 'Líquido', 'Taxa', 'Repasse', 'Obs.']
    const s = result.summary
    const w = window.open('', '_blank'); if (!w) return
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório de Conciliação de Cartões</title>
      <style>body{font-family:system-ui,Arial,sans-serif;padding:24px;color:#0f172a}h1{font-size:18px;margin:0 0 4px}
      .sub{color:#64748b;font-size:12px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:11px}
      th,td{border:1px solid #e2e8f0;padding:4px 6px;text-align:left}th{background:#f1f5f9}
      .r{text-align:right}.tot{margin:12px 0;font-size:12px}</style></head><body>
      <h1>Relatório de Conciliação de Cartões</h1>
      <div class="sub">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
      <div class="tot"><b>${s.total}</b> lançamentos · Vinculados <b>${s.linked}</b> · Divergentes <b>${s.divergent}</b> · Não encontrados <b>${s.not_found}</b> · Já conciliados <b>${s.already}</b></div>
      <table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
      ${reportRows().map(row => `<tr>${row.map((c, i) => `<td class="${i >= 4 && i <= 6 ? 'r' : ''}">${c}</td>`).join('')}</tr>`).join('')}
      </tbody></table></body></html>`)
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
  }

  async function handleInclude(reconcile: boolean) {
    if (!result || including || selectedNf.size === 0) return
    setIncluding(true); setError(null)
    const rowsToInc = [...selectedNf].map(gi => result.rows[gi]?.statement).filter(Boolean) as CardMatchResult['rows'][number]['statement'][]
    const res = await includeCardMovements(rowsToInc, { reconcile })
    setIncluding(false)
    if ('error' in res) { setError(res.error); return }
    setDone(reconcile
      ? `${res.included} título(s) incluído(s) na movimentação e conciliado(s).`
      : `${res.included} título(s) incluído(s) na movimentação de cartões (pendentes, veja em Financeiro › Cartões).`)
    setResult(null); setSelected(new Set()); setSelectedNf(new Set())
  }

  async function handleRegisterCards() {
    const chosen = [...selCards].map(i => unregistered[i]).filter(Boolean)
    if (!chosen.length || registering) return
    setRegistering(true); setError(null)
    const res = await registerCardsFromStatement(chosen)
    setRegistering(false)
    if ('error' in res) { setError(res.error); return }
    setDone(`${res.created} cartão(ões) cadastrado(s) a partir do extrato.`)
    setUnregistered([]); setSelCards(new Set())
  }

  async function handleReconcile() {
    if (!result || reconciling || selected.size === 0) return
    setReconciling(true); setError(null)
    const items = result.rows
      .filter(r => r.installment_id && selected.has(r.installment_id) && (r.status === 'linked' || r.status === 'divergent'))
      .map(r => ({
        installment_id: r.installment_id!,
        settled_net: r.statement.net ?? r.system?.net ?? 0,
        settlement_date: r.statement.settlement_date ?? null,
        apply_statement: r.status === 'divergent'
          ? { gross: r.statement.gross ?? undefined, net: r.statement.net ?? undefined, fee: r.statement.fee ?? undefined, brand: r.statement.brand ?? undefined }
          : null,
      }))
    const res = await reconcileCardInstallments(items)
    setReconciling(false)
    if ('error' in res) { setError(res.error); return }
    setDone(`${res.reconciled} título(s) conciliado(s) e baixado(s).`)
    setResult(null); setSelected(new Set())
  }

  const STYLE: Record<MatchedRow['status'], { card: string; text: string; header: string }> = {
    linked:    { card: 'border-emerald-200 bg-emerald-50/50', text: 'text-emerald-700', header: 'bg-emerald-50/50 text-emerald-800' },
    divergent: { card: 'border-amber-200 bg-amber-50/50',     text: 'text-amber-700',   header: 'bg-amber-50/50 text-amber-800' },
    not_found: { card: 'border-rose-200 bg-rose-50/50',       text: 'text-rose-700',    header: 'bg-rose-50/50 text-rose-800' },
    already:   { card: 'border-slate-200 bg-slate-50/50',     text: 'text-slate-600',   header: 'bg-slate-50 text-slate-700' },
  }
  const groups: { key: MatchedRow['status']; label: string; icon: any }[] = [
    { key: 'linked',    label: 'Vinculados',      icon: CheckCircle2 },
    { key: 'divergent', label: 'Divergentes',     icon: AlertTriangle },
    { key: 'not_found', label: 'Não encontrados', icon: HelpCircle },
    { key: 'already',   label: 'Já conciliados',  icon: Link2 },
  ]

  return (
    <div className="space-y-4">
      {/* Importação */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Formato:</span>
          <select value={format} onChange={e => setFormat(e.target.value as Format)}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
            <option value="csv">Auto (CSV / Sipag XLSX)</option>
            <option value="sipag_edi">Sipag (EDI/CSV)</option>
            <option value="finpet">FinPet</option>
          </select>
        </div>
        <label className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 cursor-pointer">
          <Upload className="h-4 w-4" /> Importar extrato da adquirente
          <input type="file" accept=".csv,.txt,.ret,.edi,.ofx,.xlsx,.xlsm,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = '' }} />
        </label>
        <span className="text-[11px] text-slate-400">API da adquirente entra depois (mesma tela).</span>
      </div>

      {loading && <div className="p-6 flex items-center justify-center gap-2 text-slate-400 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Cruzando o extrato com o sistema…</div>}
      {error && <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-700">{error}</div>}
      {done && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> {done}</div>}

      {/* Cartões não cadastrados detectados no extrato — "amarra a ponta do cadastro" */}
      {unregistered.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            <p className="text-sm font-semibold">{unregistered.length} cartão(ões) usado(s) no extrato não estão cadastrados. Deseja cadastrar?</p>
          </div>
          <div className="space-y-1.5">
            {unregistered.map((c, i) => (
              <label key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-amber-900">
                <input type="checkbox" checked={selCards.has(i)} onChange={() => setSelCards(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })} />
                <span className="font-semibold">{c.acquirer} · {c.brand} · {c.method === 'debit' ? 'Débito' : 'Crédito'}</span>
                <span className="text-amber-700">taxa média {c.fee_percent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}% · repasse {c.settlement_days}d · até {c.max_installments}x · {c.count} lançamento(s)</span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleRegisterCards} disabled={registering || selCards.size === 0}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2">
              {registering ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />} Cadastrar selecionados ({selCards.size})
            </button>
            <button onClick={() => setUnregistered([])} className="text-xs text-amber-700 hover:text-amber-900">Ignorar por agora</button>
          </div>
          <p className="text-[11px] text-amber-700">Taxa, prazo de repasse e nº de parcelas foram pré-calculados do próprio extrato — ajuste depois em Cadastros › Cartões se precisar.</p>
        </div>
      )}

      {result && (
        <>
          {/* Relatório prévio (resumo + legenda) — imprimível/salvável ANTES de conciliar */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-bold text-slate-700">Relatório prévio da conciliação</h3>
            <div className="flex items-center gap-2">
              <button onClick={printReport} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Printer className="h-3.5 w-3.5" /> Imprimir</button>
              <button onClick={downloadReport} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><FileDown className="h-3.5 w-3.5" /> Salvar (CSV)</button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {groups.map(g => {
              const n = result.summary[g.key]
              const Icon = g.icon
              return (
                <div key={g.key} className={`rounded-xl border px-4 py-3 ${STYLE[g.key].card}`}>
                  <div className={`flex items-center gap-1.5 ${STYLE[g.key].text}`}><Icon className="h-3.5 w-3.5" /><span className="text-[11px] font-semibold uppercase tracking-wide">{g.label}</span></div>
                  <p className={`text-xl font-bold tabular-nums ${STYLE[g.key].text}`}>{n}</p>
                </div>
              )
            })}
          </div>

          {/* Grupos */}
          {groups.map(g => {
            const rows = result.rows.filter(r => r.status === g.key)
            if (rows.length === 0) return null
            const selectable = g.key === 'linked' || g.key === 'divergent' || g.key === 'not_found'
            return (
              <div key={g.key} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className={`px-4 py-2 border-b border-slate-100 flex items-center justify-between ${STYLE[g.key].header}`}>
                  <span className="text-xs font-bold uppercase tracking-wide">{g.label} · {rows.length}</span>
                  {selectable && (
                    <button onClick={() => g.key === 'not_found' ? toggleAllNf() : toggleAllGroup(g.key)}
                      className="text-[11px] font-semibold underline decoration-dotted hover:opacity-80">Marcar todos</button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase">
                      <tr>
                        {selectable && <th className="px-3 py-2 w-8"></th>}
                        <th className="text-left px-3 py-2">NSU</th>
                        <th className="text-left px-3 py-2">Bandeira</th>
                        <th className="text-left px-3 py-2">Parc.</th>
                        <th className="text-right px-3 py-2">Bruto</th>
                        <th className="text-right px-3 py-2">Líquido</th>
                        <th className="text-right px-3 py-2">Taxa</th>
                        <th className="text-left px-3 py-2">Repasse</th>
                        <th className="text-left px-3 py-2">{g.key === 'not_found' ? '—' : 'Pet / Obs.'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((r, i) => {
                        const st = r.statement
                        const gi = result.rows.indexOf(r)
                        return (
                          <tr key={i} className="hover:bg-slate-50/50">
                            {selectable && <td className="px-3 py-2">
                              {g.key === 'not_found'
                                ? <input type="checkbox" checked={selectedNf.has(gi)} onChange={() => toggleNf(gi)} />
                                : <input type="checkbox" checked={r.installment_id ? selected.has(r.installment_id) : false} onChange={() => r.installment_id && toggle(r.installment_id)} />}
                            </td>}
                            <td className="px-3 py-2 font-mono">{st.nsu ?? '—'}</td>
                            <td className="px-3 py-2">{st.brand ?? '—'}</td>
                            <td className="px-3 py-2 tabular-nums">{st.installment ?? '—'}{st.total_installments ? `/${st.total_installments}` : ''}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{BRL(st.gross)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{BRL(st.net)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-rose-600">{BRL(st.fee)}</td>
                            <td className="px-3 py-2 font-mono">{fmtD(st.settlement_date)}</td>
                            <td className="px-3 py-2 text-slate-500">
                              {g.key === 'divergent' && r.diffs.length > 0
                                ? <span className="text-amber-700">difere: {r.diffs.join(', ')} · sistema {BRL(r.system?.net ?? null)}</span>
                                : (r.system?.patient_name ?? (g.key === 'not_found' ? 'sem correspondência no sistema' : '—'))}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {/* Ação */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs text-slate-500">
              {selected.size} vinculado(s)/divergente(s) para conciliar. Divergentes serão atualizados com os dados do extrato.
              {selectedNf.size > 0 && <> · {selectedNf.size} não encontrado(s) para incluir na movimentação.</>}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {selectedNf.size > 0 && (
                <>
                  <button onClick={() => handleInclude(false)} disabled={including}
                    className="rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 flex items-center gap-2">
                    {including ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />} Incluir na movimentação ({selectedNf.size})
                  </button>
                  <button onClick={() => handleInclude(true)} disabled={including}
                    className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2">
                    {including ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />} Incluir e conciliar ({selectedNf.size})
                  </button>
                </>
              )}
              <button onClick={handleReconcile} disabled={reconciling || selected.size === 0}
                className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
                {reconciling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Conciliar selecionados
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
