'use client'

import { useActionState, useState, useTransition } from 'react'
import { login, selectClinic, completeAuthSession } from '@/lib/actions/auth'
import type { AuthState } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
  Building2, ChevronRight, ArrowLeft,
  Eye, EyeOff, Smartphone, Mail, Globe, Loader2,
} from 'lucide-react'

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

// ─── Logo SVG ─────────────────────────────────────────────────────────────────

function VetMaxLogo() {
  return (
    <svg className="h-8 w-8" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="27" cy="32" rx="10" ry="13" fill="white" transform="rotate(-18 27 32)"/>
      <ellipse cx="44" cy="23" rx="10" ry="13" fill="white" transform="rotate(-6 44 23)"/>
      <ellipse cx="61" cy="23" rx="10" ry="13" fill="white" transform="rotate(6 61 23)"/>
      <ellipse cx="78" cy="32" rx="10" ry="13" fill="white" transform="rotate(18 78 32)"/>
      <ellipse cx="52" cy="67" rx="26" ry="22" fill="white"/>
    </svg>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

type AuthTab  = 'email' | 'google' | 'phone'
type PhoneStep = 'input' | 'otp'

function formatPhoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`
  return `+55${digits}`
}

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<AuthTab>('email')

  // Email
  const [loginState, loginAction, loginPending] = useActionState(login, null)
  const [showPassword, setShowPassword] = useState(false)
  const [showSelector, setShowSelector]  = useState(false)
  const [clinicList, setClinicList]      = useState<{ id: string; name: string; role: string }[]>([])

  // Google / Phone
  const [socialError, setSocialError]   = useState<string | null>(null)
  const [socialLoading, setSocialLoading] = useState(false)

  // Phone OTP
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('input')
  const [phone, setPhone]         = useState('')
  const [otp, setOtp]             = useState('')
  const [isPending, startTransition] = useTransition()

  // Detecta múltiplas clínicas no login de e-mail
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

  const emailError = state && 'error' in state ? state.error : null

  // ── Google OAuth ─────────────────────────────────────────────────────────
  async function handleGoogleLogin() {
    setSocialLoading(true)
    setSocialError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) {
      setSocialError('Não foi possível iniciar o login com Google. Tente novamente ou use e-mail.')
      setSocialLoading(false)
    }
  }

  // ── Phone OTP — envio ─────────────────────────────────────────────────────
  async function handleSendOtp() {
    const formatted = formatPhoneE164(phone)
    if (formatted.replace(/\D/g, '').length < 12) {
      setSocialError('Digite um número de celular válido com DDD. Ex: 11 99999-9999')
      return
    }
    setSocialLoading(true)
    setSocialError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted })
    if (error) {
      setSocialError('Não foi possível enviar o código SMS. Verifique o número e tente novamente.')
      setSocialLoading(false)
      return
    }
    setPhoneStep('otp')
    setSocialLoading(false)
  }

  // ── Phone OTP — verificação ───────────────────────────────────────────────
  async function handleVerifyOtp() {
    if (otp.length !== 6) {
      setSocialError('Digite o código de 6 dígitos recebido por SMS.')
      return
    }
    setSocialLoading(true)
    setSocialError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({
      phone: formatPhoneE164(phone),
      token: otp,
      type:  'sms',
    })
    if (error) {
      setSocialError('Código inválido ou expirado. Solicite um novo código.')
      setSocialLoading(false)
      return
    }
    // Sessão estabelecida — completa fluxo de auth no servidor
    startTransition(async () => {
      const result = await completeAuthSession()
      if (result && 'selectClinic' in result && result.selectClinic) {
        setShowSelector(true)
        setClinicList(result.clinics)
      } else if (result && 'error' in result) {
        setSocialError(result.error)
      }
      setSocialLoading(false)
    })
  }

  const tabs: { id: AuthTab; label: string; icon: React.ReactNode }[] = [
    { id: 'email',  label: 'E-mail',   icon: <Mail      className="h-3.5 w-3.5" /> },
    { id: 'google', label: 'Google',   icon: <Globe     className="h-3.5 w-3.5" /> },
    { id: 'phone',  label: 'Telefone', icon: <Smartphone className="h-3.5 w-3.5" /> },
  ]

  const isLoading = socialLoading || isPending

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 shadow-lg">
            <VetMaxLogo />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">SysVetMax</h1>
          <p className="mt-1 text-sm text-slate-500">Acesse sua clínica veterinária</p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-1 mb-3 gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSocialError(null) }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-teal-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

          {/* ── Tab E-mail ──────────────────────────────────────────────── */}
          {activeTab === 'email' && (
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

              {emailError && (
                <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{emailError}</p>
              )}

              <button
                type="submit" disabled={loginPending}
                className="mt-2 w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loginPending ? 'Aguarde...' : 'Entrar'}
              </button>
            </form>
          )}

          {/* ── Tab Google ──────────────────────────────────────────────── */}
          {activeTab === 'google' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500 text-center">
                Entre com sua conta Google. Sua foto de perfil será carregada automaticamente.
              </p>
              {socialError && (
                <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{socialError}</p>
              )}
              <button
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 transition-all focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                ) : (
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                {isLoading ? 'Redirecionando...' : 'Continuar com Google'}
              </button>
            </div>
          )}

          {/* ── Tab Telefone ────────────────────────────────────────────── */}
          {activeTab === 'phone' && (
            <div className="space-y-4">
              {phoneStep === 'input' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Celular</label>
                    <div className="relative mt-1.5">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">+55</span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        disabled={isLoading}
                        className="block w-full rounded-xl border border-slate-300 pl-12 pr-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-100"
                        placeholder="(11) 99999-9999"
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Um código de 6 dígitos será enviado via SMS</p>
                  </div>

                  {socialError && (
                    <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{socialError}</p>
                  )}

                  <button
                    onClick={handleSendOtp}
                    disabled={isLoading || !phone}
                    className="w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isLoading ? 'Enviando...' : 'Enviar Código SMS'}
                  </button>
                </>
              ) : (
                <>
                  <div className="text-center">
                    <p className="text-sm text-slate-600">
                      Código enviado para <span className="font-semibold text-slate-900">+55 {phone}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => { setPhoneStep('input'); setOtp(''); setSocialError(null) }}
                      className="mt-1 text-xs text-teal-600 hover:underline"
                    >
                      Trocar número
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Código de verificação</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                      disabled={isLoading}
                      className="mt-1.5 block w-full rounded-xl border border-slate-300 px-3 py-2.5 text-center text-xl font-bold tracking-[0.5em] text-slate-900 placeholder:text-slate-300 placeholder:tracking-normal placeholder:text-base focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-100"
                      placeholder="000000"
                    />
                  </div>

                  {socialError && (
                    <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{socialError}</p>
                  )}

                  <button
                    onClick={handleVerifyOtp}
                    disabled={isLoading || otp.length !== 6}
                    className="w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isLoading ? 'Verificando...' : 'Verificar e Entrar'}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setSocialLoading(false); setSocialError(null); handleSendOtp() }}
                    disabled={isLoading}
                    className="w-full text-sm text-slate-500 hover:text-teal-600 transition-colors disabled:opacity-50"
                  >
                    Reenviar código
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Links */}
        <div className="text-sm text-slate-500 text-center mt-6 space-y-2">
          {activeTab === 'email' && (
            <p>
              <Link href="/forgot-password" className="text-teal-600 hover:underline">
                Esqueceu sua senha?
              </Link>
            </p>
          )}
          <p>
            Novo no SysVetMax?{' '}
            <Link href="/register" className="text-teal-600 font-bold hover:underline">
              Criar uma conta
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
