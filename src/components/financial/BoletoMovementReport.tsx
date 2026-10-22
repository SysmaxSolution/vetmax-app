'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, Search, Download, Printer } from 'lucide-react'
import { listBoletoMovements, type BoletoMovement } from '@/lib/actions/boleto-cobranca'

const money = (n: number | null) => (n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const dt = (s: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—')
const dth = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const EVENT: Record<string, { label: string; cls: string }> = {
  emitido: { label: 'Emitido', cls: 'bg-slate-100 text-slate-600' },
  reimpresso: { label: '2ª via', cls: 'bg-slate-100 text-slate-500' },
  email_enviado: { label: 'E-mail', cls: 'bg-teal-100 text-teal-700' },
  whatsapp_enviado: { label: 'WhatsApp', cls: 'bg-emerald-100 text-emerald-700' },
  consulta: { label: 'Consulta', cls: 'bg-sky-100 text-sky-700' },
  retorno_banco: { label: 'Retorno do banco', cls: 'bg-indigo-100 text-indigo-700' },
  instrucao: { label: 'Instrução', cls: 'bg-amber-100 text-amber-700' },
  pago: { label: 'Pago', cls: 'bg-emerald-100 text-emerald-700' },
  baixado: { label: 'Baixado', cls: 'bg-amber-100 text-amber-700' },
  erro: { label: 'Erro', cls: 'bg-rose-100 text-rose-700' },
}
const TITULO: Record<string, string> = { pending: 'Em aberto', paid: 'Pago', cancelled: 'Cancelado' }

export default function BoletoMovementReport() {
  const [rows, setRows] = useState<BoletoMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [f, setF] = useState({ from: '', to: '', eventType: '', situacao: '', search: '' })

  const load = useCallback(async () => {
    setLoading(true)
    setRows(await listBoletoMovements({
      from: f.from || undefined, to: f.to || undefined, eventType: f.eventType || undefined,
      situacao: f.situacao || undefined, search: f.search || undefined,
    }))
    setLoading(false)
  }, [f])
  useEffect(() => { load() }, [load])

  function exportCsv() {
    const head = ['Data/Hora', 'Pagador', 'Nosso nº', 'Seu nº', 'Valor', 'Vencimento', 'Evento', 'Quem fez', 'Situação do título', 'Detalhe', 'Ambiente']
    const lines = rows.map(r => [dth(r.createdAt), r.pagadorNome ?? '', r.nossoNumero ?? '', r.seuNumero ?? '', money(r.valor), dt(r.vencimento), EVENT[r.eventType]?.label ?? r.eventType, r.actorName ?? '', TITULO[r.tituloStatus ?? ''] ?? r.tituloStatus ?? '', (r.detail ?? '').replace(/[\r\n;]/g, ' '), r.environment ?? ''])
    const csv = [head, ...lines].map(l => l.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'movimentacao-boletos.csv'; a.click()
  }

  const F = 'rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm'
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2 print:hidden">
        <button onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Download className="h-3.5 w-3.5" />CSV</button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Printer className="h-3.5 w-3.5" />Imprimir</button>
      </div>

      {/* filtros */}
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <div><label className="block text-[11px] text-slate-500">De</label><input type="date" className={F} value={f.from} onChange={e => setF(s => ({ ...s, from: e.target.value }))} /></div>
        <div><label className="block text-[11px] text-slate-500">Até</label><input type="date" className={F} value={f.to} onChange={e => setF(s => ({ ...s, to: e.target.value }))} /></div>
        <div><label className="block text-[11px] text-slate-500">Evento</label>
          <select className={F} value={f.eventType} onChange={e => setF(s => ({ ...s, eventType: e.target.value }))}>
            <option value="">Todos</option>
            {Object.entries(EVENT).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div><label className="block text-[11px] text-slate-500">Situação do título</label>
          <select className={F} value={f.situacao} onChange={e => setF(s => ({ ...s, situacao: e.target.value }))}>
            <option value="">Todas</option><option value="pending">Em aberto</option><option value="paid">Pago</option><option value="cancelled">Cancelado</option>
          </select>
        </div>
        <div className="flex-1 min-w-[160px]"><label className="block text-[11px] text-slate-500">Buscar (pagador / nº)</label>
          <div className="relative"><Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-400" /><input className={`${F} w-full pl-7`} value={f.search} onChange={e => setF(s => ({ ...s, search: e.target.value }))} placeholder="nome ou nosso número" /></div>
        </div>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] text-slate-500 uppercase">
              <tr>
                <th className="text-left px-3 py-2">Data/Hora</th><th className="text-left px-3 py-2">Pagador</th>
                <th className="text-left px-3 py-2">Nosso nº</th><th className="text-right px-3 py-2">Valor</th>
                <th className="text-left px-3 py-2">Venc.</th><th className="text-left px-3 py-2">Evento</th>
                <th className="text-left px-3 py-2">Quem fez</th><th className="text-left px-3 py-2">Título</th>
                <th className="text-left px-3 py-2">Detalhe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? <tr><td colSpan={9} className="py-8 text-center text-slate-400">Nenhuma movimentação no período.</td></tr>
              : rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/60 align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600 tabular-nums">{dth(r.createdAt)}</td>
                  <td className="px-3 py-2 text-slate-700">{r.pagadorNome ?? '—'}{r.environment !== 'production' && <span className="ml-1 text-[9px] uppercase text-amber-500">sbx</span>}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{r.nossoNumero ?? '—'}</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">{money(r.valor)}</td>
                  <td className="px-3 py-2 text-slate-600">{dt(r.vencimento)}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${EVENT[r.eventType]?.cls ?? 'bg-slate-100'}`}>{EVENT[r.eventType]?.label ?? r.eventType}</span></td>
                  <td className="px-3 py-2 text-slate-600">{r.actorName ?? '—'}{r.actorType === 'bank' && <span className="ml-1 text-[9px] text-indigo-500">banco</span>}</td>
                  <td className="px-3 py-2 text-slate-600">{TITULO[r.tituloStatus ?? ''] ?? '—'}</td>
                  <td className="px-3 py-2 text-[12px] text-slate-500 max-w-[280px]">{r.detail ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-slate-400 print:hidden">{rows.length} movimento(s). Registra emissão, 2ª via, envios, consultas, instruções, retornos do banco, pagamentos e baixas — com quem fez e quando.</p>
    </div>
  )
}
