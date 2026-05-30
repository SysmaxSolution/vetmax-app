'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, MessageCircle, MessageSquare, BedDouble } from 'lucide-react'
import { getNotificationCounts, type NotificationCounts } from '@/lib/actions/internal-chat'
import { createClient } from '@/lib/supabase/client'

/**
 * Sininho consolidado: agrega WhatsApp (handoff), Chat Interno (não lidas) e
 * Internação (tarefas atrasadas). Refresh por polling de 30s + broadcast
 * de chat_messages para reagir na hora à conversa.
 */
export default function NotificationBell({ clinicId }: { clinicId: string }) {
  const [counts, setCounts] = useState<NotificationCounts>({
    whatsapp_unread: 0, chat_unread: 0, hospitalization_alerts: 0, total: 0,
  })
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  async function refresh() {
    const res = await getNotificationCounts()
    if (!('error' in res)) setCounts(res)
  }

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [])

  // Realtime: nova mensagem de chat OU mudança em conversa WPP → refresh
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`notifications:${clinicId}`)
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
    return () => { supabase.removeChannel(channel) }
  }, [clinicId])

  // Fechar ao clicar fora
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-label="Notificações"
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center h-9 w-9 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
      >
        <Bell className="h-5 w-5" />
        {counts.total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center px-1">
            {counts.total > 99 ? '99+' : counts.total}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed sm:absolute right-2 sm:right-0 top-14 sm:top-11 z-[10040] w-[calc(100vw-1rem)] sm:w-80 max-w-[22rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        >
          <div className="border-b border-slate-100 px-4 py-2.5 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">Notificações</p>
              <p className="text-xs text-slate-500">{counts.total} pendente{counts.total === 1 ? '' : 's'}</p>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => setOpen(false)}
              className="sm:hidden rounded-full p-1 text-slate-400 hover:bg-slate-100"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <ul className="divide-y divide-slate-50">
            <li>
              <Link
                href="/dashboard/whatsapp"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-emerald-50/50 transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 flex-shrink-0">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">WhatsApp</p>
                  <p className="text-xs text-slate-500">Conversas aguardando atendimento humano</p>
                </div>
                <span className={`flex-shrink-0 rounded-full text-[10px] font-bold px-2 py-0.5 min-w-[22px] text-center ${
                  counts.whatsapp_unread > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {counts.whatsapp_unread}
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/internal-chat"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-violet-50/50 transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-700 flex-shrink-0">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">Chat Interno</p>
                  <p className="text-xs text-slate-500">Mensagens não lidas da equipe</p>
                </div>
                <span className={`flex-shrink-0 rounded-full text-[10px] font-bold px-2 py-0.5 min-w-[22px] text-center ${
                  counts.chat_unread > 0 ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {counts.chat_unread}
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/dashboard/hospitalization"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50/50 transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 flex-shrink-0">
                  <BedDouble className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">Internação</p>
                  <p className="text-xs text-slate-500">Tarefas/medicações atrasadas</p>
                </div>
                <span className={`flex-shrink-0 rounded-full text-[10px] font-bold px-2 py-0.5 min-w-[22px] text-center ${
                  counts.hospitalization_alerts > 0 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {counts.hospitalization_alerts}
                </span>
              </Link>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
