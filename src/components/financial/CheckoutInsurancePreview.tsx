import { Wallet, CreditCard, FileClock, ShieldCheck, TrendingDown } from 'lucide-react'
import { previewConsultationInsurance } from '@/lib/actions/insurance-checkout'
import TutorSummaryPrint from '@/components/financial/TutorSummaryPrint'

interface Props {
  consultationId: string
  /** Quando passados, exibe o botão "Resumo para o tutor" no rodapé. */
  patientName?:   string
  tutorName?:     string
  serviceDate?:   string
  clinicName?:    string
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
 * Server component: olha a consulta, cruza com o convênio do pet e mostra
 * "Você cobra X agora · Petlove cobra Y · Resta Z em A Receber".
 */
export default async function CheckoutInsurancePreview({ consultationId, patientName, tutorName, serviceDate, clinicName }: Props) {
  const preview = await previewConsultationInsurance(consultationId)

  if ('error' in preview) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        Prévia de convênio indisponível: {preview.error}
      </div>
    )
  }

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

      {/* Totalizadores */}
      <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b border-sky-200/60">
        <div className="rounded-lg bg-white px-3 py-2 border border-sky-100">
          <div className="flex items-center gap-1.5 text-[11px] text-sky-700 font-medium mb-0.5">
            <Wallet className="h-3 w-3" />
            Cobrar do tutor AGORA
          </div>
          <div className="text-base font-bold text-sky-900 tabular-nums">{BRL(totals.charge_now)}</div>
        </div>
        <div className="rounded-lg bg-white px-3 py-2 border border-sky-100">
          <div className="flex items-center gap-1.5 text-[11px] text-sky-700 font-medium mb-0.5">
            <CreditCard className="h-3 w-3" />
            Petlove cobra no cartão
          </div>
          <div className="text-base font-bold text-sky-900 tabular-nums">{BRL(totals.deferred_provider)}</div>
        </div>
        <div className="rounded-lg bg-white px-3 py-2 border border-sky-100">
          <div className="flex items-center gap-1.5 text-[11px] text-sky-700 font-medium mb-0.5">
            <FileClock className="h-3 w-3" />
            Vai pra A Receber Petlove
          </div>
          <div className="text-base font-bold text-sky-900 tabular-nums">{BRL(totals.receivable)}</div>
        </div>
        <div className="rounded-lg bg-emerald-50 px-3 py-2 border border-emerald-200">
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium mb-0.5">
            <TrendingDown className="h-3 w-3" />
            Tutor economizou
          </div>
          <div className="text-base font-bold text-emerald-800 tabular-nums">{BRL(totals.tutor_saved)}</div>
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

      <footer className="px-5 py-2 bg-sky-50/60 border-t border-sky-100 text-[10px] text-sky-700 flex items-center justify-between gap-3">
        <div>
          <strong>Total cheio (preço particular):</strong>{' '}
          <span className="tabular-nums">{BRL(totals.grand_total)}</span>
          {' · '}
          Esta é uma prévia — clique em <em>&quot;Aplicar prévia&quot;</em> para gravar a marcação no faturamento.
        </div>
        {patientName && tutorName && (
          <TutorSummaryPrint
            consultationId={consultationId}
            patientName={patientName}
            tutorName={tutorName}
            serviceDate={serviceDate ?? new Date().toISOString().slice(0, 10)}
            preview={preview}
            clinicName={clinicName}
          />
        )}
      </footer>
    </section>
  )
}
