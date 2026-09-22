import Link from 'next/link'
import { getTutorContext } from '@/lib/portal/session'
import { getPortalPets } from '@/lib/actions/portal-data'
import { PawPrint, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react'
import PortalLoginForm from '@/components/portal/PortalLoginForm'

export const dynamic = 'force-dynamic'

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐕', cat: '🐈', bird: '🐦', rabbit: '🐰', rodent: '🐭', reptile: '🦎', fish: '🐟', exotic: '🐾',
}
const serif = { fontFamily: 'var(--font-fraunces), serif' }

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams
  const ctx = await getTutorContext()

  if (!ctx) {
    return (
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
    )
  }

  const petsResult = await getPortalPets()
  const pets = Array.isArray(petsResult) ? petsResult : []
  const first = ctx.fullName ? ctx.fullName.split(' ')[0] : null

  return (
    <div>
      {/* Hero full-width */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0E3B2E] via-[#134A38] to-[#17624A]">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        <div className="relative w-full px-5 sm:px-8 lg:px-12 py-14 sm:py-20">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#C9A96A]">Portal do Tutor</p>
          <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl text-white leading-[1.05]" style={serif}>
            {first ? <>Olá, {first}.</> : 'Bem-vindo.'}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] text-white/70 leading-relaxed">
            Acompanhe com tranquilidade os exames, laudos, vacinas e o histórico de saúde dos seus pets — sempre atualizados pela equipe veterinária.
          </p>
        </div>
      </section>

      {/* Pets — full-width */}
      <section className="w-full px-5 sm:px-8 lg:px-12 py-10 sm:py-12">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-xl text-[#16221C]" style={serif}>Meus pets</h2>
          <span className="text-xs text-[#9AA69F]">{pets.length} {pets.length === 1 ? 'pet' : 'pets'}</span>
        </div>

        {pets.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#EDE9E0] p-16 text-center">
            <PawPrint className="h-12 w-12 text-[#E5E0D5] mx-auto mb-3" />
            <p className="text-sm text-[#9AA69F]">Nenhum pet vinculado ao seu acesso ainda.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pets.map(pet => (
              <Link key={pet.id} href={`/portal/pet/${pet.id}`}
                    className="group relative bg-white rounded-2xl border border-[#EDE9E0] p-6 transition hover:shadow-[0_12px_40px_-16px_rgba(14,59,46,0.25)] hover:border-[#C9A96A]/50">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full ring-1 ring-[#C9A96A]/40 bg-[#F2EFE8] flex items-center justify-center text-4xl overflow-hidden flex-shrink-0">
                    {pet.photoUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={pet.photoUrl} alt={pet.name} className="w-full h-full object-cover" />
                      : (SPECIES_EMOJI[pet.species ?? ''] ?? '🐾')}
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg text-[#16221C] truncate" style={serif}>{pet.name}</p>
                    <p className="text-xs text-[#9AA69F] truncate">{pet.clinicName}</p>
                  </div>
                </div>
                <div className="mt-5 pt-4 border-t border-[#F0ECE3] flex items-center justify-between">
                  <span className="text-xs font-medium text-[#17624A]">Ver histórico</span>
                  <ArrowRight className="h-4 w-4 text-[#C9A96A] group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}

        <p className="mt-8 text-[11px] text-[#9AA69F] flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-[#17624A]" />
          Acesso pessoal e seguro. As informações clínicas exibidas são liberadas pelo médico-veterinário responsável.
        </p>
      </section>
    </div>
  )
}
