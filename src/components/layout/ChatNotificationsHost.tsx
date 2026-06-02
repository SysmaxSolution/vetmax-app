'use client'

import { Suspense } from 'react'
import { Toaster } from 'sonner'
import { useChatRealtimeNotifications } from '@/hooks/useChatRealtimeNotifications'

/**
 * Monta o Toaster Sonner + o hook de realtime para mensagens de chat. Fica
 * dentro de Suspense porque useSearchParams (consumido pelo hook) exige
 * boundary no App Router.
 */
function ChatNotificationsBridge({ clinicId, userId }: { clinicId: string; userId: string }) {
  useChatRealtimeNotifications({ clinicId, userId })
  return null
}

export default function ChatNotificationsHost({
  clinicId, userId,
}: { clinicId: string; userId: string }) {
  return (
    <>
      <Suspense fallback={null}>
        <ChatNotificationsBridge clinicId={clinicId} userId={userId} />
      </Suspense>
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ classNames: { toast: 'rounded-xl shadow-lg' } }}
      />
    </>
  )
}
