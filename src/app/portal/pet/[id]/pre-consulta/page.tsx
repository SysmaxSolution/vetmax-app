import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPortalPetDetail } from '@/lib/actions/portal-data'
import PreconsultForm from '@/components/portal/PreconsultForm'
import { ChevronLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PreconsultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await getPortalPetDetail(id)

  if ('error' in res) {
    if (res.error === 'auth') {
      return <div className="px-5 sm:px-8 lg:px-12 py-16 text-center text-[#6A7A72]">Sua sessão expirou. Acesse novamente pelo link do WhatsApp.</div>
    }
    notFound()
  }

  return (
    <div className="w-full px-5 sm:px-8 lg:px-12 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link href={`/portal/pet/${id}`} className="inline-flex items-center gap-1 text-sm text-[#6A7A72] hover:text-[#0E3B2E]">
          <ChevronLeft className="h-4 w-4" />Voltar ao pet
        </Link>
        <PreconsultForm petId={id} petName={res.name} />
      </div>
    </div>
  )
}
