'use client'

// Livro de Controlados (1.7) — razão por substância, humano × veterinário.
// Sintético: card-resumo por item (saldo inicial/entradas/saídas/perdas/saldo).
// Analítico: razão cronológica expansível por item. Imprimível p/ Vigilância.

import { useState, useTransition } from 'react'
import { getControlledBook, type ControlledBook, type ControlledItemBook } from '@/lib/actions/controlled-book'

const fmtQty = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const fmtDate = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')

const KIND_LABEL: Record<string, string> = { entrada: 'Entrada', saida: 'Saída', perda: 'Perda/Inutilização', ajuste: 'Ajuste' }
const KIND_COLOR: Record<string, string> = { entrada: 'text-emerald-700', saida: 'text-rose-600', perda: 'text-amber-600', ajuste: 'text-slate-600' }

export default function ControlledBookReport() {
  const today = new Date().toISOString().split('T')[0]
  const oneYearAgo = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split('T')[0] })()

  const [from, setFrom] = useState(today.slice(0, 7) + '-01')
  const [to, setTo] = useState(today)
  const [book, setBook] = useState<ControlledBook | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()

  function run(f = from, t = to) {
    startT(async () => {
      setError(null)
      const res = await getControlledBook({ from: f, to: t })
      if ('error' in res) { setError(res.error); return }
      setBook(res)
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-end print:hidden">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">De</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => run()} disabled={pending}
            className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60">
            {pending ? 'Carregando…' : 'Gerar'}
          </button>
          <button onClick={() => { setFrom(oneYearAgo); setTo(today); run(oneYearAgo, today) }} disabled={pending}
            className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Último ano (retroativo)
          </button>
          {book && (
            <button onClick={() => window.print()}
              className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Imprimir / PDF (Vigilância)
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 print:hidden">{error}</div>}

      {book === null && !pending && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-8 text-center text-sm text-slate-500 print:hidden">
          Selecione o período e clique em Gerar. Use “Último ano” para o retroativo exigido pela Vigilância.
        </div>
      )}

      {book && (
        <div className="space-y-6">
          <div className="hidden print:block">
            <h2 className="text-lg font-bold">Livro de Registro de Medicamentos Controlados</h2>
            <p className="text-sm text-slate-500">Período: {new Date(from + 'T00:00:00').toLocaleDateString('pt-BR')} a {new Date(to + 'T00:00:00').toLocaleDateString('pt-BR')} · Portaria SVS/MS 344/1998</p>
          </div>

          {book.veterinary.length === 0 && book.human.length === 0 && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              Nenhum medicamento controlado com movimento no período. Marque os itens como “Controlado” e preencha a substância no cadastro do estoque.
            </div>
          )}

          <BookSection title="Forma Farmacêutica Veterinária" items={book.veterinary} />
          <BookSection title="Forma Farmacêutica Humana" items={book.human} />
        </div>
      )}

      <style>{`@media print { body * { visibility: hidden; } .print-book, .print-book * { visibility: visible; } .print-book { position: absolute; top: 0; left: 0; width: 100%; } }`}</style>
    </div>
  )
}

function BookSection({ title, items }: { title: string; items: ControlledItemBook[] }) {
  if (items.length === 0) return null
  return (
    <div className="print-book space-y-3">
      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide border-b border-slate-200 pb-1">{title}</h3>
      {items.map(item => <ItemBook key={item.stock_item_id} item={item} />)}
    </div>
  )
}

function ItemBook({ item }: { item: ControlledItemBook }) {
  const [open, setOpen] = useState(false)
  const unit = item.unit ?? 'un'
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50/60 hover:bg-slate-50 text-left print:cursor-default">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">
            {item.substance || item.name}
            {item.concentration && <span className="text-slate-400 font-normal"> · {item.concentration}</span>}
            {item.control_class && <span className="ml-2 text-[10px] font-bold uppercase rounded-full bg-violet-100 text-violet-700 px-1.5 py-0.5">{item.control_class}</span>}
          </p>
          {item.substance && <p className="text-xs text-slate-400 truncate">{item.name}</p>}
        </div>
        <div className="flex items-center gap-4 text-xs flex-shrink-0">
          <Stat label="Inicial" value={`${fmtQty(item.opening_balance)} ${unit}`} />
          <Stat label="Entradas" value={`+${fmtQty(item.total_in)}`} color="text-emerald-700" />
          <Stat label="Saídas" value={`−${fmtQty(item.total_out)}`} color="text-rose-600" />
          {item.total_loss > 0 && <Stat label="Perdas" value={`−${fmtQty(item.total_loss)}`} color="text-amber-600" />}
          <Stat label="Saldo" value={`${fmtQty(item.closing_balance)} ${unit}`} color="text-slate-900" bold />
        </div>
      </button>

      {(open) && (
        <div className="overflow-x-auto print:!block">
          <table className="w-full text-xs">
            <thead className="bg-white text-[10px] text-slate-400 uppercase tracking-wide border-y border-slate-100">
              <tr>
                <th className="text-left px-4 py-2">Data</th>
                <th className="text-left px-2 py-2">Operação</th>
                <th className="text-left px-2 py-2">Origem / Tomador</th>
                <th className="text-right px-2 py-2">Qtd</th>
                <th className="text-right px-4 py-2">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              <tr className="text-slate-400"><td className="px-4 py-1.5" colSpan={4}>Saldo anterior</td><td className="px-4 py-1.5 text-right font-mono">{fmtQty(item.opening_balance)}</td></tr>
              {item.entries.map((e, i) => (
                <tr key={i} className="hover:bg-slate-50/50">
                  <td className="px-4 py-1.5 whitespace-nowrap text-slate-500">{fmtDate(e.date)}</td>
                  <td className={`px-2 py-1.5 font-medium ${KIND_COLOR[e.kind]}`}>{KIND_LABEL[e.kind]}</td>
                  <td className="px-2 py-1.5 text-slate-600 truncate max-w-[220px]">{e.origin}{e.reference ? ` · ${e.reference}` : ''}</td>
                  <td className={`px-2 py-1.5 text-right font-mono ${e.quantity >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{e.quantity >= 0 ? '+' : ''}{fmtQty(e.quantity)}</td>
                  <td className="px-4 py-1.5 text-right font-mono font-semibold">{fmtQty(e.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color = 'text-slate-700', bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className="text-right">
      <span className="block text-[9px] text-slate-400 uppercase">{label}</span>
      <span className={`font-mono tabular-nums ${color} ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  )
}
