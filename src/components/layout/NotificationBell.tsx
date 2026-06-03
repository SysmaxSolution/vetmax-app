'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, MessageCircle, MessageSquare, BedDouble, Volume2, VolumeX, CheckCheck } from 'lucide-react'
import { getNotificationCounts, markAllChatsRead, type NotificationCounts } from '@/lib/actions/internal-chat'
import { createClient } from '@/lib/supabase/client'

// ─── Web Audio chime (dois tons — sem arquivo de áudio) ──────────────────────

function playChime() {
  try {
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7)

    const osc1 = ctx.createOscillator()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(880, ctx.currentTime)       // A5
    osc1.connect(gain)
    osc1.start(ctx.currentTime)
    osc1.stop(ctx.currentTime + 0.18)

    const osc2 = ctx.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1318.5, ctx.currentTime + 0.18) // E6
    osc2.connect(gain)
    osc2.start(ctx.currentTime + 0.18)
    osc2.stop(ctx.currentTime + 0.7)
  } catch {
    // autoplay bloqueado pelo browser — falha silenciosa
  }
}

// ─── Notificação nativa do browser ───────────────────────────────────────────

function showBrowserNotification(body: string) {
  if (typeof window === 'undefined') return
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (!document.hidden) return  // só quando a aba não está visível

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (Notification as any)('VetMax — Chat Interno', {
    body,
    icon: '/favicon.ico',
    tag: 'vetmax-chat',
    renotify: true,
  })
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function NotificationBell({ clinicId }: { clinicId: string }) {
  const [counts, setCounts] = useState<NotificationCounts>({
    whatsapp_unread: 0, chat_unread: 0, hospitalization_alerts: 0, total: 0,
  })
  const [open, setOpen]           = useState(false)
  const [soundOn, setSoundOn]     = useState(true)
  const [ringing, setRinging]     = useState(false)
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>('default')
  const [marking, setMarking]     = useState(false)

  const wrapperRef       = useRef<HTMLDivElement | null>(null)
  const prevChatUnread   = useRef(-1)   // -1 = primeira carga (não dispara som)
  const ringTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Pede permissão de notificação do browser uma vez ──────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    setNotifPerm(Notification.permission)
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => setNotifPerm(p))
    }
  }, [])

  // ── Faz a animação do sino por 2 s ────────────────────────────────────────
  function triggerRing() {
    setRinging(true)
    if (ringTimerRef.current) clearTimeout(ringTimerRef.current)
    ringTimerRef.current = setTimeout(() => setRinging(false), 2000)
  }

  // ── Atualiza contagens e dispara efeitos se chat_unread subiu ─────────────
  const refresh = useCallback(async () => {
    const res = await getNotificationCounts()
    if ('error' in res) return

    const prev = prevChatUnread.current
    const curr = res.chat_unread

    if (prev >= 0 && curr > prev) {
      // novas mensagens desde a última checagem
      triggerRing()
      if (soundOn) playChime()

      const delta = curr - prev
      showBrowserNotification(
        `${delta} ${delta > 1 ? 'novas mensagens não lidas' : 'nova mensagem não lida'}`
      )
    }

    prevChatUnread.current = curr
    setCounts(res)
  }, [soundOn])

  // ── Polling 30 s + carga inicial ──────────────────────────────────────────
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [refresh])

  // ── Realtime: nova mensagem → refresh imediato ────────────────────────────
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
  }, [clinicId, refresh])

  // ── Fechar ao clicar fora ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // ── Marcar todas como lidas (apenas chat — WhatsApp/Internação são filas ativas) ─
  async function handleMarkAllRead() {
    if (marking) return
    setMarking(true)
    const res = await markAllChatsRead()
    if (!('error' in res)) {
      prevChatUnread.current = 0
      setCounts(c => ({ ...c, chat_unread: 0, total: c.whatsapp_unread + c.hospitalization_alerts }))
    }
    setMarking(false)
  }

  const hasChatUnread = counts.chat_unread > 0

  return (
    <>
      {/* Keyframes da animação de sino — injetados inline */}
      <style>{`
        @keyframes bell-ring {
          0%,60%,100% { transform: rotate(0); }
          10%          { transform: rotate(16deg); }
          20%          { transform: rotate(-12deg); }
          30%          { transform: rotate(16deg); }
          40%          { transform: rotate(-8deg); }
          50%          { transform: rotate(12deg); }
        }
        .bell-ringing { animation: bell-ring 0.5s ease-in-out 3; transform-origin: top center; }
      `}</style>

      <div ref={wrapperRef} className="relative">
        <button
          type="button"
          aria-label="Notificações"
          onClick={() => setOpen(o => !o)}
          className={`relative flex items-center justify-center h-9 w-9 rounded-lg transition-colors ${
            hasChatUnread
              ? 'text-violet-600 bg-violet-50 hover:bg-violet-100'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Bell className={`h-5 w-5 ${ringing ? 'bell-ringing' : ''}`} />

          {counts.total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-sm">
              {counts.total > 99 ? '99+' : counts.total}
            </span>
          )}
        </button>

        {open && (
          <div className="fixed sm:absolute right-2 sm:right-0 top-14 sm:top-11 z-[10040] w-[calc(100vw-1rem)] sm:w-80 max-w-[22rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">

            {/* Cabeçalho */}
            <div className="border-b border-slate-100 px-4 py-2.5 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">Notificações</p>
                <p className="text-xs text-slate-500">{counts.total} pendente{counts.total === 1 ? '' : 's'}</p>
              </div>
              <div className="flex items-center gap-1">
                {/* Marcar todas as mensagens de chat como lidas */}
                {hasChatUnread && (
                  <button
                    type="button"
                    title="Marcar mensagens de chat como lidas"
                    onClick={handleMarkAllRead}
                    disabled={marking}
                    className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50 transition-colors disabled:opacity-50"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    {marking ? 'Marcando...' : 'Marcar como lidas'}
                  </button>
                )}
                {/* Toggle de som */}
                <button
                  type="button"
                  title={soundOn ? 'Desativar som' : 'Ativar som'}
                  onClick={() => setSoundOn(s => !s)}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </button>
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
            </div>

            {/* Aviso de permissão de notificação bloqueada */}
            {notifPerm === 'denied' && (
              <p className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
                Notificações bloqueadas no browser. Habilite nas configurações do site para avisos quando estiver fora da tela.
              </p>
            )}

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
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${
                    hasChatUnread ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-700'
                  }`}>
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">Chat Interno</p>
                    <p className="text-xs text-slate-500">
                      {hasChatUnread ? `${counts.chat_unread} ${counts.chat_unread > 1 ? 'mensagens não lidas' : 'mensagem não lida'}` : 'Mensagens não lidas da equipe'}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 rounded-full text-[10px] font-bold px-2 py-0.5 min-w-[22px] text-center ${
                    hasChatUnread ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500'
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

            {/* Rodapé: status do som */}
            <div className="border-t border-slate-100 px-4 py-2 flex items-center gap-1.5 text-xs text-slate-400">
              {soundOn ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
              <span>Som de notificação {soundOn ? 'ativado' : 'desativado'}</span>
              {notifPerm === 'granted' && (
                <span className="ml-auto text-green-600 font-medium">· Alertas ativos</span>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
