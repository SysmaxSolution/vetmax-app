'use client'

import { useState } from 'react'
import { sendPasswordResetEmail } from '@/lib/actions/password'
import Link from 'next/link'
import { ArrowLeft, Mail, Loader2, CheckCircle2 } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await sendPasswordResetEmail(email.trim().toLowerCase())

    setLoading(false)
    if ('error' in result) {
      setError(result.error)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 shadow-lg">
            <Mail className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Recuperar Senha</h1>
          <p className="mt-1 text-sm text-slate-500">
            Informe seu e-mail para receber o link de recuperação
          </p>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-slate-900 mb-1">E-mail Enviado!</h2>
            <p className="text-sm text-slate-600 mb-4">
              Se o e-mail <span className="font-semibold">{email}</span> estiver cadastrado,
              você receberá um link para redefinir sua senha.
            </p>
            <p className="text-xs text-slate-400 mb-4">Verifique também a pasta de spam.</p>
            <Link
              href="/login"
              className="inline-flex items-center gap-1 text-sm font-semibold text-teal-600 hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar ao login
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">E-mail</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="mt-1.5 block w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder="seu@email.com"
                />
              </div>

              {error && (
                <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </span>
                ) : (
                  'Enviar Link de Recuperação'
                )}
              </button>
            </form>
          </div>
        )}

        <p className="text-sm text-slate-500 text-center mt-6">
          <Link href="/login" className="inline-flex items-center gap-1 text-teal-600 font-bold hover:underline">
            <ArrowLeft className="h-3 w-3" />
            Voltar ao login
          </Link>
        </p>
      </div>
    </div>
  )
}
