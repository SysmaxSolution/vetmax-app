'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ChatEntityType } from '@/lib/actions/internal-chat'
import { getEntityChat, getOrCreateChannelChat, markChatRead } from '@/lib/actions/internal-chat'

// ─── Tipos de contexto ────────────────────────────────────────────────────────

export interface ProcedureContext {
  type:        'procedure'
  entityType:  ChatEntityType
  entityId:    string
  patientName: string
}

export interface ChannelContext {
  type:           'channel'
  moduloContexto: string
  label:          string   // ex: '#caixa'
}

export type ActiveChatContext = ProcedureContext | ChannelContext

// ─── Valor do Context ─────────────────────────────────────────────────────────

interface ChatContextValue {
  /** Contexto atualmente configurado (null = nenhum) */
  chatCtx:    ActiveChatContext | null
  /** Setter chamado pelas telas de procedimento no mount/unmount */
  setChatCtx: (ctx: ActiveChatContext | null) => void

  /** Estado do painel flutuante */
  isOpen:    boolean
  openChat:  () => void
  closeChat: () => void
  toggleChat: () => void

  /** Dados do chat carregado para o contexto atual */
  chatId:      string | null
  unreadCount: number
  clearUnread: () => void

  /** Dados do usuário (injetados pelo layout server) */
  clinicId: string
  userId:   string
  userName: string
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ChatCtx = createContext<ChatContextValue | null>(null)

export function useChatContext(): ChatContextValue {
  const v = useContext(ChatCtx)
  if (!v) throw new Error('useChatContext must be used inside ChatContextProvider')
  return v
}

/**
 * Hook para telas de procedimento (ConsultationDetail, TriageForm, ExamDetail).
 * Registra o contexto ao montar e limpa ao desmontar.
 */
export function useSetChatContext(ctx: ActiveChatContext | null) {
  const { setChatCtx } = useChatContext()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const key = ctx?.type === 'procedure' ? ctx.entityId : ctx?.moduloContexto
  useEffect(() => {
    if (ctx) setChatCtx(ctx)
    return () => setChatCtx(null)
  // key muda apenas quando a entidade muda (não re-registrar por referência do objeto)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

// ─── Provider ─────────────────────────────────────────────────────────────────

interface ProviderProps {
  clinicId: string
  userId:   string
  userName: string
  children: React.ReactNode
}

export function ChatContextProvider({ clinicId, userId, userName, children }: ProviderProps) {
  const [chatCtx,    setChatCtx]    = useState<ActiveChatContext | null>(null)
  const [isOpen,     setIsOpen]     = useState(false)
  const [chatId,     setChatId]     = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const loadingRef = useRef(false)

  // Carrega/cria a sala quando o contexto muda
  useEffect(() => {
    if (!chatCtx) {
      setChatId(null)
      setUnreadCount(0)
      setIsOpen(false)
      return
    }

    let cancelled = false
    const ctx = chatCtx // captura antes do async para manter narrowing

    async function load() {
      if (loadingRef.current) return
      loadingRef.current = true
      try {
        const res = ctx.type === 'procedure'
          ? await getEntityChat(ctx.entityType, ctx.entityId)
          : await getOrCreateChannelChat(ctx.moduloContexto)

        if (cancelled) return
        if ('error' in res) return

        setChatId(res.chat_id)
        setUnreadCount(res.unread_count)
      } finally {
        loadingRef.current = false
      }
    }

    load()
    return () => { cancelled = true }
  }, [
    chatCtx?.type,
    chatCtx?.type === 'procedure' ? chatCtx.entityId : chatCtx?.moduloContexto,
  ])

  const openChat = useCallback(async () => {
    setIsOpen(true)
    if (chatId) {
      await markChatRead(chatId)
      setUnreadCount(0)
    }
  }, [chatId])

  const closeChat  = useCallback(() => setIsOpen(false), [])
  const toggleChat = useCallback(() => {
    if (isOpen) closeChat()
    else openChat()
  }, [isOpen, openChat, closeChat])

  const clearUnread = useCallback(() => setUnreadCount(0), [])

  return (
    <ChatCtx.Provider value={{
      chatCtx, setChatCtx,
      isOpen, openChat, closeChat, toggleChat,
      chatId, unreadCount, clearUnread,
      clinicId, userId, userName,
    }}>
      {children}
    </ChatCtx.Provider>
  )
}
