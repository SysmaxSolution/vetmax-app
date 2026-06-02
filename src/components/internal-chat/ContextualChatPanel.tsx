'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageSquare, X, Send, Loader2, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getEntityChat,
  sendChatMessage,
  markChatRead,
  type ChatEntityType,
  type ChatMessage,
} from '@/lib/actions/internal-chat'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  entityType:  ChatEntityType
  entityId:    string
  clinicId:    string
  userId:      string
  userName:    string
  patientName: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return 'Hoje'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ContextualChatPanel({
  entityType, entityId, clinicId, userId, userName, patientName,
}: Props) {
  const [open,      setOpen]      = useState(false)
  const [chatId,    setChatId]    = useState<string | null>(null)
  const [messages,  setMessages]  = useState<ChatMessage[]>([])
  const [unread,    setUnread]    = useState(0)
  const [draft,     setDraft]     = useState('')
  const [sending,   setSending]   = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)

  // ── Carrega chat da entidade ──────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const res = await getEntityChat(entityType, entityId)
    setLoading(false)
    if ('error' in res) { setError(res.error); return }
    setChatId(res.chat_id)
    setMessages(res.messages)
    setUnread(res.unread_count)
  }, [entityType, entityId])

  useEffect(() => { load() }, [load])

  // ── Marca como lido ao abrir ──────────────────────────────────────────────
  useEffect(() => {
    if (open && chatId) {
      markChatRead(chatId).then(() => setUnread(0))
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
      inputRef.current?.focus()
    }
  }, [open, chatId])

  // ── Realtime: novas mensagens ─────────────────────────────────────────────
  useEffect(() => {
    if (!chatId) return
    const supabase = createClient()
    const ch = supabase
      .channel(`ctx-chat:${chatId}`)
      .on(
        // @ts-ignore
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'chat_messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload: any) => {
          const row = payload.new
          if (!row) return

          const msg: ChatMessage = {
            id:          row.id,
            chat_id:     row.chat_id,
            sent_by:     row.sent_by ?? null,
            sender_name: row.sent_by === userId ? userName : null,
            kind:        row.kind,
            body:        row.body,
            metadata:    row.metadata ?? {},
            created_at:  row.created_at,
            edited_at:   null,
            attachments: [],
          }

          setMessages(prev => [...prev, msg])

          if (open && row.sent_by !== userId) {
            // já visível → marca lido imediatamente
            if (chatId) markChatRead(chatId)
          } else if (!open && row.sent_by !== userId) {
            setUnread(u => u + 1)
          }

          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [chatId, clinicId, open, userId, userName])

  // ── Enviar mensagem ───────────────────────────────────────────────────────
  async function handleSend() {
    if (!chatId || !draft.trim() || sending) return
    const body = draft.trim()
    setDraft('')
    setSending(true)
    const res = await sendChatMessage({ chat_id: chatId, body })
    setSending(false)
    if ('error' in res) setError(res.error)
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // ── Agrupamento de mensagens por data ─────────────────────────────────────
  const grouped: { date: string; msgs: ChatMessage[] }[] = []
  for (const m of messages) {
    const d = formatDate(m.created_at)
    const last = grouped[grouped.length - 1]
    if (last?.date === d) last.msgs.push(m)
    else grouped.push({ date: d, msgs: [m] })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-6 right-6 z-[9000] flex flex-col items-end gap-3">

      {/* Painel de mensagens */}
      {open && (
        <div className="w-80 sm:w-96 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
          style={{ height: '480px' }}>

          {/* Cabeçalho */}
          <div className="flex items-center justify-between gap-2 bg-violet-600 px-4 py-3 flex-shrink-0">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">Chat — {patientName}</p>
              <p className="text-xs text-violet-200">
                {entityType === 'consultation' ? 'Atendimento' : entityType === 'hospitalization' ? 'Internação' : 'Cirurgia'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-shrink-0 rounded-full p-1 text-violet-200 hover:bg-violet-500 transition-colors"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 bg-slate-50">
            {loading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            )}
            {!loading && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <MessageSquare className="h-8 w-8 text-slate-200 mb-2" />
                <p className="text-xs text-slate-400">Nenhuma mensagem ainda.</p>
                <p className="text-xs text-slate-400">Inicie a conversa sobre este atendimento.</p>
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

                {msgs.map((m) => {
                  const isOwn = m.sent_by === userId
                  if (m.kind === 'system') {
                    return (
                      <div key={m.id} className="flex justify-center py-1">
                        <span className="text-[10px] text-slate-400 italic">{m.body}</span>
                      </div>
                    )
                  }
                  return (
                    <div key={m.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1`}>
                      <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        isOwn
                          ? 'bg-violet-600 text-white rounded-br-sm'
                          : 'bg-white text-slate-800 border border-slate-100 rounded-bl-sm'
                      }`}>
                        {!isOwn && m.sender_name && (
                          <p className="text-[10px] font-semibold text-violet-600 mb-0.5">{m.sender_name}</p>
                        )}
                        {m.kind === 'attachment' ? (
                          <span className="flex items-center gap-1 text-xs">📎 {m.body}</span>
                        ) : (
                          <p className="whitespace-pre-wrap break-words leading-snug">{m.body}</p>
                        )}
                        <p className={`text-[10px] mt-0.5 text-right ${isOwn ? 'text-violet-200' : 'text-slate-400'}`}>
                          {formatTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Erro */}
          {error && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-red-50 border-t border-red-100 flex-shrink-0">
              <p className="text-xs text-red-600">{error}</p>
              <button type="button" onClick={() => setError(null)}><X className="h-3.5 w-3.5 text-red-400" /></button>
            </div>
          )}

          {/* Input */}
          <div className="flex items-end gap-2 border-t border-slate-100 bg-white px-3 py-2 flex-shrink-0">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Mensagem... (Enter para enviar)"
              className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent max-h-24 overflow-auto"
              style={{ minHeight: '38px' }}
            />
            <button
              type="button"
              disabled={sending || !draft.trim()}
              onClick={handleSend}
              className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Botão flutuante */}
      <button
        type="button"
        title={`Chat do atendimento — ${patientName}`}
        onClick={() => setOpen(o => !o)}
        className={`relative flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-200 ${
          open
            ? 'bg-violet-700 text-white'
            : 'bg-violet-600 text-white hover:bg-violet-700 hover:scale-105'
        }`}
      >
        {open ? <X className="h-5 w-5" /> : <MessageSquare className="h-5 w-5" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  )
}
