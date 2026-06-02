'use client'

import { usePathname } from 'next/navigation'
import { MessageSquare, Hash, Stethoscope } from 'lucide-react'
import { useChatContext, type ChannelContext } from '@/components/providers/ChatContextProvider'
import { useEffect } from 'react'

// ─── Mapa pathname → canal de módulo ─────────────────────────────────────────

const PATH_TO_CHANNEL: Record<string, { moduloContexto: string; label: string }> = {
  '/dashboard/reception':       { moduloContexto: 'recepcao',   label: '#recepção' },
  '/dashboard/cashier':         { moduloContexto: 'caixa',      label: '#caixa' },
  '/dashboard/triage':          { moduloContexto: 'triagem',    label: '#triagem' },
  '/dashboard/exams':           { moduloContexto: 'exames',     label: '#exames' },
  '/dashboard/pharmacy':        { moduloContexto: 'farmacia',   label: '#farmácia' },
  '/dashboard/hospitalization': { moduloContexto: 'internacao', label: '#internação' },
  '/dashboard/surgery':         { moduloContexto: 'cirurgia',   label: '#cirurgia' },
  '/dashboard/grooming':        { moduloContexto: 'grooming',   label: '#grooming' },
  '/dashboard/financial':       { moduloContexto: 'financeiro', label: '#financeiro' },
  '/dashboard/patients':        { moduloContexto: 'pacientes',  label: '#pacientes' },
  '/dashboard/management':      { moduloContexto: 'gestao',     label: '#gestão' },
  '/dashboard/purchases':       { moduloContexto: 'compras',    label: '#compras' },
  '/dashboard/sales':           { moduloContexto: 'vendas',     label: '#vendas' },
  '/dashboard/reports':         { moduloContexto: 'relatorios', label: '#relatórios' },
  '/dashboard/registry':        { moduloContexto: 'cadastros',  label: '#cadastros' },
  '/dashboard/vet':             { moduloContexto: 'consultorio', label: '#consultório' },
  '/dashboard/internal-chat':   { moduloContexto: 'chat',       label: '#chat' },
}

function getChannelForPath(pathname: string): ChannelContext | null {
  for (const [prefix, channel] of Object.entries(PATH_TO_CHANNEL)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return { type: 'channel', ...channel }
    }
  }
  return null
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ChatContextButton() {
  const pathname = usePathname()
  const { chatCtx, setChatCtx, toggleChat, isOpen, unreadCount } = useChatContext()

  // Detecta canal de módulo a partir do pathname.
  // Se já há um contexto de procedimento ativo (set pela página), não sobrescreve.
  const channelFromPath = getChannelForPath(pathname)

  // Quando o pathname muda e não há contexto de procedimento, aplica canal do módulo
  useEffect(() => {
    // Não interfere se uma tela de procedimento já configurou o contexto
    if (chatCtx?.type === 'procedure') return
    if (!channelFromPath) {
      setChatCtx(null)
      return
    }
    setChatCtx(channelFromPath)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Contexto efetivo para exibição no botão
  const effectiveCtx = chatCtx ?? channelFromPath
  if (!effectiveCtx) return null

  const isProcedure = effectiveCtx.type === 'procedure'
  const label = isProcedure
    ? effectiveCtx.patientName
    : effectiveCtx.label

  return (
    <button
      type="button"
      title={`Chat: ${label}`}
      onClick={toggleChat}
      className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all ${
        isOpen
          ? (isProcedure ? 'bg-indigo-100 text-indigo-700' : 'bg-violet-100 text-violet-700')
          : (isProcedure ? 'text-indigo-600 hover:bg-indigo-50' : 'text-violet-600 hover:bg-violet-50')
      }`}
    >
      {isProcedure
        ? <Stethoscope className="h-4 w-4 flex-shrink-0" />
        : <Hash className="h-4 w-4 flex-shrink-0" />
      }
      <span className="hidden sm:inline max-w-[120px] truncate">{label}</span>

      {/* Badge de não-lidas */}
      {unreadCount > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white px-1">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  )
}
