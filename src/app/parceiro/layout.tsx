// Moldura do Portal do Parceiro (veterinário solicitante).
//
// Ganhou o MESMO white-label do Portal do Tutor porque aqui o contexto de
// clínica é ainda mais simples: a sessão do parceiro já nasce amarrada a uma
// clínica de referência (`PartnerContext.clinicId`), então não há slug a
// inventar nem seletor a construir — basta ler o tema daquela clínica. O custo
// foi um `loadPortalBrand` no layout; por isso entrou junto, e não numa fase 2.

import { getPartnerContext } from '@/lib/portal/partner-session'
import { Stethoscope, LogOut } from 'lucide-react'
import { PORTAL_FONT_VARS } from '@/lib/portal/fonts'
import { loadPortalBrand, brandStyle, NEUTRAL_PORTAL_BRAND } from '@/lib/portal/brand-server'

export const metadata = { title: 'Portal do Veterinário | SysVetMax' }

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getPartnerContext()
  // Sem sessão (tela de código), a marca é a neutra: a identidade da clínica não
  // aparece para quem ainda não provou ser parceiro dela.
  const brand = ctx ? await loadPortalBrand(ctx.clinicId) : NEUTRAL_PORTAL_BRAND
  return (
    <div className={`${PORTAL_FONT_VARS} min-h-screen bg-[var(--pt-bg)] text-[var(--pt-text)] antialiased`} style={brandStyle(brand)}>
      <header className="sticky top-0 z-30 bg-[var(--pt-surface)]/95 backdrop-blur border-b border-[var(--pt-border)] print:hidden">
        <div className="w-full px-5 sm:px-8 lg:px-12 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-10 w-10 rounded-full ring-1 ring-[var(--pt-accent-soft)] bg-[var(--pt-primary-dark)] flex items-center justify-center flex-shrink-0">
              <Stethoscope className="h-5 w-5 text-[var(--pt-accent)]" />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-tight truncate" style={{ fontFamily: 'var(--pt-heading-font)' }}>{brand.clinicName ?? 'Portal do Veterinário'}</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--pt-muted)]">{ctx ? (ctx.kind === 'admin' ? 'Acesso da clínica' : ctx.name) : 'SYSVETMAX'}</p>
            </div>
          </div>
          {ctx && (
            <form action="/parceiro/sair" method="post">
              <button type="submit" className="text-xs font-medium text-[var(--pt-muted)] hover:text-[var(--pt-primary-dark)] flex items-center gap-1.5 rounded-full border border-[var(--pt-border)] px-3 py-1.5 transition hover:border-[var(--pt-accent-ring)]">
                <LogOut className="h-3.5 w-3.5" />Sair
              </button>
            </form>
          )}
        </div>
      </header>
      {children}
    </div>
  )
}
