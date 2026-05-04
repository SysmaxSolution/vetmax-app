'use client'

import { useActionState, useState } from 'react'
import { login, selectClinic } from '@/lib/actions/auth'
import type { AuthState } from '@/lib/actions/auth'
import Link from 'next/link'
import { Building2, ChevronRight, ArrowLeft, Eye, EyeOff } from 'lucide-react'

function ClinicSelector({
  clinics,
  onBack,
}: {
  clinics: { id: string; name: string; role: string }[]
  onBack: () => void
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    vet: 'Médico Veterinário',
    assistant: 'Auxiliar Veterinário',
    receptionist: 'Recepcionista',
    pharmacist: 'Farmacêutico',
  }

  async function handleSelect(clinicId: string) {
    setLoading(clinicId)
    setError(null)
    const result = await selectClinic(clinicId)
    if (result && 'error' in result) {
      setError(result.error)
      setLoading(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 shadow-lg">
            <Building2 className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Selecione a Clínica</h1>
          <p className="mt-1 text-sm text-slate-500">Você está vinculado a múltiplas clínicas</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
          {clinics.map((clinic) => (
            <button
              key={clinic.id}
              onClick={() => handleSelect(clinic.id)}
              disabled={loading !== null}
              className="w-full flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition-all hover:border-teal-300 hover:bg-teal-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700 font-bold text-sm">
                {clinic.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{clinic.name}</p>
                <p className="text-xs text-slate-500">{roleLabels[clinic.role] ?? clinic.role}</p>
              </div>
              {loading === clinic.id ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
              ) : (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              )}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <button
          onClick={onBack}
          className="mt-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 transition-colors mx-auto"
        >
          <ArrowLeft className="h-3 w-3" />
          Voltar ao login
        </button>
      </div>
    </div>
  )
}

export default function LoginPage() {
  const [loginState, loginAction, loginPending] = useActionState(login, null)
  const [showPassword, setShowPassword] = useState(false)
  const [showSelector, setShowSelector] = useState(false)
  const [clinicList, setClinicList] = useState<{ id: string; name: string; role: string }[]>([])

  // Detecta se o login retornou seleção de clínicas
  const state = loginState as AuthState
  if (state && 'selectClinic' in state && state.selectClinic && !showSelector) {
    setShowSelector(true)
    setClinicList(state.clinics)
  }

  if (showSelector && clinicList.length > 0) {
    return (
      <ClinicSelector
        clinics={clinicList}
        onBack={() => {
          setShowSelector(false)
          setClinicList([])
        }}
      />
    )
  }

  const errorMsg = state && 'error' in state ? state.error : null

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 shadow-lg">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">VetMax</h1>
          <p className="mt-1 text-sm text-slate-500">Acesse sua clínica veterinária</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <form action={loginAction} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">E-mail</label>
              <input
                id="email" name="email" type="email" autoComplete="email" required
                disabled={loginPending}
                className="mt-1.5 block w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-100 disabled:text-slate-500"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">Senha</label>
              <div className="relative mt-1.5">
                <input
                  id="password" name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required minLength={8}
                  disabled={loginPending}
                  className="block w-full rounded-xl border border-slate-300 px-3 py-2.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-100 disabled:text-slate-500"
                  placeholder="Mínimo 8 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{errorMsg}</p>
            )}

            <button
              type="submit" disabled={loginPending}
              className="mt-2 w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loginPending ? 'Aguarde...' : 'Entrar'}
            </button>
          </form>
        </div>

        <div className="text-sm text-slate-500 text-center mt-6 space-y-2">
          <p>
            <Link href="/forgot-password" className="text-teal-600 hover:underline">
              Esqueceu sua senha?
            </Link>
          </p>
          <p>
            Novo no VetMax?{' '}
            <Link href="/register" className="text-teal-600 font-bold hover:underline">
              Criar uma conta
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
