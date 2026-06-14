'use client'

import { Suspense } from 'react'
import { Toaster } from 'sonner'
import { useChatRealtimeNotifications } from '@/hooks/useChatRealtimeNotifications'
import { FloatingChatPopupHost } from '@/components/internal-chat/FloatingChatPopup'

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
      <Suspense fallback={null}>
        <FloatingChatPopupHost clinicId={clinicId} userId={userId} />
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
