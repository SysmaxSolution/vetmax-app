'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageSquare, X, Send, Loader2, ChevronDown, Hash, Stethoscope } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { sendChatMessage, markChatRead, listChatMessages, type ChatMessage } from '@/lib/actions/internal-chat'
import { useChatContext } from '@/components/providers/ChatContextProvider'

// ─── Ping sonoro (Web Audio API — sem arquivo) ────────────────────────────────

function ping() {
  try {
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1046.5, ctx.currentTime)   // C6
    osc.frequency.setValueAtTime(1318.5, ctx.currentTime + 0.08) // E6
    osc.connect(gain)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
  } catch { /* autoplay bloqueado */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Hoje'
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function FloatingChatWindow() {
  const {
    chatCtx, chatId, isOpen, openChat, closeChat, toggleChat,
    unreadCount, clearUnread, userId, userName,
  } = useChatContext()

  const [messages,  setMessages]  = useState<ChatMessage[]>([])
  const [draft,     setDraft]     = useState('')
  const [sending,   setSending]   = useState(false)
  const [loading,   setLoading]   = useState(false)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLTextAreaElement>(null)
  const prevChatId  = useRef<string | null>(null)

  // Carrega mensagens quando chatId muda
  useEffect(() => {
    if (!chatId || chatId === prevChatId.current) return
    prevChatId.current = chatId
    setMessages([])
    setLoading(true)
    listChatMessages(chatId, { limit: 60 }).then(res => {
      setLoading(false)
      if (Array.isArray(res)) setMessages(res)
    })
  }, [chatId])

  // Scroll ao abrir ou receber mensagem
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
      inputRef.current?.focus()
    }
  }, [isOpen, messages.length])

  // Marca como lido ao abrir
  useEffect(() => {
    if (isOpen && chatId) {
      markChatRead(chatId).then(() => clearUnread())
    }
  }, [isOpen, chatId, clearUnread])

  // Realtime: novas mensagens
  useEffect(() => {
    if (!chatId) return
    const supabase = createClient()
    const ch = supabase
      .channel(`floating-chat:${chatId}`)
      .on(
        // @ts-ignore
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `chat_id=eq.${chatId}` },
        (payload: any) => {
          const row = payload.new
          if (!row || row.kind === 'system') return

          const isOwn = row.sent_by === userId

          const msg: ChatMessage = {
            id:          row.id,
            chat_id:     row.chat_id,
            sent_by:     row.sent_by ?? null,
            sender_name: isOwn ? userName : null,
            kind:        row.kind,
            body:        row.body,
            metadata:    row.metadata ?? {},
            created_at:  row.created_at,
            edited_at:   null,
            attachments: [],
          }

          setMessages(prev => [...prev, msg])

          if (!isOwn) {
            if (!isOpen) {
              ping()
            } else {
              markChatRead(chatId)
              clearUnread()
            }
          }
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [chatId, isOpen, userId, userName, clearUnread])

  // Enviar mensagem
  const handleSend = useCallback(async () => {
    if (!chatId || !draft.trim() || sending) return
    const body = draft.trim()
    setDraft('')
    setSending(true)
    await sendChatMessage({ chat_id: chatId, body })
    setSending(false)
  }, [chatId, draft, sending])

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // Agrupamento por data
  const grouped: { date: string; msgs: ChatMessage[] }[] = []
  for (const m of messages) {
    const d = fmtDate(m.created_at)
    const last = grouped[grouped.length - 1]
    if (last?.date === d) last.msgs.push(m)
    else grouped.push({ date: d, msgs: [m] })
  }

  // Label do contexto
  const ctxLabel = !chatCtx ? null
    : chatCtx.type === 'procedure'
      ? chatCtx.patientName
      : chatCtx.label

  const ctxSub = !chatCtx ? null
    : chatCtx.type === 'procedure'
      ? (chatCtx.entityType === 'consultation' ? 'Atendimento' : chatCtx.entityType === 'hospitalization' ? 'Internação' : 'Cirurgia')
      : 'Canal do módulo'

  const isProcedure = chatCtx?.type === 'procedure'

  // Não renderiza se não há contexto
  if (!chatCtx) return null

  return (
    <div className="fixed bottom-5 right-5 z-[9500] flex flex-col items-end gap-2 select-none">

      {/* ── Painel de mensagens ─────────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
          style={{ width: 380, height: 520 }}
        >
          {/* Cabeçalho */}
          <div className={`flex items-center gap-2.5 px-4 py-3 flex-shrink-0 ${isProcedure ? 'bg-indigo-600' : 'bg-violet-600'}`}>
            <div className={`flex h-8 w-8 items-center justify-center rounded-full flex-shrink-0 ${isProcedure ? 'bg-indigo-500' : 'bg-violet-500'}`}>
              {isProcedure
                ? <Stethoscope className="h-4 w-4 text-white" />
                : <Hash className="h-4 w-4 text-white" />
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{ctxLabel}</p>
              <p className={`text-xs ${isProcedure ? 'text-indigo-200' : 'text-violet-200'}`}>{ctxSub}</p>
            </div>
            <button
              type="button"
              onClick={closeChat}
              className={`flex-shrink-0 rounded-full p-1.5 transition-colors ${isProcedure ? 'text-indigo-200 hover:bg-indigo-500' : 'text-violet-200 hover:bg-violet-500'}`}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {/* Área de mensagens */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 bg-slate-50">
            {loading && (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            )}
            {!loading && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                {isProcedure
                  ? <Stethoscope className="h-8 w-8 text-slate-200" />
                  : <Hash className="h-8 w-8 text-slate-200" />
                }
                <p className="text-xs text-slate-400 font-medium">
                  {isProcedure ? `Chat do atendimento de ${ctxLabel}` : `Canal ${ctxLabel}`}
                </p>
                <p className="text-xs text-slate-400">Seja o primeiro a enviar uma mensagem.</p>
              </div>
            )}

            {grouped.map(({ date, msgs }) => (
              <div key={date}>
                {/* Separador de data */}
                <div className="flex items-center gap-2 py-2">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[10px] text-slate-400 font-medium px-1">{date}</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                {msgs.map(m => {
                  if (m.kind === 'system') return (
                    <div key={m.id} className="flex justify-center py-1">
                      <span className="text-[10px] text-slate-400 italic">{m.body}</span>
                    </div>
                  )
                  const isOwn = m.sent_by === userId
                  return (
                    <div key={m.id} className={`flex mb-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        isOwn
                          ? (isProcedure ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-violet-600 text-white rounded-br-sm')
                          : 'bg-white text-slate-800 border border-slate-100 rounded-bl-sm'
                      }`}>
                        {!isOwn && m.sender_name && (
                          <p className={`text-[10px] font-semibold mb-0.5 ${isProcedure ? 'text-indigo-600' : 'text-violet-600'}`}>
                            {m.sender_name}
                          </p>
                        )}
                        {m.kind === 'attachment'
                          ? <span className="flex items-center gap-1 text-xs">📎 {m.body}</span>
                          : <p className="whitespace-pre-wrap break-words leading-snug">{m.body}</p>
                        }
                        <p className={`text-[10px] mt-0.5 text-right ${isOwn ? 'opacity-70' : 'text-slate-400'}`}>
                          {fmtTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex items-end gap-2 border-t border-slate-100 bg-white px-3 py-2 flex-shrink-0">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Mensagem… (Enter envia)"
              className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent max-h-24 overflow-auto"
              style={{ minHeight: 38 }}
            />
            <button
              type="button"
              disabled={sending || !draft.trim()}
              onClick={handleSend}
              className={`flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl text-white disabled:opacity-40 transition-colors ${isProcedure ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-violet-600 hover:bg-violet-700'}`}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* ── Botão flutuante ─────────────────────────────────────────────────── */}
      <button
        type="button"
        title={ctxLabel ? `Chat — ${ctxLabel}` : 'Chat Interno'}
        onClick={toggleChat}
        className={`relative flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all duration-200 text-white ${
          isOpen
            ? (isProcedure ? 'bg-indigo-700' : 'bg-violet-700')
            : (isProcedure ? 'bg-indigo-600 hover:bg-indigo-700 hover:scale-105' : 'bg-violet-600 hover:bg-violet-700 hover:scale-105')
        }`}
      >
        {isOpen
          ? <X className="h-6 w-6" />
          : (isProcedure ? <Stethoscope className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />)
        }

        {/* Badge de não-lidas */}
        {!isOpen && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white px-1 animate-bounce">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  )
}
