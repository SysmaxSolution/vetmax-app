'use client'

import { useState, useEffect } from 'react'
import { KeyRound, Copy, RefreshCcw, Loader2, Check } from 'lucide-react'
import { getClinicJoinCode, regenerateClinicJoinCode } from '@/lib/actions/auth'

export default function ClinicJoinCodeCard() {
  const [code, setCode]   = useState<string | null>(null)
  const [busy, setBusy]   = useState(false)
  const [copied, setCopied] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)

  useEffect(() => { getClinicJoinCode().then(r => { if ('code' in r) setCode(r.code) }) }, [])

  async function regen() {
    setBusy(true)
    const r = await regenerateClinicJoinCode()
    setBusy(false); setConfirmRegen(false)
    if ('code' in r) setCode(r.code)
  }
  async function copy() {
    if (!code) return
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* noop */ }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-6 py-4">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-semibold text-slate-700">Código de acesso da clínica</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Passe este código a quem for criar conta na sua clínica (em <strong>Criar conta &gt; Já cadastrada</strong>).
        Só quem tem o código entra no seu sistema. Prefira o <strong>convite por e-mail</strong> abaixo quando quiser controlar por pessoa.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="font-mono text-lg font-bold tracking-widest text-slate-900 bg-slate-100 rounded-lg px-4 py-2">
          {code ?? '········'}
        </div>
        <button onClick={copy} disabled={!code} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copiado' : 'Copiar'}
        </button>
        {confirmRegen ? (
          <>
            <span className="text-xs text-amber-600">Gerar novo? O código atual deixa de valer.</span>
            <button onClick={regen} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Confirmar
            </button>
            <button onClick={() => setConfirmRegen(false)} className="text-xs text-slate-500 hover:underline">Cancelar</button>
          </>
        ) : (
          <button onClick={() => setConfirmRegen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <RefreshCcw className="h-3.5 w-3.5" /> Gerar novo
          </button>
        )}
      </div>
    </div>
  )
}
