// Porta de entrada do Portal do Tutor — SEM contexto de clínica.
//
// É a rota dos links já enviados aos tutores, então ela não pode deixar de
// existir. O que ela faz agora:
//   · sem sessão              → tela de login (marca neutra);
//   · rotina desligada        → aviso honesto, nada é carregado;
//   · vínculo com 1 clínica   → redireciona para `/portal/c/<slug>`;
//   · vínculo com 2+ clínicas → SELETOR de clínica.
// É daqui que sai a retrocompatibilidade: nenhum link antigo quebra.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTutorContext } from '@/lib/portal/session'
import { ShieldCheck, AlertCircle, ArrowRight, PawPrint } from 'lucide-react'
import PortalLoginForm from '@/components/portal/PortalLoginForm'
import PortalShell from '@/components/portal/PortalShell'
import { decidePortalEntry, portalClinicPath } from '@/lib/portal/clinic-context'
import { NEUTRAL_PORTAL_BRAND, loadPortalBrands, ensurePortalSlug } from '@/lib/portal/brand-server'

export const dynamic = 'force-dynamic'

const heading = { fontFamily: 'var(--pt-heading-font)' }

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const ctx = await getTutorContext()

  if (!ctx) {
    return (
      <PortalShell brand={NEUTRAL_PORTAL_BRAND}>
        <div className="px-5 sm:px-8 lg:px-12 py-16 flex justify-center">
          <div className="max-w-md w-full space-y-4">
            {erro && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">{erro}</p>
              </div>
            )}
            <PortalLoginForm />
          </div>
        </div>
      </PortalShell>
    )
  }

  // Rotina desligada na(s) clínica(s) do vínculo: a sessão é válida, mas nada do
  // Portal é carregado. Mensagem honesta e sem revelar o que existe lá dentro —
  // nenhum pet, exame ou vacina chega a ser consultado (ver getTutorContext).
  if (ctx.portalDisabled) {
    return (
      <PortalShell brand={NEUTRAL_PORTAL_BRAND} tutorName={ctx.fullName} showLogout>
        <div className="px-5 sm:px-8 lg:px-12 py-16 flex justify-center">
          <div className="max-w-md w-full bg-[var(--pt-surface)] rounded-2xl border border-[var(--pt-border)] p-10 text-center">
            <ShieldCheck className="h-10 w-10 text-[var(--pt-accent)] mx-auto mb-4" />
            <h1 className="text-xl text-[var(--pt-text)]" style={heading}>Área do Tutor indisponível</h1>
            <p className="mt-3 text-sm text-[var(--pt-muted)] leading-relaxed">
              A clínica em que você tem cadastro ainda não disponibilizou a Área do Tutor.
              Fale com a recepção para receber as informações do seu pet.
            </p>
            <form action="/portal/sair" method="post" className="mt-6">
              <button type="submit" className="text-xs font-medium text-[var(--pt-muted)] hover:text-[var(--pt-primary-dark)] rounded-full border border-[var(--pt-border)] px-4 py-2 transition hover:border-[var(--pt-accent-ring)]">
                Sair
              </button>
            </form>
          </div>
        </div>
      </PortalShell>
    )
  }

  const decision = decidePortalEntry(ctx.links)

  if (decision.kind === 'empty') {
    return (
      <PortalShell brand={NEUTRAL_PORTAL_BRAND} tutorName={ctx.fullName} showLogout>
        <div className="px-5 sm:px-8 lg:px-12 py-16 flex justify-center">
          <div className="max-w-md w-full bg-[var(--pt-surface)] rounded-2xl border border-[var(--pt-border)] p-10 text-center">
            <PawPrint className="h-10 w-10 text-[var(--pt-border)] mx-auto mb-4" />
            <h1 className="text-xl text-[var(--pt-text)]" style={heading}>Nenhum pet vinculado</h1>
            <p className="mt-3 text-sm text-[var(--pt-muted)] leading-relaxed">
              Seu acesso ainda não está ligado a nenhum cadastro. Fale com a recepção da clínica.
            </p>
          </div>
        </div>
      </PortalShell>
    )
  }

  if (decision.kind === 'redirect') {
    const slug = await ensurePortalSlug(decision.clinicId)
    if (slug) redirect(portalClinicPath(slug))
    // Sem slug (clínica sem nome utilizável, caso de borda): cai no seletor.
  }

  const ids = decision.kind === 'select' ? decision.clinicIds : [decision.clinicId]
  const brands = await loadPortalBrands(ids)
  const first = ctx.fullName ? ctx.fullName.split(' ')[0] : null

  return (
    <PortalShell brand={NEUTRAL_PORTAL_BRAND} tutorName={ctx.fullName} showLogout>
      <section className="w-full px-5 sm:px-8 lg:px-12 py-12 sm:py-16">
        <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--pt-primary)]">Área do Tutor</p>
        <h1 className="mt-2 text-2xl sm:text-3xl text-[var(--pt-text)]" style={heading}>
          {first ? <>Olá, {first}.</> : 'Bem-vindo.'}
        </h1>
        <p className="mt-3 max-w-xl text-sm text-[var(--pt-muted)] leading-relaxed">
          Você tem cadastro em mais de uma clínica. Escolha de qual delas quer ver os pets —
          cada clínica tem a sua própria área, com o seu histórico.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map(b => {
            const href = b.clinicSlug ? portalClinicPath(b.clinicSlug) : '/portal'
            return (
              <Link key={b.clinicId ?? href} href={href}
                    className="group bg-[var(--pt-surface)] rounded-2xl border border-[var(--pt-border)] p-6 transition hover:border-[var(--pt-accent-soft)] hover:shadow-[0_12px_40px_-16px_rgba(16,34,28,0.22)]">
                <div className="flex items-center gap-4">
                  <span className="h-14 w-14 rounded-full flex items-center justify-center overflow-hidden flex-shrink-0 ring-1"
                        style={{ background: b.theme.primaryDarkColor, borderColor: b.theme.accentColor, boxShadow: `0 0 0 1px ${b.theme.accentColor}55` }}>
                    {b.clinicLogo
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={b.clinicLogo} alt={b.clinicName ?? 'Clínica'} className="h-full w-full object-cover" />
                      : <PawPrint className="h-6 w-6" style={{ color: b.theme.accentColor }} />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-lg text-[var(--pt-text)] truncate" style={heading}>{b.clinicName ?? 'Clínica'}</p>
                    <p className="text-xs text-[var(--pt-muted-soft)]">{b.theme.tagline ?? 'Portal do Tutor'}</p>
                  </div>
                </div>
                <div className="mt-5 pt-4 border-t border-[var(--pt-border-soft)] flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: b.theme.primaryColor }}>Entrar</span>
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" style={{ color: b.theme.accentColor }} />
                </div>
              </Link>
            )
          })}
        </div>

        <p className="mt-8 text-[11px] text-[var(--pt-muted-soft)] flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--pt-primary)]" />
          Cada clínica enxerga apenas o cadastro que mantém com você. Nada é compartilhado entre elas.
        </p>
      </section>
    </PortalShell>
  )
}
