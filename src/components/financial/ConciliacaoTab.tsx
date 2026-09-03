'use client'

import { useState, useRef, useTransition, useMemo } from 'react'
import {
  BankAccount, ReconciliationBatch, StatementWithLinks, ReconcCandidate, AutoLinkResult,
  importStatements, getBBStatement, getStatementsWithLinks, persistAutoLinks, listReconcCandidates,
  linkEntriesToStatement, unlinkEntry, unlinkStatement, reconcileLines, unreconcileLine,
  settleOpenEntryAndLink, insertEntryFromStatement,
} from '@/lib/actions/financial'
import { parseFile } from '@/lib/parsers/bankStatementParser'
import {
  Upload, RefreshCcw, CheckCircle2, Circle, Link2, Link2Off, Building2, FileText,
  PlusCircle, Search, Undo2, Sparkles,
} from 'lucide-react'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (d: string) => { if (!d) return '—'; const [y, m, day] = d.slice(0, 10).split('-'); return `${day}/${m}/${y}` }

interface Props { bankAccounts: BankAccount[] }

export default function ConciliacaoTab({ bankAccounts }: Props) {
  const defaultAccount = bankAccounts.find(b => b.is_default) ?? bankAccounts[0]

  const [selectedBank, setSelectedBank] = useState<string>(defaultAccount?.id ?? '')
  const [batch, setBatch]         = useState<ReconciliationBatch | null>(null)
  const [statements, setStatements] = useState<StatementWithLinks[]>([])
  const [candidates, setCandidates] = useState<{ paid: ReconcCandidate[]; open: ReconcCandidate[] }>({ paid: [], open: [] })
  const [matchResult, setMatchResult] = useState<AutoLinkResult | null>(null)
  const [period, setPeriod]       = useState<{ start: string; end: string } | null>(null)

  const [activeStmt, setActiveStmt] = useState<string | null>(null)   // linha do extrato selecionada
  const [selCands, setSelCands]   = useState<Set<string>>(new Set())  // candidatos marcados p/ vincular
  const [showOpen, setShowOpen]   = useState(false)
  const [search, setSearch]       = useState('')

  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isBBLoading, setIsBBLoading] = useState(false)
  const [busy, setBusy]           = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const candById = useMemo(() => {
    const m = new Map<string, ReconcCandidate>()
    ;[...candidates.paid, ...candidates.open].forEach(c => m.set(c.id, c))
    return m
  }, [candidates])

  async function loadData(batchId: string, start: string, end: string) {
    const [st, cand] = await Promise.all([
      getStatementsWithLinks(batchId),
      listReconcCandidates({ bank_account_id: selectedBank, start_date: start, end_date: end }),
    ])
    if (!('error' in st)) setStatements(st)
    if (!('error' in cand)) setCandidates(cand)
  }
  async function reload() { if (batch && period) await loadData(batch.id, period.start, period.end) }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedBank) return
    setErrorMsg(null); setSuccessMsg(null); setParseErrors([]); setBatch(null)
    setStatements([]); setMatchResult(null); setActiveStmt(null); setSelCands(new Set())

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
      const auto = await persistAutoLinks(res.id)
      if (!('error' in auto)) setMatchResult(auto)
      await loadData(res.id, start, end)
      setSuccessMsg(`${parsed.statements.length} lançamentos importados. ${'error' in auto ? '' : auto.linked + ' vinculados automaticamente.'}`)
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
      setBatch(res); setActiveStmt(null); setSelCands(new Set())
      const auto = await persistAutoLinks(res.id)
      if (!('error' in auto)) setMatchResult(auto)
      await loadData(res.id, monthAgo, today)
      setSuccessMsg(`${bb.length} lançamentos importados do Banco (simulado).`)
    }
    setIsBBLoading(false)
  }

  const active = statements.find(s => s.id === activeStmt) ?? null

  function toggleCand(id: string) {
    setSelCands(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function selectLine(id: string) { setActiveStmt(prev => prev === id ? null : id); setSelCands(new Set()); setSearch('') }

  async function handleLink() {
    if (!active || selCands.size === 0 || busy) return
    setBusy(true); setErrorMsg(null)
    const chosen = [...selCands]
    const paidIds = chosen.filter(id => candById.get(id)?.status === 'paid')
    const openIds = chosen.filter(id => candById.get(id)?.status === 'pending')
    if (paidIds.length) { const r = await linkEntriesToStatement(active.id, paidIds); if ('error' in r) { setErrorMsg(r.error); setBusy(false); return } }
    for (const id of openIds) {
      const r = await settleOpenEntryAndLink({ entry_id: id, statement_id: active.id, bank_account_id: selectedBank, payment_date: active.date })
      if (r.error) { setErrorMsg(r.error); setBusy(false); return }
    }
    setSelCands(new Set()); await reload(); setBusy(false)
  }

  async function handleUnlinkEntry(entryId: string) {
    if (!active || busy) return
    setBusy(true); const r = await unlinkEntry(active.id, entryId)
    if (r.error) setErrorMsg(r.error)
    await reload(); setBusy(false)
  }
  async function handleUnlinkAll(id: string) { setBusy(true); await unlinkStatement(id); await reload(); setBusy(false) }

  async function handleInsertNew() {
    if (!active || busy) return
    setBusy(true); const r = await insertEntryFromStatement({ statement_id: active.id, bank_account_id: selectedBank })
    if ('error' in r) setErrorMsg(r.error); else setSuccessMsg('Título inserido no sistema e vinculado a esta linha.')
    await reload(); setBusy(false)
  }

  async function handleReconcileOne(id: string) { setBusy(true); const r = await reconcileLines([id]); if ('error' in r) setErrorMsg(r.error); await reload(); setBusy(false) }
  async function handleUnreconcile(id: string) { setBusy(true); await unreconcileLine(id); await reload(); setBusy(false) }
  async function handleReconcileAll() {
    const ids = statements.filter(s => !s.reconciled && s.linked.length > 0).map(s => s.id)
    if (!ids.length) return
    setBusy(true); const r = await reconcileLines(ids); if ('error' in r) setErrorMsg(r.error); else setSuccessMsg(`${'reconciled' in r ? r.reconciled : ids.length} linha(s) conciliada(s).`)
    await reload(); setBusy(false)
  }

  // ── derivados ──
  const linkedCount    = statements.filter(s => s.linked.length > 0).length
  const reconciledCount = statements.filter(s => s.reconciled).length
  const pendingReconcile = statements.filter(s => !s.reconciled && s.linked.length > 0).length
  const rightList = useMemo(() => {
    const base = showOpen ? [...candidates.paid, ...candidates.open] : candidates.paid
    const q = search.trim().toLowerCase()
    return q ? base.filter(c => (c.description + ' ' + (c.tutor_name ?? '') + ' ' + (c.document_number ?? '')).toLowerCase().includes(q)) : base
  }, [candidates, showOpen, search])
  const linkedSum = active ? active.linked.reduce((s, c) => s + c.amount, 0) : 0
  const diff = active ? Math.round((active.amount - linkedSum) * 100) / 100 : 0

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

      {matchResult && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
            <Sparkles className="h-4 w-4 text-emerald-600 mx-auto mb-1" />
            <p className="text-xl font-bold tabular-nums text-emerald-700">{linkedCount}</p>
            <p className="text-[11px] font-semibold text-emerald-600">Vinculados</p>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-center">
            <CheckCircle2 className="h-4 w-4 text-sky-600 mx-auto mb-1" />
            <p className="text-xl font-bold tabular-nums text-sky-700">{reconciledCount}</p>
            <p className="text-[11px] font-semibold text-sky-600">Conciliados</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
            <Circle className="h-4 w-4 text-slate-400 mx-auto mb-1" />
            <p className="text-xl font-bold tabular-nums text-slate-600">{statements.length - linkedCount}</p>
            <p className="text-[11px] font-semibold text-slate-500">Sem vínculo</p>
          </div>
        </div>
      )}

      {statements.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ESQUERDA — extrato */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-700">Extrato bancário</h3>
                <p className="text-xs text-slate-400">{reconciledCount} conciliados · {linkedCount} vinculados · clique numa linha</p>
              </div>
              <Building2 className="h-4 w-4 text-slate-300" />
            </div>
            <div className="divide-y divide-slate-100 max-h-[560px] overflow-y-auto">
              {statements.map(s => {
                const isSel = activeStmt === s.id
                const hasLink = s.linked.length > 0
                return (
                  <div key={s.id} onClick={() => selectLine(s.id)}
                    className={`px-4 py-2.5 cursor-pointer transition-colors ${isSel ? 'bg-teal-50 border-l-4 border-teal-500' : s.reconciled ? 'bg-sky-50/40 hover:bg-sky-50' : hasLink ? 'bg-emerald-50/30 hover:bg-emerald-50/60' : 'hover:bg-slate-50'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-700 truncate">{s.description}</p>
                        <p className="text-xs text-slate-400 font-mono tabular-nums">{fmtDate(s.date)}</p>
                      </div>
                      <p className={`text-sm font-bold font-mono tabular-nums shrink-0 ${s.type === 'credit' ? 'text-emerald-700' : 'text-red-700'}`}>
                        {s.type === 'credit' ? '+' : '-'}{fmt(s.amount)}
                      </p>
                    </div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      {s.reconciled
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700"><CheckCircle2 className="h-3 w-3" /> Conciliado</span>
                        : hasLink
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><Link2 className="h-3 w-3" /> Vinculado · {s.linked.length} título(s) · {fmt(s.linked.reduce((a, c) => a + c.amount, 0))}</span>
                          : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500"><Circle className="h-3 w-3" /> Pendente</span>}
                      {s.reconciled && <button onClick={e => { e.stopPropagation(); handleUnreconcile(s.id) }} className="text-[10px] text-sky-700 hover:text-sky-900 inline-flex items-center gap-0.5"><Undo2 className="h-3 w-3" /> desconciliar</button>}
                      {!s.reconciled && hasLink && <button onClick={e => { e.stopPropagation(); handleReconcileOne(s.id) }} className="text-[10px] text-teal-700 hover:text-teal-900 inline-flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" /> conciliar</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* DIREITA — títulos do sistema (da linha ativa) */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
            {!active ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-sm text-slate-400">
                Selecione uma linha do extrato à esquerda para ver/editar os títulos vinculados.
              </div>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <h3 className="text-sm font-bold text-slate-700">Títulos do sistema · linha de {fmt(active.amount)}</h3>
                  <p className="text-[11px] text-slate-400">{fmtDate(active.date)} · {active.description}</p>
                </div>

                {/* Vinculados a esta linha */}
                <div className="px-4 py-2 border-b border-slate-100">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase mb-1">Vinculados ({active.linked.length})</p>
                  {active.linked.length === 0 && <p className="text-xs text-slate-400 py-1">Nenhum título vinculado ainda.</p>}
                  {active.linked.map(c => (
                    <div key={c.id} className="flex items-center justify-between gap-2 py-1">
                      <span className="text-xs text-slate-700 truncate">{c.document_number ? `${c.document_number} · ` : ''}{c.description}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold tabular-nums">{fmt(c.amount)}</span>
                        <button onClick={() => handleUnlinkEntry(c.id)} disabled={busy} className="text-[11px] text-rose-600 hover:text-rose-800 inline-flex items-center gap-0.5"><Link2Off className="h-3 w-3" /> desvincular</button>
                      </div>
                    </div>
                  ))}
                  {active.linked.length > 0 && (
                    <p className={`mt-1 text-[11px] ${Math.abs(diff) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                      Soma vinculada {fmt(linkedSum)} · linha {fmt(active.amount)}{Math.abs(diff) >= 0.01 ? ` · diferença ${fmt(diff)}` : ' ✓ confere'}
                    </p>
                  )}
                </div>

                {/* Adicionar títulos */}
                <div className="px-4 py-2 border-b border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase">Adicionar títulos (marque 1 ou mais)</p>
                    <button onClick={() => setShowOpen(v => !v)} className={`text-[11px] rounded-md px-2 py-0.5 ${showOpen ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                      {showOpen ? 'incluindo em aberto' : 'incluir em aberto'}
                    </button>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrar por descrição, tutor, documento…"
                      className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs focus:border-teal-500 focus:outline-none" />
                  </div>
                </div>
                <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto flex-1">
                  {rightList.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">Nenhum título candidato{showOpen ? '' : ' pago'} no período.</p>}
                  {rightList.map(c => {
                    const isOpen = c.status === 'pending'
                    return (
                      <label key={c.id} className="flex items-center gap-2 px-4 py-2 hover:bg-teal-50/50 cursor-pointer">
                        <input type="checkbox" checked={selCands.has(c.id)} onChange={() => toggleCand(c.id)} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-700 truncate">{c.document_number ? `${c.document_number} · ` : ''}{c.description}</p>
                          <p className="text-xs text-slate-400 tabular-nums">
                            {c.type === 'receivable' ? 'A receber' : 'A pagar'} · {isOpen ? `Venc. ${fmtDate(c.due_date)}` : `Pago ${fmtDate(c.payment_date ?? c.due_date)}`}{c.tutor_name ? ` · ${c.tutor_name}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-slate-700 font-mono tabular-nums">{fmt(c.amount)}</p>
                          {isOpen && <span className="text-[10px] font-semibold text-amber-600">em aberto → baixa</span>}
                        </div>
                      </label>
                    )
                  })}
                </div>

                {/* ações da linha ativa */}
                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center gap-2">
                  <button onClick={handleLink} disabled={busy || selCands.size === 0}
                    className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
                    {busy ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Vincular ({selCands.size})
                  </button>
                  <button onClick={handleInsertNew} disabled={busy} className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 flex items-center gap-1.5"><PlusCircle className="h-4 w-4" /> Inserir título</button>
                  {active.linked.length > 0 && !active.reconciled && (
                    <button onClick={() => handleReconcileOne(active.id)} disabled={busy} className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Conciliar linha</button>
                  )}
                  {active.reconciled && (
                    <button onClick={() => handleUnreconcile(active.id)} disabled={busy} className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50 flex items-center gap-1.5"><Undo2 className="h-4 w-4" /> Desconciliar</button>
                  )}
                  {active.linked.length > 0 && (
                    <button onClick={() => handleUnlinkAll(active.id)} disabled={busy} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50 flex items-center gap-1.5"><Link2Off className="h-4 w-4" /> Desvincular tudo</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* CONCILIAR EM LOTE (parcial — só os vinculados) */}
      {statements.length > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">
            {pendingReconcile > 0 ? `${pendingReconcile} linha(s) vinculada(s) prontas para conciliar.` : 'Nenhuma linha vinculada pendente de conciliação.'} As não vinculadas ficam pendentes.
          </p>
          <button onClick={handleReconcileAll} disabled={busy || pendingReconcile === 0}
            className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
            {busy ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Conciliar vinculados ({pendingReconcile})
          </button>
        </div>
      )}

      {!batch && !isPending && (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-slate-200 bg-white shadow-sm">
          <Upload className="h-12 w-12 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">Selecione uma conta e importe um extrato para iniciar a conciliação.</p>
          <p className="text-xs text-slate-400 mt-1">Formatos: OFX, CSV, TXT (Bradesco/Itaú), XLSX · vários títulos podem compor uma linha</p>
        </div>
      )}
    </div>
  )
}
