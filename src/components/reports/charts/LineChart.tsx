'use client'

import { linePoints, polylinePath } from '@/lib/reports/chart-geometry'

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function LineChart({ data, height = 160, color = '#0d9488' }: {
  data: { label: string; value: number }[]
  height?: number
  color?: string
}) {
  const W = Math.max(320, data.length * 60)
  const { points, max } = linePoints(data.map(d => d.value), W, height)
  if (data.length === 0) return <div className="py-8 text-center text-sm text-slate-400">Sem dados no período.</div>
  const path = polylinePath(points)
  const area = points.length ? `${path} L${points[points.length - 1].x.toFixed(2)},${height} L${points[0].x.toFixed(2)},${height} Z` : ''
  return (
    <div className="overflow-x-auto">
      <svg width="100%" viewBox={`0 0 ${W} ${height + 34}`} className="min-w-[320px]" role="img">
        {[0, 0.5, 1].map(t => (
          <line key={t} x1={0} x2={W} y1={height - height * t} y2={height - height * t} stroke="currentColor" className="text-slate-100" strokeWidth={1} />
        ))}
        <path d={area} fill={color} opacity={0.08} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} fill={color}><title>{`${data[i].label}: ${BRL(data[i].value)}`}</title></circle>
            <text x={p.x} y={height + 14} textAnchor="middle" className="fill-slate-500" fontSize={10}>{data[i].label}</text>
          </g>
        ))}
        <text x={0} y={10} className="fill-slate-300" fontSize={9}>{BRL(max)}</text>
      </svg>
    </div>
  )
}
