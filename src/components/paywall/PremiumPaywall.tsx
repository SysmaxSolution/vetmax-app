import { getPaywallCopy } from '@/config/access-matrix'
import { Lock, Zap } from 'lucide-react'
import PaywallCTAButtons from './PaywallCTAButtons'

interface Props {
  route: string
}

// Server Component — sem flash-of-content, renderizado no servidor antes de chegar ao cliente.
export default function PremiumPaywall({ route }: Props) {
  const copy = getPaywallCopy(route)

  return (
    <div className="relative min-h-[calc(100vh-8rem)] flex items-center justify-center overflow-hidden p-4">
      {/* Fundo gradiente */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-indigo-50/60 to-purple-50/60" />
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-indigo-200/30 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-purple-200/30 rounded-full blur-3xl pointer-events-none" />

      {/* Card */}
      <div className="relative z-10 max-w-md w-full">
        <div
          className="rounded-2xl border border-white/80 p-8 text-center shadow-2xl shadow-indigo-200/30"
          style={{
            background:           'rgba(255, 255, 255, 0.82)',
            backdropFilter:       'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          {/* Ícone */}
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4 shadow-lg shadow-indigo-300/50">
            <Lock className="w-7 h-7 text-white" />
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full mb-5 shadow-sm">
            <Zap className="w-3 h-3" />
            Disponível no Plano PRO
          </div>

          {/* Título */}
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {copy.title}
          </h2>

          {/* Mensagem de plano */}
          <p className="text-sm font-medium text-indigo-600 mb-3">
            Seu plano atual não inclui este módulo
          </p>

          {/* Descrição */}
          <p className="text-slate-600 leading-relaxed mb-8 text-sm">
            {copy.description}
          </p>

          {/* CTAs */}
          <PaywallCTAButtons feature={copy.feature} />

          {/* Rodapé */}
          <p className="mt-6 text-xs text-slate-400">
            Fale com a{' '}
            <span className="font-semibold text-slate-600">Sysmax Solutions</span>
            {' '}para fazer upgrade e liberar este módulo.
          </p>
        </div>
      </div>
    </div>
  )
}
