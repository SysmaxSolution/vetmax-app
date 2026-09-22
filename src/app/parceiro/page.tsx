import Link from 'next/link'
import { getPartnerContext } from '@/lib/portal/partner-session'
import { getPartnerReferredPets } from '@/lib/actions/partner-portal'
import PartnerLoginForm from '@/components/portal/PartnerLoginForm'
import { PawPrint, ArrowRight, FileImage, ShieldCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐕', cat: '🐈', bird: '🐦', rabbit: '🐰', rodent: '🐭', reptile: '🦎', fish: '🐟', exotic: '🐾',
}
const serif = { fontFamily: 'var(--font-fraunces-p), serif' }

export default async function PartnerHome() {
  const ctx = await getPartnerContext()

  if (!ctx) {
    return (
      <div className="px-5 sm:px-8 lg:px-12 py-16 flex justify-center">
        <div className="max-w-md w-full"><PartnerLoginForm /></div>
      </div>
    )
  }

  const petsResult = await getPartnerReferredPets()
  const pets = Array.isArray(petsResult) ? petsResult : []

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0E3B2E] via-[#134A38] to-[#17624A]">
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        <div className="relative w-full px-5 sm:px-8 lg:px-12 py-12 sm:py-16">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[#C9A96A]">Pets encaminhados</p>
          <h1 className="mt-3 text-3xl sm:text-4xl text-white leading-[1.05]" style={serif}>{ctx.name}</h1>
          <p className="mt-3 max-w-xl text-[15px] text-white/70">
            {ctx.kind === 'admin' ? 'Todos os pets encaminhados pela sua clínica.' : 'Os pets que você encaminhou.'} Acompanhe imagens e laudos assim que ficam prontos.
          </p>
        </div>
      </section>

      <section className="w-full px-5 sm:px-8 lg:px-12 py-10">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-xl text-[#16221C]" style={serif}>Pacientes</h2>
          <span className="text-xs text-[#9AA69F]">{pets.length} {pets.length === 1 ? 'pet' : 'pets'}</span>
        </div>

        {pets.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#EDE9E0] p-16 text-center">
            <PawPrint className="h-12 w-12 text-[#E5E0D5] mx-auto mb-3" />
            <p className="text-sm text-[#9AA69F]">Nenhum pet encaminhado encontrado ainda.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pets.map(pet => (
              <Link key={pet.id} href={`/parceiro/pet/${pet.id}`}
                    className="group bg-white rounded-2xl border border-[#EDE9E0] p-6 transition hover:shadow-[0_12px_40px_-16px_rgba(14,59,46,0.25)] hover:border-[#C9A96A]/50">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full ring-1 ring-[#C9A96A]/40 bg-[#F2EFE8] flex items-center justify-center text-3xl flex-shrink-0">
                    {SPECIES_EMOJI[pet.species ?? ''] ?? '🐾'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg text-[#16221C] truncate" style={serif}>{pet.name}</p>
                    <p className="text-xs text-[#9AA69F] truncate">{pet.tutorName ? `Tutor: ${pet.tutorName}` : '—'}</p>
                  </div>
                </div>
                <div className="mt-5 pt-4 border-t border-[#F0ECE3] flex items-center justify-between">
                  <span className="text-xs font-medium text-[#17624A] flex items-center gap-1.5"><FileImage className="h-3.5 w-3.5" />{pet.imagingCount} exame(s)</span>
                  <ArrowRight className="h-4 w-4 text-[#C9A96A] group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}

        <p className="mt-8 text-[11px] text-[#9AA69F] flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-[#17624A]" />
          Acesso restrito ao veterinário solicitante. Conteúdo sigiloso, sob responsabilidade do centro de diagnóstico.
        </p>
      </section>
    </div>
  )
}
