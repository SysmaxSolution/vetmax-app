'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Loader2, CheckCircle2, Building2, KeyRound,
  UserCircle2, Phone, CreditCard, Eye, EyeOff, AtSign,
  Stethoscope, Scissors,
} from 'lucide-react'
import { signUpWithClinic } from '@/lib/actions/auth'
import { recordAttribution } from '@/lib/actions/attribution'
import type { BusinessType } from '@/types'

// ─── Formatadores ─────────────────────────────────────────────────────────────

function formatCNPJ(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2)  return d
  if (d.length <= 6)  return `(${d.slice(0,2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface CnpjData {
  razao_social?:  string
  nome_fantasia?: string
  estabelecimento?: {
    logradouro?: string
    numero?:     string
    bairro?:     string
    cidade?:     { nome?: string }
    estado?:     { sigla?: string }
    telefone?:   string
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function RegisterPage() {
  // Modo de clínica
  const [clinicMode, setClinicMode] = useState<'new' | 'existing'>('new')

  // Segmento do negócio (Freemium 2026-05-26): obrigatório para nova clínica.
  // Adesão a clínica existente herda o businessType da clínica selecionada.
  const [businessType, setBusinessType] = useState<BusinessType | null>(null)

  // Nova clínica
  const [clinicName, setClinicName]   = useState('')
  const [cnpj, setCnpj]               = useState('')
  const [cnpjLoading, setCnpjLoading] = useState(false)
  const [cnpjData, setCnpjData]       = useState<CnpjData | null>(null)
  const [cnpjError, setCnpjError]     = useState('')

  // Clínica existente — adesão por CÓDIGO DE ACESSO (fornecido pelo admin da clínica)
  const [joinCode, setJoinCode] = useState('')

  // Dados pessoais
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail]       = useState('')
  const [phone, setPhone]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  // Termos de uso
  const [termsAccepted, setTermsAccepted] = useState(false)

  // Estado do form
  const [loading, setLoading]                 = useState(false)
  const [error, setError]                     = useState<string | null>(null)
  const [confirmedEmail, setConfirmedEmail]   = useState<string | null>(null)

  // ── CNPJ auto-fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    const digits = cnpj.replace(/\D/g, '')
    if (digits.length !== 14) {
      setCnpjData(null)
      setCnpjError('')
      return
    }
    let cancelled = false
    setCnpjLoading(true)
    setCnpjError('')
    fetch(`https://publica.cnpj.ws/cnpj/${digits}`)
      .then(r => r.ok ? r.json() as Promise<CnpjData> : null)
      .then(data => {
        if (cancelled) return
        if (!data) { setCnpjError('CNPJ não encontrado na base de dados.'); return }
        setCnpjData(data)
        const nome = data.nome_fantasia || data.razao_social
        if (nome && !clinicName) setClinicName(nome)
      })
      .catch(() => { if (!cancelled) setCnpjError('Erro ao consultar CNPJ. Verifique sua conexão.') })
      .finally(() => { if (!cancelled) setCnpjLoading(false) })
    return () => { cancelled = true }
  }, [cnpj])

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData()
    formData.set('username', username)
    formData.set('full_name', fullName)
    formData.set('email', email)
    formData.set('phone', phone.replace(/\D/g, ''))
    formData.set('password', password)
    formData.set('terms_accepted', String(termsAccepted))

    if (clinicMode === 'existing') {
      formData.set('join_code', joinCode.trim())
    } else {
      if (!businessType) {
        setError('Selecione o segmento da sua clínica antes de continuar.')
        setLoading(false)
        return
      }
      formData.set('clinic_name', clinicName)
      formData.set('business_type', businessType)
      const cnpjDigits = cnpj.replace(/\D/g, '')
      if (cnpjDigits.length === 14) formData.set('cnpj', cnpjDigits)
    }

    const res = await signUpWithClinic(formData)
    if ('error' in res) {
      setError(res.error)
      setLoading(false)
    } else {
      setConfirmedEmail(res.email)
      // F2 — registra atribuição de campanha (best-effort, não bloqueia)
      try {
        const q = new URLSearchParams(window.location.search)
        void recordAttribution({
          email: res.email,
          utm_source: q.get('utm_source') ?? undefined,
          utm_medium: q.get('utm_medium') ?? undefined,
          utm_campaign: q.get('utm_campaign') ?? undefined,
          utm_content: q.get('utm_content') ?? undefined,
          creative_id: q.get('creative_id') ?? q.get('utm_content') ?? undefined,
          landing_path: window.location.pathname,
        })
      } catch {}
    }
  }

  // ── Tela de sucesso ────────────────────────────────────────────────────────
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
          </p>
          <p className="text-xs text-slate-400">
            Após a confirmação, seu cadastro ficará pendente de liberação.
            Entraremos em contato assim que aprovado.
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

  // ── Formulário ─────────────────────────────────────────────────────────────

  const fieldClass = "w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-none transition-all"
  const labelClass = "block text-xs font-bold text-slate-500 uppercase mb-2 ml-1"

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 py-12">

      {/* Header */}
      <div className="mb-6 flex flex-col items-center">
        <div className="bg-teal-600 p-3 rounded-2xl mb-4 shadow-lg shadow-teal-200">
          <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-black text-slate-900">SysVetMax</h1>
        <p className="text-sm text-slate-500 font-medium">Crie a sua conta</p>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 w-full max-w-md border border-slate-100">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ── Seção: Clínica ─────────────────────────────────────────── */}
          <div>
            <label className={labelClass}>
              <Building2 className="inline h-3.5 w-3.5 mr-1 mb-0.5" />
              Clínica
            </label>

            {/* Toggle modo */}
            <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-1 mb-3 gap-1">
              {[
                { id: 'new'      as const, label: 'Nova Clínica' },
                { id: 'existing' as const, label: 'Já Cadastrada' },
              ].map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { setClinicMode(m.id); setError(null) }}
                  className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-all ${
                    clinicMode === m.id
                      ? 'bg-white text-teal-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {/* Nova clínica */}
            {clinicMode === 'new' && (
              <div className="space-y-3">

                {/* ── Segmento (Freemium) ── */}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2 ml-1">
                    Qual é o seu modelo de negócio?
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {([
                      {
                        id:       'vet_clinic'     as const,
                        title:    'Clínica Veterinária',
                        icon:     Stethoscope,
                        accent:   'teal',
                        modules:  'Recepção, Consultório e Gestão',
                      },
                      {
                        id:       'pet_aesthetics' as const,
                        title:    'Estética & Banho e Tosa',
                        icon:     Scissors,
                        accent:   'indigo',
                        modules:  'Recepção, Banho e Tosa e Gestão',
                      },
                    ]).map(opt => {
                      const Icon     = opt.icon
                      const selected = businessType === opt.id
                      const accent   = opt.accent
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setBusinessType(opt.id)}
                          className={`flex flex-col items-start gap-1.5 rounded-xl border-2 px-3 py-3 text-left transition-all ${
                            selected
                              ? accent === 'teal'
                                ? 'border-teal-500 bg-teal-50 shadow-md shadow-teal-100'
                                : 'border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                            selected
                              ? accent === 'teal' ? 'bg-teal-600 text-white' : 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <p className={`text-xs font-bold leading-tight ${
                            selected
                              ? accent === 'teal' ? 'text-teal-800' : 'text-indigo-800'
                              : 'text-slate-700'
                          }`}>
                            {opt.title}
                          </p>
                          <p className="text-[10px] leading-snug text-slate-500">
                            <span className="font-semibold">Módulos Free:</span> {opt.modules}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                  {!businessType && (
                    <p className="mt-1.5 text-[11px] text-slate-400 ml-1">
                      Selecione um segmento para liberar o cadastro.
                    </p>
                  )}
                </div>

                <input
                  value={clinicName}
                  onChange={e => setClinicName(e.target.value)}
                  required
                  className={fieldClass}
                  placeholder={
                    businessType === 'pet_aesthetics'
                      ? 'Nome do Centro de Estética'
                      : 'Nome da Clínica Veterinária'
                  }
                />

                {/* CNPJ */}
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    {cnpjLoading
                      ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      : <CreditCard className="h-4 w-4 text-slate-400" />}
                  </div>
                  <input
                    value={cnpj}
                    onChange={e => setCnpj(formatCNPJ(e.target.value))}
                    className={`${fieldClass} pl-9`}
                    placeholder="CNPJ (opcional — auto-preenche dados)"
                    maxLength={18}
                  />
                </div>

                {cnpjData && (
                  <div className="rounded-xl bg-teal-50 border border-teal-200 px-3 py-2 text-xs text-teal-800">
                    <p className="font-semibold">{cnpjData.razao_social}</p>
                    {cnpjData.nome_fantasia && cnpjData.nome_fantasia !== cnpjData.razao_social && (
                      <p className="text-teal-600">{cnpjData.nome_fantasia}</p>
                    )}
                    {cnpjData.estabelecimento?.cidade?.nome && (
                      <p className="mt-0.5 text-teal-600">
                        {cnpjData.estabelecimento.logradouro}, {cnpjData.estabelecimento.numero} —{' '}
                        {cnpjData.estabelecimento.cidade.nome}/{cnpjData.estabelecimento.estado?.sigla}
                      </p>
                    )}
                  </div>
                )}
                {cnpjError && (
                  <p className="text-xs text-red-500 ml-1">{cnpjError}</p>
                )}
              </div>
            )}

            {/* Clínica existente — só por CÓDIGO DE ACESSO (o admin da clínica fornece) */}
            {clinicMode === 'existing' && (
              <div>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <KeyRound className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 12))}
                    className={`${fieldClass} pl-9 font-mono tracking-widest`}
                    placeholder="CÓDIGO DE ACESSO"
                    autoComplete="off"
                  />
                </div>
                <p className="mt-2 text-xs text-slate-400 ml-1">
                  Peça o <span className="font-semibold text-slate-600">código de acesso</span> ao administrador da sua clínica
                  (Gestão &gt; Usuários). Você entrará com o perfil que ele definir.
                </p>
              </div>
            )}
          </div>

          {/* Divisor */}
          <div className="relative flex items-center">
            <div className="flex-grow border-t border-slate-200" />
            <span className="mx-3 text-xs font-semibold text-slate-400 uppercase">Seus dados</span>
            <div className="flex-grow border-t border-slate-200" />
          </div>

          {/* ── Nome de usuário ────────────────────────────────────────── */}
          <div>
            <label className={labelClass}>
              <AtSign className="inline h-3.5 w-3.5 mr-1 mb-0.5" />
              Nome de usuário
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">@</span>
              <input
                value={username}
                onChange={e => setUsername(e.target.value.replace(/[^a-z0-9_]/gi, '').toLowerCase())}
                className={`${fieldClass} pl-7`}
                placeholder="seunome"
                minLength={3}
                maxLength={30}
              />
            </div>
            <p className="mt-1 text-xs text-slate-400 ml-1">3–30 caracteres: letras, números e _</p>
          </div>

          {/* ── Nome completo ──────────────────────────────────────────── */}
          <div>
            <label className={labelClass}>
              <UserCircle2 className="inline h-3.5 w-3.5 mr-1 mb-0.5" />
              Nome completo
            </label>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
              className={fieldClass}
              placeholder="Dr. Carlos Santos"
            />
          </div>

          {/* ── E-mail ────────────────────────────────────────────────── */}
          <div>
            <label className={labelClass}>E-mail profissional</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className={fieldClass}
              placeholder="diretor@clinica.com"
            />
          </div>

          {/* ── Telefone ──────────────────────────────────────────────── */}
          <div>
            <label className={labelClass}>
              <Phone className="inline h-3.5 w-3.5 mr-1 mb-0.5" />
              Celular
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(formatPhone(e.target.value))}
              className={fieldClass}
              placeholder="(11) 99999-9999"
            />
          </div>

          {/* ── Senha ─────────────────────────────────────────────────── */}
          <div>
            <label className={labelClass}>Senha</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                className={`${fieldClass} pr-10`}
                placeholder="Mínimo 8 caracteres"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* ── Aceite de Termos ──────────────────────────────────────────── */}
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <div className="mt-0.5 flex-shrink-0">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/20"
              />
            </div>
            <span className="text-xs text-slate-600 leading-relaxed">
              Li e aceito os{' '}
              <a
                href="/termos-de-uso"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-800"
              >
                Termos de Uso
              </a>
              {', '}
              a{' '}
              <a
                href="/privacidade"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-800"
              >
                Política de Privacidade
              </a>
              {' '}e o{' '}
              <a
                href="/dpa"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-teal-700 underline underline-offset-2 hover:text-teal-800"
              >
                Acordo de Processamento de Dados (DPA)
              </a>
              {' '}da Sysmax Solutions, incluindo as obrigações de proteção de dados previstas na LGPD.
            </span>
          </label>

          {/* Erro */}
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl border border-red-100 font-medium">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={
              loading ||
              !termsAccepted ||
              (clinicMode === 'existing' && joinCode.trim().length < 4) ||
              (clinicMode === 'new' && !businessType)
            }
            className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-teal-100 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {loading ? 'Criando conta...' : 'Criar Conta'}
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
