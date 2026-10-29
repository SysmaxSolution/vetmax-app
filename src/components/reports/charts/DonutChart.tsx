'use client'

import { donutSegments } from '@/lib/reports/chart-geometry'

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const PALETTE = ['#7c3aed', '#0d9488', '#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#ec4899', '#64748b']

export default function DonutChart({ data, size = 160 }: {
  data: { label: string; value: number }[]
  size?: number
}) {
  if (data.length === 0) return <div className="py-8 text-center text-sm text-slate-400">Sem dados no período.</div>
  const r = size / 2 - 12
  const circ = 2 * Math.PI * r
  const segs = donutSegments(data.map(d => d.value), circ)
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0)
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segs.map((s, i) => (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={PALETTE[i % PALETTE.length]} strokeWidth={16}
              strokeDasharray={`${s.dash} ${circ - s.dash}`} strokeDashoffset={s.offset}>
              <title>{`${data[i].label}: ${BRL(data[i].value)} (${s.pct}%)`}</title>
            </circle>
          ))}
        </g>
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" className="fill-slate-400" fontSize={9}>Total</text>
        <text x={size / 2} y={size / 2 + 12} textAnchor="middle" className="fill-slate-800" fontSize={11} fontWeight="bold">{BRL(total)}</text>
      </svg>
      <ul className="space-y-1 text-xs">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            <span className="text-slate-600 truncate max-w-[160px]">{d.label}</span>
            <span className="text-slate-400 font-mono ml-auto">{segs[i].pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
