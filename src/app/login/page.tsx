'use client'

import { useActionState, useState } from 'react'
import { login, selectClinic } from '@/lib/actions/auth'
import type { AuthState } from '@/lib/actions/auth'
import Link from 'next/link'
import { Building2, ChevronRight, ArrowLeft, Eye, EyeOff } from 'lucide-react'

// ─── Seletor de clínica (multi-tenant) ────────────────────────────────────────

function ClinicSelector({
  clinics,
  onBack,
}: {
  clinics: { id: string; name: string; role: string }[]
  onBack: () => void
}) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError]   = useState<string | null>(null)

  const roleLabels: Record<string, string> = {
    admin:        'Administrador',
    vet:          'Médico Veterinário',
    assistant:    'Auxiliar Veterinário',
    receptionist: 'Recepcionista',
    pharmacist:   'Farmacêutico',
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
          {clinics.map(clinic => (
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
              {loading === clinic.id
                ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
                : <ChevronRight className="h-4 w-4 text-slate-400" />}
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

// ─── Página de login ──────────────────────────────────────────────────────────

export default function LoginPage() {
  const [loginState, loginAction, loginPending] = useActionState(login, null)
  const [showPassword, setShowPassword] = useState(false)
  const [showSelector, setShowSelector]  = useState(false)
  const [clinicList, setClinicList]      = useState<{ id: string; name: string; role: string }[]>([])

  const state = loginState as AuthState
  if (state && 'selectClinic' in state && state.selectClinic && !showSelector) {
    setShowSelector(true)
    setClinicList(state.clinics)
  }

  if (showSelector && clinicList.length > 0) {
    return (
      <ClinicSelector
        clinics={clinicList}
        onBack={() => { setShowSelector(false); setClinicList([]) }}
      />
    )
  }

  const errorMsg = state && 'error' in state ? state.error : null

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center px-4 overflow-hidden"
      style={{
        background: `
          radial-gradient(circle at 20% 15%, rgba(45,212,191,0.18) 0%, transparent 45%),
          radial-gradient(circle at 80% 90%, rgba(20,184,166,0.14) 0%, transparent 50%),
          linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)
        `,
      }}
    >
      {/* Patinhas decorativas flutuantes — sutilmente animadas */}
      <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
        <svg className="login-paw-deco login-paw-deco-1" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="27" cy="32" rx="10" ry="13" fill="#5eead4" transform="rotate(-18 27 32)"/>
          <ellipse cx="44" cy="23" rx="10" ry="13" fill="#5eead4" transform="rotate(-6 44 23)"/>
          <ellipse cx="61" cy="23" rx="10" ry="13" fill="#5eead4" transform="rotate(6 61 23)"/>
          <ellipse cx="78" cy="32" rx="10" ry="13" fill="#5eead4" transform="rotate(18 78 32)"/>
          <ellipse cx="52" cy="67" rx="26" ry="22" fill="#5eead4"/>
        </svg>
        <svg className="login-paw-deco login-paw-deco-2" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="27" cy="32" rx="10" ry="13" fill="#14b8a6" transform="rotate(-18 27 32)"/>
          <ellipse cx="44" cy="23" rx="10" ry="13" fill="#14b8a6" transform="rotate(-6 44 23)"/>
          <ellipse cx="61" cy="23" rx="10" ry="13" fill="#14b8a6" transform="rotate(6 61 23)"/>
          <ellipse cx="78" cy="32" rx="10" ry="13" fill="#14b8a6" transform="rotate(18 78 32)"/>
          <ellipse cx="52" cy="67" rx="26" ry="22" fill="#14b8a6"/>
        </svg>
      </div>

      <div className="relative w-full max-w-sm login-fade-in">
        <div className="mb-8 text-center">
          <div className="login-logo-wrap mb-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl shadow-xl"
               style={{ background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)' }}>
            <svg className="h-9 w-9" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="27" cy="32" rx="10" ry="13" fill="white" transform="rotate(-18 27 32)"/>
              <ellipse cx="44" cy="23" rx="10" ry="13" fill="white" transform="rotate(-6 44 23)"/>
              <ellipse cx="61" cy="23" rx="10" ry="13" fill="white" transform="rotate(6 61 23)"/>
              <ellipse cx="78" cy="32" rx="10" ry="13" fill="white" transform="rotate(18 78 32)"/>
              <ellipse cx="52" cy="67" rx="26" ry="22" fill="white"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 login-rise">SysVetMax</h1>
          <p className="mt-1 text-sm text-slate-500 login-rise-delay">Acesse sua clínica veterinária</p>
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
                  aria-label={showPassword ? 'Ocultar' : 'Exibir'}
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
            Novo no SysVetMax?{' '}
            <Link href="/register" className="text-teal-600 font-bold hover:underline">
              Criar uma conta
            </Link>
          </p>
        </div>
      </div>

      <style jsx>{`
        .login-fade-in     { animation: login-rise 0.55s cubic-bezier(.22,.61,.36,1) both; }
        .login-logo-wrap   { animation: login-pop 0.7s cubic-bezier(.34,1.56,.64,1) both,
                                        login-float 4s ease-in-out 0.7s infinite; }
        .login-rise        { opacity: 0; transform: translateY(8px); animation: login-rise 0.5s ease-out 0.25s forwards; }
        .login-rise-delay  { opacity: 0; transform: translateY(8px); animation: login-rise 0.5s ease-out 0.4s forwards; }
        .login-paw-deco    { position: absolute; opacity: 0.07; pointer-events: none; }
        .login-paw-deco-1  { top: -40px; left: -40px; width: 240px; height: 240px;
                             animation: paw-drift1 18s ease-in-out infinite; }
        .login-paw-deco-2  { bottom: -50px; right: -50px; width: 280px; height: 280px;
                             animation: paw-drift2 22s ease-in-out infinite; }
        @keyframes login-pop {
          0%   { transform: scale(0.4) rotate(-8deg); opacity: 0; }
          60%  { transform: scale(1.08) rotate(2deg); opacity: 1; }
          100% { transform: scale(1) rotate(0); }
        }
        @keyframes login-float {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-4px); }
        }
        @keyframes login-rise {
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes paw-drift1 {
          0%,100% { transform: translate(0,0) rotate(-12deg); }
          50%     { transform: translate(20px,15px) rotate(-6deg); }
        }
        @keyframes paw-drift2 {
          0%,100% { transform: translate(0,0) rotate(8deg); }
          50%     { transform: translate(-15px,-20px) rotate(14deg); }
        }
      `}</style>
    </div>
  )
}
