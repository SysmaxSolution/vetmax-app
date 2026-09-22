import { Fraunces } from 'next/font/google'
import { getPartnerContext } from '@/lib/portal/partner-session'
import { Stethoscope, LogOut } from 'lucide-react'

const fraunces = Fraunces({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-fraunces-p' })

export const metadata = { title: 'Portal do Veterinário | SysVetMax' }

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getPartnerContext()
  return (
    <div className={`${fraunces.variable} min-h-screen bg-[#F6F5F1] text-[#16221C] antialiased`}>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#EDE9E0] print:hidden">
        <div className="w-full px-5 sm:px-8 lg:px-12 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-10 w-10 rounded-full ring-1 ring-[#C9A96A]/50 bg-[#0E3B2E] flex items-center justify-center flex-shrink-0">
              <Stethoscope className="h-5 w-5 text-[#C9A96A]" />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-tight truncate" style={{ fontFamily: 'var(--font-fraunces-p), serif' }}>Portal do Veterinário</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#6A7A72]">{ctx ? (ctx.kind === 'admin' ? 'Acesso da clínica' : ctx.name) : 'SYSVETMAX'}</p>
            </div>
          </div>
          {ctx && (
            <form action="/parceiro/sair" method="post">
              <button type="submit" className="text-xs font-medium text-[#6A7A72] hover:text-[#0E3B2E] flex items-center gap-1.5 rounded-full border border-[#EDE9E0] px-3 py-1.5 transition hover:border-[#C9A96A]/60">
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
