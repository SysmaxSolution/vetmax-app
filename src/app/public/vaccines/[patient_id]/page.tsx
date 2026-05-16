import { notFound } from 'next/navigation'
import { getPublicPatientVaccines } from '@/lib/actions/public-data'
import { Syringe, Phone, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { patient_id: string } }) {
  return {
    title: 'Carteira de Vacinação',
    description: 'Histórico de vacinação atualizado',
  }
}

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐕', cat: '🐈', bird: '🐦', rabbit: '🐰',
  rodent: '🐭', reptile: '🦎', fish: '🐟', exotic: '🐾',
}

export default async function PublicVaccinesPage({ params }: { params: { patient_id: string } }) {
  const result = await getPublicPatientVaccines(params.patient_id)

  if ('error' in result) notFound()

  const { petName, petSpecies, clinicName, clinicPhone, clinicLogo, vaccines, nextDue } = result
  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white">

      {/* Header da Clínica */}
      <header className="bg-white shadow-sm border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          {clinicLogo ? (
            <img src={clinicLogo} alt={clinicName} className="h-8 w-auto object-contain" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center">
              <Syringe className="h-4 w-4 text-white" />
            </div>
          )}
          <div>
            <p className="text-sm font-bold text-slate-900 leading-tight">{clinicName}</p>
            {clinicPhone && (
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {clinicPhone}
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Card do Pet */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 text-center">
          <div className="text-5xl mb-3">{SPECIES_EMOJI[petSpecies] ?? '🐾'}</div>
          <h1 className="text-2xl font-bold text-slate-900">{petName}</h1>
          <p className="text-sm text-slate-500 mt-1">Carteira de Vacinação Digital</p>
        </div>

        {/* Próxima dose */}
        {nextDue && (
          <div className="bg-teal-600 text-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-teal-200 mb-0.5">
                  Próxima Dose
                </p>
                <p className="text-lg font-bold">{nextDue.vaccine}</p>
                <p className="text-sm text-teal-100">
                  {new Date(nextDue.date + 'T12:00:00').toLocaleDateString('pt-BR', {
                    day: 'numeric', month: 'long', year: 'numeric'
                  })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Lista de vacinas */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <Syringe className="h-4 w-4 text-slate-400" />
              Histórico de Vacinação
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{vaccines.length} vacina{vaccines.length !== 1 ? 's' : ''} registrada{vaccines.length !== 1 ? 's' : ''}</p>
          </div>

          {vaccines.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Syringe className="h-10 w-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Nenhuma vacina registrada ainda</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {vaccines.map(v => {
                const isOverdue = v.next_due_date && v.next_due_date < today
                const isUpcoming = v.next_due_date && v.next_due_date >= today

                return (
                  <div key={v.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 text-sm">{v.vaccine_name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Aplicada em {new Date(v.date_administered + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </p>
                        {v.notes && (
                          <p className="text-xs text-slate-400 mt-0.5 italic">{v.notes}</p>
                        )}
                      </div>

                      {isOverdue ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-1 flex-shrink-0">
                          <AlertTriangle className="h-3 w-3" />
                          Atrasado
                        </span>
                      ) : isUpcoming ? (
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Em dia
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Próxima: {new Date(v.next_due_date! + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="text-center text-xs text-slate-400 pb-4">
          <p>Gerado por <strong>{clinicName}</strong></p>
          <p className="mt-0.5">VetMax — Sistema de Gestão Veterinária</p>
        </div>
      </main>
    </div>
  )
}
