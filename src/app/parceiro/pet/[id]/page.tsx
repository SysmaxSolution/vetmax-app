import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPartnerPetImaging } from '@/lib/actions/partner-portal'
import { ChevronLeft, FileImage, ArrowUpRight, Clock } from 'lucide-react'

export const dynamic = 'force-dynamic'
const serif = { fontFamily: 'var(--font-fraunces-p), serif' }

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('pt-BR')
}

export default async function PartnerPetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await getPartnerPetImaging(id)
  if ('error' in res) {
    if (res.error === 'auth') return <div className="px-5 sm:px-8 lg:px-12 py-16 text-center text-[#6A7A72]">Sua sessão expirou. Acesse novamente com o código.</div>
    notFound()
  }

  return (
    <div className="w-full px-5 sm:px-8 lg:px-12 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link href="/parceiro" className="inline-flex items-center gap-1 text-sm text-[#6A7A72] hover:text-[#0E3B2E]">
          <ChevronLeft className="h-4 w-4" />Pacientes
        </Link>
        <h1 className="text-2xl text-[#16221C]" style={serif}>{res.petName}</h1>

        <div className="bg-white rounded-2xl border border-[#EDE9E0] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#F0ECE3] flex items-center gap-2.5">
            <FileImage className="h-4 w-4 text-[#17624A]" />
            <h2 className="text-[15px] text-[#16221C]" style={serif}>Exames de imagem</h2>
            <span className="text-xs text-[#B3BDB6]">({res.imaging.length})</span>
          </div>
          {res.imaging.length === 0 ? (
            <p className="px-6 py-8 text-sm text-[#B3BDB6] text-center">Nenhum exame de imagem.</p>
          ) : (
            <div className="divide-y divide-[#F0ECE3]">
              {res.imaging.map(s => (
                <div key={s.id} className="px-6 py-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[#16221C]">{s.title || s.modality || 'Exame de imagem'}</p>
                    <p className="text-xs text-[#9AA69F] flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(s.createdAt)}{s.laudoAvailable ? ' · laudo disponível' : ' · imagens (pré-laudo)'}</p>
                  </div>
                  {s.link && (
                    <a href={s.link} target="_blank" rel="noopener noreferrer"
                       className="text-xs font-semibold text-[#17624A] flex items-center gap-1 rounded-full border border-[#EDE9E0] px-3 py-1.5 hover:border-[#C9A96A]/60 whitespace-nowrap">
                      Abrir <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
