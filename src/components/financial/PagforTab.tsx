'use client'

import { useState } from 'react'
import { Loader2, Upload, CheckCircle2, XCircle, PlusCircle, CalendarClock, FileDown, Landmark, Banknote, EyeOff, RotateCcw, Sparkles, Database } from 'lucide-react'
import { parseDdaCsv } from '@/lib/parsers/ddaParser'
import type { DdaBoleto, DdaMatchResult, DdaBoletoPersistido } from '@/types/pagfor'
import PreviaFornecedoresModal from './PreviaFornecedoresModal'
import {
  matchDdaBoletos, insertPayablesFromDda, schedulePayments, generatePagforRemittance,
  fetchDdaFromBank, payBoletosViaBank,
  carregarDdaDoPeriodo, ignorarBoletoDda, reativarBoletoDda, enriquecerFornecedoresDda,
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
  const today = new Date().toISOString().slice(0, 10)
  const [ddaFrom, setDdaFrom] = useState(today)
  const [ddaTo, setDdaTo]     = useState(today)
  // Linhas guardadas, na MESMA ordem de `parsed` — é assim que cada linha da
  // tabela sabe se já foi lançada ou ignorada numa sessão anterior.
  const [persistidos, setPersistidos] = useState<DdaBoletoPersistido[]>([])
  const [previaAberta, setPreviaAberta] = useState(false)

  /**
   * Abre o período: lê o que já está guardado e completa com o banco.
   *
   * `forcar` manda consultar o banco mesmo havendo dado guardado — é o
   * "Atualizar do banco". Sem ele, voltar à tela NÃO refaz a consulta: o
   * trabalho de quem parou no meio continua exatamente onde estava.
   */
  async function handleFetchDda(forcar = false) {
    setError(null); setDone(null); setResult(null); setLoading(true)
    try {
      const res = await carregarDdaDoPeriodo({
        dataInicial: ddaFrom, dataFinal: ddaTo, consultarBanco: forcar,
      })
      if ('error' in res) { setError(res.error); return }
      if (!res.boletos.length) { setError('Nenhum boleto no DDA para o período.'); return }

      setPersistidos(res.boletos)
      const lista = res.boletos.map(p => p.boleto)
      setParsed(lista)
      await runMatch(lista)

      const tratados = res.boletos.filter(p => p.entry_id || p.dismissed_at).length
      setDone(
        res.consultou_banco
          ? `${res.guardados} boleto(s) no período${res.do_banco ? ` · ${res.do_banco} vindos do banco agora` : ''}` +
            (tratados ? ` · ${tratados} já tratado(s) antes` : '')
          : `${res.guardados} boleto(s) recuperados do que já estava guardado` +
            (tratados ? ` · ${tratados} já tratado(s)` : '') + '. Use "Atualizar do banco" para buscar novos.',
      )
    } catch (e) { setError(`Falha ao buscar DDA: ${(e as Error).message}`) }
    finally { setLoading(false) }
  }

  /** Completa os fornecedores que entraram com o nome cortado do banco. */
  async function handleCompletarFornecedores() {
    setBusy('enrich'); setError(null)
    const res = await enriquecerFornecedoresDda(4)
    setBusy(null)
    if ('error' in res) { setError(res.error); return }
    setDone(
      res.atualizados
        ? `${res.atualizados} fornecedor(es) completado(s) com os dados da Receita.` +
          (res.restantes ? ` Faltam ${res.restantes} — clique de novo em instantes (a consulta pública limita chamadas).` : '')
        : res.restantes
          ? `A consulta pública recusou agora (limite de chamadas). Faltam ${res.restantes} — tente de novo em um minuto.`
          : 'Todos os fornecedores já estão completos.',
    )
  }

  async function handleIgnorar(i: number) {
    const p = persistidos[i]; if (!p) return
    setBusy('ignore'); setError(null)
    const res = p.dismissed_at ? await reativarBoletoDda(p.id) : await ignorarBoletoDda(p.id)
    setBusy(null)
    if ('error' in res) { setError(res.error); return }
    setPersistidos(prev => prev.map((x, j) =>
      j === i ? { ...x, dismissed_at: p.dismissed_at ? null : new Date().toISOString() } : x))
  }

  async function handleBankPay() {
    const ids = selGreenIds(); if (!ids.length) { setError('Selecione títulos já lançados (verdes) para pagar/agendar no banco.'); return }
    setBusy('bankpay'); setError(null)
    const res = await payBoletosViaBank({ entry_ids: ids, dataPagamento: scheduleDate || today })
    setBusy(null)
    if ('error' in res) { setError(res.error); return }
    const falhas = res.falhas.length ? ` ${res.falhas.length} falharam.` : ''
    setDone(`${res.agendados} pagamento(s) agendado(s) no Sicoob para ${fmtD(scheduleDate || today)}.${falhas}`)
    await runMatch(parsed)
  }

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

  async function handleInsert(cadastrarFornecedor: boolean) {
    const red = selRed(); if (!red.length) return
    setBusy('insert'); setError(null)
    const res = await insertPayablesFromDda(red.map(r => r.boleto), { cadastrarFornecedor })
    setBusy(null)
    if ('error' in res) { setError(res.error); return }
    setPreviaAberta(false)
    const forn = res.fornecedores_criados
      ? ` ${res.fornecedores_criados} fornecedor(es) cadastrado(s), ${res.fornecedores_vinculados} vinculado(s).`
      : res.fornecedores_vinculados ? ` ${res.fornecedores_vinculados} vinculado(s) a fornecedor já cadastrado.` : ''
    setDone(`${res.inserted} título(s) lançado(s) em contas a pagar.${forn}`)
    // Recarrega do guardado para as linhas já virem marcadas como lançadas.
    await handleFetchDda(false)
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
      {/* Buscar DDA direto no banco (API Sicoob Pagamentos) */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-indigo-600" />
          <div>
            <p className="text-sm font-semibold text-indigo-800">Buscar DDA no banco (Sicoob)</p>
            <p className="text-[11px] text-indigo-500">Os boletos ficam guardados: se você parar no meio, ao voltar o período reabre com o que já foi tratado.</p>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div><label className="block text-[10px] text-slate-500">De</label><input type="date" value={ddaFrom} onChange={e => setDdaFrom(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs" /></div>
          <div><label className="block text-[10px] text-slate-500">Até</label><input type="date" value={ddaTo} onChange={e => setDdaTo(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs" /></div>
          <button onClick={() => handleFetchDda(false)} disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}Abrir período
          </button>
          <button onClick={() => handleFetchDda(true)} disabled={loading} title="Consulta o banco de novo e acrescenta o que houver de novo, sem perder o que já foi tratado"
            className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 flex items-center gap-2">
            <Landmark className="h-4 w-4" />Atualizar do banco
          </button>
        </div>
      </div>

      {/* Importar DDA (CSV — alternativa manual) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
          <Upload className="h-4 w-4" /> Importar DDA por arquivo (CSV)
          <input type="file" accept=".csv,.txt,.ret" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = '' }} />
        </label>
        <span className="text-[11px] text-slate-400">Verde = já lançado · Vermelho = falta lançar.</span>
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
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.rows.map((r, i) => {
                    const green = r.status === 'in_system'
                    const ignorado = !!persistidos[i]?.dismissed_at
                    return (
                      <tr key={i} className={ignorado ? 'bg-slate-50 opacity-60' : green ? 'bg-emerald-50/40' : 'bg-rose-50/40'}>
                        <td className="px-3 py-2"><input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} /></td>
                        <td className="px-3 py-2 font-medium text-slate-700">{r.boleto.beneficiary ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-500">{r.boleto.document ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-slate-400">{r.boleto.barcode ? r.boleto.barcode.replace(/\D/g, '').slice(0, 12) + '…' : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-700">{BRL(r.boleto.amount)}</td>
                        <td className="px-3 py-2 font-mono">{fmtD(r.boleto.due_date)}</td>
                        <td className="px-3 py-2">
                          {ignorado
                            ? <span className="inline-flex items-center gap-1 text-slate-400"><EyeOff className="h-3 w-3" /> ignorado</span>
                            : green
                              ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3 w-3" /> no sistema{r.entry_scheduled ? ` · agendado ${fmtD(r.entry_scheduled)}` : ''}</span>
                              : <span className="inline-flex items-center gap-1 text-rose-700"><XCircle className="h-3 w-3" /> não lançado</span>}
                        </td>
                        <td className="px-3 py-2">
                          {persistidos[i] && (
                            <button onClick={() => handleIgnorar(i)} disabled={busy !== null}
                              title={ignorado ? 'Voltar a considerar' : 'Ignorar este boleto (fica guardado)'}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40">
                              {ignorado ? <RotateCcw className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                            </button>
                          )}
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
              <button onClick={() => setPreviaAberta(true)} disabled={busy !== null || selRed().length === 0}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50 flex items-center gap-2">
                {busy === 'insert' ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />} Lançar selecionados
              </button>
              <button onClick={handleSchedule} disabled={busy !== null || selGreenIds().length === 0}
                className="rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 flex items-center gap-2">
                {busy === 'schedule' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />} Agendar (local)
              </button>
              <button onClick={handleBankPay} disabled={busy !== null || selGreenIds().length === 0}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                {busy === 'bankpay' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />} Pagar no banco (Sicoob)
              </button>
              <button onClick={handleCompletarFornecedores} disabled={busy !== null}
                title="Busca na Receita a razão social completa dos fornecedores que entraram com o nome cortado pelo banco"
                className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 flex items-center gap-2">
                {busy === 'enrich' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Completar cadastros
              </button>
              <button onClick={handleRemittance} disabled={busy !== null || selGreenIds().length === 0}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
                {busy === 'remit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Gerar remessa
              </button>
            </div>
          </div>
        </>
      )}

      {previaAberta && (
        <PreviaFornecedoresModal
          boletos={selRed().map(r => r.boleto)}
          lancando={busy === 'insert'}
          onClose={() => setPreviaAberta(false)}
          onConfirmar={handleInsert}
        />
      )}
    </div>
  )
}
