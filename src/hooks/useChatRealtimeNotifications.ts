'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface Options {
  clinicId: string
  /** User id atual — não disparamos toast pra mensagem do próprio usuário. */
  userId:   string
}

/**
 * Escuta INSERT em chat_messages na clínica e dispara um toast Sonner discreto
 * no canto inferior direito quando a mensagem NÃO é minha e eu NÃO estou
 * olhando para aquele chat agora (rota internal-chat?chat=<id>). Clicar no
 * toast abre o chat correspondente.
 *
 * Coexiste com o NotificationBell (que toca chime + Notification API nativa).
 * Esse hook cuida do feedback in-app visual; o sino cuida do background.
 */
export function useChatRealtimeNotifications({ clinicId, userId }: Options) {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  // Mantém ref atualizada para o callback do realtime ler estado sem reassinar
  const routeRef = useRef<{ pathname: string; chat: string | null }>({ pathname, chat: null })
  useEffect(() => {
    routeRef.current = { pathname, chat: searchParams.get('chat') }
  }, [pathname, searchParams])

  useEffect(() => {
    if (!clinicId || !userId) return
    const supabase = createClient()

    const channel = supabase
      .channel(`chat-notifications:${clinicId}:${userId}`)
      .on(
        // @ts-ignore — tipagem do supabase-js exige schema literal
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `clinic_id=eq.${clinicId}`,
        },
        async (payload: any) => {
          const msg = payload.new as {
            id: string; chat_id: string; sent_by: string | null;
            kind: 'text' | 'system' | 'attachment'; body: string | null
          }

          // 1. Não notifico minhas próprias mensagens
          if (!msg.sent_by || msg.sent_by === userId) return

          // 2. Não notifico mensagens "system" (ruído baixo)
          if (msg.kind === 'system') return

          // 3. Se já estou olhando para esse chat agora, é redundante
          const { pathname: curPath, chat: curChat } = routeRef.current
          if (curPath.startsWith('/dashboard/internal-chat') && curChat === msg.chat_id) return

          // 4. Confirmo que sou participante do chat antes de mostrar
          const { data: part } = await supabase
            .from('chat_participants')
            .select('id')
            .eq('chat_id', msg.chat_id)
            .eq('user_id', userId)
            .is('left_at', null)
            .maybeSingle()
          if (!part) return

          // 5. Busca nome do autor + título do chat pra montar o toast
          const [{ data: sender }, { data: chat }] = await Promise.all([
            supabase.from('profiles').select('full_name').eq('id', msg.sent_by).maybeSingle(),
            supabase.from('chats').select('title, kind').eq('id', msg.chat_id).maybeSingle(),
          ])

          const senderName = sender?.full_name ?? 'Colega'
          const chatLabel  = chat?.title
            ?? (chat?.kind === 'direct' ? senderName : 'Conversa')
          const preview = msg.kind === 'attachment'
            ? '📎 Anexo recebido'
            : (msg.body ?? '').slice(0, 120) + ((msg.body?.length ?? 0) > 120 ? '…' : '')

          toast.message(senderName, {
            description: preview,
            duration: 6000,
            action: {
              label: chatLabel,
              onClick: () => router.push(`/dashboard/internal-chat?chat=${msg.chat_id}`),
            },
          })
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [clinicId, userId, router])
}
