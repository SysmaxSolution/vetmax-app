'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { signUpWithClinic } from '@/lib/actions/auth'

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)

    const res = await signUpWithClinic(formData)

    if ('error' in res) {
      setError(res.error)
      setLoading(false)
    } else {
      setConfirmedEmail(res.email)
    }
  }

  if (confirmedEmail) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <div className="bg-white p-10 rounded-3xl shadow-xl shadow-slate-200/50 w-full max-w-md border border-slate-100 text-center">
          <div className="flex justify-center mb-5">
            <CheckCircle2 className="h-16 w-16 text-teal-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Confirme seu e-mail</h2>
          <p className="text-sm text-slate-500 mb-4">
            Enviamos um link de confirmação para{' '}
            <span className="font-semibold text-slate-700">{confirmedEmail}</span>.
            Clique no link para ativar sua conta.
          </p>
          <p className="text-xs text-slate-400">
            Após a confirmação, seu cadastro ficará pendente de liberação pela equipe Sysmax.
            Entraremos em contato assim que sua clínica for aprovada.
          </p>
          <div className="mt-8">
            <Link href="/login" className="text-sm text-teal-600 font-bold hover:underline">
              Voltar ao Login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
      <div className="mb-8 flex flex-col items-center">
        <div className="bg-teal-600 p-3 rounded-2xl mb-4 shadow-lg shadow-teal-200">
          <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-black text-slate-900">SysVetMax</h1>
        <p className="text-sm text-slate-500 font-medium">Crie a conta da sua clínica</p>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 w-full max-w-md border border-slate-100">
        <form action={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Nome da Clínica Veterinária</label>
            <input
              name="clinic_name"
              type="text"
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all"
              placeholder="Ex: Clínica Vet Saúde Animal"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Seu Nome Completo</label>
            <input
              name="full_name"
              type="text"
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all"
              placeholder="Ex: Dr. Carlos Santos"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">E-mail Profissional</label>
            <input
              name="email"
              type="email"
              required
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all"
              placeholder="diretor@clinica.com"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Senha</label>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all"
              placeholder="Mínimo 8 caracteres"
            />
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl border border-red-100 font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-teal-100 flex items-center justify-center disabled:opacity-70"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Criar Conta'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-sm text-slate-500">
            Já tem uma conta?{' '}
            <Link href="/login" className="text-teal-600 font-bold hover:underline">
              Fazer Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
