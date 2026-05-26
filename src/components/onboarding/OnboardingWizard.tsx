'use client'

import { useState, useEffect, useRef } from 'react'
import { X, CheckCircle2, Upload, Loader2, Sparkles } from 'lucide-react'
import { uploadClinicLogo } from '@/lib/actions/clinic-settings'
import PatientFullModal from '@/components/patients/PatientFullModal'
import NewAppointmentModal from '@/components/reception/NewAppointmentModal'

// ─── StepCard ─────────────────────────────────────────────────────────────────

function StepCard({
  number, title, description, done, children,
}: {
  number: number
  title: string
  description: string
  done: boolean
  children?: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border p-4 transition-all duration-300 ${
      done ? 'border-green-200 bg-green-50/60' : 'border-slate-200 bg-white'
    }`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {done ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-300">
              <span className="text-[9px] font-bold text-slate-400">{number}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${done ? 'text-green-800' : 'text-slate-800'}`}>
            {title}
            {done && <span className="ml-2 text-xs font-normal text-green-600">✓ Concluído</span>}
          </p>
          {!done && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>}
          {!done && children}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  initialHasLogo: boolean
  initialHasPets: boolean
  clinicId: string
  userRole: string
  /** Segmento da clínica — controla saudação e copy do wizard (Freemium 2026-05-26). */
  businessType?: 'vet_clinic' | 'pet_aesthetics'
}

export default function OnboardingWizard({
  initialHasLogo, initialHasPets, clinicId, userRole,
  businessType = 'vet_clinic',
}: Props) {
  const isAesthetics = businessType === 'pet_aesthetics'
  const [open,        setOpen]        = useState(false)
  const [step1Done,   setStep1Done]   = useState(initialHasLogo)
  const [step2Done,   setStep2Done]   = useState(initialHasPets)
  const [step3Done,   setStep3Done]   = useState(false)
  const [showPet,     setShowPet]     = useState(false)
  const [showAppt,    setShowAppt]    = useState(false)
  const [uploading,   setUploading]   = useState(false)
  const [logoError,   setLogoError]   = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isAdmin      = userRole === 'admin'
  const STORAGE_KEY  = `vetmax_onboarding_done_${clinicId}`
  const allDone      = step1Done && step2Done && step3Done
  const doneCount    = [step1Done, step2Done, step3Done].filter(Boolean).length

  // Auto-open once for first-time clinics (not dismissed, and missing setup)
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return
      if (!initialHasLogo || !initialHasPets) {
        const t = setTimeout(() => setOpen(true), 900)
        return () => clearTimeout(t)
      }
    } catch { /* localStorage unavailable */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ }
    setOpen(false)
  }

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setLogoError(null)
    const fd = new FormData()
    fd.append('logo', file)
    const res = await uploadClinicLogo(fd)
    setUploading(false)
    if ('error' in res) { setLogoError(res.error); return }
    setStep1Done(true)
  }

  if (!open) return null

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        className="fixed inset-0 z-[9940] bg-black/50 backdrop-blur-sm"
        onClick={dismiss}
      />

      {/* ── Wizard card ── */}
      <div className="fixed inset-0 z-[9941] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-teal-600 to-indigo-600 px-6 py-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                    {isAesthetics ? 'Centro de Estética · SysVetMax' : 'Mentor de IA · SysVetMax'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <h2 className="text-base font-bold text-white">
                      {allDone
                        ? '🎉 Tudo configurado!'
                        : isAesthetics
                          ? 'Bem-vindo à sua Estética!'
                          : 'Bem-vindo à sua Clínica!'}
                    </h2>
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold text-white tabular-nums">
                      {doneCount}/3
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={dismiss}
                aria-label="Fechar"
                className="flex-shrink-0 rounded-full p-1.5 text-white/60 transition-colors hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4 bg-slate-50">
            <p className="text-sm leading-relaxed text-slate-600">
              {allDone
                ? isAesthetics
                  ? 'Seu centro de estética está pronto para operar. Explore o módulo Banho e Tosa!'
                  : 'Sua clínica está pronta para operar. Explore todas as funcionalidades!'
                : isAesthetics
                  ? 'Sou seu Mentor de IA. Vamos preparar o seu centro de estética em 3 passos rápidos? Você tem acesso a Recepção, Pacientes, Caixa, Banho e Tosa e Gestão no seu plano Free.'
                  : 'Sou seu Mentor de IA. Para que você veja a mágica acontecer, vamos configurar o básico da sua clínica em 3 passos rápidos? Você tem acesso a Recepção, Pacientes, Caixa, Consultório e Gestão no seu plano Free.'}
            </p>

            {/* Steps */}
            <div className="space-y-2.5">

              {/* Passo 1 — Logo */}
              <StepCard
                number={1}
                title="Identidade Visual"
                description={isAdmin
                  ? 'Adicione o logotipo da clínica (PNG, JPG, SVG)'
                  : 'Peça ao administrador para configurar o logotipo'}
                done={step1Done}
              >
                {isAdmin && (
                  <div className="mt-3 space-y-1.5">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={handleLogoFile}
                    />
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {uploading
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
                        : <><Upload className="h-4 w-4" /> Carregar Logotipo</>}
                    </button>
                    {logoError && (
                      <p className="text-xs text-red-500">{logoError}</p>
                    )}
                  </div>
                )}
              </StepCard>

              {/* Passo 2 — Primeiro Pet */}
              <StepCard
                number={2}
                title="Primeiro Paciente"
                description="Cadastre o primeiro pet e tutor da clínica"
                done={step2Done}
              >
                <button
                  onClick={() => setShowPet(true)}
                  className="mt-3 flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
                >
                  🐾 Cadastrar Pet
                </button>
              </StepCard>

              {/* Passo 3 — Primeiro Agendamento */}
              <StepCard
                number={3}
                title="Primeiro Agendamento"
                description="Marque a primeira consulta da clínica"
                done={step3Done}
              >
                <button
                  onClick={() => setShowAppt(true)}
                  disabled={!step2Done}
                  title={!step2Done ? 'Cadastre um pet primeiro' : undefined}
                  className="mt-3 flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  📅 Fazer Agendamento
                </button>
              </StepCard>

            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              {allDone ? (
                <button
                  onClick={dismiss}
                  className="w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
                >
                  Começar a usar o SysVetMax 🚀
                </button>
              ) : (
                <button
                  onClick={dismiss}
                  className="text-xs text-slate-400 transition-colors hover:text-slate-600"
                >
                  Pular configuração →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Sub-modais em z-index acima do wizard ── */}
      {showPet && (
        <div className="fixed inset-0 z-[9942]">
          <PatientFullModal
            mode="new_tutor_and_pet"
            onClose={() => setShowPet(false)}
            onSuccess={() => { setShowPet(false); setStep2Done(true) }}
          />
        </div>
      )}
      {showAppt && (
        <div className="fixed inset-0 z-[9942]">
          <NewAppointmentModal
            onClose={() => setShowAppt(false)}
            onSuccess={() => { setShowAppt(false); setStep3Done(true) }}
          />
        </div>
      )}
    </>
  )
}
