'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { MessageCircle, Send, RefreshCw, Bot, User, X } from 'lucide-react'
import {
  getWhatsappConversations,
  getConversationMessages,
  sendHumanMessage,
  takeOverConversation,
  returnToBot,
  closeConversation,
  type WppConversation,
  type WppMessage,
} from '@/lib/actions/whatsapp-conversations'

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterStatus = 'all' | 'human' | 'bot' | 'closed'

const STATUS_CFG = {
  bot:    { label: 'Bot',     color: 'bg-blue-100 text-blue-700'   },
  human:  { label: 'Humano',  color: 'bg-amber-100 text-amber-700' },
  closed: { label: 'Fechado', color: 'bg-slate-100 text-slate-500' },
}

function timeLabel(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  if (mins < 1440) return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConversationsPageClient({
  initialConversations,
}: {
  initialConversations: WppConversation[]
}) {
  const [conversations, setConversations] = useState(initialConversations)
  const [filter,        setFilter]        = useState<FilterStatus>('all')
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [messages,      setMessages]      = useState<WppMessage[]>([])
  const [replyText,     setReplyText]     = useState('')
  const [loadingMsgs,   setLoadingMsgs]   = useState(false)
  const [toast,         setToast]         = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [isPending,     startTransition]  = useTransition()
  const endRef = useRef<HTMLDivElement>(null)

  const selectedConv = conversations.find(c => c.id === selectedId) ?? null
  const humanCount   = conversations.filter(c => c.status === 'human').length

  // Scroll to bottom when messages change
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Poll conversation list every 15s
  useEffect(() => {
    const id = setInterval(async () => {
      const res = await getWhatsappConversations()
      if (Array.isArray(res)) setConversations(res)
    }, 15000)
    return () => clearInterval(id)
  }, [])

  // Poll messages every 8s when a conversation is open
  useEffect(() => {
    if (!selectedId) return
    const id = setInterval(async () => {
      const res = await getConversationMessages(selectedId)
      if (Array.isArray(res)) setMessages(res)
    }, 8000)
    return () => clearInterval(id)
  }, [selectedId])

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function selectConversation(id: string) {
    setSelectedId(id)
    setMessages([])
    setReplyText('')
    setLoadingMsgs(true)
    const res = await getConversationMessages(id)
    setLoadingMsgs(false)
    if (Array.isArray(res)) setMessages(res)
  }

  async function refreshAll() {
    const res = await getWhatsappConversations()
    if (Array.isArray(res)) setConversations(res)
  }

  function handleSend() {
    if (!selectedId || !replyText.trim() || isPending) return
    const text = replyText.trim()
    setReplyText('')
    startTransition(async () => {
      const res = await sendHumanMessage(selectedId, text)
      if ('error' in res) {
        showToast(res.error, 'error')
        setReplyText(text)
      } else {
        const msgs = await getConversationMessages(selectedId)
        if (Array.isArray(msgs)) setMessages(msgs)
      }
    })
  }

  function handleTakeOver() {
    if (!selectedId || isPending) return
    startTransition(async () => {
      const res = await takeOverConversation(selectedId)
      if ('error' in res) { showToast(res.error, 'error'); return }
      showToast('Atendimento assumido.')
      await Promise.all([refreshAll(), (async () => {
        const msgs = await getConversationMessages(selectedId)
        if (Array.isArray(msgs)) setMessages(msgs)
      })()])
    })
  }

  function handleReturnToBot() {
    if (!selectedId || isPending) return
    startTransition(async () => {
      const res = await returnToBot(selectedId)
      if ('error' in res) { showToast(res.error, 'error'); return }
      showToast('Conversa devolvida ao bot.')
      await Promise.all([refreshAll(), (async () => {
        const msgs = await getConversationMessages(selectedId)
        if (Array.isArray(msgs)) setMessages(msgs)
      })()])
    })
  }

  function handleClose() {
    if (!selectedId || isPending) return
    startTransition(async () => {
      const res = await closeConversation(selectedId)
      if ('error' in res) { showToast(res.error, 'error'); return }
      showToast('Conversa encerrada.')
      setSelectedId(null)
      setMessages([])
      await refreshAll()
    })
  }

  const filtered = conversations.filter(c =>
    filter === 'all' ? c.status !== 'closed' : c.status === filter
  )

  return (
    <>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">WhatsApp — Atendimento</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {humanCount > 0
                ? `${humanCount} conversa${humanCount !== 1 ? 's' : ''} aguardando atendimento humano`
                : 'Sem conversas aguardando atendimento humano'}
            </p>
          </div>
          <button
            onClick={refreshAll}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>

        {/* 2-panel layout */}
        <div
          className="grid grid-cols-1 lg:grid-cols-5 gap-0 rounded-2xl border border-slate-200 bg-white overflow-hidden"
          style={{ minHeight: '580px' }}
        >
          {/* ── Left: conversation list ── */}
          <div className="lg:col-span-2 border-r border-slate-200 flex flex-col">
            {/* Filter tabs */}
            <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b border-slate-100 flex-wrap">
              {([
                ['all',    'Abertas'],
                ['human',  'Humano'],
                ['bot',    'Bot'],
                ['closed', 'Fechadas'],
              ] as [FilterStatus, string][]).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className={`relative px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                    filter === val ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {label}
                  {val === 'human' && humanCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                      {humanCount > 9 ? '9+' : humanCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">
                  {filter === 'all' ? 'Nenhuma conversa aberta' : `Nenhuma conversa com status "${filter}"`}
                </div>
              ) : (
                filtered.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => selectConversation(conv.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                      selectedId === conv.id ? 'bg-slate-100 border-l-2 border-teal-500' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold ${
                          conv.status === 'human'  ? 'bg-amber-100 text-amber-700' :
                          conv.status === 'bot'    ? 'bg-blue-100 text-blue-700'   :
                          'bg-slate-100 text-slate-400'
                        }`}>
                          {(conv.tutor_name ?? conv.tutor_phone).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {conv.tutor_name ?? conv.tutor_phone}
                          </p>
                          {conv.tutor_name && (
                            <p className="text-[11px] text-slate-400">{conv.tutor_phone}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${STATUS_CFG[conv.status].color}`}>
                          {STATUS_CFG[conv.status].label}
                        </span>
                        {conv.last_message_at && (
                          <span className="text-[10px] text-slate-400">{timeLabel(conv.last_message_at)}</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* ── Right: message thread ── */}
          <div className="lg:col-span-3 flex flex-col">
            {!selectedConv ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <MessageCircle className="h-12 w-12 text-slate-200 mb-3" />
                <p className="text-sm font-medium text-slate-400">Selecione uma conversa</p>
                <p className="text-xs text-slate-300 mt-0.5">para ver o histórico e responder</p>
              </div>
            ) : (
              <>
                {/* Conversation header */}
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold text-slate-900">{selectedConv.tutor_name ?? selectedConv.tutor_phone}</p>
                    <p className="text-xs text-slate-400">{selectedConv.tutor_phone}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold rounded-full px-2.5 py-1 ${STATUS_CFG[selectedConv.status].color}`}>
                      {STATUS_CFG[selectedConv.status].label}
                    </span>

                    {selectedConv.status === 'bot' && (
                      <button
                        onClick={handleTakeOver}
                        disabled={isPending}
                        className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <User className="h-3.5 w-3.5" />
                        Assumir
                      </button>
                    )}

                    {selectedConv.status === 'human' && (
                      <button
                        onClick={handleReturnToBot}
                        disabled={isPending}
                        className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Bot className="h-3.5 w-3.5" />
                        Devolver ao Bot
                      </button>
                    )}

                    {selectedConv.status !== 'closed' && (
                      <button
                        onClick={handleClose}
                        disabled={isPending}
                        className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 bg-slate-50 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Fechar
                      </button>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5" style={{ maxHeight: '400px' }}>
                  {loadingMsgs ? (
                    <div className="flex items-center justify-center py-10">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-8">Nenhuma mensagem</p>
                  ) : (
                    messages.map(msg => {
                      const out       = msg.direction === 'outbound'
                      const isHuman   = msg.sent_by === 'human'
                      const isBot     = msg.sent_by === 'bot'
                      return (
                        <div key={msg.id} className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 ${
                            out
                              ? isHuman ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-900'
                          }`}>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                            <div className={`flex items-center gap-1 mt-1 ${out ? 'text-white/60' : 'text-slate-400'} justify-end`}>
                              {isHuman && <User className="h-2.5 w-2.5" />}
                              {isBot   && <Bot  className="h-2.5 w-2.5" />}
                              <span className="text-[10px]">{timeLabel(msg.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={endRef} />
                </div>

                {/* Reply box */}
                {selectedConv.status === 'human' ? (
                  <div className="border-t border-slate-100 p-3 flex items-end gap-2">
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                      }}
                      placeholder="Digite sua mensagem… (Enter para enviar, Shift+Enter para nova linha)"
                      rows={2}
                      className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!replyText.trim() || isPending}
                      className="flex-shrink-0 h-10 w-10 rounded-xl bg-teal-600 flex items-center justify-center text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="border-t border-slate-100 px-4 py-3 text-center">
                    <p className="text-xs text-slate-400">
                      {selectedConv.status === 'closed'
                        ? 'Esta conversa está encerrada.'
                        : 'Bot gerenciando a conversa. Clique em "Assumir" para responder manualmente.'}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
