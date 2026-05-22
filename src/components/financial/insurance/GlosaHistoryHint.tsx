import { AlertTriangle } from 'lucide-react'
import { getGlosaHistoryByProcedure } from '@/lib/actions/petlove-glosas'

interface Props {
  /** Quando passado, filtra histórico para esse procedimento. */
  procedureName?: string
  /** Quantos registros mostrar (default 5). */
  limit?: number
}

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Server component compacto que carrega o histórico de glosas dos últimos 6 meses
 * e exibe os procedimentos mais glosados — útil como hint pré-procedimento.
 */
export default async function GlosaHistoryHint({ procedureName, limit = 5 }: Props) {
  const res = await getGlosaHistoryByProcedure()
  if ('error' in res) return null

  const filtered = procedureName
    ? res.filter(r => r.procedure_name.toLowerCase().includes(procedureName.toLowerCase()))
    : res

  const top = filtered.slice(0, limit)
  if (top.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs">
      <div className="flex items-center gap-1.5 text-amber-800 font-semibold mb-1.5">
        <AlertTriangle className="h-3.5 w-3.5" />
        Histórico de glosas (últimos 6 meses)
      </div>
      <ul className="space-y-0.5">
        {top.map(p => (
          <li key={p.procedure_name} className="flex items-center justify-between text-amber-900">
            <span className="truncate flex-1 pr-2">{p.procedure_name}</span>
            <span className="flex-shrink-0">
              <strong>{p.glosa_count}×</strong> · {BRL(p.total_loss)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
