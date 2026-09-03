'use client'

import { useState, useRef, useTransition, useEffect, useMemo } from 'react'
import {
  BankAccount, BankStatement, ReconciliationBatch, AutoLinkResult, ReconcCandidate,
  importStatements, listBatchStatements, getBBStatement,
  persistAutoLinks, unlinkStatement, listReconcCandidates,
  reconcileStatements, settleOpenEntryAndLink, insertEntryFromStatement, finalizeReconciliation,
} from '@/lib/actions/financial'
import { parseFile } from '@/lib/parsers/bankStatementParser'
import {
  Upload, RefreshCcw, CheckCircle2, AlertTriangle, Circle, Link2, Link2Off,
  Building2, FileText, Ban, PlusCircle, Sparkles, Search, Settings2,
} from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string) => { if (!d) return '—'; const [y, m, day] = d.slice(0, 10).split('-'); return `${day}/${m}/${y}` }

interface Props { bankAccounts: BankAccount[] }

export default function ConciliacaoTab({ bankAccounts }: Props) {
  const defaultAccount = bankAccounts.find(b => b.is_default) ?? bankAccounts[0]

  const [selectedBank, setSelectedBank] = useState<string>(defaultAccount?.id ?? '')
  const [batch, setBatch]         = useState<ReconciliationBatch | null>(null)
  const [imported, setImported]   = useState<BankStatement[]>([])
  const [candidates, setCandidates] = useState<{ paid: ReconcCandidate[]; open: ReconcCandidate[] }>({ paid: [], open: [] })
  const [matchResult, setMatchResult] = useState<AutoLinkResult | null>(null)
  const [period, setPeriod]       = useState<{ start: string; end: string } | null>(null)

  // amarração: linha do extrato selecionada + cache de títulos vistos (p/ exibir vinculados)
  const [selectedStmt, setSelectedStmt] = useState<string | null>(null)
  const [entryCache, setEntryCache] = useState<Map<string, ReconcCandidate>>(new Map())
  const [ignored, setIgnored]     = useState<Set<string>>(new Set())   // ignorar = local à sessão
  const [showOpen, setShowOpen]   = useState(false)                    // F3(a): mostrar títulos em aberto
  const [search, setSearch]       = useState('')

  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isBBLoading, setIsBBLoading] = useState(false)
  const [isFinalizing, setIsFinalizing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const cacheEntry = (c: ReconcCandidate) => setEntryCache(prev => { const n = new Map(prev); n.set(c.id, c); return n })

  // ── carga de candidatos ──
  async function loadCandidates(start: string, end: string) {
    const res = await listReconcCandidates({ bank_account_id: selectedBank, start_date: start, end_date: end })
    if ('error' in res) { setErrorMsg(res.error); return }
    setCandidates(res)
    setEntryCache(prev => { const n = new Map(prev);[...res.paid, ...res.open].forEach(c => n.set(c.id, c)); return n })
  }

  async function reloadStatements(batchId: string) {
    const res = await listBatchStatements(batchId)
    if (!('error' in res)) setImported(res)
  }

  // ── upload + auto-amarração persistida ──
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedBank) return
    setErrorMsg(null); setSuccessMsg(null); setParseErrors([]); setBatch(null)
    setImported([]); setMatchResult(null); setIgnored(new Set()); setSelectedStmt(null)

    const parsed = await parseFile(file)
    setParseErrors(parsed.errors)
    if (!parsed.statements.length) { setErrorMsg('Nenhum lançamento encontrado no arquivo.'); return }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'unknown'
    const source = ['ofx', 'csv', 'txt', 'xlsx', 'xls'].includes(ext) ? ext : 'unknown'
    const dates = parsed.statements.map(s => s.date).sort()
    const start = dates[0], end = dates[dates.length - 1]
    setPeriod({ start, end })

    startTransition(async () => {
      const res = await importStatements({ bank_account_id: selectedBank, source, statements: parsed.statements })
      if ('error' in res) { setErrorMsg(res.error); return }
      setBatch(res)
      await loadCandidates(start, end)
      const auto = await persistAutoLinks(res.id)                     // amarra automaticamente e persiste
      if (!('error' in auto)) { setMatchResult(auto); auto.linked.forEach(l => cacheEntry(l.candidate)) }
      await reloadStatements(res.id)
      await loadCandidates(start, end)
      setSuccessMsg(`${parsed.statements.length} lançamentos importados. ${'error' in auto ? '' : auto.linked.length + ' vinculados automaticamente.'}`)
    })
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleBBImport() {
    if (!selectedBank) return
    setIsBBLoading(true); setErrorMsg(null); setSuccessMsg(null)
    const today = new Date().toISOString().slice(0, 10)
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const bb = await getBBStatement({ account_id: selectedBank, start_date: monthAgo, end_date: today })
    if ('error' in bb) { setErrorMsg(bb.error); setIsBBLoading(false); return }
    setPeriod({ start: monthAgo, end: today })
    const res = await importStatements({
      bank_account_id: selectedBank, source: 'bb_api',
      statements: bb.map(s => ({ external_id: s.external_id ?? undefined, date: s.date, amount: s.amount, description: s.description, type: s.type })),
    })
    if ('error' in res) { setErrorMsg(res.error) }
    else {
      setBatch(res); setIgnored(new Set()); setSelectedStmt(null)
      await loadCandidates(monthAgo, today)
      const auto = await persistAutoLinks(res.id)
      if (!('error' in auto)) { setMatchResult(auto); auto.linked.forEach(l => cacheEntry(l.candidate)) }
      await reloadStatements(res.id)
      await loadCandidates(monthAgo, today)
      setSuccessMsg(`${bb.length} lançamentos importados do Banco do Brasil (simulado).`)
    }
    setIsBBLoading(false)
  }

  // ── ações por título ──
  async function refresh() { if (batch && period) { await reloadStatements(batch.id); await loadCandidates(period.start, period.end) } }

  async function linkTo(candidate: ReconcCandidate) {
    if (!selectedStmt) return
    if (candidate.status === 'pending') return void openSettle(candidate)   // aberto → baixar (F3a)
    const res = await reconcileStatements(selectedStmt, candidate.id)
    if (res.error) { setErrorMsg(res.error); return }
    cacheEntry(candidate); setSelectedStmt(null); await refresh()
  }

  async function openSettle(candidate: ReconcCandidate) {
    if (!selectedStmt || !period) return
    const stmt = imported.find(s => s.id === selectedStmt)
    const res = await settleOpenEntryAndLink({ entry_id: candidate.id, statement_id: selectedStmt, bank_account_id: selectedBank, payment_date: stmt?.date ?? period.end })
    if (res.error) { setErrorMsg(res.error); return }
    cacheEntry({ ...candidate, status: 'paid' }); setSelectedStmt(null); await refresh()
    setSuccessMsg('Título em aberto baixado e vinculado.')
  }

  async function unlink(stmtId: string) {
    const res = await unlinkStatement(stmtId)
    if (res.error) { setErrorMsg(res.error); return }
    await refresh()
  }

  async function insertNew(stmtId: string) {
    const res = await insertEntryFromStatement({ statement_id: stmtId, bank_account_id: selectedBank })
    if (res.error) { setErrorMsg(res.error); return }
    setSelectedStmt(null); await refresh()
    setSuccessMsg('Título inserido a partir do extrato e vinculado.')
  }

  function toggleIgnore(stmtId: string) {
    setIgnored(prev => { const n = new Set(prev); n.has(stmtId) ? n.delete(stmtId) : n.add(stmtId); return n })
    if (selectedStmt === stmtId) setSelectedStmt(null)
  }

  async function finalize() {
    if (!batch) return
    setIsFinalizing(true)
    const res = await finalizeReconciliation(batch.id)
    setIsFinalizing(false)
    if ('error' in res) { setErrorMsg(res.error); return }
    setSuccessMsg(`Conciliação concluída — ${res.matched} lançamento(s) conciliado(s).`)
  }

  // atalho F3 → foco no botão de opções (revela títulos em aberto)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'F3') { e.preventDefault(); setShowOpen(v => !v) } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])

  // ── derivados ──
  const active = imported.filter(s => !ignored.has(s.id))
  const allLinked = active.length > 0 && active.every(s => s.reconciled_entry_id)
  const linkedCount = imported.filter(s => s.reconciled_entry_id).length
  const rightList = useMemo(() => {
    const base = showOpen ? [...candidates.paid, ...candidates.open] : candidates.paid
    const q = search.trim().toLowerCase()
    return q ? base.filter(c => (c.description + ' ' + (c.tutor_name ?? '') + ' ' + (c.document_number ?? '')).toLowerCase().includes(q)) : base
  }, [candidates, showOpen, search])

  return (
    <div className="space-y-4">
      {/* Importação */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:min-w-[200px] flex-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Conta Bancária</label>
            <select value={selectedBank} onChange={e => setSelectedBank(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20">
              <option value="">Selecione uma conta</option>
              {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}{b.bank_name ? ` — ${b.bank_name}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5"><FileText className="inline h-3 w-3 mr-1" /> Importar Extrato</label>
            <input ref={fileRef} type="file" accept=".ofx,.csv,.txt,.xlsx,.xls" onChange={handleFileUpload} className="hidden" id="bank-statement-upload" disabled={!selectedBank || isPending} />
            <label htmlFor="bank-statement-upload"
              className={`flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold cursor-pointer justify-center ${!selectedBank || isPending ? 'opacity-50 cursor-default bg-slate-50 text-slate-400' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
              <Upload className="h-4 w-4" /> {isPending ? 'Processando...' : 'Upload OFX / CSV / TXT / XLSX'}
            </label>
          </div>
          <button onClick={handleBBImport} disabled={!selectedBank || isBBLoading}
            className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
            <Building2 className={`h-4 w-4 ${isBBLoading ? 'animate-spin' : ''}`} /> Importar do Banco (API)
          </button>
        </div>

        {parseErrors.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800 mb-1">Avisos de importação:</p>
            <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">{parseErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}
        {errorMsg && <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{errorMsg}</p>}
        {successMsg && <p className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-700">{successMsg}</p>}
      </div>

      {/* Resumo auto-match */}
      {matchResult && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
            <Sparkles className="h-4 w-4 text-emerald-600 mx-auto mb-1" />
            <p className="text-xl font-bold tabular-nums text-emerald-700">{matchResult.linked.length}</p>
            <p className="text-[11px] font-semibold text-emerald-600">Vinculados automaticamente</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
            <Circle className="h-4 w-4 text-slate-400 mx-auto mb-1" />
            <p className="text-xl font-bold tabular-nums text-slate-600">{matchResult.unmatched_statements}</p>
            <p className="text-[11px] font-semibold text-slate-500">Extrato sem par</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
            <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto mb-1" />
            <p className="text-xl font-bold tabular-nums text-amber-700">{matchResult.unmatched_candidates}</p>
            <p className="text-[11px] font-semibold text-amber-600">Títulos sem par</p>
          </div>
        </div>
      )}

      {/* 2 PAINÉIS */}
      {imported.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ESQUERDA — extrato (voz da verdade) */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-700">Extrato bancário</h3>
                <p className="text-xs text-slate-400">{linkedCount}/{imported.length} vinculados · clique numa linha para amarrar</p>
              </div>
              <Building2 className="h-4 w-4 text-slate-300" />
            </div>
            <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
              {imported.map(stmt => {
                const isIgnored = ignored.has(stmt.id)
                const linked = stmt.reconciled_entry_id ? entryCache.get(stmt.reconciled_entry_id) : null
                const isSel = selectedStmt === stmt.id
                return (
                  <div key={stmt.id}
                    className={`px-4 py-2.5 transition-colors ${isIgnored ? 'bg-slate-50 opacity-60' : stmt.reconciled_entry_id ? 'bg-emerald-50/40' : isSel ? 'bg-teal-50 border-l-4 border-teal-500' : 'hover:bg-slate-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => !isIgnored && !stmt.reconciled_entry_id && setSelectedStmt(isSel ? null : stmt.id)}
                        disabled={isIgnored || !!stmt.reconciled_entry_id} className="min-w-0 flex-1 text-left disabled:cursor-default">
                        <p className={`text-sm font-medium text-slate-700 truncate ${isIgnored ? 'line-through' : ''}`}>{stmt.description}</p>
                        <p className="text-xs text-slate-400 font-mono tabular-nums">{fmtDate(stmt.date)}</p>
                      </button>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold font-mono tabular-nums ${isIgnored ? 'line-through text-slate-400' : stmt.type === 'credit' ? 'text-emerald-700' : 'text-red-700'}`}>
                          {stmt.type === 'credit' ? '+' : '-'}{fmt(stmt.amount)}
                        </p>
                      </div>
                    </div>
                    {/* vinculado */}
                    {linked && !isIgnored && (
                      <div className="mt-1 flex items-center justify-between gap-2 rounded-md bg-emerald-100/60 px-2 py-1">
                        <span className="text-[11px] text-emerald-800 truncate flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 shrink-0" /> {linked.document_number ? `${linked.document_number} · ` : ''}{linked.description}
                        </span>
                        <button onClick={() => unlink(stmt.id)} className="text-[11px] text-emerald-700 hover:text-emerald-900 flex items-center gap-0.5 shrink-0"><Link2Off className="h-3 w-3" /> desvincular</button>
                      </div>
                    )}
                    {/* ações da linha não vinculada */}
                    {!stmt.reconciled_entry_id && (
                      <div className="mt-1 flex items-center gap-3">
                        {!isIgnored && isSel && <button onClick={() => insertNew(stmt.id)} className="text-[11px] text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"><PlusCircle className="h-3 w-3" /> inserir como título novo</button>}
                        <button onClick={() => toggleIgnore(stmt.id)} className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-0.5">
                          <Ban className="h-3 w-3" /> {isIgnored ? 'reativar' : 'ignorar'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* DIREITA — títulos do sistema */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-700">Títulos do sistema</h3>
                <button onClick={() => setShowOpen(v => !v)} title="F3"
                  className={`text-[11px] flex items-center gap-1 rounded-md px-2 py-1 ${showOpen ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                  <Settings2 className="h-3 w-3" /> Opções (F3){showOpen ? ' · incluindo em aberto' : ''}
                </button>
              </div>
              <div className="mt-2 relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrar por descrição, tutor, documento…"
                  className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs focus:border-teal-500 focus:outline-none" />
              </div>
              {selectedStmt
                ? <p className="text-[11px] text-teal-600 mt-1.5">Selecione o título para amarrar à linha do extrato selecionada.</p>
                : <p className="text-[11px] text-slate-400 mt-1.5">Clique numa linha do extrato à esquerda para amarrar.</p>}
            </div>
            <div className="divide-y divide-slate-100 max-h-[470px] overflow-y-auto flex-1">
              {rightList.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">Nenhum título candidato{showOpen ? '' : ' pago'} no período.</p>}
              {rightList.map(c => {
                const isOpen = c.status === 'pending'
                return (
                  <button key={c.id} onClick={() => selectedStmt && linkTo(c)} disabled={!selectedStmt}
                    className={`w-full text-left px-4 py-2.5 transition-colors ${!selectedStmt ? 'opacity-60 cursor-default' : 'hover:bg-teal-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-700 truncate">{c.document_number ? `${c.document_number} · ` : ''}{c.description}</p>
                        <p className="text-xs text-slate-400 tabular-nums">
                          {c.type === 'receivable' ? 'A receber' : 'A pagar'} · {isOpen ? `Venc. ${fmtDate(c.due_date)}` : `Pago ${fmtDate(c.payment_date ?? c.due_date)}`}
                          {c.tutor_name ? ` · ${c.tutor_name}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-slate-700 font-mono tabular-nums">{fmt(c.amount)}</p>
                        {isOpen && <span className="text-[10px] font-semibold text-amber-600">em aberto → baixar</span>}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* CONCILIAR */}
      {imported.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">
            {allLinked ? 'Todos os lançamentos (não ignorados) estão vinculados.' : `Faltam ${active.filter(s => !s.reconciled_entry_id).length} lançamento(s) para vincular ou ignorar.`}
            {ignored.size > 0 && ` · ${ignored.size} ignorado(s).`}
          </p>
          <button onClick={finalize} disabled={!allLinked || isFinalizing || batch?.status === 'completed'}
            className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
            {isFinalizing ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} {batch?.status === 'completed' ? 'Conciliado' : 'CONCILIAR'}
          </button>
        </div>
      )}

      {/* vazio */}
      {!batch && !isPending && (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-slate-200 bg-white shadow-sm">
          <Upload className="h-12 w-12 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">Selecione uma conta e importe um extrato para iniciar a conciliação.</p>
          <p className="text-xs text-slate-400 mt-1">Formatos: OFX, CSV, TXT (Bradesco/Itaú), XLSX · atalho F3 = opções</p>
        </div>
      )}
    </div>
  )
}
