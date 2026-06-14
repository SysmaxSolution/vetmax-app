'use client'

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react'
import { createClient } from '@/lib/supabase/client'
import { getNotificationCounts, type NotificationCounts } from '@/lib/actions/internal-chat'

interface NotificationCtx {
  counts:  NotificationCounts
  refresh: () => void
}

const Ctx = createContext<NotificationCtx>({
  counts:  { whatsapp_unread: 0, chat_unread: 0, hospitalization_alerts: 0, total: 0 },
  refresh: () => {},
})

export function useNotifications() {
  return useContext(Ctx)
}

interface Props {
  clinicId: string
  children: React.ReactNode
}

/**
 * Carrega getNotificationCounts via RPC (1 query total, sem N+1) e recalcula
 * quando chega INSERT em chat_messages ou UPDATE em whatsapp_conversations.
 * Expõe refresh() para que markChatRead / markAllChatsRead possam forçar
 * atualização imediata.
 */
export function NotificationProvider({ clinicId, children }: Props) {
  const [counts, setCounts] = useState<NotificationCounts>({
    whatsapp_unread: 0, chat_unread: 0, hospitalization_alerts: 0, total: 0,
  })
  const prevChatRef = useRef(-1)

  const refresh = useCallback(async () => {
    const res = await getNotificationCounts()
    if (!('error' in res)) {
      prevChatRef.current = res.chat_unread
      setCounts(res)
    }
  }, [])

  // Carga inicial + polling 30 s (fallback para realtime falho)
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [refresh])

  // Realtime Supabase — dispara refresh a cada INSERT/UPDATE relevante
  useEffect(() => {
    if (!clinicId) return
    const supabase = createClient()
    const ch = supabase
      .channel(`notif-ctx:${clinicId}`)
      .on(
        // @ts-ignore
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `clinic_id=eq.${clinicId}` },
        () => refresh(),
      )
      .on(
        // @ts-ignore
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'whatsapp_conversations', filter: `clinic_id=eq.${clinicId}` },
        () => refresh(),
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [clinicId, refresh])

  return <Ctx.Provider value={{ counts, refresh }}>{children}</Ctx.Provider>
}
