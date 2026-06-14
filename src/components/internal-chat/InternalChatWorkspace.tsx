'use client'

import { useEffect, useRef, useState, useTransition, useCallback } from 'react'
import {
  Send, Search, Plus, X, MessageSquare, Users, Loader2, Paperclip,
  FileText, Check, UserPlus, Pin, PinOff, BellOff, Bell,
  Pencil, Trash2, MoreVertical, Hash, Globe, Lock,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  listMyChats, listChatMessages, sendChatMessage, markChatRead,
  markChatUnread, toggleChatPin, searchUsersForChat, openOrCreateDirectChat,
  createGroupChat, uploadChatAttachment, editChatMessage, deleteChatMessage,
  listChannels, joinChannel, createChannelChat,
  type ChatSummary, type ChatMessage, type ChatUserOption, type ChannelSummary,
} from '@/lib/actions/internal-chat'
import ChatParticipantsSheet from './ChatParticipantsSheet'

interface Props {
  initialChats: ChatSummary[]
  clinicId:     string
  userId:       string
  userName:     string
  userRole?:    string
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function chatDisplayTitle(c: ChatSummary, selfUserId: string): string {
  if (c.display_title) return c.display_title
  if (c.title) return c.title
  if (c.kind === 'direct') {
    const other = c.participants.find(p => p.user_id !== selfUserId)
    return other?.full_name ?? 'Conversa'
  }
  if (c.kind === 'consultation')    return 'Atendimento'
  if (c.kind === 'hospitalization') return 'Internação'
  if (c.kind === 'surgery')         return 'Cirurgia'
  if (c.kind === 'channel')         return c.title ?? 'Canal'
  return 'Conversa'
}

interface CtxMenu {
  x: number; y: number
  chatId: string
  isPinned: boolean
  isUnread: boolean
}

interface MsgCtxMenu {
  x: number; y: number
  msgId: string
  isMine: boolean
  body: string | null
}

export default function InternalChatWorkspace({
  initialChats, clinicId, userId, userName, userRole,
}: Props) {
  const [chats,          setChats]          = useState<ChatSummary[]>(initialChats)
  const [activeId,       setActiveId]       = useState<string | null>(
    // Abre o chat com URL ?chat= se houver
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('chat') ?? initialChats[0]?.id ?? null
      : initialChats[0]?.id ?? null,
  )
  const [messages,       setMessages]       = useState<ChatMessage[]>([])
  const [loadingMsgs,    setLoadingMsgs]    = useState(false)
  const [draft,          setDraft]          = useState('')
  const [newChatOpen,    setNewChatOpen]    = useState(false)
  const [newChatMode,    setNewChatMode]    = useState<'direct' | 'group' | 'channel'>('direct')
  const [userSearch,     setUserSearch]     = useState('')
  const [userResults,    setUserResults]    = useState<ChatUserOption[]>([])
  const [groupSelected,  setGroupSelected]  = useState<ChatUserOption[]>([])
  const [groupTitle,     setGroupTitle]     = useState('')
  const [groupError,     setGroupError]     = useState<string | null>(null)
  const [channelSlug,    setChannelSlug]    = useState('')
  const [uploading,      setUploading]      = useState(false)
  const [ctxMenu,        setCtxMenu]        = useState<CtxMenu | null>(null)
  const [msgCtxMenu,     setMsgCtxMenu]     = useState<MsgCtxMenu | null>(null)
  const [editingMsgId,   setEditingMsgId]   = useState<string | null>(null)
  const [editDraft,      setEditDraft]      = useState('')
  const [participants,   setParticipants]   = useState(false) // sheet aberto?
  const [activeSection,  setActiveSection]  = useState<'chats' | 'channels'>('chats')
  const [channels,       setChannels]       = useState<ChannelSummary[]>([])
  const [loadingChans,   setLoadingChans]   = useState(false)
  const [pending, startTransition]          = useTransition()
  const scrollRef   = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const ctxRef      = useRef<HTMLDivElement | null>(null)

  const activeChat = chats.find(c => c.id === activeId) ?? null
  const isOwner    = activeChat?.participants.find(p => p.user_id === userId)?.role === 'owner'
  const isAdmin    = userRole === 'admin' || userRole === 'director'

  // ── Carrega mensagens ao trocar de chat ──────────────────────────────────────
  const loadMessages = useCallback(async (chatId: string) => {
    setLoadingMsgs(true)
    const res = await listChatMessages(chatId)
    setLoadingMsgs(false)
    if (Array.isArray(res)) setMessages(res)
    else setMessages([])
    markChatRead(chatId)
    setChats(prev => prev.map(c =>
      c.id === chatId ? { ...c, unread_count: 0, force_unread: false } : c
    ))
  }, [])

  useEffect(() => {
    if (!activeId) { setMessages([]); return }
    loadMessages(activeId)
  }, [activeId, loadMessages])

  // ── Atualiza URL sem reload (deep-link) ──────────────────────────────────────
  useEffect(() => {
    if (!activeId) return
    const url = new URL(window.location.href)
    url.searchParams.set('chat', activeId)
    window.history.replaceState(null, '', url.toString())
  }, [activeId])

  // ── Refresh da lista ─────────────────────────────────────────────────────────
  const refreshChats = useCallback(async () => {
    const res = await listMyChats()
    if (Array.isArray(res)) setChats(res)
  }, [])

  // ── Realtime novas mensagens ─────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`ws:${clinicId}`)
      .on(
        // @ts-ignore
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `clinic_id=eq.${clinicId}` },
        async (payload: any) => {
          const row = payload.new as { id: string; chat_id: string; sent_by: string | null }
          if (row.chat_id === activeId) {
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

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  // ── Fechar context menus ao clicar fora ─────────────────────────────────────
  useEffect(() => {
    if (!ctxMenu && !msgCtxMenu) return
    const handler = () => { setCtxMenu(null); setMsgCtxMenu(null) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ctxMenu, msgCtxMenu])

  // ── Busca de usuários ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!newChatOpen || newChatMode === 'channel') return
    const t = setTimeout(async () => {
      const res = await searchUsersForChat(userSearch)
      if (Array.isArray(res)) setUserResults(res)
    }, 200)
    return () => clearTimeout(t)
  }, [userSearch, newChatOpen, newChatMode])

  // ── Carregar canais ao trocar para a seção ───────────────────────────────────
  useEffect(() => {
    if (activeSection !== 'channels') return
    setLoadingChans(true)
    listChannels().then(res => {
      if (Array.isArray(res)) setChannels(res)
      setLoadingChans(false)
    })
  }, [activeSection])

  // ── Envio ────────────────────────────────────────────────────────────────────
  function handleSend(e?: React.FormEvent) {
    e?.preventDefault()
    const body = draft.trim()
    if (!body || !activeId || pending) return
    setDraft('')
    startTransition(async () => {
      const res = await sendChatMessage({ chat_id: activeId, body })
      if ('error' in res) { setDraft(body); alert(res.error) }
      else await loadMessages(activeId)
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // ── Picker de usuário ────────────────────────────────────────────────────────
  async function handlePickUser(opt: ChatUserOption) {
    if (newChatMode === 'group') {
      setGroupSelected(prev =>
        prev.some(s => s.user_id === opt.user_id)
          ? prev.filter(s => s.user_id !== opt.user_id)
          : [...prev, opt]
      )
      return
    }
    setNewChatOpen(false)
    startTransition(async () => {
      const res = await openOrCreateDirectChat(opt.user_id)
      if ('error' in res) { alert(res.error); return }
      await refreshChats()
      setActiveId(res.chat_id)
      setActiveSection('chats')
    })
  }

  function closeNewChat() {
    setNewChatOpen(false)
    setNewChatMode('direct')
    setUserSearch('')
    setUserResults([])
    setGroupSelected([])
    setGroupTitle('')
    setGroupError(null)
    setChannelSlug('')
  }

  function handleCreateGroup() {
    setGroupError(null)
    if (!groupTitle.trim())         { setGroupError('Informe um título.'); return }
    if (groupSelected.length === 0) { setGroupError('Selecione ao menos um participante.'); return }
    startTransition(async () => {
      const res = await createGroupChat({ title: groupTitle.trim(), member_ids: groupSelected.map(g => g.user_id) })
      if ('error' in res) { setGroupError(res.error); return }
      closeNewChat()
      await refreshChats()
      setActiveId(res.chat_id)
    })
  }

  function handleCreateChannel() {
    setGroupError(null)
    if (!groupTitle.trim()) { setGroupError('Informe um título.'); return }
    startTransition(async () => {
      const res = await createChannelChat({
        title: groupTitle.trim(),
        slug:  channelSlug.trim() || null,
        is_public: true,
      })
      if ('error' in res) { setGroupError(res.error); return }
      closeNewChat()
      setActiveSection('channels')
      const cRes = await listChannels()
      if (Array.isArray(cRes)) setChannels(cRes)
      setActiveId(res.chat_id)
    })
  }

  // ── Upload de arquivo ────────────────────────────────────────────────────────
  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !activeId) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('chat_id', activeId)
      fd.append('file', file)
      const res = await uploadChatAttachment(fd)
      if ('error' in res) { alert(res.error); return }
      await loadMessages(activeId)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ── Context menu de conversa (clique direito na sidebar) ─────────────────────
  function handleChatRightClick(e: React.MouseEvent, chat: ChatSummary) {
    e.preventDefault()
    setCtxMenu({
      x: e.clientX, y: e.clientY,
      chatId: chat.id,
      isPinned: !!chat.pinned_at,
      isUnread: chat.force_unread || chat.unread_count > 0,
    })
  }

  async function handleCtxPin() {
    if (!ctxMenu) return
    const { chatId } = ctxMenu
    setCtxMenu(null)
    await toggleChatPin(chatId)
    refreshChats()
  }

  async function handleCtxMarkUnread() {
    if (!ctxMenu) return
    const { chatId, isUnread } = ctxMenu
    setCtxMenu(null)
    if (isUnread) {
      await markChatRead(chatId)
    } else {
      await markChatUnread(chatId)
    }
    refreshChats()
  }

  // ── Context menu de mensagem ─────────────────────────────────────────────────
  function handleMsgRightClick(e: React.MouseEvent, msg: ChatMessage) {
    e.preventDefault()
    setMsgCtxMenu({ x: e.clientX, y: e.clientY, msgId: msg.id, isMine: msg.sent_by === userId, body: msg.body })
  }

  async function handleMsgEdit() {
    if (!msgCtxMenu) return
    setEditingMsgId(msgCtxMenu.msgId)
    setEditDraft(msgCtxMenu.body ?? '')
    setMsgCtxMenu(null)
  }

  async function handleSaveEdit() {
    if (!editingMsgId || !editDraft.trim() || !activeId) return
    startTransition(async () => {
      const res = await editChatMessage(editingMsgId, editDraft)
      if ('error' in res) { alert(res.error); return }
      setEditingMsgId(null)
      setEditDraft('')
      await loadMessages(activeId)
    })
  }

  async function handleMsgDelete() {
    if (!msgCtxMenu) return
    const { msgId } = msgCtxMenu
    setMsgCtxMenu(null)
    if (!activeId) return
    startTransition(async () => {
      const res = await deleteChatMessage(msgId)
      if ('error' in res) { alert(res.error); return }
      await loadMessages(activeId)
    })
  }

  // ── Entrar em canal ──────────────────────────────────────────────────────────
  async function handleJoinChannel(chanId: string) {
    startTransition(async () => {
      const res = await joinChannel(chanId)
      if ('error' in res) { alert(res.error); return }
      const cRes = await listChannels()
      if (Array.isArray(cRes)) setChannels(cRes)
      await refreshChats()
      setActiveId(chanId)
      setActiveSection('chats')
    })
  }

  // ── Pinned chats ordenados ────────────────────────────────────────────────────
  const pinnedChats = chats
    .filter(c => c.pinned_at)
    .sort((a, b) => (a.pin_order ?? 99) - (b.pin_order ?? 99))
  const unpinnedChats = chats.filter(c => !c.pinned_at)

  const renderChatItem = (c: ChatSummary, isPinned = false) => {
    const isActive = c.id === activeId
    const title    = chatDisplayTitle(c, userId)
    const hasUnread = c.force_unread || c.unread_count > 0
    return (
      <button
        key={c.id}
        type="button"
        onClick={() => { setActiveId(c.id); setActiveSection('chats') }}
        onContextMenu={e => handleChatRightClick(e, c)}
        className={`w-full text-left px-3 py-2.5 transition-colors relative ${
          isActive ? 'bg-violet-50' : 'hover:bg-slate-50'
        }`}
      >
        {isPinned && (
          <Pin className="absolute top-2 right-2 h-2.5 w-2.5 text-violet-400 rotate-45" />
        )}
        <div className="flex items-start gap-2.5">
          <div className={`flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0 ${
            c.kind === 'direct'           ? 'bg-emerald-100 text-emerald-700'
            : c.kind === 'consultation'   ? 'bg-blue-100 text-blue-700'
            : c.kind === 'hospitalization'? 'bg-indigo-100 text-indigo-700'
            : c.kind === 'surgery'        ? 'bg-orange-100 text-orange-700'
            : c.kind === 'channel'        ? 'bg-teal-100 text-teal-700'
            : 'bg-slate-100 text-slate-600'
          }`}>
            {c.kind === 'direct'   ? <MessageSquare className="h-4 w-4" />
             : c.kind === 'channel' ? <Hash className="h-4 w-4" />
             : <Users className="h-4 w-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className={`text-sm truncate ${hasUnread ? 'font-bold text-slate-900' : 'font-semibold text-slate-900'}`}>
                {title}
              </p>
              <span className="text-[10px] text-slate-400 flex-shrink-0">
                {formatTimestamp(c.last_message_at)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <p className="text-xs text-slate-500 truncate">{c.last_preview ?? '—'}</p>
              {hasUnread && (
                <span className="flex-shrink-0 rounded-full bg-violet-600 text-white text-[10px] font-bold px-1.5 py-0.5 min-w-[18px] text-center">
                  {c.force_unread && c.unread_count === 0 ? '●' : c.unread_count}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-6 py-4 sm:py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold text-slate-900">Chat Interno</h1>
        <p className="mt-0.5 text-sm text-slate-500">Mensagens em tempo real entre a equipe</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-220px)] min-h-[480px]">
        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className="flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {/* Cabeçalho da sidebar com abas */}
          <div className="flex items-center border-b border-slate-100 px-3 py-2">
            <div className="flex flex-1 gap-0.5 rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveSection('chats')}
                className={`flex-1 rounded-md py-1 transition-colors ${
                  activeSection === 'chats' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Conversas
              </button>
              <button
                type="button"
                onClick={() => setActiveSection('channels')}
                className={`flex-1 rounded-md py-1 transition-colors ${
                  activeSection === 'channels' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Canais
              </button>
            </div>
            <button
              type="button"
              onClick={() => { setNewChatOpen(true); setUserSearch('') }}
              className="ml-2 flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo
            </button>
          </div>

          {/* Seção de Conversas */}
          {activeSection === 'chats' && (
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {chats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-3 text-center">
                  <MessageSquare className="h-8 w-8 text-slate-200 mb-2" />
                  <p className="text-xs text-slate-500">Nenhuma conversa ainda.</p>
                  <button type="button" onClick={() => setNewChatOpen(true)} className="mt-3 text-xs text-violet-700 font-semibold hover:underline">
                    Iniciar a primeira
                  </button>
                </div>
              ) : (
                <>
                  {pinnedChats.length > 0 && (
                    <div>
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-50">
                        Fixadas
                      </p>
                      {pinnedChats.map(c => renderChatItem(c, true))}
                    </div>
                  )}
                  {unpinnedChats.map(c => renderChatItem(c))}
                </>
              )}
            </div>
          )}

          {/* Seção de Canais */}
          {activeSection === 'channels' && (
            <div className="flex-1 overflow-y-auto">
              {loadingChans ? (
                <div className="flex items-center justify-center py-10 text-slate-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Carregando…
                </div>
              ) : channels.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-3 text-center">
                  <Hash className="h-8 w-8 text-slate-200 mb-2" />
                  <p className="text-xs text-slate-500">Nenhum canal criado.</p>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => { setNewChatOpen(true); setNewChatMode('channel') }}
                      className="mt-3 text-xs text-violet-700 font-semibold hover:underline"
                    >
                      Criar primeiro canal
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {channels.map(ch => (
                    <div
                      key={ch.id}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 text-teal-700 flex-shrink-0">
                        {ch.is_public ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{ch.title ?? '—'}</p>
                        {ch.slug && <p className="text-[11px] text-slate-400">#{ch.slug}</p>}
                      </div>
                      {ch.participant ? (
                        <button
                          type="button"
                          onClick={() => { setActiveId(ch.id); setActiveSection('chats') }}
                          className="text-[11px] font-semibold text-violet-700 hover:underline flex-shrink-0"
                        >
                          Abrir
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleJoinChannel(ch.id)}
                          className="text-[11px] font-semibold text-teal-700 hover:underline flex-shrink-0 disabled:opacity-50"
                        >
                          Entrar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* ── Painel de mensagens ───────────────────────────────────────────── */}
        <section className="flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden">
          {!activeChat ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center px-4">
              <MessageSquare className="h-10 w-10 text-slate-200 mb-3" />
              <p className="text-sm font-medium text-slate-500">Selecione uma conversa para começar</p>
            </div>
          ) : (
            <>
              {/* Header do chat */}
              <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{chatDisplayTitle(activeChat, userId)}</p>
                  <p className="text-xs text-slate-500">
                    {activeChat.participants.length} participante{activeChat.participants.length !== 1 ? 's' : ''}
                    {activeChat.kind !== 'direct' && ` · ${activeChat.kind}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {/* Gerenciar participantes (grupos/canais) */}
                  {activeChat.kind !== 'direct' && activeChat.kind !== 'consultation'
                   && activeChat.kind !== 'hospitalization' && activeChat.kind !== 'surgery' && (
                    <button
                      type="button"
                      title="Gerenciar participantes"
                      onClick={() => setParticipants(true)}
                      className="flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-violet-700 transition-colors"
                    >
                      <Users className="h-4 w-4" />
                    </button>
                  )}
                  {/* Pin / unpin */}
                  <button
                    type="button"
                    title={activeChat.pinned_at ? 'Desafixar conversa' : 'Fixar conversa'}
                    onClick={async () => { await toggleChatPin(activeId!); refreshChats() }}
                    className="flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-violet-700 transition-colors"
                  >
                    {activeChat.pinned_at ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                  </button>
                  {/* Marcar não-lida */}
                  <button
                    type="button"
                    title={activeChat.force_unread ? 'Remover marcação' : 'Marcar como não lida'}
                    onClick={async () => {
                      if (activeChat.force_unread) await markChatRead(activeId!)
                      else await markChatUnread(activeId!)
                      refreshChats()
                    }}
                    className="flex items-center justify-center h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-violet-700 transition-colors"
                  >
                    {activeChat.force_unread ? <Bell className="h-4 w-4 text-violet-600" /> : <BellOff className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Mensagens */}
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
                  const isEditing = editingMsgId === m.id
                  return (
                    <div
                      key={m.id}
                      className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                      onContextMenu={e => handleMsgRightClick(e, m)}
                    >
                      <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 shadow-sm ${
                        mine ? 'bg-violet-600 text-white' : 'bg-white border border-slate-200 text-slate-800'
                      }`}>
                        {!mine && (
                          <p className="text-[10px] font-semibold text-slate-500 mb-0.5">
                            {m.sender_name ?? 'Usuário'}
                          </p>
                        )}
                        {isEditing ? (
                          <div className="space-y-1.5">
                            <textarea
                              value={editDraft}
                              onChange={e => setEditDraft(e.target.value)}
                              rows={2}
                              autoFocus
                              className="w-full rounded-lg border border-violet-300 bg-white text-slate-900 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
                            />
                            <div className="flex gap-1.5 justify-end">
                              <button
                                type="button"
                                onClick={() => setEditingMsgId(null)}
                                className="rounded px-2 py-0.5 text-[11px] font-semibold text-violet-200 hover:text-white"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={handleSaveEdit}
                                className="rounded bg-white px-2 py-0.5 text-[11px] font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                              >
                                Salvar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
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
                            <div className="flex items-center justify-end gap-1.5 mt-1">
                              {m.edited_at && (
                                <span className={`text-[9px] ${mine ? 'text-violet-200' : 'text-slate-400'}`}>
                                  editado
                                </span>
                              )}
                              <p className={`text-[10px] ${mine ? 'text-violet-100' : 'text-slate-400'}`}>
                                {formatTimestamp(m.created_at)}
                              </p>
                              {/* Botão de menu por hover */}
                              <button
                                type="button"
                                onClick={e => handleMsgRightClick(e, m)}
                                className={`opacity-0 group-hover:opacity-100 rounded-full p-0.5 transition-opacity ${
                                  mine ? 'hover:bg-violet-700' : 'hover:bg-slate-100'
                                }`}
                              >
                                <MoreVertical className="h-3 w-3" />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Input de mensagem */}
              <form onSubmit={handleSend} className="border-t border-slate-100 p-3 flex items-end gap-2">
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePicked} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || pending}
                  title="Anexar arquivo (até 25MB)"
                  aria-label="Anexar arquivo"
                  className="flex items-center justify-center h-10 w-10 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-violet-700 disabled:opacity-50 transition-colors"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </button>
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

      {/* ── Modal: novo chat / grupo / canal ─────────────────────────────── */}
      {newChatOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[10010] flex items-start justify-center bg-slate-900/60 backdrop-blur-sm p-4 pt-[10vh]"
          onClick={closeNewChat}
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Tabs */}
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 bg-slate-50">
              <div className="flex gap-1 rounded-lg bg-white border border-slate-200 p-0.5">
                {(['direct', 'group', ...(isAdmin ? ['channel'] : [])] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setNewChatMode(mode as any)}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                      newChatMode === mode ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {mode === 'direct' && <><MessageSquare className="h-3.5 w-3.5" />Direta</>}
                    {mode === 'group'  && <><Users className="h-3.5 w-3.5" />Grupo</>}
                    {mode === 'channel' && <><Hash className="h-3.5 w-3.5" />Canal</>}
                  </button>
                ))}
              </div>
              <button type="button" aria-label="Fechar" onClick={closeNewChat} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Formulário de grupo / canal */}
            {(newChatMode === 'group' || newChatMode === 'channel') && (
              <div className="border-b border-slate-100 px-4 py-3 space-y-2 bg-violet-50/40">
                <input
                  value={groupTitle}
                  onChange={e => setGroupTitle(e.target.value)}
                  placeholder={newChatMode === 'channel' ? 'Nome do canal' : 'Nome do grupo'}
                  maxLength={80}
                  className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                {newChatMode === 'channel' && (
                  <input
                    value={channelSlug}
                    onChange={e => setChannelSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    placeholder="slug (opcional, ex: recepcao)"
                    maxLength={40}
                    className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                )}
                {newChatMode === 'group' && groupSelected.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {groupSelected.map(s => (
                      <span key={s.user_id} className="inline-flex items-center gap-1 rounded-full bg-violet-100 text-violet-700 text-xs font-medium px-2 py-0.5">
                        {s.full_name ?? 'Sem nome'}
                        <button type="button" onClick={() => setGroupSelected(prev => prev.filter(x => x.user_id !== s.user_id))} className="text-violet-500 hover:text-violet-900">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {groupError && <p className="text-xs text-red-600">{groupError}</p>}
              </div>
            )}

            {/* Busca de usuários (direto/grupo) */}
            {newChatMode !== 'channel' && (
              <>
                <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    autoFocus
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    placeholder={newChatMode === 'group' ? 'Adicionar colega…' : 'Buscar colega…'}
                    className="bg-transparent text-sm focus:outline-none w-full"
                  />
                </div>
                <ul className="max-h-[40vh] overflow-y-auto">
                  {userResults.length === 0 ? (
                    <li className="px-4 py-8 text-center text-xs text-slate-400">Nenhum usuário encontrado</li>
                  ) : userResults.map(u => {
                    const picked = newChatMode === 'group' && groupSelected.some(s => s.user_id === u.user_id)
                    return (
                      <li key={u.user_id}>
                        <button
                          type="button"
                          onClick={() => handlePickUser(u)}
                          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${picked ? 'bg-violet-50' : 'hover:bg-slate-50'}`}
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs">
                            {(u.full_name ?? '?').slice(0, 1).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{u.full_name ?? 'Sem nome'}</p>
                            <p className="text-[11px] text-slate-500 capitalize">{u.role}</p>
                          </div>
                          {newChatMode === 'group' && (picked ? <Check className="h-4 w-4 text-violet-600" /> : <UserPlus className="h-4 w-4 text-slate-300" />)}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}

            {/* Botões de ação */}
            {(newChatMode === 'group' || newChatMode === 'channel') && (
              <div className="border-t border-slate-100 px-4 py-3 flex gap-2">
                <button type="button" onClick={closeNewChat} disabled={pending} className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={newChatMode === 'channel' ? handleCreateChannel : handleCreateGroup}
                  disabled={pending || !groupTitle.trim() || (newChatMode === 'group' && groupSelected.length === 0)}
                  className="flex-[1.4] rounded-lg bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 transition-colors"
                >
                  {pending ? 'Criando…'
                    : newChatMode === 'channel' ? 'Criar canal'
                    : `Criar grupo (${groupSelected.length})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Context menu de conversa (clique direito) ─────────────────────── */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          style={{ position: 'fixed', top: ctxMenu.y, left: ctxMenu.x, zIndex: 10060 }}
          className="min-w-[170px] rounded-xl border border-slate-200 bg-white shadow-xl py-1 text-sm"
          onClick={e => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={handleCtxPin}
            className="flex w-full items-center gap-2.5 px-4 py-2 hover:bg-slate-50 transition-colors"
          >
            {ctxMenu.isPinned ? <><PinOff className="h-4 w-4 text-slate-500" />Desafixar</> : <><Pin className="h-4 w-4 text-slate-500" />Fixar conversa</>}
          </button>
          <button
            type="button"
            onClick={handleCtxMarkUnread}
            className="flex w-full items-center gap-2.5 px-4 py-2 hover:bg-slate-50 transition-colors"
          >
            {ctxMenu.isUnread
              ? <><Bell className="h-4 w-4 text-violet-600" />Marcar como lida</>
              : <><BellOff className="h-4 w-4 text-slate-500" />Marcar como não lida</>}
          </button>
        </div>
      )}

      {/* ── Context menu de mensagem (clique direito) ─────────────────────── */}
      {msgCtxMenu && (
        <div
          style={{ position: 'fixed', top: msgCtxMenu.y, left: msgCtxMenu.x, zIndex: 10060 }}
          className="min-w-[150px] rounded-xl border border-slate-200 bg-white shadow-xl py-1 text-sm"
          onClick={e => e.stopPropagation()}
        >
          {msgCtxMenu.isMine && (
            <button
              type="button"
              onClick={handleMsgEdit}
              className="flex w-full items-center gap-2.5 px-4 py-2 hover:bg-slate-50 transition-colors"
            >
              <Pencil className="h-4 w-4 text-slate-500" />
              Editar
            </button>
          )}
          {(msgCtxMenu.isMine || isOwner) && (
            <button
              type="button"
              onClick={handleMsgDelete}
              className="flex w-full items-center gap-2.5 px-4 py-2 hover:bg-red-50 text-red-600 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Deletar
            </button>
          )}
        </div>
      )}

      {/* ── Sheet de participantes ────────────────────────────────────────── */}
      {activeChat && (
        <ChatParticipantsSheet
          open={participants}
          onClose={() => setParticipants(false)}
          chatId={activeChat.id}
          chatTitle={chatDisplayTitle(activeChat, userId)}
          participants={activeChat.participants}
          currentUserId={userId}
          isOwner={isOwner}
          onRefresh={async () => { await refreshChats() }}
        />
      )}
    </div>
  )
}
