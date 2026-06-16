'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { MessageCircle, Send, Bot, User, X, ArrowLeft, RotateCcw, Check, CheckSquare, Square, Pin, CheckCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getWhatsappConversations,
  getConversationMessages,
  sendHumanMessage,
  takeOverConversation,
  returnToBot,
  closeConversation,
  reopenConversation,
  takeOverConversationsBulk,
  returnConversationsToBotBulk,
  markWppRead,
  markWppUnread,
  toggleWppPin,
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

// Formata tutor_phone para exibição: remove sufixos WhatsApp e máscara brasileira
function displayPhone(raw: string | null): string {
  if (!raw) return ''
  if (raw.endsWith('@lid')) return 'WhatsApp'
  const digits = raw.replace('@s.whatsapp.net', '').replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length === 13)
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`
  if (digits.startsWith('55') && digits.length === 12)
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`
  return digits || raw
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConversationsPageClient({
  initialConversations,
  clinicId,
}: {
  initialConversations: WppConversation[]
  clinicId: string
}) {
  const [conversations, setConversations] = useState(initialConversations)
  const [filter,        setFilter]        = useState<FilterStatus>('all')
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [bulkSelected,  setBulkSelected]  = useState<Set<string>>(new Set())
  const [bulkMode,      setBulkMode]      = useState(false)
  const [messages,      setMessages]      = useState<WppMessage[]>([])
  const [replyText,     setReplyText]     = useState('')
  const [loadingMsgs,   setLoadingMsgs]   = useState(false)
  const [toast,         setToast]         = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [isPending,     startTransition]  = useTransition()
  const [mobileView,    setMobileView]    = useState<'list' | 'chat'>('list')
  const [ctxMenu,       setCtxMenu]       = useState<{ x: number; y: number; conv: WppConversation } | null>(null)
  const endRef        = useRef<HTMLDivElement>(null)
  const selectedIdRef = useRef<string | null>(null)

  // Mantém ref sincronizada com state para uso nos callbacks do Realtime
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  const selectedConv = conversations.find(c => c.id === selectedId) ?? null
  const humanCount   = conversations.filter(c => c.status === 'human').length

  // Scroll to bottom when messages change
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Supabase Realtime — atualizações instantâneas sem polling
  // Requer replication habilitada para as tabelas no Supabase Dashboard > Database > Replication
  useEffect(() => {
    if (!clinicId) return
    const supabase = createClient()

    const channel = supabase.channel(`wpp-${clinicId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_conversations', filter: `clinic_id=eq.${clinicId}` },
        async () => {
          const res = await getWhatsappConversations()
          if (Array.isArray(res)) setConversations(res)
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `clinic_id=eq.${clinicId}` },
        async (payload) => {
          const newMsg = payload.new as Record<string, unknown>
          const sid = selectedIdRef.current
          if (sid && newMsg.conversation_id === sid) {
            const res = await getConversationMessages(sid)
            if (Array.isArray(res)) setMessages(res)
          }
          const convRes = await getWhatsappConversations()
          if (Array.isArray(convRes)) setConversations(convRes)
        },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [clinicId])

  // Polling de fallback raro — Realtime cobre o caminho principal; este intervalo
  // só protege contra desconexão do WebSocket.
  useEffect(() => {
    const id = setInterval(async () => {
      const res = await getWhatsappConversations()
      if (Array.isArray(res)) setConversations(res)
    }, 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!selectedId) return
    const id = setInterval(async () => {
      const res = await getConversationMessages(selectedId)
      if (Array.isArray(res)) setMessages(res)
    }, 60000)
    return () => clearInterval(id)
  }, [selectedId])

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function selectConversation(id: string) {
    setSelectedId(id)
    setMobileView('chat')
    setMessages([])
    setReplyText('')
    setLoadingMsgs(true)
    const res = await getConversationMessages(id)
    setLoadingMsgs(false)
    if (Array.isArray(res)) setMessages(res)
    // Zera não-lidos otimisticamente ao abrir a conversa
    setConversations(prev => prev.map(c => c.id === id ? { ...c, unread_count: 0 } : c))
    void markWppRead(id)
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

  function handleReopen() {
    if (!selectedId || isPending) return
    startTransition(async () => {
      const res = await reopenConversation(selectedId)
      if ('error' in res) { showToast(res.error, 'error'); return }
      showToast('Conversa reaberta.')
      await Promise.all([refreshAll(), (async () => {
        const msgs = await getConversationMessages(selectedId)
        if (Array.isArray(msgs)) setMessages(msgs)
      })()])
    })
  }

  // ─── Bulk actions ──────────────────────────────────────────────────────────
  function toggleBulk(id: string) {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function exitBulkMode() {
    setBulkMode(false)
    setBulkSelected(new Set())
  }

  function selectAllVisible() {
    const visibleIds = filtered.map(c => c.id)
    if (bulkSelected.size === visibleIds.length) {
      setBulkSelected(new Set())
    } else {
      setBulkSelected(new Set(visibleIds))
    }
  }

  function handleBulkTakeOver() {
    const ids = Array.from(bulkSelected)
    if (ids.length === 0 || isPending) return
    startTransition(async () => {
      const res = await takeOverConversationsBulk(ids)
      if ('error' in res) { showToast(res.error, 'error'); return }
      showToast(`${res.updated} conversa${res.updated !== 1 ? 's' : ''} assumida${res.updated !== 1 ? 's' : ''}.`)
      exitBulkMode()
      await refreshAll()
    })
  }

  function handleBulkReturnToBot() {
    const ids = Array.from(bulkSelected)
    if (ids.length === 0 || isPending) return
    startTransition(async () => {
      const res = await returnConversationsToBotBulk(ids)
      if ('error' in res) { showToast(res.error, 'error'); return }
      showToast(`${res.updated} conversa${res.updated !== 1 ? 's' : ''} devolvida${res.updated !== 1 ? 's' : ''} ao bot.`)
      exitBulkMode()
      await refreshAll()
    })
  }

  // ─── Context menu (botão direito) ────────────────────────────────────────
  function handleConvRightClick(e: React.MouseEvent, conv: WppConversation) {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, conv })
  }

  async function handleCtxTogglePin() {
    if (!ctxMenu) return
    const { conv } = ctxMenu
    setCtxMenu(null)
    await toggleWppPin(conv.id)
    await refreshAll()
  }

  async function handleCtxToggleRead() {
    if (!ctxMenu) return
    const { conv } = ctxMenu
    setCtxMenu(null)
    if (conv.unread_count > 0) {
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c))
      void markWppRead(conv.id)
    } else {
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unread_count: 1 } : c))
      void markWppUnread(conv.id)
    }
  }

  // Pinned first (by pin_order), then by last_message_at desc
  const sorted = [...conversations].sort((a, b) => {
    const aPinned = a.pinned_at !== null
    const bPinned = b.pinned_at !== null
    if (aPinned !== bPinned) return aPinned ? -1 : 1
    if (aPinned && bPinned) return (a.pin_order ?? 0) - (b.pin_order ?? 0)
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
    return bTime - aTime
  })

  const filtered = sorted.filter(c =>
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
          <span
            className="flex items-center gap-2 text-xs font-medium text-emerald-700"
            title="Conversas atualizam automaticamente em tempo real"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Ao vivo
          </span>
        </div>

        {/* 2-panel layout */}
        <div
          className="grid grid-cols-1 lg:grid-cols-5 gap-0 rounded-2xl border border-slate-200 bg-white overflow-hidden"
          style={{ minHeight: '400px' }}
        >
          {/* ── Left: conversation list ── */}
          <div className={`lg:col-span-2 border-r border-slate-200 flex-col ${mobileView === 'chat' ? 'hidden lg:flex' : 'flex'}`}>
            {/* Filter tabs + bulk toggle */}
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
              <button
                onClick={() => bulkMode ? exitBulkMode() : setBulkMode(true)}
                title="Selecionar múltiplas conversas"
                className={`ml-auto px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  bulkMode ? 'bg-teal-600 text-white' : 'text-slate-500 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {bulkMode ? `Cancelar (${bulkSelected.size})` : 'Selecionar'}
              </button>
            </div>

            {/* Bulk action bar — aparece quando há seleção */}
            {bulkMode && (
              <div className="px-3 py-2 border-b border-slate-100 bg-teal-50/60 flex items-center gap-2 flex-wrap">
                <button
                  onClick={selectAllVisible}
                  className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800"
                >
                  {bulkSelected.size === filtered.length && filtered.length > 0
                    ? <><CheckSquare className="h-3.5 w-3.5" /> Desmarcar todas</>
                    : <><Square className="h-3.5 w-3.5" /> Marcar todas ({filtered.length})</>}
                </button>
                <span className="text-xs font-bold text-teal-700 ml-auto">
                  {bulkSelected.size} selecionada{bulkSelected.size !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={handleBulkTakeOver}
                  disabled={bulkSelected.size === 0 || isPending}
                  className="flex items-center gap-1 rounded-lg bg-amber-500 hover:bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                  title="Marcar selecionadas como atendimento humano"
                >
                  <User className="h-3 w-3" /> Assumir
                </button>
                <button
                  onClick={handleBulkReturnToBot}
                  disabled={bulkSelected.size === 0 || isPending}
                  className="flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                  title="Devolver selecionadas ao atendimento automático"
                >
                  <Bot className="h-3 w-3" /> Bot
                </button>
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">
                  {filter === 'all' ? 'Nenhuma conversa aberta' : `Nenhuma conversa com status "${filter}"`}
                </div>
              ) : (
                filtered.map(conv => {
                  const isChecked = bulkSelected.has(conv.id)
                  return (
                    <div
                      key={conv.id}
                      onContextMenu={(e) => !bulkMode && handleConvRightClick(e, conv)}
                      className={`flex items-center gap-2 px-2 py-3 hover:bg-slate-50 transition-colors ${
                        selectedId === conv.id && !bulkMode ? 'bg-slate-100 border-l-2 border-teal-500' : ''
                      } ${isChecked ? 'bg-teal-50/50' : ''}`}
                    >
                      {bulkMode && (
                        <button
                          onClick={() => toggleBulk(conv.id)}
                          className="flex-shrink-0 ml-1 p-1 rounded text-teal-600 hover:bg-teal-100"
                          title={isChecked ? 'Desmarcar' : 'Marcar'}
                        >
                          {isChecked
                            ? <CheckSquare className="h-4 w-4" />
                            : <Square className="h-4 w-4 text-slate-400" />}
                        </button>
                      )}
                      <button
                        onClick={() => bulkMode ? toggleBulk(conv.id) : selectConversation(conv.id)}
                        className="flex-1 text-left px-2 py-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold ${
                              conv.status === 'human'  ? 'bg-amber-100 text-amber-700' :
                              conv.status === 'bot'    ? 'bg-blue-100 text-blue-700'   :
                              'bg-slate-100 text-slate-400'
                            }`}>
                              {(conv.tutor_name || displayPhone(conv.tutor_phone)).charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {conv.tutor_name || displayPhone(conv.tutor_phone) || 'Desconhecido'}
                              </p>
                              {conv.tutor_name && (
                                <p className="text-[11px] text-slate-400">{displayPhone(conv.tutor_phone)}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <div className="flex items-center gap-1">
                              {conv.pinned_at && (
                                <Pin className="h-3 w-3 text-amber-500" />
                              )}
                              <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 ${STATUS_CFG[conv.status].color}`}>
                                {STATUS_CFG[conv.status].label}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {conv.last_message_at && (
                                <span className="text-[10px] text-slate-400">{timeLabel(conv.last_message_at)}</span>
                              )}
                              {conv.unread_count > 0 && (
                                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-white">
                                  {conv.unread_count > 99 ? '99+' : conv.unread_count}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* ── Right: message thread ── */}
          <div className={`lg:col-span-3 flex-col ${mobileView === 'list' ? 'hidden lg:flex' : 'flex'}`}>
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
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => setMobileView('list')}
                      className="flex lg:hidden items-center gap-1 text-slate-500 hover:text-slate-900 text-sm font-medium flex-shrink-0"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate">{selectedConv.tutor_name || displayPhone(selectedConv.tutor_phone) || 'Desconhecido'}</p>
                      <p className="text-xs text-slate-400">{displayPhone(selectedConv.tutor_phone)}</p>
                    </div>
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

                    {selectedConv.status === 'closed' && (
                      <button
                        onClick={handleReopen}
                        disabled={isPending}
                        className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reabrir
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

      {/* Context menu — botão direito sobre conversa */}
      {ctxMenu && (
        <>
          <div
            className="fixed inset-0 z-[10080]"
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }}
          />
          <div
            className="fixed z-[10090] min-w-[190px] rounded-xl border border-slate-200 bg-white py-1 shadow-2xl"
            style={{ top: ctxMenu.y, left: Math.min(ctxMenu.x, window.innerWidth - 200) }}
          >
            <button
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={handleCtxTogglePin}
            >
              <Pin className="h-3.5 w-3.5 text-amber-500" />
              {ctxMenu.conv.pinned_at ? 'Desafixar conversa' : 'Fixar conversa'}
            </button>
            <button
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={handleCtxToggleRead}
            >
              <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
              {ctxMenu.conv.unread_count > 0 ? 'Marcar como lida' : 'Marcar como não lida'}
            </button>
          </div>
        </>
      )}
    </>
  )
}
