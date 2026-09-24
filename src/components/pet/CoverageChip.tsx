import { ShieldCheck, Clock, ShieldX, HelpCircle, Wallet } from 'lucide-react'
import { checkProcedureCoverage } from '@/lib/actions/insurance-coverage'

interface Props {
  patientId:     string
  stockItemId?:  string
  procedureName?: string
  /** Quando true, exibe explicação completa; quando false, só o chip compacto. */
  detailed?:     boolean
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
  red:    'bg-red-50      text-red-700     border-red-200',
  gray:   'bg-slate-50    text-slate-600   border-slate-200',
}

/**
 * Server component que consulta a cobertura de um procedimento para um pet
 * específico e renderiza um chip colorido com a situação.
 *
 * Uso:
 *   <CoverageChip patientId={pet.id} procedureName="Vacina V8" />
 *   <CoverageChip patientId={pet.id} stockItemId={item.id} detailed />
 */
export default async function CoverageChip(props: Props) {
  const res = await checkProcedureCoverage({
    patientId:     props.patientId,
    stockItemId:   props.stockItemId,
    procedureName: props.procedureName,
  })

  if ('error' in res) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border bg-slate-50 text-slate-500 border-slate-200">
        <HelpCircle className="h-3 w-3" /> Cobertura indisponível
      </span>
    )
  }

  const Icon = ICON_BY_BADGE[res.badge]
  const style = STYLE_BY_BADGE[res.badge]

  if (!props.detailed) {
    return (
      <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ${style}`} title={res.message}>
        <Icon className="h-3 w-3 flex-shrink-0" />
        {res.status === 'covered'        && `Coberto · copay R$ ${(res.copay_amount ?? 0).toFixed(2)}`}
        {res.status === 'waiting'        && `Em carência · faltam ${res.waiting_remaining_days}d`}
        {res.status === 'not_covered'    && 'Não coberto · particular'}
        {res.status === 'no_insurance'   && 'Sem convênio · particular'}
        {res.status === 'unknown_procedure' && 'Consultar portal'}
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
          {res.status === 'covered' && res.copay_amount !== undefined && res.copay_amount > 0 && (
            <p className="mt-1 inline-flex items-center gap-1 opacity-90">
              <Wallet className="h-3 w-3" />
              {res.copay_charger === 'clinic'   && 'Cobrar no caixa'}
              {res.copay_charger === 'provider' && 'Cobrança automática no cartão do tutor'}
              {res.copay_charger === 'mixed'    && 'Coparticipação dividida'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
