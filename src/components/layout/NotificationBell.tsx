'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, MessageCircle, MessageSquare, BedDouble, Volume2, VolumeX, CheckCheck, X, CheckCircle2 } from 'lucide-react'
import { getNotificationCounts, markAllChatsRead, type NotificationCounts } from '@/lib/actions/internal-chat'
import { createClient } from '@/lib/supabase/client'

// ─── Web Audio chime (dois tons, sem arquivo) ─────────────────────────────────

function playChime() {
  try {
    const ctx  = new AudioContext()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7)

    const osc1 = ctx.createOscillator()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(880, ctx.currentTime)
    osc1.connect(gain)
    osc1.start(ctx.currentTime)
    osc1.stop(ctx.currentTime + 0.18)

    const osc2 = ctx.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1318.5, ctx.currentTime + 0.18)
    osc2.connect(gain)
    osc2.start(ctx.currentTime + 0.18)
    osc2.stop(ctx.currentTime + 0.7)
  } catch { /* autoplay bloqueado — falha silenciosa */ }
}

function showBrowserNotification(body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (!document.hidden) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (Notification as any)('VetMax', { body, icon: '/favicon.ico', tag: 'vetmax-notif', renotify: true })
}

const SOUND_KEY        = 'vetmax-notif-sound'
const CHIME_DEBOUNCE   = 5_000   // ms entre chimes — evita rafada sonora
const POLL_INTERVAL_MS = 60_000  // polling é fallback; realtime cuida do tempo real

// ─── Componente ───────────────────────────────────────────────────────────────

export default function NotificationBell({ clinicId }: { clinicId: string }) {
  const [counts, setCounts] = useState<NotificationCounts>({
    whatsapp_unread: 0, chat_unread: 0, hospitalization_alerts: 0, total: 0,
  })
  const [open,    setOpen]    = useState(false)
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const v = localStorage.getItem(SOUND_KEY)
    return v === null ? true : v === 'true'
  })
  const [ringing, setRinging] = useState(false)
  const [marking, setMarking] = useState(false)

  const wrapperRef     = useRef<HTMLDivElement | null>(null)
  const prevChat       = useRef(-1)   // -1 = primeira carga, não dispara efeitos
  const prevWa         = useRef(-1)
  const ringTimer      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastChimeAt    = useRef(0)

  // Persiste preferência de som
  useEffect(() => {
    localStorage.setItem(SOUND_KEY, String(soundOn))
  }, [soundOn])

  function triggerRing() {
    setRinging(true)
    if (ringTimer.current) clearTimeout(ringTimer.current)
    ringTimer.current = setTimeout(() => setRinging(false), 2000)
  }

  const refresh = useCallback(async () => {
    const res = await getNotificationCounts()
    if ('error' in res) return

    const chatNew = res.chat_unread
    const waNew   = res.whatsapp_unread

    const chatGrew = prevChat.current >= 0 && chatNew > prevChat.current
    const waGrew   = prevWa.current   >= 0 && waNew   > prevWa.current

    if (chatGrew || waGrew) {
      triggerRing()

      // Chime com debounce — não toca se já tocou nos últimos 5 s
      if (soundOn) {
        const now = Date.now()
        if (now - lastChimeAt.current > CHIME_DEBOUNCE) {
          lastChimeAt.current = now
          playChime()
        }
      }

      const delta = (chatGrew ? chatNew - prevChat.current : 0) + (waGrew ? waNew - prevWa.current : 0)
      showBrowserNotification(`${delta} nova${delta > 1 ? 's notificações' : ' notificação'}`)
    }

    prevChat.current = chatNew
    prevWa.current   = waNew
    setCounts(res)
  }, [soundOn])

  // Polling de segurança (realtime cuida do tempo real)
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [refresh])

  // Realtime: refresh imediato ao receber nova mensagem
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel(`notif-bell:${clinicId}`)
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

  // Fechar ao clicar fora
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Fechar com Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  async function handleMarkAllRead() {
    if (marking || !hasChatUnread) return
    setMarking(true)
    const res = await markAllChatsRead()
    if (!('error' in res)) {
      prevChat.current = 0
      setCounts(c => ({ ...c, chat_unread: 0, total: c.whatsapp_unread + c.hospitalization_alerts }))
    }
    setMarking(false)
  }

  const hasChatUnread = counts.chat_unread > 0
  const hasAny        = counts.total > 0

  return (
    <>
      <style>{`
        @keyframes bell-ring {
          0%,60%,100% { transform: rotate(0); }
          10%  { transform: rotate(16deg); }
          20%  { transform: rotate(-12deg); }
          30%  { transform: rotate(16deg); }
          40%  { transform: rotate(-8deg); }
          50%  { transform: rotate(12deg); }
        }
        .bell-ringing { animation: bell-ring 0.5s ease-in-out 3; transform-origin: top center; }
      `}</style>

      <div ref={wrapperRef} className="relative">
        {/* Botão do sino */}
        <button
          type="button"
          aria-label="Notificações"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          className={`relative flex items-center justify-center h-9 w-9 rounded-lg transition-colors ${
            hasAny
              ? 'text-violet-600 bg-violet-50 hover:bg-violet-100'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Bell className={`h-5 w-5 ${ringing ? 'bell-ringing' : ''}`} />
          {hasAny && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 shadow-sm">
              {counts.total > 99 ? '99+' : counts.total}
            </span>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div
            role="dialog"
            aria-label="Painel de notificações"
            className="fixed sm:absolute right-2 sm:right-0 top-[68px] sm:top-full sm:mt-2 z-[10050] w-[calc(100vw-1rem)] sm:w-80 max-w-[22rem] rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
          >
            {/* Cabeçalho */}
            <div className="border-b border-slate-100 px-4 py-2.5 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">Notificações</p>
                <p className="text-xs text-slate-500">
                  {hasAny ? `${counts.total} pendente${counts.total > 1 ? 's' : ''}` : 'Nenhuma pendente'}
                </p>
              </div>

              <div className="flex items-center gap-0.5">
                {/* Marcar chat como lido — sempre visível, desabilitado quando não há não-lidas */}
                <button
                  type="button"
                  title={hasChatUnread ? 'Marcar mensagens de chat como lidas' : 'Nenhuma mensagem não lida no chat'}
                  onClick={handleMarkAllRead}
                  disabled={!hasChatUnread || marking}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    hasChatUnread && !marking
                      ? 'text-violet-700 hover:bg-violet-50 cursor-pointer'
                      : 'text-slate-300 cursor-not-allowed'
                  }`}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {marking ? 'Marcando…' : 'Marcar lidas'}
                </button>

                {/* Toggle som */}
                <button
                  type="button"
                  title={soundOn ? 'Desativar som de notificações' : 'Ativar som de notificações'}
                  onClick={() => setSoundOn(s => !s)}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </button>

                {/* Fechar */}
                <button
                  type="button"
                  aria-label="Fechar notificações"
                  onClick={() => setOpen(false)}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Lista de categorias */}
            <ul className="divide-y divide-slate-50">
              {/* WhatsApp */}
              <li>
                <Link
                  href="/dashboard/whatsapp"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-emerald-50/50 transition-colors"
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${
                    counts.whatsapp_unread > 0
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    <MessageCircle className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">WhatsApp</p>
                    <p className="text-xs text-slate-500 truncate">
                      {counts.whatsapp_unread > 0
                        ? `${counts.whatsapp_unread} conversa${counts.whatsapp_unread > 1 ? 's' : ''} aguardando atendimento`
                        : 'Nenhuma conversa pendente'}
                    </p>
                  </div>
                  {counts.whatsapp_unread > 0 ? (
                    <span className="flex-shrink-0 rounded-full text-[10px] font-bold px-2 py-0.5 min-w-[22px] text-center bg-emerald-600 text-white">
                      {counts.whatsapp_unread}
                    </span>
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-slate-200 flex-shrink-0" />
                  )}
                </Link>
              </li>

              {/* Chat Interno */}
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
                    <p className="text-xs text-slate-500 truncate">
                      {hasChatUnread
                        ? `${counts.chat_unread} ${counts.chat_unread > 1 ? 'mensagens não lidas' : 'mensagem não lida'}`
                        : 'Nenhuma mensagem não lida'}
                    </p>
                  </div>
                  {hasChatUnread ? (
                    <span className="flex-shrink-0 rounded-full text-[10px] font-bold px-2 py-0.5 min-w-[22px] text-center bg-violet-600 text-white">
                      {counts.chat_unread}
                    </span>
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-slate-200 flex-shrink-0" />
                  )}
                </Link>
              </li>

              {/* Internação */}
              <li>
                <Link
                  href="/dashboard/hospitalization"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50/50 transition-colors"
                >
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 ${
                    counts.hospitalization_alerts > 0 ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    <BedDouble className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900">Internação</p>
                    <p className="text-xs text-slate-500 truncate">
                      {counts.hospitalization_alerts > 0
                        ? `${counts.hospitalization_alerts} tarefa${counts.hospitalization_alerts > 1 ? 's' : ''} atrasada${counts.hospitalization_alerts > 1 ? 's' : ''}`
                        : 'Nenhuma tarefa atrasada'}
                    </p>
                  </div>
                  {counts.hospitalization_alerts > 0 ? (
                    <span className="flex-shrink-0 rounded-full text-[10px] font-bold px-2 py-0.5 min-w-[22px] text-center bg-indigo-600 text-white">
                      {counts.hospitalization_alerts}
                    </span>
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-slate-200 flex-shrink-0" />
                  )}
                </Link>
              </li>
            </ul>

            {/* Rodapé */}
            <div className="border-t border-slate-100 px-4 py-2 flex items-center gap-1.5 text-xs text-slate-400">
              {soundOn ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
              <span>Som {soundOn ? 'ativado' : 'desativado'}</span>
              <span className="ml-auto">Tempo real</span>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
