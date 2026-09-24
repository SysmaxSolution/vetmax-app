'use client'

import { barLayout } from '@/lib/reports/chart-geometry'

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function BarChart({ data, height = 160, color = '#7c3aed', money = true }: {
  data: { label: string; value: number }[]
  height?: number
  color?: string
  money?: boolean
}) {
  const W = Math.max(320, data.length * 48)
  const { bars, max } = barLayout(data.map(d => d.value), W, height)
  const fmt = (v: number) => money ? BRL(v) : v.toLocaleString('pt-BR')
  if (data.length === 0) return <div className="py-8 text-center text-sm text-slate-400">Sem dados no período.</div>
  return (
    <div className="overflow-x-auto">
      <svg width="100%" viewBox={`0 0 ${W} ${height + 34}`} className="min-w-[320px]" role="img">
        {[0, 0.5, 1].map(t => (
          <line key={t} x1={0} x2={W} y1={height - height * t} y2={height - height * t} stroke="currentColor" className="text-slate-100" strokeWidth={1} />
        ))}
        {bars.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={b.y} width={b.w} height={Math.max(0, b.h)} rx={3} fill={color}>
              <title>{`${data[i].label}: ${fmt(data[i].value)}`}</title>
            </rect>
            <text x={b.x + b.w / 2} y={height + 14} textAnchor="middle" className="fill-slate-500" fontSize={10}>{data[i].label}</text>
            {b.h > 14 && <text x={b.x + b.w / 2} y={b.y - 3} textAnchor="middle" className="fill-slate-600" fontSize={9}>{money ? '' : data[i].value}</text>}
          </g>
        ))}
        <text x={0} y={10} className="fill-slate-300" fontSize={9}>{fmt(max)}</text>
      </svg>
    </div>
  )
}
