// Home do Portal do Tutor DENTRO de uma clínica: só os pets daquela clínica,
// com a identidade visual daquela clínica.
//
// Antes esta tela vivia em `/portal` e misturava os pets de todas as clínicas.
// Um tutor atendido na A e na B via uma lista só, sob a marca genérica.

import Link from 'next/link'
import { getPortalPets } from '@/lib/actions/portal-data'
import { getTutorPendingExamDecisions } from '@/lib/actions/exam-rejection-portal'
import { PawPrint, ArrowRight, ShieldCheck } from 'lucide-react'
import ExamDecisionCard from '@/components/portal/ExamDecisionCard'
import { resolvePortalContext } from '@/lib/portal/clinic-context-server'

export const dynamic = 'force-dynamic'

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐕', cat: '🐈', bird: '🐦', rabbit: '🐰', rodent: '🐭', reptile: '🦎', fish: '🐟', exotic: '🐾',
}
const heading = { fontFamily: 'var(--pt-heading-font)' }

export default async function PortalClinicHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const res = await resolvePortalContext(slug)

  if (!res.ok) {
    // Mensagem ÚNICA para "não existe" e "não é sua": a URL não serve de oráculo.
    const msg = res.reason === 'auth'
      ? 'Sua sessão expirou. Acesse novamente pelo link enviado no WhatsApp.'
      : res.reason === 'disabled'
        ? 'A clínica em que você tem cadastro ainda não disponibilizou a Área do Tutor.'
        : 'Esta área não está disponível para o seu acesso.'
    return (
      <div className="px-5 sm:px-8 lg:px-12 py-16 flex justify-center">
        <div className="max-w-md w-full bg-[var(--pt-surface)] rounded-2xl border border-[var(--pt-border)] p-10 text-center">
          <ShieldCheck className="h-10 w-10 text-[var(--pt-accent)] mx-auto mb-4" />
          <h1 className="text-xl text-[var(--pt-text)]" style={heading}>Área do Tutor</h1>
          <p className="mt-3 text-sm text-[var(--pt-muted)] leading-relaxed">{msg}</p>
          <Link href="/portal" className="mt-6 inline-block text-xs font-medium text-[var(--pt-muted)] hover:text-[var(--pt-primary-dark)] rounded-full border border-[var(--pt-border)] px-4 py-2 transition">
            Voltar
          </Link>
        </div>
      </div>
    )
  }

  const [petsResult, pendingDecisions] = await Promise.all([
    getPortalPets(res.clinicId),
    getTutorPendingExamDecisions(),
  ])
  const pets = Array.isArray(petsResult) ? petsResult : []
  const first = res.tutor.fullName ? res.tutor.fullName.split(' ')[0] : null
  const cover = res.brand.theme.coverImageUrl

  return (
    <div>
      {/* Herói full-width — cores e capa vêm do tema da clínica */}
      <section className="relative overflow-hidden"
               style={{ background: `linear-gradient(135deg, var(--pt-primary-dark), var(--pt-primary-mid) 55%, var(--pt-primary))` }}>
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-25" />
        )}
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        <div className="relative w-full px-5 sm:px-8 lg:px-12 py-14 sm:py-20">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--pt-accent)]">
            {res.brand.theme.tagline ?? 'Portal do Tutor'}
          </p>
          <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl leading-[1.05] text-[var(--pt-on-primary)]" style={heading}>
            {first ? <>Olá, {first}.</> : 'Bem-vindo.'}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--pt-on-primary)]/70">
            Acompanhe com tranquilidade os exames, laudos, vacinas e o histórico de saúde dos seus pets
            {res.brand.clinicName ? <> na <span className="font-medium">{res.brand.clinicName}</span></> : null} — sempre
            atualizados pela equipe veterinária.
          </p>
        </div>
      </section>

      {pendingDecisions.length > 0 && (
        <section className="w-full px-5 sm:px-8 lg:px-12 pt-10">
          <ExamDecisionCard items={pendingDecisions} audience="tutor" />
        </section>
      )}

      <section className="w-full px-5 sm:px-8 lg:px-12 py-10 sm:py-12">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-xl text-[var(--pt-text)]" style={heading}>Meus pets</h2>
          <span className="text-xs text-[var(--pt-muted-soft)]">{pets.length} {pets.length === 1 ? 'pet' : 'pets'}</span>
        </div>

        {pets.length === 0 ? (
          <div className="bg-[var(--pt-surface)] rounded-2xl border border-[var(--pt-border)] p-16 text-center">
            <PawPrint className="h-12 w-12 text-[var(--pt-border)] mx-auto mb-3" />
            <p className="text-sm text-[var(--pt-muted-soft)]">Nenhum pet vinculado ao seu acesso nesta clínica.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {pets.map(pet => (
              <Link key={pet.id} href={`/portal/pet/${pet.id}`}
                    className="group relative bg-[var(--pt-surface)] rounded-2xl border border-[var(--pt-border)] p-6 transition hover:shadow-[0_12px_40px_-16px_rgba(16,34,28,0.25)] hover:border-[var(--pt-accent-soft)]">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full ring-1 ring-[var(--pt-accent-line)] bg-[var(--pt-tint)] flex items-center justify-center text-4xl overflow-hidden flex-shrink-0">
                    {pet.photoUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={pet.photoUrl} alt={pet.name} className="w-full h-full object-cover" />
                      : (SPECIES_EMOJI[pet.species ?? ''] ?? '🐾')}
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg text-[var(--pt-text)] truncate" style={heading}>{pet.name}</p>
                    <p className="text-xs text-[var(--pt-muted-soft)] truncate">{pet.clinicName}</p>
                  </div>
                </div>
                <div className="mt-5 pt-4 border-t border-[var(--pt-border-soft)] flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--pt-primary)]">Ver histórico</span>
                  <ArrowRight className="h-4 w-4 text-[var(--pt-accent)] group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}

        <p className="mt-8 text-[11px] text-[var(--pt-muted-soft)] flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-[var(--pt-primary)]" />
          Acesso pessoal e seguro. As informações clínicas exibidas são liberadas pelo médico-veterinário responsável.
        </p>
      </section>
    </div>
  )
}
