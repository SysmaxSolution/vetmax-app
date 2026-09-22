import { trendGeometry } from '@/lib/portal/trend'
import type { PortalTrend } from '@/lib/portal/types'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const W = 320, H = 64, PAD = 8
const FLAG_COLOR: Record<string, string> = { H: '#e11d48', L: '#0284c7', A: '#d97706' }

function fmtDate(d: string): string {
  const s = d.length <= 10 ? d + 'T12:00:00' : d
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

export default function TrendChart({ trend }: { trend: PortalTrend }) {
  const values = trend.points.map(p => p.value)
  const { pts } = trendGeometry(values, W, H, PAD)
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${path} L${pts[pts.length - 1].x.toFixed(1)},${H} L${pts[0].x.toFixed(1)},${H} Z`
  const last = trend.points[trend.points.length - 1]
  const first = trend.points[0]
  const delta = last.value - first.value
  const dir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'

  return (
    <div className="px-6 py-4">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium text-[#16221C]">{trend.analyte}</span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold tabular-nums" style={{ color: last.flag && FLAG_COLOR[last.flag] ? FLAG_COLOR[last.flag] : '#16221C' }}>
            {fmtNum(last.value)}{trend.unit ? ` ${trend.unit}` : ''}
          </span>
          <span className={`inline-flex items-center text-[11px] ${dir === 'up' ? 'text-rose-600' : dir === 'down' ? 'text-sky-600' : 'text-[#9AA69F]'}`}>
            {dir === 'up' ? <TrendingUp className="h-3 w-3" /> : dir === 'down' ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          </span>
        </span>
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block">
        <defs>
          <linearGradient id={`g-${trend.analyte.replace(/\W/g, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#17624A" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#17624A" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#g-${trend.analyte.replace(/\W/g, '')})`} />
        <path d={path} fill="none" stroke="#17624A" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => {
          const f = trend.points[i].flag
          return <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 3.2 : 2}
            fill={f && FLAG_COLOR[f] ? FLAG_COLOR[f] : '#17624A'} stroke="#fff" strokeWidth="1" />
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-[#B3BDB6] mt-0.5">
        <span>{fmtDate(first.date)}</span>
        <span>{fmtDate(last.date)}</span>
      </div>
    </div>
  )
}
