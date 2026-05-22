'use client'

import { useEffect, useState } from 'react'
import { Wallet, CreditCard, FileClock, ShieldCheck, TrendingDown, Loader2, Scissors } from 'lucide-react'
import { previewConsultationInsurance } from '@/lib/actions/insurance-checkout'
import type { CheckoutInsurancePreview } from '@/lib/actions/insurance-checkout.types'
import TutorSummaryPrint from '@/components/financial/TutorSummaryPrint'

interface Props {
  consultationId: string
  patientName?:   string
  tutorName?:     string
  serviceDate?:   string
  clinicName?:    string
  /**
   * Quando true, o componente assume que a cobertura JÁ FOI APLICADA na
   * invoice (banco tem discount > 0 e entry is_clinic_discount). Esconde o
   * botão "Aplicar cobertura" — não há mais ação a tomar, só visualização.
   */
  alreadyApplied?: boolean
  /**
   * Disparado quando o usuário clica "Aplicar Cobertura". O parent (CheckoutModal)
   * deve ajustar o valor a receber para charge_now e enviar o split no payload
   * de processPayment para criar o entry pending de receivable.
   */
  onApplyInsurance?: (split: {
    charge_now:        number
    receivable:        number
    clinic_discount:   number
    procedure_pattern: string
    has_insurance:     boolean
  } | null) => void
}

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const STATUS_BADGE: Record<string, string> = {
  covered:           'bg-emerald-100 text-emerald-700 border-emerald-200',
  waiting:           'bg-amber-100   text-amber-700   border-amber-200',
  not_covered:       'bg-rose-100    text-rose-700    border-rose-200',
  no_insurance:      'bg-slate-100   text-slate-600   border-slate-200',
  unknown_procedure: 'bg-slate-100   text-slate-600   border-slate-200',
}

const STATUS_LABEL: Record<string, string> = {
  covered:           'Coberto',
  waiting:           'Em carência',
  not_covered:       'Não coberto',
  no_insurance:      'Sem convênio',
  unknown_procedure: 'Consultar portal',
}

/**
 * Versão client do CheckoutInsurancePreview — chama a server action via
 * useEffect. Necessária porque o componente original é async server e não
 * pode ser renderizado dentro de client components (ex.: CheckoutModal).
 */
export default function CheckoutInsurancePreviewClient(props: Props) {
  const [preview, setPreview] = useState<CheckoutInsurancePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    if (!props.consultationId) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    previewConsultationInsurance(props.consultationId)
      .then(res => {
        if (cancelled) return
        // Defesa: resposta pode vir como Promise rejection serializada, objeto
        // de erro server-action, ou o payload válido. Verificamos a forma antes
        // de aplicar 'in' (que crasha se res não for object).
        if (!res || typeof res !== 'object') {
          setError('Resposta inválida do servidor')
          return
        }
        if ('error' in res && typeof res.error === 'string') {
          setError(res.error)
          return
        }
        if ('items' in res && Array.isArray((res as { items: unknown }).items)) {
          setPreview(res as CheckoutInsurancePreview)
          return
        }
        setError('Formato de resposta inesperado')
      })
      .catch(err => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'erro inesperado')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [props.consultationId])

  if (loading) {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50/50 px-4 py-3 flex items-center gap-2 text-xs text-sky-700">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Carregando prévia do convênio…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        Prévia indisponível: {error}
      </div>
    )
  }

  if (!preview) return null

  if (!preview.has_insurance) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 flex items-center gap-2">
        <Wallet className="h-3.5 w-3.5" />
        Sem convênio identificado — cobrar particular o valor cheio
      </div>
    )
  }

  const { totals } = preview

  return (
    <section className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 overflow-hidden">
      <header className="px-5 py-3 border-b border-sky-200/70 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-sky-600" />
          <h3 className="text-sm font-semibold text-sky-900">
            Caixa Inteligente · {preview.provider_name} {preview.plan_type}
          </h3>
        </div>
        <span className="text-[11px] text-sky-700 font-medium">{preview.items.length} procedimento{preview.items.length !== 1 ? 's' : ''}</span>
      </header>

      {/* Totalizadores — lista horizontal compacta que cabe em qualquer modal */}
      <div className="px-4 py-3 border-b border-sky-200/60 space-y-1.5">
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-white border border-sky-100">
          <div className="flex items-center gap-2 text-xs text-sky-800 min-w-0">
            <Wallet className="h-3.5 w-3.5 text-sky-600 flex-shrink-0" />
            <span className="truncate">Cobrar do tutor AGORA</span>
          </div>
          <span className="text-sm font-bold text-sky-900 tabular-nums flex-shrink-0">{BRL(totals.charge_now)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-white border border-sky-100">
          <div className="flex items-center gap-2 text-xs text-sky-800 min-w-0">
            <CreditCard className="h-3.5 w-3.5 text-sky-600 flex-shrink-0" />
            <span className="truncate">Petlove cobra no cartão</span>
          </div>
          <span className="text-sm font-bold text-sky-900 tabular-nums flex-shrink-0">{BRL(totals.deferred_provider)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-white border border-sky-100">
          <div className="flex items-center gap-2 text-xs text-sky-800 min-w-0">
            <FileClock className="h-3.5 w-3.5 text-sky-600 flex-shrink-0" />
            <span className="truncate">A Receber Petlove (repasse)</span>
          </div>
          <span className="text-sm font-bold text-sky-900 tabular-nums flex-shrink-0">{BRL(totals.receivable)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-emerald-50 border border-emerald-200">
          <div className="flex items-center gap-2 text-xs text-emerald-800 min-w-0">
            <TrendingDown className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
            <span className="truncate">Tutor economizou</span>
          </div>
          <span className="text-sm font-bold text-emerald-900 tabular-nums flex-shrink-0">{BRL(totals.tutor_saved)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-rose-50 border border-rose-200">
          <div className="flex items-center gap-2 text-xs text-rose-800 min-w-0">
            <Scissors className="h-3.5 w-3.5 text-rose-600 flex-shrink-0" />
            <span className="truncate">Desconto da clínica</span>
          </div>
          <span className="text-sm font-bold text-rose-900 tabular-nums flex-shrink-0">{BRL(totals.clinic_discount)}</span>
        </div>
      </div>

      {/* Lista de itens */}
      <ul className="divide-y divide-sky-100">
        {preview.items.map(it => (
          <li key={it.invoice_item_id} className="px-5 py-2.5 flex items-center justify-between text-xs">
            <div className="min-w-0 flex-1 pr-3">
              <div className="flex items-center gap-2">
                <span className="text-slate-800 font-medium truncate">{it.description}</span>
                <span className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${STATUS_BADGE[it.coverage.status]}`}>
                  {STATUS_LABEL[it.coverage.status]}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">{it.coverage.message}</p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {it.charge_now > 0 && (
                <span className="text-sky-700">caixa <strong className="tabular-nums">{BRL(it.charge_now)}</strong></span>
              )}
              {it.deferred_provider > 0 && (
                <span className="text-sky-700">cartão <strong className="tabular-nums">{BRL(it.deferred_provider)}</strong></span>
              )}
              {it.receivable > 0 && (
                <span className="text-emerald-700">repasse <strong className="tabular-nums">{BRL(it.receivable)}</strong></span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Ações: aplicar / remover cobertura — só quando a cobertura NÃO está
          aplicada ainda no banco. Se alreadyApplied=true, mostramos apenas
          estado consolidado (sem botão de re-aplicar, evita duplicação). */}
      {props.alreadyApplied ? (
        <div className="px-5 py-2.5 border-t border-sky-200/60 bg-sky-50 text-[11px] text-sky-800 flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-sky-600 flex-shrink-0" />
          <span>
            <strong>Cobertura já aplicada nesta fatura</strong> — desconto convênio
            de {BRL(totals.clinic_discount)} contabilizado. Saldo {BRL(totals.receivable)}
            aguardando repasse Petlove.
          </span>
        </div>
      ) : props.onApplyInsurance && totals.charge_now < totals.grand_total && (
        <div className="px-5 py-2.5 border-t border-sky-200/60 bg-sky-50 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] text-sky-800">
            {applied ? (
              <><strong>Cobertura aplicada</strong> — caixa cobra apenas {BRL(totals.charge_now)} do tutor. Saldo {BRL(totals.receivable)} fica como A Receber Petlove.</>
            ) : (
              <>Clique para aplicar a cobertura — caixa cobra só {BRL(totals.charge_now)} do tutor e {BRL(totals.receivable)} vira A Receber Petlove.</>
            )}
          </span>
          {applied ? (
            <button
              type="button"
              onClick={() => { setApplied(false); props.onApplyInsurance?.(null) }}
              className="text-[11px] font-semibold text-rose-700 hover:text-rose-900 px-3 py-1 rounded border border-rose-200 hover:bg-rose-50"
            >
              Remover cobertura
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setApplied(true)
                props.onApplyInsurance?.({
                  charge_now:        totals.charge_now,
                  receivable:        totals.receivable,
                  clinic_discount:   totals.clinic_discount,
                  procedure_pattern: preview.items[0]?.coverage.procedure_pattern ?? preview.items[0]?.description ?? '',
                  has_insurance:     true,
                })
              }}
              className="text-[11px] font-semibold text-white bg-sky-600 hover:bg-sky-700 px-3 py-1 rounded"
            >
              Aplicar cobertura no caixa
            </button>
          )}
        </div>
      )}

      <footer className="px-5 py-2 bg-sky-50/60 border-t border-sky-100 text-[10px] text-sky-700 flex items-center justify-between gap-3">
        <div>
          <strong>Total cheio (preço particular):</strong>{' '}
          <span className="tabular-nums">{BRL(totals.grand_total)}</span>
        </div>
        {props.patientName && props.tutorName && (
          <TutorSummaryPrint
            consultationId={props.consultationId}
            patientName={props.patientName}
            tutorName={props.tutorName}
            serviceDate={props.serviceDate ?? new Date().toISOString().slice(0, 10)}
            preview={preview}
            clinicName={props.clinicName}
          />
        )}
      </footer>
    </section>
  )
}
