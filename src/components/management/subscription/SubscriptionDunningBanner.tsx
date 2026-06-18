// Banner global de cobrança (R7) — exibido no topo da dashboard para o admin
// quando a assinatura exige atenção (pending/past_due/grace/expiring/suspended/
// expired). Mensagens M1–M4 do plano: lideram com a AÇÃO (PAGAR AGORA) e usam
// data exata quando ela existe. Componente presentacional (sem estado) — o
// layout decide quando renderizar (nunca para grandfathered / 'active' / free).

import Link from 'next/link'
import { AlertTriangle, CreditCard, Clock, ShieldAlert } from 'lucide-react'
import type { SubscriptionLifecycleState, BillingCycle } from '@/types'

const ASSINATURA_HREF = '/dashboard/management?tab=assinatura'

function fmtDate(iso: string | null, addDays = 0): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  if (addDays) d.setDate(d.getDate() + addDays)
  return d.toLocaleDateString('pt-BR')
}

interface Props {
  lifecycleState: SubscriptionLifecycleState
  billingCycle: BillingCycle | null
  currentPeriodEnd: string | null
  pastDueSince: string | null
  /** D3: há internação ativa / prontuário aberto (preserva acesso). */
  clinicalOpen: boolean
}

type Tone = 'amber' | 'sky' | 'red'

const TONE: Record<Tone, string> = {
  amber: 'bg-amber-50 border-amber-200 text-amber-900',
  sky:   'bg-sky-50 border-sky-200 text-sky-900',
  red:   'bg-red-50 border-red-200 text-red-900',
}
const BTN: Record<Tone, string> = {
  amber: 'bg-amber-500 hover:bg-amber-600',
  sky:   'bg-sky-600 hover:bg-sky-700',
  red:   'bg-red-600 hover:bg-red-700',
}

export default function SubscriptionDunningBanner({
  lifecycleState, currentPeriodEnd, pastDueSince, clinicalOpen,
}: Props) {
  let tone: Tone = 'amber'
  let Icon = AlertTriangle
  let title = ''
  let message = ''
  let cta = 'PAGAR AGORA'

  switch (lifecycleState) {
    case 'pending':
      tone = 'amber'; Icon = Clock; cta = 'Finalizar pagamento'
      title = 'Assinatura aguardando pagamento'
      message = 'Finalize o pagamento para liberar os módulos do seu plano. A liberação é automática após a confirmação.'
      break
    case 'past_due': {
      tone = 'amber'; Icon = AlertTriangle
      const until = fmtDate(pastDueSince, 7)
      title = 'Pagamento não identificado'
      message = `Não recebemos o pagamento da sua mensalidade.${until ? ` Pague até ${until} para manter seu acesso.` : ' Regularize para manter seu acesso.'}`
      break
    }
    case 'grace':
      if (clinicalOpen) {
        tone = 'amber'; Icon = ShieldAlert
        title = 'Acesso preservado por segurança do paciente'
        message = 'Há atendimentos/internações em andamento, então mantivemos seu acesso. Regularize o pagamento para evitar a suspensão dos módulos assim que os registros forem encerrados.'
      } else {
        tone = 'amber'; Icon = AlertTriangle; cta = 'PAGAR AGORA via PIX'
        title = 'Pagamento ainda não identificado'
        message = 'Regularize agora para não perder o acesso aos módulos do seu plano.'
      }
      break
    case 'expiring': {
      tone = 'sky'; Icon = Clock; cta = 'RENOVAR'
      const exp = fmtDate(currentPeriodEnd)
      title = 'Sua assinatura anual está perto de vencer'
      message = `Sua assinatura${exp ? ` vence em ${exp}` : ' está prestes a vencer'}. Renove para manter o acesso sem interrupção.`
      break
    }
    case 'suspended':
    case 'expired':
      if (clinicalOpen) {
        tone = 'red'; Icon = ShieldAlert
        title = 'Acesso de leitura preservado'
        message = 'Há atendimentos em andamento; o acesso de leitura ao prontuário foi preservado por segurança do paciente. Regularize o pagamento para reativar os módulos.'
      } else {
        tone = 'red'; Icon = ShieldAlert
        title = 'Módulos do plano suspensos'
        message = 'Seu acesso aos módulos do plano foi suspenso por falta de pagamento. Regularize para reativar imediatamente.'
      }
      break
    default:
      return null
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${TONE[tone]}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs opacity-90">{message}</p>
      </div>
      <Link
        href={ASSINATURA_HREF}
        className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${BTN[tone]}`}
      >
        <CreditCard className="h-3.5 w-3.5" /> {cta}
      </Link>
    </div>
  )
}
