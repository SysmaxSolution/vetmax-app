import Link from 'next/link'
import { fetchInvitationByToken } from '@/lib/actions/invitations'

const ROLE_LABELS: Record<string, string> = {
  admin:        'Administrador(a)',
  vet:          'Médico Veterinário',
  assistant:    'Auxiliar Veterinário',
  receptionist: 'Recepcionista',
  pharmacist:   'Técnico',
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const { invitation, alreadyAccepted, error } = await fetchInvitationByToken(token)

  // ── Caso 1: convite já foi aceito (conta já existe) ─────────────────────────
  // Não é erro — apenas avisa e oferece o caminho certo (login / esqueci a senha).
  if (alreadyAccepted) {
    const acceptedDate = new Date(alreadyAccepted.accepted_at).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'long', year: 'numeric',
    })
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-100">
            <svg className="h-7 w-7 text-teal-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Sua conta já está criada!</h1>
          <p className="mt-2 text-sm text-slate-500">
            Você ingressou em <span className="font-semibold text-slate-700">{alreadyAccepted.clinic_name}</span> em {acceptedDate}.
          </p>
          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-left">
            <p className="text-xs text-slate-400 font-medium">E-mail da sua conta</p>
            <p className="text-sm font-semibold text-slate-800 break-all">{alreadyAccepted.email}</p>
          </div>
          <Link
            href="/login"
            className="mt-5 block w-full rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors"
          >
            Fazer login
          </Link>
          <Link
            href="/forgot-password"
            className="mt-3 inline-block text-sm font-medium text-teal-600 hover:underline"
          >
            Esqueci minha senha
          </Link>
          <p className="mt-6 text-xs text-slate-400">
            Não consegue lembrar a senha? Use a opção acima ou peça ao administrador para redefinir no cadastro do seu usuário.
          </p>
        </div>
      </div>
    )
  }

  // ── Caso 2: erro real (convite não existe / expirou) ───────────────────────
  if (error || !invitation) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
            <svg className="h-7 w-7 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">Convite indisponível</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <Link href="/login" className="mt-6 inline-block rounded-xl bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors">
            Ir para o Login
          </Link>
        </div>
      </div>
    )
  }

  const roleLabel = ROLE_LABELS[invitation.role] ?? invitation.role
  const expiresAt = new Date(invitation.expires_at).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 shadow-lg">
            <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Você foi convidado!</h1>
          <p className="mt-1 text-sm text-slate-500">Crie sua conta para ingressar na equipe</p>
        </div>

        <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5 mb-6 space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-bold text-white">
              {invitation.clinic_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-xs font-medium text-teal-500">Clínica</p>
              <p className="text-sm font-semibold text-teal-900">{invitation.clinic_name}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-teal-200">
            <div>
              <p className="text-xs text-teal-500 font-medium">Função</p>
              <p className="text-sm font-semibold text-teal-900">{roleLabel}</p>
            </div>
            <div>
              <p className="text-xs text-teal-500 font-medium">Convidado por</p>
              <p className="text-sm font-semibold text-teal-900">{invitation.inviter_name}</p>
            </div>
          </div>

          <p className="text-xs text-teal-600 pt-1 border-t border-teal-200">
            Convite válido até {expiresAt}
          </p>
        </div>

        <Link
          href={`/onboarding?clinic_id=${invitation.clinic_id}&token=${invitation.token}`}
          className="block w-full rounded-xl bg-teal-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-teal-700 transition-colors"
        >
          Criar minha conta e ingressar
        </Link>

        <p className="mt-4 text-center text-xs text-slate-400">
          Já possui uma conta?{' '}
          <Link href="/login" className="text-teal-600 hover:underline font-medium">
            Fazer login
          </Link>
        </p>
      </div>
    </div>
  )
}
