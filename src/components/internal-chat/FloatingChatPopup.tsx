'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { X, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useNotifications } from '@/context/NotificationContext'

interface PopupCard {
  id:         string
  chatId:     string
  senderName: string
  chatLabel:  string
  preview:    string
  ts:         number
}

const DISMISS_MS = 8_000
const MAX_CARDS  = 3

/**
 * Pop-up flutuante de chat — renderizado num React Portal no canto superior
 * direito. Aparece quando chega mensagem de outro usuário e não estamos no
 * chat correspondente. Até 3 cartões empilhados; cada um fecha após 8 s ou
 * ao clicar em X.
 *
 * Suprimido nas rotas /dashboard/vet/[id] e /dashboard/triage/[id]
 * para não interromper prontuário/triagem.
 */
export function FloatingChatPopupHost({
  clinicId,
  userId,
}: {
  clinicId: string
  userId:   string
}) {
  const [cards, setCards] = useState<PopupCard[]>([])
  const [mounted, setMounted] = useState(false)
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const routeRef     = useRef<{ path: string; chat: string | null }>({ path: pathname, chat: null })
  const { refresh }  = useNotifications()

  useEffect(() => {
    routeRef.current = { path: pathname, chat: searchParams.get('chat') }
  }, [pathname, searchParams])

  useEffect(() => { setMounted(true) }, [])

  // Rotas em que o pop-up fica silenciado (foco clínico)
  const isFocusMode = pathname.match(/\/dashboard\/(vet|triage|surgery)\//)

  const dismiss = useCallback((id: string) => {
    setCards(prev => prev.filter(c => c.id !== id))
  }, [])

  useEffect(() => {
    if (!clinicId || !userId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`fp-chat:${clinicId}:${userId}`)
      .on(
        // @ts-ignore
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `clinic_id=eq.${clinicId}` },
        async (payload: any) => {
          const msg = payload.new as {
            id: string; chat_id: string; sent_by: string | null;
            kind: 'text' | 'system' | 'attachment'; body: string | null;
          }

          if (!msg.sent_by || msg.sent_by === userId) return
          if (msg.kind === 'system') return

          const { path, chat } = routeRef.current
          if (path.startsWith('/dashboard/internal-chat') && chat === msg.chat_id) return

          // Confirma participação antes de mostrar
          const { data: part } = await supabase
            .from('chat_participants')
            .select('id')
            .eq('chat_id', msg.chat_id)
            .eq('user_id', userId)
            .is('left_at', null)
            .maybeSingle()
          if (!part) return

          const [senderRes, chatRes] = await Promise.all([
            supabase.from('profiles').select('full_name').eq('id', msg.sent_by!).maybeSingle(),
            supabase.from('chats').select('title, kind').eq('id', msg.chat_id).maybeSingle(),
          ])

          const senderName = senderRes.data?.full_name ?? 'Colega'
          const chatLabel  = (chatRes.data as any)?.title
            ?? ((chatRes.data as any)?.kind === 'direct' ? senderName : 'Conversa')
          const preview = msg.kind === 'attachment'
            ? '📎 Anexo'
            : (msg.body ?? '').slice(0, 100) + ((msg.body?.length ?? 0) > 100 ? '…' : '')

          const card: PopupCard = {
            id: msg.id,
            chatId: msg.chat_id,
            senderName,
            chatLabel,
            preview,
            ts: Date.now(),
          }

          setCards(prev => [card, ...prev].slice(0, MAX_CARDS))
          refresh()

          // Auto-dismiss após 8 s
          setTimeout(() => dismiss(card.id), DISMISS_MS)
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [clinicId, userId, refresh, dismiss])

  if (!mounted || isFocusMode || cards.length === 0) return null

  return createPortal(
    <div
      className="fixed top-16 right-4 z-[10050] flex flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      {cards.map((card, i) => (
        <div
          key={card.id}
          style={{ opacity: 1 - i * 0.1, transform: `translateY(${i * 2}px)` }}
          className="pointer-events-auto w-72 rounded-xl border border-slate-200 bg-white shadow-xl
                     overflow-hidden transition-all duration-300 animate-in slide-in-from-right-4"
        >
          <div className="flex items-start gap-3 p-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700 text-sm font-bold">
              {card.senderName.slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-semibold text-slate-900 truncate">{card.senderName}</p>
                <span className="text-[10px] text-slate-400 flex-shrink-0">{card.chatLabel}</span>
              </div>
              <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{card.preview}</p>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => dismiss(card.id)}
              className="flex-shrink-0 rounded-full p-0.5 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              router.push(`/dashboard/internal-chat?chat=${card.chatId}`)
              dismiss(card.id)
            }}
            className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100
                       bg-violet-50 py-1.5 text-[11px] font-semibold text-violet-700
                       hover:bg-violet-100 transition-colors"
          >
            <MessageSquare className="h-3 w-3" />
            Abrir conversa
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}
