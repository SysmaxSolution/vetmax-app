'use client'

import { useActionState } from 'react'
import { completeOnboarding } from '@/lib/actions/onboarding'
import { logout } from '@/lib/actions/auth'

interface Props {
  clinicId: string | null
  clinicName: string | null
  token: string | null
}

export function OnboardingForm({ clinicId, clinicName, token }: Props) {
  const [state, formAction, pending] = useActionState(completeOnboarding, null)
  const isJoining = !!clinicId

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 flex justify-end">
          <form action={logout}>
            <button type="submit" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">Sair da conta</button>
          </form>
        </div>

        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 shadow-lg">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Z" />
            </svg>
          </div>
          {isJoining ? (
            <>
              <h1 className="text-2xl font-bold text-slate-900">Você foi convidado!</h1>
              <p className="mt-1 text-sm text-slate-500">Crie sua conta para ingressar na equipe</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900">Configurar sua clínica</h1>
              <p className="mt-1 text-sm text-slate-500">Configure o VetMax para começar a usar</p>
            </>
          )}
        </div>

        {isJoining && clinicName && (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-bold text-white">
              {clinicName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-xs font-medium text-teal-500">Você está ingressando em</p>
              <p className="text-sm font-semibold text-teal-900">{clinicName}</p>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <form action={formAction} className="space-y-4">
            {clinicId && <input type="hidden" name="clinic_id" value={clinicId} />}
            {token    && <input type="hidden" name="token"     value={token} />}

            {!isJoining && (
              <div>
                <label htmlFor="clinic_name" className="block text-sm font-medium text-slate-700">Nome da clínica veterinária</label>
                <input
                  id="clinic_name" name="clinic_name" type="text" required
                  className="mt-1.5 block w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  placeholder="Ex: Clínica Vet Saúde Animal"
                />
              </div>
            )}

            <div>
              <label htmlFor="full_name" className="block text-sm font-medium text-slate-700">Seu nome completo</label>
              <input
                id="full_name" name="full_name" type="text" required
                className="mt-1.5 block w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                placeholder="Ex: Dr. Carlos Santos"
              />
            </div>

            {isJoining && (
              <>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700">E-mail</label>
                  <input id="email" name="email" type="email" required
                    className="mt-1.5 block w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    placeholder="seu@email.com" />
                </div>
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700">Senha</label>
                  <input id="password" name="password" type="password" required minLength={8}
                    className="mt-1.5 block w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    placeholder="Mínimo 8 caracteres" />
                </div>
              </>
            )}

            {state?.error && (
              <p className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{state.error}</p>
            )}

            <button
              type="submit" disabled={pending}
              className="mt-2 w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-60"
            >
              {pending ? 'Configurando...' : isJoining ? 'Ingressar na clínica' : 'Criar minha clínica'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
