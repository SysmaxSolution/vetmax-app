// Moldura do Portal do Tutor — cabeçalho, rodapé e, sobretudo, a INJEÇÃO do
// tema da clínica como variáveis CSS.
//
// Antes, a moldura vivia em `src/app/portal/layout.tsx` com as cores escritas à
// mão no JSX. Agora ela é um componente parametrizado pela marca, e cada ramo
// de rota decide QUAL marca usar:
//   · /portal              → marca neutra (login e seletor)
//   · /portal/c/<slug>/…   → marca da clínica do slug
//   · /portal/pet/<id>/…   → marca da clínica DONA do pet (links antigos)

import Link from 'next/link'
import { PawPrint, LogOut, ArrowLeftRight } from 'lucide-react'
import { PORTAL_FONT_VARS } from '@/lib/portal/fonts'
import { brandStyle, type PortalBrand } from '@/lib/portal/brand-server'

interface Props {
  brand: PortalBrand
  /** Nome do tutor logado (saudação no topo). Null = ninguém logado. */
  tutorName?: string | null
  /** Mostra "Sair" — só quando há sessão. */
  showLogout?: boolean
  /** Mostra "Trocar de clínica" — só para tutor com vínculo em 2+ clínicas. */
  showClinicSwitch?: boolean
  children: React.ReactNode
}

export default function PortalShell({
  brand, tutorName, showLogout, showClinicSwitch, children,
}: Props) {
  const title = brand.clinicName ?? 'Área do Tutor'
  const eyebrow = brand.theme.tagline ?? (brand.clinicName ? 'Portal do Tutor' : 'SYSVETMAX')

  return (
    <div
      className={`${PORTAL_FONT_VARS} min-h-screen antialiased bg-[var(--pt-bg)] text-[var(--pt-text)]`}
      style={brandStyle(brand)}
    >
      <header className="sticky top-0 z-30 bg-[var(--pt-surface)]/95 backdrop-blur border-b border-[var(--pt-border)] print:hidden">
        <div className="w-full px-5 sm:px-8 lg:px-12 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-10 w-10 rounded-full ring-1 ring-[var(--pt-accent-soft)] bg-[var(--pt-primary-dark)] flex items-center justify-center overflow-hidden flex-shrink-0">
              {brand.clinicLogo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={brand.clinicLogo} alt={title} className="h-full w-full object-cover" />
                : <PawPrint className="h-5 w-5 text-[var(--pt-accent)]" />}
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-tight truncate" style={{ fontFamily: 'var(--pt-heading-font)' }}>{title}</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--pt-muted)]">{eyebrow}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            {tutorName && <span className="hidden sm:block text-sm text-[var(--pt-muted)]">Olá, <span className="text-[var(--pt-text)] font-medium">{tutorName.split(' ')[0]}</span></span>}
            {showClinicSwitch && (
              <Link href="/portal"
                    className="text-xs font-medium text-[var(--pt-muted)] hover:text-[var(--pt-primary-dark)] flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] px-3 py-1.5 transition hover:border-[var(--pt-accent-ring)]">
                <ArrowLeftRight className="h-3.5 w-3.5" /><span className="hidden sm:inline">Trocar de clínica</span>
              </Link>
            )}
            {showLogout && (
              <form action="/portal/sair" method="post">
                <button type="submit" className="text-xs font-medium text-[var(--pt-muted)] hover:text-[var(--pt-primary-dark)] flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] px-3 py-1.5 transition hover:border-[var(--pt-accent-ring)]">
                  <LogOut className="h-3.5 w-3.5" />Sair
                </button>
              </form>
            )}
          </div>
        </div>
      </header>

      {children}

      <footer className="border-t border-[var(--pt-border)] mt-4 print:hidden">
        <div className="w-full px-5 sm:px-8 lg:px-12 py-6 flex items-center justify-between text-[11px] text-[var(--pt-muted-soft)]">
          <span>{brand.clinicName ?? 'SYSVETMAX'}</span>
          <span>Powered by <span className="font-semibold text-[var(--pt-muted)]">SYSVETMAX</span></span>
        </div>
      </footer>
    </div>
  )
}
