'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Upload, CheckCircle2, XCircle, PlusCircle, CalendarClock, FileDown, Landmark, Banknote, EyeOff, RotateCcw, Sparkles, Database, Link2, Unlink, Ban, Search, FilterX } from 'lucide-react'
import { filtrarBoletos, filtroAtivo, documentoFormatado, FILTRO_VAZIO, type FiltroPagfor } from '@/lib/financial/pagfor-filtro'
import { parseDdaCsv } from '@/lib/parsers/ddaParser'
import type { DdaBoleto, DdaMatchResult, DdaBoletoPersistido } from '@/types/pagfor'
import PreviaFornecedoresModal from './PreviaFornecedoresModal'
import SeletorDeConta from './SeletorDeConta'
import { textoParaTela } from '@/lib/financial/mensagens-operador'
import VincularBoletoModal from './VincularBoletoModal'
import {
  matchDdaBoletos, insertPayablesFromDda, schedulePayments, generatePagforRemittance,
  fetchDdaFromBank, payBoletosViaBank,
  carregarDdaDoPeriodo, ignorarBoletoDda, reativarBoletoDda, enriquecerFornecedoresDda,
  estadoDaVarredura, desvincularBoleto, cancelarAgendamentoDoTitulo,
} from '@/lib/actions/pagfor'

const BRL = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const fmtD = (iso: string | null) => { if (!iso) return '—'; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}` }

export default function PagforTab() {
  const [parsed, setParsed]   = useState<DdaBoleto[]>([])
  const [result, setResult]   = useState<DdaMatchResult | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // Filtro da lista (roda no navegador). As linhas continuam identificadas
  // pelo índice original — é ele que amarra seleção, ignorar e vínculo.
  const [filtro, setFiltro] = useState<FiltroPagfor>(FILTRO_VAZIO)
  const [scheduleDate, setScheduleDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy]       = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [done, setDone]       = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const emDias = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
  // O padrao e a mesma faixa que a varredura automatica cobre — abrir a tela
  // num periodo diferente do que a rotina traz faria a lista parecer vazia.
  const [ddaFrom, setDdaFrom] = useState(emDias(-30))
  const [ddaTo, setDdaTo]     = useState(emDias(60))
  // Linhas guardadas, na MESMA ordem de `parsed` — é assim que cada linha da
  // tabela sabe se já foi lançada ou ignorada numa sessão anterior.
  const [persistidos, setPersistidos] = useState<DdaBoletoPersistido[]>([])
  const [previaAberta, setPreviaAberta] = useState(false)
  // A conta que opera: define a credencial e o certificado e-CNPJ usados no
  // banco. Numa clinica com varios CNPJs, buscar o DDA de uma empresa e pagar
  // pela outra seria erro silencioso.
  const [contaId, setContaId] = useState<string | null>(null)
  // Frase pronta sobre o frescor da lista. Nunca carrega detalhe tecnico.
  const [frescor, setFrescor] = useState<{ texto: string; tom: 'ok' | 'atencao' | 'alerta' } | null>(null)
  // Boleto que o operador escolheu amarrar a um titulo a mao.
  const [vincular, setVincular] = useState<number | null>(null)

  /**
   * Abre o período: lê o que já está guardado e completa com o banco.
   *
   * `forcar` manda consultar o banco mesmo havendo dado guardado — é o
   * "Atualizar do banco". Sem ele, voltar à tela NÃO refaz a consulta: o
   * trabalho de quem parou no meio continua exatamente onde estava.
   */
  /**
   * Abre a lista com o que a varredura automatica ja trouxe.
   *
   * Nao fala com o banco: entrar na aba nao pode disparar chamada externa, e
   * a rotina da madrugada ja fez esse trabalho.
   */
  const carregarGuardado = useCallback(async (conta: string) => {
    setLoading(true)
    const [res, est] = await Promise.all([
      carregarDdaDoPeriodo({
        dataInicial: ddaFrom, dataFinal: ddaTo,
        bankAccountId: conta, somenteGuardado: true,
      }),
      estadoDaVarredura(conta),
    ])
    setLoading(false)
    setFrescor(est.texto ? est : null)
    if ('error' in res) return
    setPersistidos(res.boletos)
      if (res.aviso) setError(res.aviso)   // banco recusou/falhou em parte: a lista pode estar velha ou incompleta
    const lista = res.boletos.map(p => p.boleto)
    setParsed(lista)
    if (lista.length) await runMatch(lista)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ddaFrom, ddaTo])

  useEffect(() => {
    if (contaId) void carregarGuardado(contaId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contaId])

  async function handleFetchDda(forcar = false) {
    setError(null); setDone(null); setResult(null); setLoading(true)
    try {
      const res = await carregarDdaDoPeriodo({
        dataInicial: ddaFrom, dataFinal: ddaTo, consultarBanco: forcar,
        bankAccountId: contaId ?? undefined,
      })
      if ('error' in res) { setError(textoParaTela(res.error)); return }
      if (!res.boletos.length) { setError('Nenhum boleto no DDA para o período.'); return }

      setPersistidos(res.boletos)
      if (res.aviso) setError(res.aviso)   // banco recusou/falhou em parte: a lista pode estar velha ou incompleta
      const lista = res.boletos.map(p => p.boleto)
      setParsed(lista)
      await runMatch(lista)

      // O operador precisa saber QUANTOS boletos tem e quantos faltam tratar.
      // De onde vieram e como ficam guardados e assunto nosso, nao dele.
      const tratados = res.boletos.filter(p => p.entry_id || p.dismissed_at).length
      const pendentes = res.guardados - tratados
      setDone(
        pendentes > 0
          ? `${pendentes} boleto(s) aguardando lançamento${tratados ? ` · ${tratados} já tratado(s)` : ''}.`
          : res.guardados > 0
            ? `Tudo tratado: ${res.guardados} boleto(s) no período.`
            : 'Nenhum boleto no período.',
      )
    } catch { setError('Não foi possível atualizar os boletos agora. Tente de novo em alguns minutos.') }
    finally { setLoading(false) }
  }

  /** Completa os fornecedores que entraram com o nome cortado do banco. */
  async function handleCompletarFornecedores() {
    setBusy('enrich'); setError(null)
    const res = await enriquecerFornecedoresDda(4)
    setBusy(null)
    if ('error' in res) { setError(textoParaTela(res.error)); return }
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
    if ('error' in res) { setError(textoParaTela(res.error)); return }
    setPersistidos(prev => prev.map((x, j) =>
      j === i ? { ...x, dismissed_at: p.dismissed_at ? null : new Date().toISOString() } : x))
  }

  async function handleBankPay() {
    const ids = selGreenIds(); if (!ids.length) { setError('Selecione títulos já lançados (verdes) para pagar/agendar no banco.'); return }
    setBusy('bankpay'); setError(null)
    const res = await payBoletosViaBank({
      entry_ids: ids, dataPagamento: scheduleDate || today, bankAccountId: contaId ?? undefined,
    })
    setBusy(null)
    if ('error' in res) { setError(textoParaTela(res.error)); return }
    const falhas = res.falhas.length ? ` ${res.falhas.length} falharam.` : ''
    setDone(`${res.agendados} pagamento(s) agendado(s) no Sicoob para ${fmtD(scheduleDate || today)}.${falhas}`)
    await runMatch(parsed)
  }

  async function handleDesvincular(i: number) {
    const fp = persistidos[i]?.fingerprint
    if (!fp) return
    setBusy('unlink'); setError(null)
    const res = await desvincularBoleto(fp)
    setBusy(null)
    if ('error' in res) { setError(textoParaTela(res.error)); return }
    await runMatch(parsed)
    if (contaId) await carregarGuardado(contaId)
  }

  async function runMatch(boletos: DdaBoleto[]) {
    const res = await matchDdaBoletos(boletos)
    if ('error' in res) { setError(textoParaTela(res.error)); return }
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

  // Boleto ignorado nunca entra numa ação em lote, mesmo que tenha ficado
  // marcado antes de ser ignorado.
  const selRows = () => [...selected]
    .filter(i => !persistidos[i]?.dismissed_at)
    .map(i => result?.rows[i]).filter(Boolean) as NonNullable<DdaMatchResult['rows'][number]>[]

  async function handleCancelarAgendamento(i: number) {
    const r = result?.rows[i]; if (!r?.entry_id) return
    if (!confirm('Cancelar o agendamento deste pagamento no banco? O título volta a ficar pendente, sem data programada.')) return
    setBusy('cancel'); setError(null)
    const res = await cancelarAgendamentoDoTitulo(r.entry_id)
    setBusy(null)
    if ('error' in res) { setError(textoParaTela(res.error)); return }
    setDone('Agendamento cancelado no banco. O título continua lançado, agora sem data programada.')
    setResult(prev => prev ? {
      ...prev,
      rows: prev.rows.map((x, j) => j === i ? { ...x, entry_scheduled: null, entry_bank_payment_id: null } : x),
    } : prev)
  }
  const selRed = () => selRows().filter(r => r.status === 'not_in_system')
  const selGreenIds = () => selRows().filter(r => r.entry_id).map(r => r.entry_id!) as string[]

  async function handleInsert(cadastrarFornecedor: boolean) {
    const red = selRed(); if (!red.length) return
    setBusy('insert'); setError(null)
    const res = await insertPayablesFromDda(red.map(r => r.boleto), { cadastrarFornecedor })
    setBusy(null)
    if ('error' in res) { setError(textoParaTela(res.error)); return }
    setPreviaAberta(false)
    const forn = res.fornecedores_criados
      ? ` ${res.fornecedores_criados} fornecedor(es) cadastrado(s), ${res.fornecedores_vinculados} vinculado(s).`
      : res.fornecedores_vinculados ? ` ${res.fornecedores_vinculados} vinculado(s) a fornecedor já cadastrado.` : ''
    setDone(`${res.inserted} título(s) lançado(s) em contas a pagar.${forn}`)
    // O título entrou de qualquer jeito; o que falhou foi o cadastro do
    // fornecedor. Mostrar é o que faltou na primeira versão — ela lançou 4
    // títulos sem criar nenhum fornecedor e não avisou nada.
    if (res.fornecedores_falharam.length) {
      setError(`Os títulos entraram, mas ${res.fornecedores_falharam.length} fornecedor(es) não puderam ser cadastrados: `
        + res.fornecedores_falharam.join(' · '))
    }
    // Recarrega do guardado para as linhas já virem marcadas como lançadas.
    await handleFetchDda(false)
  }

  async function handleSchedule() {
    const ids = selGreenIds(); if (!ids.length) { setError('Selecione títulos já lançados (verdes) para agendar.'); return }
    setBusy('schedule'); setError(null)
    const res = await schedulePayments({ entry_ids: ids, scheduled_date: scheduleDate || null })
    setBusy(null)
    if ('error' in res) { setError(textoParaTela(res.error)); return }
    setDone(`${res.scheduled} pagamento(s) agendado(s)${scheduleDate ? ` para ${fmtD(scheduleDate)}` : ' no vencimento'}.`)
    await runMatch(parsed)
  }

  async function handleRemittance() {
    const ids = selGreenIds(); if (!ids.length) { setError('Selecione títulos lançados (verdes) para gerar a remessa.'); return }
    setBusy('remit'); setError(null)
    const res = await generatePagforRemittance(ids)
    setBusy(null)
    if ('error' in res) { setError(textoParaTela(res.error)); return }
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
            <p className="text-sm font-semibold text-indigo-800">Boletos a pagar</p>
            {frescor && (
              <p className={`text-[11px] ${
                frescor.tom === 'alerta'  ? 'font-medium text-rose-700'
                : frescor.tom === 'atencao' ? 'text-amber-700'
                : 'text-indigo-500'}`}>
                {frescor.texto}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <SeletorDeConta
            value={contaId}
            onChange={id => {
              if (id === contaId) return
              setContaId(id)
              // Limpa o que esta na tela: sao os boletos da conta ANTERIOR, e
              // deixar na tela e convite a lancar o boleto de um CNPJ no
              // outro. Nao recarrega sozinho de proposito — abrir o periodo
              // pode significar consultar o banco, e isso e escolha de quem
              // opera, nao efeito colateral de mexer num seletor.
              setParsed([]); setResult(null); setPersistidos([])
              setSelected(new Set()); setError(null); setDone(null)
              // O efeito de `contaId` recarrega o que esta guardado desta
              // conta — sem chamar o banco.
            }}
            bankCode="756"
            label="Conta que opera"
            className="min-w-[220px]"
          />
          <div><label className="block text-[10px] text-slate-500">De</label><input type="date" value={ddaFrom} onChange={e => setDdaFrom(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs" /></div>
          <div><label className="block text-[10px] text-slate-500">Até</label><input type="date" value={ddaTo} onChange={e => setDdaTo(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs" /></div>
          <button onClick={() => handleFetchDda(false)} disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}Aplicar período
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

          {/* filtro — para achar o boleto no meio dos 90 dias que o banco devolve */}
          {(() => {
            const visiveis = filtrarBoletos(result.rows, persistidos, filtro)
            const ativo = filtroAtivo(filtro)
            const set = (patch: Partial<FiltroPagfor>) => setFiltro(prev => ({ ...prev, ...patch }))
            const campo = 'rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-teal-500 focus:outline-none'
            const selecionaveis = visiveis.filter(i => !persistidos[i]?.dismissed_at)
            const todosVisiveisMarcados = selecionaveis.length > 0 && selecionaveis.every(i => selected.has(i))
            function marcarVisiveis() {
              setSelected(prev => {
                const n = new Set(prev)
                if (todosVisiveisMarcados) selecionaveis.forEach(i => n.delete(i))
                else selecionaveis.forEach(i => n.add(i))
                return n
              })
            }
            return (
              <>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex-1 min-w-[220px]">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Nome, nº do documento ou código de barras</span>
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                        <input value={filtro.texto} onChange={e => set({ texto: e.target.value })} placeholder="Ex.: agrofarma, 202142…"
                          className={`${campo} w-full pl-8`} />
                      </div>
                    </label>
                    <label className="w-44">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">CNPJ / CPF</span>
                      <input value={filtro.cnpj} onChange={e => set({ cnpj: e.target.value })} placeholder="só números, pode ser parte" inputMode="numeric"
                        className={`${campo} w-full`} />
                    </label>
                    <label>
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Vence de</span>
                      <input type="date" value={filtro.vencDe} onChange={e => set({ vencDe: e.target.value })} className={campo} />
                    </label>
                    <label>
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">até</span>
                      <input type="date" value={filtro.vencAte} onChange={e => set({ vencAte: e.target.value })} className={campo} />
                    </label>
                    <label className="w-24">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Valor mín.</span>
                      <input value={filtro.valorMin} onChange={e => set({ valorMin: e.target.value })} placeholder="0,00" inputMode="decimal" className={`${campo} w-full text-right`} />
                    </label>
                    <label className="w-24">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Valor máx.</span>
                      <input value={filtro.valorMax} onChange={e => set({ valorMax: e.target.value })} placeholder="0,00" inputMode="decimal" className={`${campo} w-full text-right`} />
                    </label>
                    <label>
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Situação</span>
                      <select value={filtro.situacao} onChange={e => set({ situacao: e.target.value as FiltroPagfor['situacao'] })} className={`${campo} bg-white`}>
                        <option value="todos">Todos</option>
                        <option value="nao_lancados">Não lançados</option>
                        <option value="lancados">Já no sistema</option>
                        <option value="agendados">Agendados</option>
                        <option value="ignorados">Ignorados</option>
                      </select>
                    </label>
                    {ativo && (
                      <button type="button" onClick={() => setFiltro(FILTRO_VAZIO)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                        <FilterX className="h-3.5 w-3.5" /> Limpar
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {ativo
                      ? <>Mostrando <strong>{visiveis.length}</strong> de {result.rows.length} boleto(s){selected.size ? ` · ${selected.size} selecionado(s) no total` : ''}.</>
                      : <>{result.rows.length} boleto(s) no período{selected.size ? ` · ${selected.size} selecionado(s)` : ''}.</>}
                  </p>
                </div>

          {/* tabela */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 w-8">
                      <input type="checkbox" checked={todosVisiveisMarcados} disabled={selecionaveis.length === 0} onChange={marcarVisiveis}
                        title={todosVisiveisMarcados ? 'Desmarcar os boletos visíveis' : 'Marcar os boletos visíveis'} />
                    </th>
                    <th className="text-left px-3 py-2">Beneficiário</th>
                    <th className="text-left px-3 py-2">CNPJ / CPF</th>
                    <th className="text-left px-3 py-2">Documento</th>
                    <th className="text-left px-3 py-2">Código de barras</th>
                    <th className="text-right px-3 py-2">Valor</th>
                    <th className="text-left px-3 py-2">Vencimento</th>
                    <th className="text-left px-3 py-2">Situação</th>
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visiveis.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400">Nenhum boleto corresponde ao filtro.</td></tr>
                  )}
                  {visiveis.map(i => {
                    const r = result.rows[i]
                    const green = r.status === 'in_system'
                    const ignorado = !!persistidos[i]?.dismissed_at
                    return (
                      <tr key={i} className={ignorado ? 'bg-slate-50 opacity-60' : green ? 'bg-emerald-50/40' : 'bg-rose-50/40'}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={!ignorado && selected.has(i)} disabled={ignorado} onChange={() => toggle(i)}
                            title={ignorado ? 'Boleto ignorado — volte a considerá-lo para poder selecionar' : undefined} />
                        </td>
                        <td className="px-3 py-2 font-medium text-slate-700">{r.boleto.beneficiary ?? '—'}</td>
                        <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{documentoFormatado(r.boleto.beneficiary_doc) || '—'}</td>
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
                          <div className="flex items-center justify-end gap-1">
                            {/* Vincular a mao: para o que nenhuma regra pegou. */}
                            {!ignorado && !green && persistidos[i] && (
                              <button onClick={() => setVincular(i)} disabled={busy !== null}
                                title="Vincular a um título já lançado"
                                className="rounded p-1 text-indigo-500 hover:bg-indigo-50 disabled:opacity-40">
                                <Link2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {/* Agendado no banco por engano: cancela no Sicoob e limpa a data. */}
                            {!ignorado && green && r.entry_bank_payment_id && (
                              <button onClick={() => void handleCancelarAgendamento(i)} disabled={busy !== null}
                                title="Cancelar o agendamento deste pagamento no banco"
                                className="rounded p-1 text-amber-600 hover:bg-amber-50 disabled:opacity-40">
                                <Ban className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {!ignorado && green && persistidos[i]?.entry_id && (
                              <button onClick={() => void handleDesvincular(i)} disabled={busy !== null}
                                title="Desfazer o vínculo com o título"
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600 disabled:opacity-40">
                                <Unlink className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {persistidos[i] && (
                              <button onClick={() => handleIgnorar(i)} disabled={busy !== null}
                                title={ignorado ? 'Voltar a considerar' : 'Ignorar este boleto (fica guardado)'}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40">
                                {ignorado ? <RotateCcw className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
              </>
            )
          })()}

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

      {vincular !== null && persistidos[vincular] && (
        <VincularBoletoModal
          fingerprint={persistidos[vincular].fingerprint}
          boleto={result?.rows[vincular]?.boleto ?? {}}
          onClose={() => setVincular(null)}
          onVinculado={async () => {
            await runMatch(parsed)
            if (contaId) await carregarGuardado(contaId)
            setDone('Boleto vinculado ao título.')
          }}
        />
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
