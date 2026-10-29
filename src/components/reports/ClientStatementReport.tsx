'use client'

// Extrato do Cliente — treinamento financeiro Animais, 18/09/2026.
//
//  • Ana Lucia: filtra data + cliente e gera um PDF para entregar/enviar.
//  • Bruna (b): pago E em aberto na mesma tela, não em dois relatórios.
//  • Bruna (a): coluna "Baixa por" — qual operador do caixa deu baixa.
//
// "Cliente" cobre TUTOR e CLÍNICA PARCEIRA / PROTETOR (a Animais é laboratório
// de referência e fatura para os dois).

import { useState, useTransition, useMemo } from 'react'
import { Printer, FileDown, Send, Mail, Search, AlertTriangle } from 'lucide-react'
import { listStatementClients, getClientStatement } from '@/lib/actions/client-statement'
import {
  generateClientStatementPdf,
  sendClientStatementWhatsApp,
  sendClientStatementEmail,
} from '@/lib/actions/client-statement-delivery'
import {
  settledByLabel, daysOverdue,
  type ClientKind,
  type StatementClientOption,
  type ClientStatementResult,
  type StatementRow,
} from '@/lib/reports/client-statement-logic'

const fmt  = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtD = (iso: string | null) => {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : '—'
}
const net = (r: StatementRow) => Number(r.amount ?? 0) - Number(r.discount ?? 0)

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Dinheiro', pix: 'PIX', credit: 'Crédito', debit: 'Débito',
  credit_card: 'Crédito', debit_card: 'Débito', convenio: 'Convênio',
  boleto: 'Boleto', transfer: 'Transferência', credit_balance: 'Crédito do cliente',
  courtesy: 'Cortesia', other: 'Outros',
}

function firstOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function ClientStatementReport() {
  const today = new Date().toISOString().slice(0, 10)

  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo]     = useState(today)
  const [clients, setClients] = useState<StatementClientOption[] | null>(null)
  const [query, setQuery]     = useState('')
  const [picked, setPicked]   = useState<StatementClientOption | null>(null)
  const [companyId, setCompanyId] = useState<string>('')
  const [data, setData]   = useState<ClientStatementResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startT] = useTransition()
  const [sending, startSend] = useTransition()

  function loadClients() {
    startT(async () => {
      setError(null); setNotice(null)
      const res = await listStatementClients({ from, to })
      if ('error' in res) { setError(res.error); return }
      setClients(res)
      if (res.length === 0) setError('Nenhum cliente com movimento financeiro neste período.')
    })
  }

  function run(client = picked) {
    if (!client) { setError('Selecione um cliente.'); return }
    startT(async () => {
      setError(null); setNotice(null)
      const res = await getClientStatement({
        from, to,
        client_kind: client.kind,
        client_id:   client.id,
        company_id:  companyId || null,
      })
      if ('error' in res) { setError(res.error); setData(null); return }
      setData(res)
    })
  }

  function currentParams() {
    if (!picked) return null
    return { from, to, client_kind: picked.kind as ClientKind, client_id: picked.id, company_id: companyId || null }
  }

  function downloadPdf() {
    const p = currentParams(); if (!p) return
    startSend(async () => {
      setError(null); setNotice(null)
      const res = await generateClientStatementPdf(p)
      if ('error' in res) { setError(res.error); return }
      window.open(res.signed_url, '_blank', 'noopener,noreferrer')
      setNotice(`PDF gerado: ${res.file_name}`)
    })
  }

  function sendWhats() {
    const p = currentParams(); if (!p) return
    startSend(async () => {
      setError(null); setNotice(null)
      const res = await sendClientStatementWhatsApp(p)
      if ('error' in res) { setError(res.error); return }
      setNotice('Extrato enviado por WhatsApp.')
    })
  }

  function sendMail() {
    const p = currentParams(); if (!p) return
    startSend(async () => {
      setError(null); setNotice(null)
      const res = await sendClientStatementEmail(p)
      if ('error' in res) { setError(res.error); return }
      setNotice('Extrato enviado por e-mail.')
    })
  }

  const filtered = useMemo(() => {
    if (!clients) return []
    const q = query.trim().toLowerCase()
    if (!q) return clients.slice(0, 50)
    return clients
      .filter(c => c.name.toLowerCase().includes(q) || (c.document ?? '').includes(q))
      .slice(0, 50)
  }, [clients, query])

  const t = data?.summary.totals
  const busy = pending || sending

  return (
    <div className="space-y-5">
      {/* ── Filtros ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-end print:hidden">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">De</label>
          <input type="date" value={from} onChange={e => { setFrom(e.target.value); setClients(null) }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
          <input type="date" value={to} onChange={e => { setTo(e.target.value); setClients(null) }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
        <button onClick={loadClients} disabled={busy}
          className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
          {pending && !clients ? 'Buscando…' : 'Buscar clientes do período'}
        </button>

        {data && data.companies.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Empresa faturante</label>
            <select value={companyId} onChange={e => setCompanyId(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
              <option value="">Todas as empresas</option>
              {data.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* ── Seletor de cliente ────────────────────────────────────────────── */}
      {clients && clients.length > 0 && (
        <div className="rounded-xl border border-slate-200 p-3 space-y-2 print:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Buscar tutor, clínica parceira ou protetor por nome / CPF / CNPJ…"
              className="w-full rounded-lg border border-slate-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
          </div>
          <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
            {filtered.map(c => (
              <button key={`${c.kind}-${c.id}`}
                onClick={() => { setPicked(c); setQuery(c.name); run(c) }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between gap-3 ${
                  picked?.id === c.id && picked?.kind === c.kind ? 'bg-violet-50' : ''}`}>
                <span className="font-medium text-slate-700 truncate">{c.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {c.document && <span className="text-xs text-slate-400 font-mono">{c.document}</span>}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                    c.kind === 'tutor' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`}>
                    {c.kind === 'tutor' ? 'Tutor' : 'Parceira'}
                  </span>
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-sm text-slate-400 text-center">Nenhum cliente encontrado.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Ações de entrega ──────────────────────────────────────────────── */}
      {data && (
        <div className="flex flex-wrap gap-2 print:hidden">
          <button onClick={() => run()} disabled={busy}
            className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-60">
            {pending ? 'Atualizando…' : 'Atualizar'}
          </button>
          <button onClick={downloadPdf} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60">
            <FileDown className="h-4 w-4" /> {sending ? 'Gerando…' : 'Gerar PDF'}
          </button>
          <button onClick={sendWhats} disabled={busy || !data.client.phone}
            title={data.client.phone ? 'Enviar por WhatsApp' : 'Cliente sem telefone cadastrado'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
            <Send className="h-4 w-4" /> WhatsApp
          </button>
          <button onClick={sendMail} disabled={busy || !data.client.email}
            title={data.client.email ? 'Enviar por e-mail' : 'Cliente sem e-mail cadastrado'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
            <Mail className="h-4 w-4" /> E-mail
          </button>
          <button onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        </div>
      )}

      {error  && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      {!data && !pending && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
          Escolha o período, busque os clientes e selecione um para ver o extrato.
        </div>
      )}

      {data && t && (
        <div className="space-y-5">
          {/* Cabeçalho do cliente */}
          <div className="rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-base font-bold text-slate-800">{data.client.name}</p>
                <p className="text-xs text-slate-500">
                  {data.client.kind === 'tutor' ? 'Tutor' : 'Clínica parceira / protetor'}
                  {data.client.document ? ` · ${data.client.document}` : ''}
                  {data.client.phone ? ` · ${data.client.phone}` : ''}
                </p>
              </div>
              <p className="text-xs text-slate-500">
                Período {fmtD(from)} a {fmtD(to)} · posição em {fmtD(data.filters.as_of)}
              </p>
            </div>
          </div>

          {/* Pago × a pagar (pedido da Bruna) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Card label="Pago no período" value={fmt(t.paid_total)} sub={`${t.paid_count} título(s)`} tone="text-emerald-600" />
            <Card label="Em aberto"       value={fmt(t.pending_total)} sub={`${t.pending_count} título(s)`} tone="text-amber-600" />
            <Card label="Vencido"         value={fmt(t.overdue_total)} sub={`${t.overdue_count} título(s)`} tone={t.overdue_total > 0 ? 'text-red-600' : 'text-slate-600'} />
            <Card label="Saldo devedor"   value={fmt(t.balance)} sub="em aberto na data" tone="text-slate-800" />
          </div>

          {/* Quebra por empresa faturante (multi-CNPJ) */}
          {data.summary.byCompany.length > 1 && (
            <div className="rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2.5">Empresa faturante</th>
                    <th className="text-right px-4 py-2.5">Pago</th>
                    <th className="text-right px-4 py-2.5">Em aberto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.summary.byCompany.map(c => (
                    <tr key={c.company_id ?? 'none'}>
                      <td className="px-4 py-2 text-slate-700">{c.company_name}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-emerald-700">{fmt(c.paid_total)}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-amber-700">{fmt(c.pending_total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-bold text-slate-700">
                  <tr>
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">{fmt(t.paid_total)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums">{fmt(t.pending_total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* O que o cliente PAGOU — com o operador que deu baixa */}
          <section>
            <h3 className="text-sm font-bold text-slate-700 mb-2">Pagamentos recebidos no período</h3>
            <div className="rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-emerald-50 text-[11px] text-emerald-800 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2.5">Pago em</th>
                    <th className="text-left px-2 py-2.5">Documento</th>
                    <th className="text-left px-2 py-2.5">Descrição</th>
                    <th className="text-left px-2 py-2.5">Pet</th>
                    <th className="text-left px-2 py-2.5">Empresa</th>
                    <th className="text-left px-2 py-2.5">Forma</th>
                    <th className="text-left px-2 py-2.5">Baixa por</th>
                    <th className="text-right px-4 py-2.5">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.summary.paid.map(r => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 whitespace-nowrap">{fmtD(r.payment_date)}</td>
                      <td className="px-2 py-2 font-mono text-xs text-slate-500">{r.document_number ?? '—'}</td>
                      <td className="px-2 py-2 text-slate-700">{r.description}</td>
                      <td className="px-2 py-2 text-slate-600">{r.patient_name ?? '—'}</td>
                      <td className="px-2 py-2 text-slate-600 text-xs">{r.company_name ?? '—'}</td>
                      <td className="px-2 py-2 text-slate-600 text-xs">
                        {r.payment_method ? (PAYMENT_LABEL[r.payment_method] ?? r.payment_method) : '—'}
                      </td>
                      <td className={`px-2 py-2 text-xs ${r.settled.source === 'unknown' ? 'text-slate-400 italic' : 'text-slate-700 font-medium'}`}>
                        {settledByLabel(r.settled)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums text-emerald-700">{fmt(net(r))}</td>
                    </tr>
                  ))}
                  {data.summary.paid.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">Nenhum pagamento no período.</td></tr>
                  )}
                </tbody>
                {data.summary.paid.length > 0 && (
                  <tfoot className="bg-slate-50 font-bold text-slate-700">
                    <tr>
                      <td colSpan={7} className="px-4 py-2">Total pago</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{fmt(t.paid_total)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {data.has_unknown_settler && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                Baixas marcadas como &quot;Não registrado&quot; são anteriores ao registro do operador —
                a partir de agora toda baixa grava quem a fez.
              </p>
            )}
          </section>

          {/* O que o cliente TEM A PAGAR */}
          <section>
            <h3 className="text-sm font-bold text-slate-700 mb-2">Títulos em aberto</h3>
            <div className="rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-amber-50 text-[11px] text-amber-800 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2.5">Vencimento</th>
                    <th className="text-left px-2 py-2.5">Documento</th>
                    <th className="text-left px-2 py-2.5">Descrição</th>
                    <th className="text-left px-2 py-2.5">Pet</th>
                    <th className="text-left px-2 py-2.5">Empresa</th>
                    <th className="text-center px-2 py-2.5">Atraso</th>
                    <th className="text-right px-4 py-2.5">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.summary.pending.map(r => {
                    const atraso = daysOverdue(r.due_date, data.filters.as_of)
                    return (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 whitespace-nowrap">{fmtD(r.due_date)}</td>
                        <td className="px-2 py-2 font-mono text-xs text-slate-500">{r.document_number ?? '—'}</td>
                        <td className="px-2 py-2 text-slate-700">{r.description}</td>
                        <td className="px-2 py-2 text-slate-600">{r.patient_name ?? '—'}</td>
                        <td className="px-2 py-2 text-slate-600 text-xs">{r.company_name ?? '—'}</td>
                        <td className={`px-2 py-2 text-center text-xs font-semibold ${atraso > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                          {atraso > 0 ? `${atraso} d` : 'a vencer'}
                        </td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums text-amber-700">{fmt(net(r))}</td>
                      </tr>
                    )
                  })}
                  {data.summary.pending.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Nenhum título em aberto no período.</td></tr>
                  )}
                </tbody>
                {data.summary.pending.length > 0 && (
                  <tfoot className="bg-slate-50 font-bold text-slate-700">
                    <tr>
                      <td colSpan={6} className="px-4 py-2">Total em aberto</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{fmt(t.pending_total)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function Card({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
      <p className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-base font-bold font-mono tabular-nums ${tone}`}>{value}</p>
      <p className="text-[10px] text-slate-400">{sub}</p>
    </div>
  )
}
