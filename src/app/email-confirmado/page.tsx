'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Mail, RefreshCw, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getClientAppUrl } from '@/lib/app-url'

export default function EmailConfirmadoPage() {
  const [email, setEmail]       = useState('')
  const [sending, setSending]   = useState(false)
  const [sent, setSent]         = useState(false)
  const [err, setErr]           = useState('')

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    setErr('')
    const supabase = createClient()
    const appUrl   = getClientAppUrl()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${appUrl}/auth/callback?type=magiclink` },
    })
    setSending(false)
    if (error) { setErr('Erro ao enviar: ' + error.message); return }
    setSent(true)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 shadow-lg">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">SysVetMax</h1>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">

          {/* Ícone de sucesso */}
          <div className="mb-5 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-teal-50">
              <CheckCircle2 className="h-9 w-9 text-teal-600" />
            </div>
          </div>

          <h2 className="mb-2 text-xl font-bold text-slate-900">
            E-mail confirmado!
          </h2>

          <p className="mb-6 text-sm text-slate-600 leading-relaxed">
            Seu e-mail foi verificado com sucesso. Agora sua clínica aguarda a{' '}
            <strong className="text-slate-800">liberação de acesso pela equipe SysMax</strong>.
            Entraremos em contato assim que a análise for concluída.
          </p>

          {/* Contato */}
          <div className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
            <Mail className="h-4 w-4 flex-shrink-0 text-blue-600" />
            <p className="text-sm text-blue-800">
              E-mail de contato:{' '}
              <a
                href="mailto:suporte@sysmaxsolutions.com"
                className="font-semibold hover:underline"
              >
                suporte@sysmaxsolutions.com
              </a>
            </p>
          </div>

          <Link
            href="/login"
            className="inline-block w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 mb-6"
          >
            Voltar ao Login
          </Link>

          {/* Magic link — recuperação para usuários mobile que perderam a sessão PKCE */}
          <details className="text-left">
            <summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1 justify-center">
              <RefreshCw className="h-3 w-3" />
              Confirmei pelo celular e não consigo entrar?
            </summary>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-600 mb-3">
                Se você confirmou o e-mail em um navegador diferente, insira seu e-mail abaixo para receber um link de acesso direto.
              </p>
              {sent ? (
                <p className="text-xs text-teal-700 font-semibold text-center py-1">
                  ✓ Link enviado! Verifique sua caixa de entrada.
                </p>
              ) : (
                <form onSubmit={handleMagicLink} className="space-y-2">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  />
                  {err && <p className="text-xs text-rose-600">{err}</p>}
                  <button
                    type="submit"
                    disabled={sending || !email.trim()}
                    className="w-full rounded-lg bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {sending
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando…</>
                      : <><Mail className="h-3.5 w-3.5" /> Receber link de acesso</>}
                  </button>
                </form>
              )}
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
