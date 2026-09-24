'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Copy, Check, KeyRound, RefreshCw, Eye, EyeOff, Trash2, Send, Smartphone } from 'lucide-react'
import {
  inviteTutorToPortal, regenerateTutorAccessCode, getTutorAccessCode, clearTutorAccess,
  getHousehold, addHouseholdMember, removeHouseholdMember, type HouseholdMember,
} from '@/lib/actions/tutor-portal'
import { Users, UserPlus } from 'lucide-react'

interface Props { tutorId: string; tutorName: string | null; onClose: () => void }

export default function TutorPortalAccessModal({ tutorId, tutorName, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [hasCode, setHasCode] = useState(false)
  const [masked, setMasked] = useState<string | null>(null)
  const [full, setFull] = useState<string | null>(null)   // revelado
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [link, setLink] = useState<{ url: string; sent: boolean; phone: string | null } | null>(null)
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [memberCpf, setMemberCpf] = useState('')

  async function loadMembers() { setMembers(await getHousehold(tutorId)) }
  async function addMember() {
    setBusy('member'); setError(null)
    const r = await addHouseholdMember(tutorId, memberCpf)
    setBusy(null)
    if ('error' in r) { setError(r.error); return }
    setMemberCpf(''); loadMembers()
  }
  async function removeMember(id: string) {
    setBusy('rm:' + id)
    await removeHouseholdMember(tutorId, id)
    setBusy(null); loadMembers()
  }

  async function load() {
    const r = await getTutorAccessCode(tutorId)
    if (!('error' in r)) { setHasCode(r.hasCode); setMasked(r.code); setFull(null) }
    else setError(r.error)
  }
  useEffect(() => { (async () => { await load(); await loadMembers(); setLoading(false) })() /* eslint-disable-next-line */ }, [tutorId])

  async function reveal() {
    if (full) { setFull(null); return }               // ocultar
    setBusy('reveal')
    const r = await getTutorAccessCode(tutorId, true)
    setBusy(null)
    if (!('error' in r)) setFull(r.code)
  }
  async function genNew() {
    setBusy('gen'); setError(null)
    const r = await regenerateTutorAccessCode(tutorId)
    setBusy(null)
    if ('error' in r) { setError(r.error); return }
    setHasCode(true); setFull(r.code); setMasked(null)
  }
  async function clearAccess() {
    if (!confirm('Excluir o acesso do tutor? O código atual deixa de funcionar e a sessão é encerrada.')) return
    setBusy('clear')
    const r = await clearTutorAccess(tutorId)
    setBusy(null)
    if ('error' in r) { setError(r.error); return }
    setHasCode(false); setMasked(null); setFull(null)
  }
  async function sendLink() {
    setBusy('link'); setError(null)
    const r = await inviteTutorToPortal(tutorId)
    setBusy(null)
    if ('error' in r) { setError(r.error); return }
    setLink({ url: r.link, sent: r.sent, phone: r.phone })
    if (r.code) { setHasCode(true); setFull(r.code); setMasked(null) } // 1º código criado
    else load()
  }
  function copy(text: string, which: string) {
    navigator.clipboard?.writeText(text).then(() => { setCopied(which); setTimeout(() => setCopied(null), 2000) }).catch(() => {})
  }

  if (typeof document === 'undefined') return null
  const shown = full ?? masked

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-teal-600" /><h2 className="text-base font-semibold text-slate-900">Acesso ao Portal do Tutor</h2></div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-500">{tutorName ? <>Acesso de <strong className="text-slate-700">{tutorName}</strong></> : 'Acesso do tutor'} — login com <strong>CPF + código</strong>.</p>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" />Código de acesso</p>
                <div className="flex items-center gap-3">
                  {hasCode && <button onClick={genNew} disabled={!!busy} className="text-[11px] text-amber-700 flex items-center gap-1 hover:underline disabled:opacity-50">{busy === 'gen' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}Gerar novo</button>}
                  {hasCode && <button onClick={clearAccess} disabled={!!busy} className="text-[11px] text-rose-600 flex items-center gap-1 hover:underline disabled:opacity-50">{busy === 'clear' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}Excluir</button>}
                </div>
              </div>
              {hasCode ? (
                <div className="mt-1.5 flex items-center gap-2">
                  <p className="text-2xl font-bold tracking-[0.22em] text-slate-800 font-mono">{shown}</p>
                  <button onClick={reveal} disabled={busy === 'reveal'} title={full ? 'Ocultar' : 'Visualizar'} className="text-amber-700 border border-amber-300 rounded-lg p-1.5 hover:bg-amber-100">
                    {busy === 'reveal' ? <Loader2 className="h-4 w-4 animate-spin" /> : full ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                  {full && <button onClick={() => copy(full, 'code')} className="text-amber-700 border border-amber-300 rounded-lg p-1.5 hover:bg-amber-100">{copied === 'code' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button>}
                </div>
              ) : (
                <div className="mt-1.5">
                  <button onClick={genNew} disabled={!!busy} className="text-sm font-semibold text-white bg-amber-600 rounded-lg px-3 py-1.5 hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1.5">
                    {busy === 'gen' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}Gerar código
                  </button>
                  <p className="text-[10px] text-amber-600 mt-1">Requer CPF cadastrado no tutor.</p>
                </div>
              )}
              <p className="text-[10px] text-amber-600 mt-1.5">O tutor entra em <strong>Área do Tutor</strong> com o CPF + este código, sempre que quiser.</p>
            </div>
          )}

          {/* Link de 1º acesso (WhatsApp) */}
          <div className="border-t border-slate-100 pt-4">
            {!link ? (
              <button onClick={sendLink} disabled={!!busy} className="text-xs font-semibold text-teal-700 border border-teal-200 rounded-lg px-3 py-2 hover:bg-teal-50 disabled:opacity-50 flex items-center gap-1.5">
                {busy === 'link' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Enviar link de 1º acesso (WhatsApp)
              </button>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-teal-800">{link.sent ? `✅ Link enviado por WhatsApp${link.phone ? ' para ' + link.phone : ''}.` : '⚠ WhatsApp não enviado. Copie e envie manualmente:'}</p>
                <div className="flex items-center gap-2">
                  <input readOnly value={link.url} className="flex-1 text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600" />
                  <button onClick={() => copy(link.url, 'link')} className="text-xs text-teal-700 border border-teal-200 rounded-lg px-2 py-1.5 flex items-center gap-1 hover:bg-teal-50">{copied === 'link' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</button>
                </div>
                <p className="text-[10px] text-slate-400">O link expira em 30 min. O código não expira.</p>
              </div>
            )}
          </div>

          {/* Família — outros tutores/pets sob o mesmo login */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-1"><Users className="h-3.5 w-3.5 text-slate-400" />Família (mesmo login)</p>
            <p className="text-[11px] text-slate-400 mb-2">Vincule outro tutor por CPF para que os pets dele apareçam nesta mesma conta.</p>
            {members.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {members.map(m => (
                  <div key={m.tutorId} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                    <span className="text-slate-700 truncate">{m.name ?? 'Tutor'}<span className="text-slate-400 text-xs"> · {m.pets} pet(s)</span></span>
                    <button onClick={() => removeMember(m.tutorId)} disabled={busy === 'rm:' + m.tutorId} className="text-slate-300 hover:text-rose-500">{busy === 'rm:' + m.tutorId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input value={memberCpf} onChange={e => setMemberCpf(e.target.value)} placeholder="CPF do familiar" className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
              <button onClick={addMember} disabled={busy === 'member' || !memberCpf.trim()} className="inline-flex items-center gap-1 rounded-lg bg-slate-800 text-white px-3 py-1.5 text-sm hover:bg-slate-700 disabled:opacity-50">
                {busy === 'member' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}Vincular
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
