'use client'

import type { CashierReportSummary } from '@/lib/actions/cashier-reports'

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX', credit: 'Crédito', debit: 'Débito',
  cash: 'Dinheiro', convenio: 'Convênio', other: 'Outro',
  nao_informado: 'N/I',
}

const PAYMENT_COLORS: Record<string, string> = {
  pix:           '#10b981',
  credit:        '#3b82f6',
  debit:         '#8b5cf6',
  cash:          '#f59e0b',
  convenio:      '#ec4899',
  other:         '#64748b',
  nao_informado: '#94a3b8',
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtShort(v: number) {
  if (v >= 1000) return `R$ ${(v / 1000).toFixed(1)}k`
  return `R$ ${v.toFixed(0)}`
}

// ─── Bar Chart: Entradas vs Saídas por dia ────────────────────────────────────

function BarChart({ data }: { data: CashierReportSummary['by_day'] }) {
  if (data.length === 0) return null

  const maxVal = Math.max(
    ...data.map(d => Math.max(d.inflows, d.outflows)),
    1,
  )

  const W = 600
  const H = 200
  const PAD = { top: 20, right: 20, bottom: 40, left: 50 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const barGroupW = innerW / data.length
  const barW = (barGroupW - 4) / 2

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
        Entradas vs Saídas por dia
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        {/* Y axis */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH} stroke="#cbd5e1" />
        {[0, 0.5, 1].map(p => {
          const y = PAD.top + innerH - p * innerH
          const v = maxVal * p
          return (
            <g key={p}>
              <line x1={PAD.left} y1={y} x2={PAD.left + innerW} y2={y} stroke="#f1f5f9" />
              <text x={PAD.left - 4} y={y + 3} fontSize="9" fill="#94a3b8" textAnchor="end">
                {fmtShort(v)}
              </text>
            </g>
          )
        })}
        {/* Bars */}
        {data.map((d, i) => {
          const x0 = PAD.left + i * barGroupW + 2
          const inflowH  = (d.inflows  / maxVal) * innerH
          const outflowH = (d.outflows / maxVal) * innerH
          return (
            <g key={d.date}>
              <rect
                x={x0}
                y={PAD.top + innerH - inflowH}
                width={barW}
                height={inflowH}
                fill="#10b981"
                rx="2"
              >
                <title>{`${d.date} · Entradas: ${fmt(d.inflows)}`}</title>
              </rect>
              <rect
                x={x0 + barW + 2}
                y={PAD.top + innerH - outflowH}
                width={barW}
                height={outflowH}
                fill="#ef4444"
                rx="2"
              >
                <title>{`${d.date} · Saídas: ${fmt(d.outflows)}`}</title>
              </rect>
              {/* X label — só a cada N para não embolar */}
              {(data.length <= 10 || i % Math.ceil(data.length / 10) === 0) && (
                <text
                  x={x0 + barW}
                  y={PAD.top + innerH + 14}
                  fontSize="9"
                  fill="#64748b"
                  textAnchor="middle"
                >
                  {d.date.slice(5)}
                </text>
              )}
            </g>
          )
        })}
        {/* Legend */}
        <g transform={`translate(${PAD.left}, ${H - 10})`}>
          <rect width="10" height="10" fill="#10b981" rx="2" />
          <text x="14" y="9" fontSize="10" fill="#475569">Entradas</text>
          <rect x="80" width="10" height="10" fill="#ef4444" rx="2" />
          <text x="94" y="9" fontSize="10" fill="#475569">Saídas</text>
        </g>
      </svg>
    </div>
  )
}

// ─── Pie Chart: Forma de pagamento ────────────────────────────────────────────

function PieChart({ data }: { data: CashierReportSummary['by_payment_method'] }) {
  const entries = Object.entries(data).filter(([, v]) => v.amount > 0)
  if (entries.length === 0) return null

  const total = entries.reduce((s, [, v]) => s + v.amount, 0)
  const cx = 70, cy = 70, r = 60

  let acc = 0
  const slices = entries.map(([key, v]) => {
    const start = acc / total
    acc += v.amount
    const end = acc / total
    const startAngle = start * 2 * Math.PI - Math.PI / 2
    const endAngle   = end   * 2 * Math.PI - Math.PI / 2
    const x1 = cx + r * Math.cos(startAngle)
    const y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)
    const largeArc = end - start > 0.5 ? 1 : 0
    return {
      key,
      path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      pct: ((v.amount / total) * 100).toFixed(1),
      amount: v.amount,
      count: v.count,
    }
  })

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
        Recebimentos por Forma de Pagamento
      </p>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 140 140" className="w-32 h-32 flex-shrink-0">
          {slices.map(s => (
            <path
              key={s.key}
              d={s.path}
              fill={PAYMENT_COLORS[s.key] ?? '#94a3b8'}
              stroke="white"
              strokeWidth="1"
            >
              <title>{`${PAYMENT_LABELS[s.key] ?? s.key}: ${fmt(s.amount)} (${s.pct}%)`}</title>
            </path>
          ))}
        </svg>
        <div className="flex-1 space-y-1.5 text-xs">
          {slices.map(s => (
            <div key={s.key} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-3 h-3 rounded-sm"
                  style={{ backgroundColor: PAYMENT_COLORS[s.key] ?? '#94a3b8' }}
                />
                <span className="text-slate-700">{PAYMENT_LABELS[s.key] ?? s.key}</span>
              </div>
              <div className="text-right">
                <span className="font-semibold text-slate-900 tabular-nums">{fmt(s.amount)}</span>
                <span className="ml-1.5 text-slate-400">({s.pct}%)</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface Props {
  data: CashierReportSummary
}

export default function ReportCharts({ data }: Props) {
  if (data.totals.count === 0) return null
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <BarChart data={data.by_day} />
      <PieChart data={data.by_payment_method} />
    </div>
  )
}
