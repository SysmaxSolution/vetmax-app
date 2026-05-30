'use client'

import { useEffect, useRef, useState, useTransition, useCallback } from 'react'
import { Send, Search, Plus, X, MessageSquare, Users, Loader2, Paperclip, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  listMyChats, listChatMessages, sendChatMessage, markChatRead,
  searchUsersForChat, openOrCreateDirectChat,
  type ChatSummary, type ChatMessage, type ChatUserOption,
} from '@/lib/actions/internal-chat'

interface Props {
  initialChats: ChatSummary[]
  clinicId:     string
  userId:       string
  userName:     string
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function chatTitle(c: ChatSummary, selfUserId: string): string {
  if (c.title) return c.title
  if (c.kind === 'direct') {
    const other = c.participants.find(p => p.user_id !== selfUserId)
    return other?.full_name ?? 'Conversa'
  }
  if (c.kind === 'consultation')    return 'Atendimento'
  if (c.kind === 'hospitalization') return 'Internação'
  if (c.kind === 'surgery')         return 'Cirurgia'
  return 'Conversa'
}

export default function InternalChatWorkspace({ initialChats, clinicId, userId, userName }: Props) {
  const [chats,     setChats]     = useState<ChatSummary[]>(initialChats)
  const [activeId,  setActiveId]  = useState<string | null>(initialChats[0]?.id ?? null)
  const [messages,  setMessages]  = useState<ChatMessage[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [draft,     setDraft]     = useState('')
  const [newChatOpen, setNewChatOpen] = useState(false)
  const [userSearch,  setUserSearch]  = useState('')
  const [userResults, setUserResults] = useState<ChatUserOption[]>([])
  const [pending, startTransition] = useTransition()
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // ── Carrega mensagens ao trocar de chat
  const loadMessages = useCallback(async (chatId: string) => {
    setLoadingMsgs(true)
    const res = await listChatMessages(chatId)
    setLoadingMsgs(false)
    if (Array.isArray(res)) setMessages(res)
    else setMessages([])
    markChatRead(chatId)
    setChats(prev => prev.map(c => c.id === chatId ? { ...c, unread_count: 0 } : c))
  }, [])

  useEffect(() => {
    if (!activeId) { setMessages([]); return }
    loadMessages(activeId)
  }, [activeId, loadMessages])

  // ── Refresh da lista de chats
  const refreshChats = useCallback(async () => {
    const res = await listMyChats()
    if (Array.isArray(res)) setChats(res)
  }, [])

  // ── Realtime: novas mensagens em qualquer chat da clínica
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`internal-chat:${clinicId}`)
      .on(
        // @ts-ignore — tipagem do supabase-js
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `clinic_id=eq.${clinicId}` },
        async (payload: any) => {
          const row = payload.new as { id: string; chat_id: string; sent_by: string | null }
          // Se for do chat ativo, anexa direto; senão atualiza só a lista (snippet + badge)
          if (row.chat_id === activeId) {
            // recarrega últimas mensagens (simples e correto vs montar a row manualmente)
            const res = await listChatMessages(row.chat_id, { limit: 50 })
            if (Array.isArray(res)) setMessages(res)
            if (row.sent_by !== userId) markChatRead(row.chat_id)
          }
          refreshChats()
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [clinicId, activeId, userId, refreshChats])

  // ── Auto-scroll ao fim quando chegam mensagens novas
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // ── Busca de usuários para iniciar chat
  useEffect(() => {
    if (!newChatOpen) return
    const t = setTimeout(async () => {
      const res = await searchUsersForChat(userSearch)
      if (Array.isArray(res)) setUserResults(res)
    }, 200)
    return () => clearTimeout(t)
  }, [userSearch, newChatOpen])

  // ── Envio
  function handleSend(e?: React.FormEvent) {
    e?.preventDefault()
    const body = draft.trim()
    if (!body || !activeId || pending) return
    setDraft('')
    startTransition(async () => {
      const res = await sendChatMessage({ chat_id: activeId, body })
      if ('error' in res) {
        setDraft(body)
        alert(res.error)
      } else {
        // Realtime broadcast vai disparar refresh; mas otimistamente também recarregamos
        await loadMessages(activeId)
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handlePickUser(opt: ChatUserOption) {
    setNewChatOpen(false)
    startTransition(async () => {
      const res = await openOrCreateDirectChat(opt.user_id)
      if ('error' in res) { alert(res.error); return }
      await refreshChats()
      setActiveId(res.chat_id)
    })
  }

  const activeChat = chats.find(c => c.id === activeId) ?? null

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-6 py-4 sm:py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-slate-900">Chat Interno</h1>
        <p className="mt-0.5 text-sm text-slate-500">Mensagens em tempo real entre a equipe</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[480px]">
        {/* ── Sidebar: lista de chats ───────────────────────────────────── */}
        <aside className="flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
            <p className="text-sm font-semibold text-slate-700">Conversas</p>
            <button
              type="button"
              onClick={() => { setNewChatOpen(true); setUserSearch('') }}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo
            </button>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-3 text-center">
                <MessageSquare className="h-8 w-8 text-slate-200 mb-2" />
                <p className="text-xs text-slate-500">Nenhuma conversa ainda.</p>
                <button
                  type="button"
                  onClick={() => setNewChatOpen(true)}
                  className="mt-3 text-xs text-violet-700 font-semibold hover:underline"
                >
                  Iniciar a primeira
                </button>
              </div>
            ) : chats.map(c => {
              const isActive = c.id === activeId
              const title = chatTitle(c, userId)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${
                    isActive ? 'bg-violet-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0 ${
                      c.kind === 'direct'         ? 'bg-emerald-100 text-emerald-700'
                      : c.kind === 'consultation' ? 'bg-blue-100 text-blue-700'
                      : c.kind === 'hospitalization' ? 'bg-indigo-100 text-indigo-700'
                      : c.kind === 'surgery'      ? 'bg-orange-100 text-orange-700'
                      : 'bg-slate-100 text-slate-600'
                    }`}>
                      {c.kind === 'direct' ? <MessageSquare className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate">{title}</p>
                        <span className="text-[10px] text-slate-400 flex-shrink-0">
                          {formatTimestamp(c.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-slate-500 truncate">{c.last_preview ?? '—'}</p>
                        {c.unread_count > 0 && (
                          <span className="flex-shrink-0 rounded-full bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] text-center">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </aside>

        {/* ── Painel: mensagens ─────────────────────────────────────────── */}
        <section className="flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {!activeChat ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center px-4">
              <MessageSquare className="h-10 w-10 text-slate-200 mb-3" />
              <p className="text-sm font-medium text-slate-500">Selecione uma conversa para começar</p>
            </div>
          ) : (
            <>
              <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{chatTitle(activeChat, userId)}</p>
                  <p className="text-xs text-slate-500">
                    {activeChat.participants.length} participante{activeChat.participants.length !== 1 ? 's' : ''}
                    {activeChat.kind !== 'direct' && ` · ${activeChat.kind}`}
                  </p>
                </div>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50/50">
                {loadingMsgs ? (
                  <div className="flex items-center justify-center py-10 text-slate-400 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Carregando…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-xs text-slate-400 py-10">
                    Sem mensagens ainda. Mande a primeira.
                  </div>
                ) : messages.map(m => {
                  const mine = m.sent_by === userId
                  if (m.kind === 'system') {
                    return (
                      <div key={m.id} className="text-center">
                        <span className="inline-block rounded-full bg-slate-200 text-slate-600 text-[10px] px-3 py-1">
                          {m.body ?? '—'}
                        </span>
                      </div>
                    )
                  }
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 shadow-sm ${
                        mine ? 'bg-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-800'
                      }`}>
                        {!mine && (
                          <p className="text-[10px] font-semibold text-slate-500 mb-0.5">
                            {m.sender_name ?? 'Usuário'}
                          </p>
                        )}
                        {m.body && <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>}
                        {m.attachments.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {m.attachments.map(a => (
                              <a
                                key={a.id}
                                href={a.file_url ?? '#'}
                                target="_blank"
                                rel="noreferrer"
                                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                                  mine ? 'bg-violet-700 text-white hover:bg-violet-800' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                              >
                                {a.kind === 'pdf' ? <FileText className="h-3.5 w-3.5" /> : <Paperclip className="h-3.5 w-3.5" />}
                                <span className="truncate">{a.title}</span>
                              </a>
                            ))}
                          </div>
                        )}
                        <p className={`text-[10px] mt-1 ${mine ? 'text-violet-100' : 'text-slate-400'} text-right`}>
                          {formatTimestamp(m.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <form onSubmit={handleSend} className="border-t border-slate-100 p-3 flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Mensagem… (Enter envia, Shift+Enter quebra linha)"
                  className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 max-h-32"
                  style={{ minHeight: '40px' }}
                />
                <button
                  type="submit"
                  disabled={!draft.trim() || pending}
                  className="flex items-center justify-center h-10 w-10 rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                  aria-label="Enviar"
                >
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </form>
            </>
          )}
        </section>
      </div>

      {/* ── Modal: iniciar novo chat ──────────────────────────────────── */}
      {newChatOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10010] flex items-start justify-center bg-slate-900/60 backdrop-blur-sm p-4 pt-[15vh]"
          onClick={() => setNewChatOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  autoFocus
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Buscar colega por nome…"
                  className="bg-transparent text-sm focus:outline-none w-full"
                />
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setNewChatOpen(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="max-h-[60vh] overflow-y-auto">
              {userResults.length === 0 ? (
                <li className="px-4 py-8 text-center text-xs text-slate-400">
                  Nenhum usuário encontrado
                </li>
              ) : userResults.map(u => (
                <li key={u.user_id}>
                  <button
                    type="button"
                    onClick={() => handlePickUser(u)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-slate-50 text-left"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">
                      {(u.full_name ?? '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{u.full_name ?? 'Sem nome'}</p>
                      <p className="text-[11px] text-slate-500 capitalize">{u.role}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
