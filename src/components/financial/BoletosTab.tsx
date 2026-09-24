'use client'

import { useState, useEffect } from 'react'
import { Loader2, Barcode, FileText, Printer, RefreshCw, XCircle, Mail, MessageCircle, Eye, Copy, Check, Settings, Clock } from 'lucide-react'
import { listBoletos, refreshBoletoStatus, cancelBoleto, type BoletoRow } from '@/lib/actions/boletos'
import {
  listReceivablesForBoleto, listBoletoAccounts, emitOrReprintBoleto, getBoletoView,
  sendBoletoEmail, sendBoletoWhatsApp, getBoletoEvents,
  type ReceivableRow, type BankAccountBoleto,
} from '@/lib/actions/boleto-cobranca'
import type { BoletoView } from '@/lib/boleto/view'
import BoletoDocument from './boleto/BoletoDocument'

const money = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dt = (s: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—')
const SIT: Record<string, { label: string; cls: string }> = {
  emitido: { label: 'Emitido', cls: 'bg-slate-100 text-slate-600' },
  registrado: { label: 'Registrado', cls: 'bg-sky-100 text-sky-700' },
  pago: { label: 'Pago', cls: 'bg-emerald-100 text-emerald-700' },
  baixado: { label: 'Baixado', cls: 'bg-amber-100 text-amber-700' },
  erro: { label: 'Erro', cls: 'bg-rose-100 text-rose-700' },
}

export default function BoletosTab() {
  const [receivables, setReceivables] = useState<ReceivableRow[]>([])
  const [boletos, setBoletos] = useState<BoletoRow[]>([])
  const [accounts, setAccounts] = useState<BankAccountBoleto[]>([])
  const [accountId, setAccountId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [viewer, setViewer] = useState<BoletoView | null>(null)
  const [history, setHistory] = useState<{ boletoId: string; events: Awaited<ReturnType<typeof getBoletoEvents>> } | null>(null)

  async function reload() {
    const [r, b, a] = await Promise.all([listReceivablesForBoleto(), listBoletos(), listBoletoAccounts()])
    setReceivables(r); setBoletos(b)
    const enabled = a.filter(x => x.enabled)
    setAccounts(enabled)
    if (!accountId && enabled[0]) setAccountId(enabled[0].id)
    setLoading(false)
  }
  useEffect(() => { reload() }, []) // eslint-disable-line

  function flash(type: 'ok' | 'err', text: string) { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000) }

  async function emitir(entryId: string) {
    setBusy('emit:' + entryId)
    const r = await emitOrReprintBoleto(entryId, accountId || undefined)
    setBusy(null)
    if ('error' in r) return flash('err', r.error)
    await openViewer(r.boletoId)
    flash('ok', r.reprint ? 'Boleto localizado (reimpressão).' : 'Boleto emitido.')
    reload()
  }
  async function openViewer(boletoId: string) {
    setBusy('view:' + boletoId)
    const v = await getBoletoView(boletoId)
    setBusy(null)
    if ('error' in v) return flash('err', v.error)
    setViewer(v)
  }
  async function openHistory(boletoId: string) { setBusy('h:' + boletoId); const events = await getBoletoEvents(boletoId); setBusy(null); setHistory({ boletoId, events }) }
  async function refresh(id: string) { setBusy('r:' + id); await refreshBoletoStatus(id); setBusy(null); reload() }
  async function cancel(id: string) { if (!confirm('Baixar/cancelar este boleto no banco?')) return; setBusy('c:' + id); await cancelBoleto(id); setBusy(null); reload() }
  async function email(id: string) { setBusy('e:' + id); const r = await sendBoletoEmail(id); setBusy(null); flash('error' in r ? 'err' : 'ok', 'error' in r ? r.error : 'E-mail enviado.'); if (!('error' in r)) reload() }
  async function whats(id: string) { setBusy('w:' + id); const r = await sendBoletoWhatsApp(id); setBusy(null); flash('error' in r ? 'err' : 'ok', 'error' in r ? r.error : 'WhatsApp enviado.'); if (!('error' in r)) reload() }

  if (loading) return <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>

  const semBoleto = receivables.filter(r => !r.boletoId)
  const comBoleto = receivables.filter(r => r.boletoId)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2"><Barcode className="h-4.5 w-4.5 text-slate-400" />Boletos — Cobrança</h2>
          <p className="text-xs text-slate-500">Emita boletos das duplicatas em aberto ou reimprima os já emitidos. Configure a carteira em <strong>Cadastros → Bancos → (conta) → Carteira Bancária</strong>.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Conta:</label>
          {accounts.length === 0
            ? <span className="text-xs text-amber-600 flex items-center gap-1"><Settings className="h-3.5 w-3.5" />nenhuma carteira habilitada</span>
            : <select value={accountId} onChange={e => setAccountId(e.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.config.environment === 'production' ? '' : ' (sandbox)'}</option>)}
              </select>}
        </div>
      </div>

      {msg && <p className={`text-sm rounded-lg px-3 py-2 ${msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>{msg.text}</p>}

      {/* Duplicatas SEM boleto → emitir */}
      <Section title={`Duplicatas em aberto sem boleto (${semBoleto.length})`} subtitle="Selecione para emitir">
        {semBoleto.length === 0 ? <Empty text="Nenhuma duplicata em aberto sem boleto." /> : (
          <Table rows={semBoleto.map(r => ({
            key: r.id,
            cells: [r.description || '—', r.tutorName || '—', money(r.amount), dt(r.dueDate)],
            action: <button onClick={() => emitir(r.id)} disabled={!!busy || accounts.length === 0} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy === 'emit:' + r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Barcode className="h-3 w-3" />}Emitir boleto
            </button>,
          }))} />
        )}
      </Section>

      {/* Duplicatas COM boleto → reimprimir */}
      {comBoleto.length > 0 && (
        <Section title={`Duplicatas com boleto (${comBoleto.length})`} subtitle="Reimpressão">
          <Table rows={comBoleto.map(r => ({
            key: r.id,
            cells: [r.description || '—', r.tutorName || '—', money(r.amount), dt(r.dueDate), r.nossoNumero || '—'],
            action: <button onClick={() => openViewer(r.boletoId!)} disabled={!!busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              {busy === 'view:' + r.boletoId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}Reimprimir
            </button>,
          }))} extraHeader={['Nosso nº']} />
        </Section>
      )}

      {/* Boletos emitidos → enviar/gerenciar */}
      <Section title={`Boletos emitidos (${boletos.length})`} subtitle="Enviar e acompanhar">
        {boletos.length === 0 ? <Empty text="Nenhum boleto emitido ainda." /> : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr><th className="text-left px-3 py-2">Pagador</th><th className="text-right px-3 py-2">Valor</th><th className="text-left px-3 py-2">Venc.</th><th className="text-left px-3 py-2">Situação</th><th className="px-3 py-2 text-right">Ações</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {boletos.map(b => (
                  <tr key={b.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 text-slate-700">{b.pagadorNome ?? '—'}{b.environment !== 'production' && <span className="ml-1 text-[9px] uppercase text-amber-500">sbx</span>}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{money(b.valor)}</td>
                    <td className="px-3 py-2.5 text-slate-600">{dt(b.vencimento)}</td>
                    <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SIT[b.situacao]?.cls ?? 'bg-slate-100 text-slate-500'}`}>{SIT[b.situacao]?.label ?? b.situacao}</span></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => openViewer(b.id)} disabled={!!busy} title="Visualizar / imprimir" className="text-slate-400 hover:text-slate-700">{busy === 'view:' + b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}</button>
                        <button onClick={() => openHistory(b.id)} disabled={!!busy} title="Histórico / trilha" className="text-slate-400 hover:text-indigo-700">{busy === 'h:' + b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}</button>
                        <button onClick={() => email(b.id)} disabled={!!busy} title="Enviar por e-mail" className="text-slate-400 hover:text-teal-700">{busy === 'e:' + b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}</button>
                        <button onClick={() => whats(b.id)} disabled={!!busy} title="Enviar por WhatsApp" className="text-slate-400 hover:text-emerald-700">{busy === 'w:' + b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}</button>
                        {b.nossoNumero && b.situacao !== 'baixado' && <>
                          <button onClick={() => refresh(b.id)} disabled={!!busy} title="Atualizar situação" className="text-slate-400 hover:text-sky-600">{busy === 'r:' + b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}</button>
                          <button onClick={() => cancel(b.id)} disabled={!!busy} title="Baixar/cancelar" className="text-slate-400 hover:text-rose-600"><XCircle className="h-3.5 w-3.5" /></button>
                        </>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {history && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => setHistory(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 flex items-center gap-1.5"><Clock className="h-4 w-4 text-indigo-500" />Histórico do boleto</h3>
              <button onClick={() => setHistory(null)} className="text-slate-400 hover:text-slate-600 text-sm">Fechar</button>
            </div>
            <div className="p-5">
              {history.events.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">Sem eventos.</p> : (
                <ol className="relative border-l border-slate-200 ml-2 space-y-4">
                  {history.events.map(ev => (
                    <li key={ev.id} className="ml-4">
                      <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-indigo-400" />
                      <p className="text-[11px] text-slate-400">{new Date(ev.createdAt).toLocaleString('pt-BR')}</p>
                      <p className="text-sm font-medium text-slate-800">{ev.detail ?? ev.eventType}</p>
                      <p className="text-[11px] text-slate-500">por {ev.actorName ?? '—'}{ev.situacao ? ` · ${ev.situacao}` : ''}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}

      {viewer && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setViewer(null)}>
          <div className="my-6 w-full max-w-3xl rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 print:hidden">
              <h3 className="font-semibold text-slate-800">Boleto</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => viewer.publicToken ? window.open(`/public/boleto/${viewer.publicToken}`, '_blank') : window.print()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0E3B2E] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#134A38]"><Printer className="h-4 w-4" />Imprimir</button>
                <button onClick={() => setViewer(null)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Fechar</button>
              </div>
            </div>
            <div className="p-5"><BoletoDocument view={viewer} /></div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2"><h3 className="text-sm font-semibold text-slate-700">{title}</h3>{subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}</div>
      {children}
    </div>
  )
}
function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400"><FileText className="h-7 w-7 mx-auto mb-1.5 text-slate-300" />{text}</div>
}
function Table({ rows, extraHeader = [] }: { rows: { key: string; cells: React.ReactNode[]; action: React.ReactNode }[]; extraHeader?: string[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr><th className="text-left px-3 py-2">Descrição</th><th className="text-left px-3 py-2">Tutor</th><th className="text-right px-3 py-2">Valor</th><th className="text-left px-3 py-2">Vencimento</th>{extraHeader.map(h => <th key={h} className="text-left px-3 py-2">{h}</th>)}<th className="px-3 py-2 text-right">Ação</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(r => (
            <tr key={r.key} className="hover:bg-slate-50/60">
              {r.cells.map((c, i) => <td key={i} className={`px-3 py-2.5 ${i === 2 ? 'text-right font-mono tabular-nums' : 'text-slate-700'}`}>{c}</td>)}
              <td className="px-3 py-2.5 text-right">{r.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
