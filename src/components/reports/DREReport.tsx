'use client'

import { useState, useTransition } from 'react'
import { getDREReport, type DRELine } from '@/lib/actions/reports-g13'

const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function DREReport() {
  const today   = new Date().toISOString().split('T')[0]
  const firstOfMonth = today.slice(0, 7) + '-01'

  const [from,    setFrom]    = useState(firstOfMonth)
  const [to,      setTo]      = useState(today)
  const [lines,   setLines]   = useState<DRELine[] | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startT]     = useTransition()

  function run() {
    startT(async () => {
      setError(null)
      const res = await getDREReport({ from, to })
      if ('error' in res) { setError(res.error); return }
      setLines(res)
    })
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-end print:hidden">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">De</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="w-full sm:w-auto rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={run} disabled={pending}
            className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60 transition-colors">
            {pending ? 'Carregando…' : 'Gerar'}
          </button>
          {lines && (
            <button onClick={handlePrint}
              className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
              Imprimir / Exportar PDF
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 print:hidden">{error}</div>
      )}

      {lines === null && !pending && (
        <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-8 text-center text-sm text-slate-500 print:hidden">
          Selecione o período e clique em Gerar para ver a DRE.
        </div>
      )}

      {lines !== null && (
        <div className="rounded-xl border border-slate-200 overflow-x-auto">
          {/* Print header */}
          <div className="hidden print:block px-6 py-4 border-b border-slate-200">
            <h2 className="text-lg font-bold">Demonstração do Resultado do Exercício (DRE)</h2>
            <p className="text-sm text-slate-500">
              Período: {new Date(from + 'T00:00:00').toLocaleDateString('pt-BR')} a {new Date(to + 'T00:00:00').toLocaleDateString('pt-BR')}
            </p>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-slate-50 print:bg-slate-100">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-slate-500 text-xs uppercase tracking-wide">Conta</th>
                <th className="px-6 py-3 text-right font-semibold text-slate-500 text-xs uppercase tracking-wide">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line, i) => {
                const isPositive = !line.negative && line.value >= 0
                const isNegLine  = line.negative
                const isLAJIR    = line.label.startsWith('LAJIR')
                return (
                  <tr key={i} className={`
                    ${line.bold ? 'bg-slate-50' : ''}
                    ${isLAJIR ? 'bg-teal-50' : ''}
                    hover:bg-slate-50 transition-colors
                  `}>
                    <td className={`px-6 py-3 ${line.bold ? 'font-bold text-slate-800' : 'text-slate-600'}`}
                      style={{ paddingLeft: `${24 + line.indent * 20}px` }}>
                      {line.label}
                    </td>
                    <td className={`px-6 py-3 text-right font-mono ${
                      line.bold ? 'font-bold' : ''
                    } ${
                      isNegLine
                        ? 'text-red-600'
                        : isPositive
                          ? (line.value > 0 ? 'text-emerald-700' : 'text-slate-700')
                          : 'text-red-600'
                    }`}>
                      {isNegLine && line.value > 0 ? `(${fmt(line.value)})` : fmt(line.value)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 space-y-1">
            <p className="text-xs font-semibold text-teal-700">Regime de caixa (considera apenas títulos baixados no período, pela data de pagamento).</p>
            <p className="text-xs text-slate-400">
              * Adiantamentos são passivo (a receita é reconhecida no consumo do crédito).
              Compras de estoque viram CMV no consumo, não despesa na compra. Transferências
              inter-CNPJ são eliminadas. Valores em parênteses representam deduções.
            </p>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:block, .print\\:block * { visibility: visible; }
          table, table * { visibility: visible; }
          .rounded-xl { position: fixed; top: 0; left: 0; width: 100%; }
        }
      `}</style>
    </div>
  )
}
