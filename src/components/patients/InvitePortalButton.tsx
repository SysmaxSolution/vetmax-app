'use client'

import { useState } from 'react'
import { Loader2, Send, Copy, Check, Smartphone, KeyRound, RefreshCw } from 'lucide-react'
import { inviteTutorToPortal, regenerateTutorAccessCode } from '@/lib/actions/tutor-portal'

/** "Convidar para a Área do Tutor" — envia link (WhatsApp) e mostra o código de acesso permanente (CPF + código). */
export default function InvitePortalButton({ tutorId }: { tutorId: string }) {
  const [busy, setBusy] = useState(false)
  const [regen, setRegen] = useState(false)
  const [result, setResult] = useState<{ link: string; sent: boolean; phone: string | null; code: string | null; codeAlreadySet: boolean } | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleInvite() {
    setBusy(true); setError(null)
    const res = await inviteTutorToPortal(tutorId)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    setResult({ link: res.link, sent: res.sent, phone: res.phone, code: res.code, codeAlreadySet: res.codeAlreadySet })
    setCode(res.code)
  }

  async function handleRegen() {
    setRegen(true); setError(null)
    const res = await regenerateTutorAccessCode(tutorId)
    setRegen(false)
    if ('error' in res) { setError(res.error); return }
    setCode(res.code)
  }

  function copy() {
    if (!result) return
    navigator.clipboard?.writeText(result.link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {})
  }

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-teal-600" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Área do Tutor</p>
            <p className="text-[11px] text-slate-500">Acesso permanente do tutor: CPF + código, e link no WhatsApp.</p>
          </div>
        </div>
        <button type="button" onClick={handleInvite} disabled={busy}
                className="text-xs font-semibold text-white bg-teal-600 rounded-lg px-3 py-2 flex items-center gap-1.5 hover:bg-teal-700 disabled:opacity-50 whitespace-nowrap">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Convidar
        </button>
      </div>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {result && (
        <div className="mt-3 space-y-3">
          {/* Código de acesso permanente */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-amber-800 flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" />Código de acesso (com o CPF)</p>
              <button type="button" onClick={handleRegen} disabled={regen}
                      className="text-[11px] text-amber-700 flex items-center gap-1 hover:underline disabled:opacity-50">
                {regen ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}{code || result.codeAlreadySet ? 'Gerar novo' : 'Gerar'}
              </button>
            </div>
            {code ? (
              <p className="mt-1 text-lg font-bold tracking-[0.25em] text-slate-800 font-mono">{code}</p>
            ) : (
              <p className="mt-1 text-xs text-amber-700">{result.codeAlreadySet ? 'O tutor já tem um código. Se ele esqueceu, clique em "Gerar novo".' : 'Tutor sem CPF — o código exige CPF. Cadastre o CPF para habilitar.'}</p>
            )}
            <p className="text-[10px] text-amber-600 mt-1">Anote e entregue ao tutor. Ele entra sempre que quiser em <strong>Área do Tutor</strong> com CPF + este código.</p>
          </div>

          {/* Link mágico */}
          <p className="text-xs text-teal-800">
            {result.sent
              ? `✅ Link (+ código) enviado por WhatsApp${result.phone ? ' para ' + result.phone : ''}.`
              : '⚠ WhatsApp não enviado (sem número/config). Copie o link e envie manualmente:'}
          </p>
          <div className="flex items-center gap-2">
            <input readOnly value={result.link}
                   className="flex-1 text-[11px] bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600" />
            <button type="button" onClick={copy}
                    className="text-xs font-medium text-teal-700 border border-teal-200 rounded-lg px-2 py-1.5 flex items-center gap-1 hover:bg-teal-100">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-[10px] text-slate-400">O link expira em 30 minutos (1º acesso/reset). O código não expira.</p>
        </div>
      )}
    </div>
  )
}
