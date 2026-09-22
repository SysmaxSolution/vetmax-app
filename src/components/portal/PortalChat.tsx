'use client'

import { useState, useEffect, useRef } from 'react'
import { MessageCircle, Send, Loader2 } from 'lucide-react'
import { getPortalMessages, sendPortalMessage, type PortalMessage } from '@/lib/actions/portal-chat'

export default function PortalChat({ petId }: { petId: string }) {
  const [msgs, setMsgs] = useState<PortalMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  async function load() {
    const r = await getPortalMessages(petId)
    if (!('error' in r)) setMsgs(r)
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [petId])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length])

  async function send() {
    const body = text.trim()
    if (!body) return
    setBusy(true); setError(null)
    const r = await sendPortalMessage(petId, body)
    setBusy(false)
    if ('error' in r) { setError(r.error); return }
    setText(''); load()
  }

  const fmt = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="rounded-2xl bg-white ring-1 ring-[#EDE9E0] overflow-hidden">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b border-[#F0ECE3]">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#17624A]/10"><MessageCircle className="h-4 w-4 text-[#17624A]" /></span>
        <h2 className="text-[15px] text-[#16221C]" style={{ fontFamily: 'var(--font-fraunces), serif' }}>Fale com a clínica</h2>
      </div>

      <div className="max-h-72 overflow-y-auto px-5 py-4 space-y-2.5 bg-[#FBFAF7]">
        {loading ? (
          <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-[#D8D2C4]" /></div>
        ) : msgs.length === 0 ? (
          <p className="text-center text-sm text-[#9AA69F] py-6">Envie uma mensagem — a recepção responde por aqui.</p>
        ) : msgs.map(m => (
          <div key={m.id} className={`flex ${m.sender === 'tutor' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[78%] rounded-2xl px-3.5 py-2 ${m.sender === 'tutor' ? 'bg-[#17624A] text-white rounded-br-sm' : 'bg-white ring-1 ring-[#EDE9E0] text-[#16221C] rounded-bl-sm'}`}>
              {m.sender === 'clinic' && m.senderName && <p className="text-[10px] font-semibold text-[#17624A] mb-0.5">{m.senderName}</p>}
              <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
              <p className={`text-[10px] mt-0.5 ${m.sender === 'tutor' ? 'text-white/60' : 'text-[#B3BDB6]'}`}>{fmt(m.createdAt)}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error && <p className="px-5 py-1 text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-[#F0ECE3]">
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Escreva sua mensagem…" className="flex-1 rounded-full border border-[#E5E0D5] px-4 py-2 text-sm focus:border-[#17624A] focus:outline-none" />
        <button onClick={send} disabled={busy || !text.trim()} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0E3B2E] text-white hover:bg-[#134A38] disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
