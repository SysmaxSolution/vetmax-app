'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, Clock, ShieldX, HelpCircle, Loader2 } from 'lucide-react'
import { checkProcedureCoverage, type ProcedureCoverageResult } from '@/lib/actions/insurance-coverage'

interface Props {
  patientId:      string
  stockItemId?:   string
  procedureName?: string
  /** Quando true, exibe explicação completa; quando false, só o chip compacto. */
  detailed?:      boolean
}

const ICON_BY_BADGE = {
  green:  ShieldCheck,
  yellow: Clock,
  red:    ShieldX,
  gray:   HelpCircle,
}

const STYLE_BY_BADGE = {
  green:  'bg-emerald-50  text-emerald-700 border-emerald-200',
  yellow: 'bg-amber-50    text-amber-700   border-amber-200',
  red:    'bg-rose-50     text-rose-700    border-rose-200',
  gray:   'bg-slate-50    text-slate-600   border-slate-200',
}

/**
 * Versão client do CoverageChip: faz a chamada via server action assim
 * que recebe (patientId + stockItemId|procedureName), com debounce de 250ms
 * para evitar dispatch durante digitação.
 *
 * Quando o nome do procedimento mudar (ex.: vet digitando "Vacina V8"),
 * recheca a cobertura automaticamente.
 */
export default function CoverageChipClient(props: Props) {
  const [res, setRes]         = useState<ProcedureCoverageResult | null>(null)
  const [loading, setLoading] = useState(false)
  const key = `${props.stockItemId ?? ''}|${(props.procedureName ?? '').toLowerCase().trim()}`

  useEffect(() => {
    if (!props.patientId) return
    if (!props.stockItemId && !(props.procedureName ?? '').trim()) {
      setRes(null)
      return
    }
    setLoading(true)
    const handle = setTimeout(async () => {
      const r = await checkProcedureCoverage({
        patientId:     props.patientId,
        stockItemId:   props.stockItemId,
        procedureName: props.procedureName,
      })
      if (!('error' in r)) setRes(r)
      setLoading(false)
    }, 250)
    return () => { clearTimeout(handle); setLoading(false) }
  }, [props.patientId, key, props.stockItemId, props.procedureName])

  if (loading && !res) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border bg-slate-50 text-slate-400 border-slate-200">
        <Loader2 className="h-3 w-3 animate-spin" /> Verificando…
      </span>
    )
  }

  if (!res) return null

  // Silencia quando o catálogo não conhece o procedimento — medicamentos comuns
  // (dipirona, tramadol, etc.) nunca estão no catálogo Petlove e mostrar
  // "Consultar portal" para tudo polui a UI sem agregar informação.
  // Só renderiza para situações com info útil: coberto / carência / não coberto.
  if (res.status === 'unknown_procedure' || res.status === 'no_insurance') return null

  const Icon = ICON_BY_BADGE[res.badge]
  const style = STYLE_BY_BADGE[res.badge]

  if (!props.detailed) {
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ${style}`} title={res.message}>
        <Icon className="h-3 w-3 flex-shrink-0" />
        {res.status === 'covered'     && `Coberto · copay R$ ${(res.copay_amount ?? 0).toFixed(2)}`}
        {res.status === 'waiting'     && `Em carência · ${res.waiting_remaining_days}d`}
        {res.status === 'not_covered' && 'Não coberto · particular'}
      </span>
    )
  }

  return (
    <div className={`rounded-lg border px-3 py-2 ${style}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div className="flex-1 text-xs">
          <p className="font-semibold">{res.message}</p>
          {res.provider_name && (
            <p className="opacity-80 mt-0.5">
              {res.provider_name} · {res.plan_type}
              {res.procedure_pattern && ` · ${res.procedure_pattern}`}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
