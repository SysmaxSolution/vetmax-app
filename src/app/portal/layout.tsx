import { Fraunces } from 'next/font/google'
import { getTutorContext } from '@/lib/portal/session'
import { getPortalBranding } from '@/lib/actions/portal-data'
import { PawPrint, LogOut } from 'lucide-react'

const fraunces = Fraunces({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-fraunces' })

export const metadata = { title: 'Área do Tutor | SysVetMax' }

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getTutorContext()
  const brand = ctx ? await getPortalBranding() : { clinicName: null, clinicLogo: null }
  const clinicName = brand.clinicName ?? 'Área do Tutor'

  return (
    <div className={`${fraunces.variable} min-h-screen bg-[#F6F5F1] text-[#16221C] antialiased`}>
      {/* Barra superior — full-width, branca, hairline dourada */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#EDE9E0] print:hidden">
        <div className="w-full px-5 sm:px-8 lg:px-12 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-10 w-10 rounded-full ring-1 ring-[#C9A96A]/50 bg-[#0E3B2E] flex items-center justify-center overflow-hidden flex-shrink-0">
              {brand.clinicLogo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={brand.clinicLogo} alt={clinicName} className="h-full w-full object-cover" />
                : <PawPrint className="h-5 w-5 text-[#C9A96A]" />}
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-tight truncate" style={{ fontFamily: 'var(--font-fraunces), serif' }}>{clinicName}</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#6A7A72]">{brand.clinicName ? 'Portal do Tutor' : 'SYSVETMAX'}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {ctx?.fullName && <span className="hidden sm:block text-sm text-[#6A7A72]">Olá, <span className="text-[#16221C] font-medium">{ctx.fullName.split(' ')[0]}</span></span>}
            {ctx && (
              <form action="/portal/sair" method="post">
                <button type="submit" className="text-xs font-medium text-[#6A7A72] hover:text-[#0E3B2E] flex items-center gap-1.5 rounded-full border border-[#EDE9E0] px-3 py-1.5 transition hover:border-[#C9A96A]/60">
                  <LogOut className="h-3.5 w-3.5" />Sair
                </button>
              </form>
            )}
          </div>
        </div>
      </header>

      {children}

      <footer className="border-t border-[#EDE9E0] mt-4 print:hidden">
        <div className="w-full px-5 sm:px-8 lg:px-12 py-6 flex items-center justify-between text-[11px] text-[#9AA69F]">
          <span>{brand.clinicName ?? 'SYSVETMAX'}</span>
          <span>Powered by <span className="font-semibold text-[#6A7A72]">SYSVETMAX</span></span>
        </div>
      </footer>
    </div>
  )
}
