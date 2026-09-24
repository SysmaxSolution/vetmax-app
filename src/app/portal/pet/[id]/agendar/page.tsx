import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPortalBookingOptions } from '@/lib/actions/portal-booking'
import PortalBookingForm from '@/components/portal/PortalBookingForm'
import { ChevronLeft, CalendarClock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PortalBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await getPortalBookingOptions(id)

  if ('error' in res) {
    if (res.error === 'auth') {
      return <div className="px-5 sm:px-8 lg:px-12 py-16 text-center text-[var(--pt-muted)]">Sua sessão expirou. Acesse novamente pelo link do WhatsApp.</div>
    }
    notFound()
  }

  return (
    <div className="w-full px-5 sm:px-8 lg:px-12 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href={`/portal/pet/${id}`} className="inline-flex items-center gap-1 text-sm text-[var(--pt-muted)] hover:text-[var(--pt-primary-dark)]">
          <ChevronLeft className="h-4 w-4" />Voltar ao pet
        </Link>

        {res.mode === 'off' ? (
          <div className="bg-white rounded-2xl border border-[var(--pt-border)] p-12 text-center">
            <CalendarClock className="h-10 w-10 text-[var(--pt-border)] mx-auto mb-3" />
            <p className="text-[var(--pt-text)] font-medium">Agendamento online indisponível</p>
            <p className="text-sm text-[var(--pt-muted-soft)] mt-1">Esta clínica ainda não habilitou o agendamento pelo portal. Fale com a recepção.</p>
          </div>
        ) : (
          <PortalBookingForm
            petId={id}
            petName={res.petName}
            mode={res.mode}
            vets={res.vets}
            suggestedVetId={res.suggestedVetId}
            services={res.services}
          />
        )}
      </div>
    </div>
  )
}
