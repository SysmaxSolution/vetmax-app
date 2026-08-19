'use client'

import { useState, useRef, useTransition, useCallback } from 'react'
import {
  BankAccount, FinancialEntry, BankStatement,
  ReconciliationBatch, AutoMatchResult, MatchedPair,
  importStatements, listBatchStatements, listEntries,
  autoMatchStatements, reconcileStatements, getBBStatement,
} from '@/lib/actions/financial'
import { parseFile, ParsedStatement } from '@/lib/parsers/bankStatementParser'
import {
  Upload, RefreshCcw, CheckCircle2, AlertTriangle,
  Circle, Link2, Building2, FileText,
} from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtDate(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

// ─── Badge de status de conciliação ─────────────────────────────────────────

type MatchStatus = 'matched' | 'divergent' | 'unmatched'

function MatchBadge({ status }: { status: MatchStatus }) {
  if (status === 'matched') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> Conciliado
      </span>
    )
  }
  if (status === 'divergent') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
        <AlertTriangle className="h-3 w-3" /> Divergência
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
      <Circle className="h-3 w-3" /> Pendente
    </span>
  )
}

// ─── Painel de matching manual ────────────────────────────────────────────────

interface ManualMatchPanelProps {
  importedStatements: BankStatement[]
  pendingEntries:     FinancialEntry[]
  onMatch:            (stmtId: string, entryId: string) => Promise<void>
  matchResult:        AutoMatchResult | null
}

function ManualMatchPanel({
  importedStatements,
  pendingEntries,
  onMatch,
  matchResult,
}: ManualMatchPanelProps) {
  const [selectedStmt,  setSelectedStmt]  = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null)
  const [isSaving,      setIsSaving]      = useState(false)
  const [saveMsg,       setSaveMsg]       = useState<string | null>(null)

  // IDs já conciliados pelo match automático
  const autoMatchedStmtIds  = new Set(matchResult?.matched.map(m => m.statement.id) ?? [])
  const autoMatchedEntryIds = new Set(matchResult?.matched.map(m => m.entry.id) ?? [])

  async function handleConfirm() {
    if (!selectedStmt || !selectedEntry) return
    setIsSaving(true)
    setSaveMsg(null)
    await onMatch(selectedStmt, selectedEntry)
    setSaveMsg('Conciliado com sucesso!')
    setSelectedStmt(null)
    setSelectedEntry(null)
    setIsSaving(false)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Coluna: Lançamentos importados */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-700">Lançamentos Importados</h3>
          <p className="text-xs text-slate-400">{importedStatements.length} registros — clique para selecionar</p>
        </div>
        <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
          {importedStatements.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Nenhum lançamento importado</p>
          )}
          {importedStatements.map(stmt => {
            const isAutoMatched = autoMatchedStmtIds.has(stmt.id)
            const isSelected    = selectedStmt === stmt.id
            return (
              <div
                key={stmt.id}
                onClick={() => !isAutoMatched && setSelectedStmt(isSelected ? null : stmt.id)}
                className={`px-4 py-3 cursor-pointer transition-colors ${
                  isAutoMatched
                    ? 'bg-emerald-50 opacity-60 cursor-default'
                    : isSelected
                      ? 'bg-teal-50 border-l-4 border-teal-500'
                      : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700 truncate">{stmt.description}</p>
                    <p className="text-xs text-slate-400 font-mono tabular-nums">{fmtDate(stmt.date)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-bold font-mono tabular-nums ${stmt.type === 'credit' ? 'text-emerald-700' : 'text-red-700'}`}>
                      {stmt.type === 'credit' ? '+' : '-'}{fmt(stmt.amount)}
                    </p>
                    {isAutoMatched && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 ml-auto mt-1" />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Coluna: Títulos pendentes */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <h3 className="text-sm font-bold text-slate-700">Títulos Pendentes</h3>
          <p className="text-xs text-slate-400">{pendingEntries.length} títulos — clique para selecionar</p>
        </div>
        <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
          {pendingEntries.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Nenhum título pendente</p>
          )}
          {pendingEntries.map(entry => {
            const isAutoMatched = autoMatchedEntryIds.has(entry.id)
            const isSelected    = selectedEntry === entry.id
            return (
              <div
                key={entry.id}
                onClick={() => !isAutoMatched && setSelectedEntry(isSelected ? null : entry.id)}
                className={`px-4 py-3 cursor-pointer transition-colors ${
                  isAutoMatched
                    ? 'bg-emerald-50 opacity-60 cursor-default'
                    : isSelected
                      ? 'bg-teal-50 border-l-4 border-teal-500'
                      : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-700 truncate">{entry.description}</p>
                    <p className="text-xs text-slate-400 font-mono tabular-nums">Venc. {fmtDate(entry.due_date)}</p>
                    {entry.category && <p className="text-xs text-teal-600">{entry.category}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-700 font-mono tabular-nums">{fmt(entry.amount)}</p>
                    {isAutoMatched && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 ml-auto mt-1" />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Ação de conciliar */}
      {(selectedStmt || selectedEntry) && (
        <div className="col-span-1 sm:col-span-2 flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link2 className="h-4 w-4 text-teal-600" />
            <p className="text-sm font-medium text-teal-800">
              {selectedStmt && selectedEntry
                ? 'Pronto para conciliar os itens selecionados'
                : 'Selecione um lançamento importado e um título para conciliar'}
            </p>
          </div>
          <button
            onClick={handleConfirm}
            disabled={!selectedStmt || !selectedEntry || isSaving}
            className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            Conciliar
          </button>
        </div>
      )}

      {saveMsg && (
        <div className="col-span-1 sm:col-span-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-700">
          {saveMsg}
        </div>
      )}
    </div>
  )
}

// ─── Resumo do auto-match ─────────────────────────────────────────────────────

function AutoMatchSummary({ result }: { result: AutoMatchResult }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
        <CheckCircle2 className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
        <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700">{result.matched.length}</p>
        <p className="text-xs font-semibold text-emerald-600">Conciliados (auto)</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
        <Circle className="h-5 w-5 text-slate-400 mx-auto mb-1" />
        <p className="text-2xl font-bold font-mono tabular-nums text-slate-600">{result.unmatched_imported.length}</p>
        <p className="text-xs font-semibold text-slate-500">Importados sem par</p>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
        <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto mb-1" />
        <p className="text-2xl font-bold font-mono tabular-nums text-amber-700">{result.unmatched_entries.length}</p>
        <p className="text-xs font-semibold text-amber-600">Títulos sem par</p>
      </div>
    </div>
  )
}

// ─── ConciliacaoTab ──────────────────────────────────────────────────────────

interface Props {
  bankAccounts: BankAccount[]
}

export default function ConciliacaoTab({ bankAccounts }: Props) {
  const defaultAccount = bankAccounts.find(b => b.is_default) ?? bankAccounts[0]

  const [selectedBank,    setSelectedBank]    = useState<string>(defaultAccount?.id ?? '')
  const [batch,           setBatch]           = useState<ReconciliationBatch | null>(null)
  const [imported,        setImported]        = useState<BankStatement[]>([])
  const [pendingEntries,  setPendingEntries]  = useState<FinancialEntry[]>([])
  const [matchResult,     setMatchResult]     = useState<AutoMatchResult | null>(null)
  const [parseErrors,     setParseErrors]     = useState<string[]>([])
  const [errorMsg,        setErrorMsg]        = useState<string | null>(null)
  const [successMsg,      setSuccessMsg]      = useState<string | null>(null)

  const [isPending,    startTransition]    = useTransition()
  const [isBBLoading, setIsBBLoading]     = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)

  // Carrega títulos pendentes da clínica (receivable e payable)
  async function loadPendingEntries() {
    const [recRes, payRes] = await Promise.all([
      listEntries({ type: 'receivable', status: 'pending' }),
      listEntries({ type: 'payable',   status: 'pending' }),
    ])
    const rec = Array.isArray(recRes) ? recRes : []
    const pay = Array.isArray(payRes) ? payRes : []
    setPendingEntries([...rec, ...pay])
  }

  // Upload e parse do arquivo
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedBank) return

    setErrorMsg(null)
    setSuccessMsg(null)
    setParseErrors([])
    setBatch(null)
    setImported([])
    setMatchResult(null)

    // Parse client-side
    const parseResult = await parseFile(file)
    setParseErrors(parseResult.errors)

    if (!parseResult.statements.length) {
      setErrorMsg('Nenhum lançamento encontrado no arquivo.')
      return
    }

    // Detecta formato
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'unknown'
    const source = ['ofx', 'csv', 'txt', 'xlsx', 'xls'].includes(ext) ? ext : 'unknown'

    startTransition(async () => {
      const res = await importStatements({
        bank_account_id: selectedBank,
        source,
        statements:      parseResult.statements,
      })

      if ('error' in res) {
        setErrorMsg(res.error)
        return
      }

      setBatch(res)

      // Carrega os lançamentos do batch recém criado
      const stmtsRes = await listBatchStatements(res.id)
      if (!('error' in stmtsRes)) setImported(stmtsRes)

      await loadPendingEntries()
      setSuccessMsg(`${parseResult.statements.length} lançamentos importados com sucesso.`)

      // Executa auto-match
      const autoRes = await autoMatchStatements(res.id, 'receivable')
      if (!('error' in autoRes)) setMatchResult(autoRes)
    })

    // Reset input
    if (fileRef.current) fileRef.current.value = ''
  }

  // Importar do BB (mock)
  async function handleBBImport() {
    if (!selectedBank) return
    setIsBBLoading(true)
    setErrorMsg(null)
    setSuccessMsg(null)

    const today = new Date().toISOString().split('T')[0]
    const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

    const bbData = await getBBStatement({
      account_id: selectedBank,
      start_date: monthAgo,
      end_date:   today,
    })

    if ('error' in bbData) {
      setErrorMsg(bbData.error)
      setIsBBLoading(false)
      return
    }

    const res = await importStatements({
      bank_account_id: selectedBank,
      source:          'bb_api',
      statements:      bbData.map(s => ({
        external_id: s.external_id ?? undefined,
        date:        s.date,
        amount:      s.amount,
        description: s.description,
        type:        s.type,
      })),
    })

    if ('error' in res) {
      setErrorMsg(res.error)
    } else {
      setBatch(res)
      const stmtsRes = await listBatchStatements(res.id)
      if (!('error' in stmtsRes)) setImported(stmtsRes)
      await loadPendingEntries()
      setSuccessMsg(`${bbData.length} lançamentos importados do Banco do Brasil (simulado).`)
    }

    setIsBBLoading(false)
  }

  // Conciliação manual
  const handleMatch = useCallback(async (stmtId: string, entryId: string) => {
    const res = await reconcileStatements(stmtId, entryId)
    if (res.error) {
      setErrorMsg(res.error)
      return
    }
    // Atualiza estado local
    setImported(prev => prev.map(s =>
      s.id === stmtId ? { ...s, reconciled_entry_id: entryId } : s
    ))
  }, [])

  return (
    <div className="space-y-4">
      {/* Seleção de conta e upload */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:min-w-[200px] flex-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Conta Bancária</label>
            <select
              value={selectedBank}
              onChange={e => setSelectedBank(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            >
              <option value="">Selecione uma conta</option>
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name}{b.bank_name ? ` — ${b.bank_name}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Upload de arquivo */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">
              <FileText className="inline h-3 w-3 mr-1" />
              Importar Extrato
            </label>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                ref={fileRef}
                type="file"
                accept=".ofx,.csv,.txt,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
                id="bank-statement-upload"
                disabled={!selectedBank || isPending}
              />
              <label
                htmlFor="bank-statement-upload"
                className={`flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold cursor-pointer transition-colors w-full sm:w-auto justify-center ${
                  !selectedBank || isPending
                    ? 'opacity-50 cursor-default bg-slate-50 text-slate-400'
                    : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Upload className="h-4 w-4" />
                {isPending ? 'Processando...' : 'Upload OFX / CSV / TXT / XLSX'}
              </label>
            </div>
          </div>

          {/* Importar do BB */}
          <button
            onClick={handleBBImport}
            disabled={!selectedBank || isBBLoading}
            className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50 transition-colors"
          >
            <Building2 className={`h-4 w-4 ${isBBLoading ? 'animate-spin' : ''}`} />
            Importar do Banco (BB)
          </button>
        </div>

        {/* Avisos de parse */}
        {parseErrors.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800 mb-1">Avisos de importação:</p>
            <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
              {parseErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {errorMsg && (
          <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{errorMsg}</p>
        )}
        {successMsg && (
          <p className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-700">{successMsg}</p>
        )}
      </div>

      {/* Resumo do auto-match */}
      {matchResult && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-700">Resultado da Conciliação Automática</h3>
          <AutoMatchSummary result={matchResult} />
        </div>
      )}

      {/* Painel de matching manual */}
      {imported.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-700">Conciliação Manual</h3>
          <p className="text-xs text-slate-400">
            Clique em um lançamento importado (esquerda) e um título (direita) para conciliá-los.
            Itens em verde foram conciliados automaticamente.
          </p>
          <ManualMatchPanel
            importedStatements={imported}
            pendingEntries={pendingEntries}
            onMatch={handleMatch}
            matchResult={matchResult}
          />
        </div>
      )}

      {/* Estado vazio */}
      {!batch && !isPending && (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border border-slate-200 bg-white shadow-sm">
          <Upload className="h-12 w-12 text-slate-200 mb-3" />
          <p className="text-sm font-semibold text-slate-400">
            Selecione uma conta e importe um extrato bancário para iniciar a conciliação.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Formatos suportados: OFX, CSV, TXT (Bradesco/Itaú), XLSX
          </p>
        </div>
      )}
    </div>
  )
}
