'use client'

import { useState, useEffect, useTransition } from 'react'
import { X, UserPlus, LogOut, Search, Trash2, Loader2 } from 'lucide-react'
import {
  addParticipantToChat, removeParticipantFromChat,
  searchUsersForChat, type ChatUserOption,
} from '@/lib/actions/internal-chat'

interface Participant {
  user_id:   string
  full_name: string | null
  role:      string
}

interface Props {
  open:          boolean
  onClose:       () => void
  chatId:        string
  chatTitle:     string
  participants:  Participant[]
  currentUserId: string
  isOwner:       boolean
  onRefresh:     () => void
}

/**
 * Painel lateral (sheet) para gerenciar participantes de grupos e canais.
 * Exibe lista atual com opção de remover (owner) ou sair (qualquer membro).
 * Busca + adiciona novos participantes (owner apenas).
 */
export default function ChatParticipantsSheet({
  open, onClose, chatId, chatTitle, participants, currentUserId, isOwner, onRefresh,
}: Props) {
  const [query,       setQuery]       = useState('')
  const [results,     setResults]     = useState<ChatUserOption[]>([])
  const [error,       setError]       = useState<string | null>(null)
  const [pending, startTransition]    = useTransition()

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); setError(null) }
  }, [open])

  useEffect(() => {
    if (!open || !isOwner) return
    const t = setTimeout(async () => {
      const res = await searchUsersForChat(query)
      if (Array.isArray(res)) {
        const existingIds = new Set(participants.map(p => p.user_id))
        setResults(res.filter(u => !existingIds.has(u.user_id)))
      }
    }, 200)
    return () => clearTimeout(t)
  }, [query, open, isOwner, participants])

  function handleAdd(userId: string) {
    setError(null)
    startTransition(async () => {
      const res = await addParticipantToChat(chatId, userId)
      if ('error' in res) { setError(res.error); return }
      onRefresh()
    })
  }

  function handleRemove(userId: string, isSelf: boolean) {
    setError(null)
    startTransition(async () => {
      const res = await removeParticipantFromChat(chatId, userId)
      if ('error' in res) { setError(res.error); return }
      onRefresh()
      if (isSelf) onClose()
    })
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[10020] flex items-stretch justify-end"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white shadow-2xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50">
          <div>
            <p className="text-sm font-semibold text-slate-900">Participantes</p>
            <p className="text-[11px] text-slate-500 truncate max-w-[200px]">{chatTitle}</p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <p className="mx-4 mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        {/* Lista de participantes */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {participants.map(p => {
            const isSelf  = p.user_id === currentUserId
            const canKick = isOwner && !isSelf
            return (
              <div key={p.user_id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex-shrink-0">
                  {(p.full_name ?? '?').slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {p.full_name ?? 'Sem nome'}
                    {isSelf && <span className="ml-1 text-[10px] text-slate-400">(você)</span>}
                  </p>
                  <p className="text-[11px] text-slate-500 capitalize">{p.role}</p>
                </div>
                {isSelf && (
                  <button
                    type="button"
                    title="Sair do grupo"
                    onClick={() => handleRemove(p.user_id, true)}
                    disabled={pending}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                )}
                {canKick && (
                  <button
                    type="button"
                    title="Remover participante"
                    onClick={() => handleRemove(p.user_id, false)}
                    disabled={pending}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Adicionar participante (owner) */}
        {isOwner && (
          <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 space-y-2">
            <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1">
              <UserPlus className="h-3.5 w-3.5" />
              Adicionar
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
              <Search className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar colega…"
                className="flex-1 bg-transparent text-sm focus:outline-none"
              />
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            </div>
            {results.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-50">
                {results.map(u => (
                  <li key={u.user_id}>
                    <button
                      type="button"
                      onClick={() => handleAdd(u.user_id)}
                      disabled={pending}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-violet-50 disabled:opacity-50 transition-colors"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex-shrink-0">
                        {(u.full_name ?? '?').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{u.full_name ?? 'Sem nome'}</p>
                        <p className="text-[11px] text-slate-500 capitalize">{u.role}</p>
                      </div>
                      <UserPlus className="h-3.5 w-3.5 text-violet-500" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
