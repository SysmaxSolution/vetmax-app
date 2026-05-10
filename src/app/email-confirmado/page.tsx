import Link from 'next/link'
import { CheckCircle2, Mail } from 'lucide-react'

export const metadata = { title: 'E-mail confirmado | SysVetMax' }

export default function EmailConfirmadoPage() {
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
            className="inline-block w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
          >
            Voltar ao Login
          </Link>
        </div>
      </div>
    </div>
  )
}
