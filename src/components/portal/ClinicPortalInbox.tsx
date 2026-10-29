'use client'

import { useState, useEffect } from 'react'
import { MessageCircle, Send, Loader2, Inbox } from 'lucide-react'
import { listPortalThreads, getThreadMessages, sendClinicMessage, type PortalThread, type PortalMessage } from '@/lib/actions/portal-chat'

export default function ClinicPortalInbox() {
  const [threads, setThreads] = useState<PortalThread[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<PortalMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function reloadThreads() { setThreads(await listPortalThreads()); setLoading(false) }
  useEffect(() => { reloadThreads() }, [])

  async function open(id: string) { setActive(id); setMsgs(await getThreadMessages(id)); reloadThreads() }
  async function send() {
    const body = text.trim(); if (!body || !active) return
    setBusy(true)
    await sendClinicMessage(active, body); setText('')
    setMsgs(await getThreadMessages(active)); setBusy(false)
  }
  const fmt = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-0 rounded-xl border border-slate-200 overflow-hidden bg-white min-h-[28rem]">
      {/* Lista de conversas */}
      <div className="border-r border-slate-100 md:col-span-1">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 text-slate-700"><Inbox className="h-4 w-4" /><span className="text-sm font-semibold">Conversas</span></div>
        {loading ? <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
          : threads.length === 0 ? <p className="p-6 text-center text-sm text-slate-400">Nenhuma mensagem de tutores.</p>
          : (
            <ul className="divide-y divide-slate-50 max-h-[26rem] overflow-y-auto">
              {threads.map(t => (
                <li key={t.tutorUserId}>
                  <button onClick={() => open(t.tutorUserId)} className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${active === t.tutorUserId ? 'bg-slate-50' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800 truncate">{t.tutorName ?? 'Tutor'}</span>
                      {t.unread > 0 && <span className="flex-none rounded-full bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5">{t.unread}</span>}
                    </div>
                    <p className="text-xs text-slate-400 truncate">{t.lastBody}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>

      {/* Thread */}
      <div className="md:col-span-2 flex flex-col">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm gap-2"><MessageCircle className="h-5 w-5" />Selecione uma conversa</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 bg-slate-50/50 max-h-[24rem]">
              {msgs.map(m => (
                <div key={m.id} className={`flex ${m.sender === 'clinic' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 ${m.sender === 'clinic' ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-white ring-1 ring-slate-200 text-slate-800 rounded-bl-sm'}`}>
                    <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`text-[10px] mt-0.5 ${m.sender === 'clinic' ? 'text-white/60' : 'text-slate-400'}`}>{m.senderName ? `${m.senderName} · ` : ''}{fmt(m.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 p-3 border-t border-slate-100">
              <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Responder ao tutor…" className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
              <button onClick={send} disabled={busy || !text.trim()} className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
