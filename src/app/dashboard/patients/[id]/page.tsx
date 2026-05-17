import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getPatientById } from '@/lib/actions/timeline'
import { getPatientVaccines } from '@/lib/actions/vaccines'
import { getPetlovePriceHistoryForPet } from '@/lib/actions/petlove-import'
import PetlovePriceHistory from '@/components/pet/PetlovePriceHistory'
import Link from 'next/link'
import {
  ArrowLeft, PawPrint, User, Syringe, Calendar,
  Phone, MapPin, Heart, AlertTriangle, CheckCircle2
} from 'lucide-react'

const SPECIES_LABELS: Record<string, string> = {
  dog: 'Cão', cat: 'Gato', bird: 'Ave', rabbit: 'Coelho',
  rodent: 'Roedor', reptile: 'Réptil', fish: 'Peixe', exotic: 'Silvestre/Exótico',
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: 'Perfil do Paciente' }
}

export default async function PatientProfilePage({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [patientResult, vaccinesResult, petloveResult] = await Promise.all([
    getPatientById(params.id),
    getPatientVaccines(params.id),
    getPetlovePriceHistoryForPet(params.id),
  ])

  if ('error' in patientResult) notFound()

  const patient  = patientResult
  const vaccines = Array.isArray(vaccinesResult) ? vaccinesResult : []
  const petlovePrices = Array.isArray(petloveResult) ? petloveResult : []
  const today    = new Date().toISOString().split('T')[0]

  const overdue  = vaccines.filter(v => v.next_due_date && v.next_due_date < today)
  const upcoming = vaccines.filter(v => v.next_due_date && v.next_due_date >= today)
    .sort((a, b) => a.next_due_date!.localeCompare(b.next_due_date!))

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* Voltar */}
        <Link
          href="/dashboard/patients"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Lista de Pacientes
        </Link>

        {/* Header do Paciente */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex items-start gap-5">
          {patient.photo_url ? (
            <img
              src={patient.photo_url}
              alt={patient.name}
              className="w-20 h-20 rounded-2xl object-cover border-2 border-slate-200 flex-shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-blue-50 border-2 border-blue-100 flex items-center justify-center flex-shrink-0">
              <PawPrint className="h-10 w-10 text-blue-300" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">{patient.name}</h1>
            <p className="text-slate-500 mt-0.5">
              {SPECIES_LABELS[patient.species] ?? patient.species}
              {patient.breed && ` · ${patient.breed}`}
              {patient.gender === 'male' ? ' · Macho' : patient.gender === 'female' ? ' · Fêmea' : ''}
              {patient.neutered ? ' · Castrado' : ''}
            </p>

            {/* Alertas de saúde */}
            {(patient.allergies || patient.chronic_diseases) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {patient.allergies && (
                  <span className="inline-flex items-center gap-1 text-xs bg-red-50 border border-red-200 text-red-700 rounded-full px-2 py-0.5">
                    <AlertTriangle className="h-3 w-3" />
                    Alergia: {patient.allergies}
                  </span>
                )}
                {patient.chronic_diseases && (
                  <span className="inline-flex items-center gap-1 text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-2 py-0.5">
                    <Heart className="h-3 w-3" />
                    {patient.chronic_diseases}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Grid: Tutor + Vacinas */}
        <div className="grid gap-4 md:grid-cols-2">

          {/* Tutor */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-3">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <User className="h-4 w-4 text-slate-400" />
              Tutor
            </h2>
            <p className="font-medium text-slate-900">{patient.tutor?.name ?? '—'}</p>
            {patient.tutor?.phone && (
              <p className="flex items-center gap-1.5 text-sm text-slate-500">
                <Phone className="h-3.5 w-3.5" /> {patient.tutor.phone}
              </p>
            )}
            {patient.tutor?.address && (
              <p className="flex items-center gap-1.5 text-sm text-slate-500">
                <MapPin className="h-3.5 w-3.5" /> {patient.tutor.address}
              </p>
            )}
          </div>

          {/* Próxima Vacina */}
          {upcoming.length > 0 ? (
            <div className="bg-green-50 rounded-2xl border border-green-200 p-5 space-y-2">
              <h2 className="font-semibold text-green-800 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Próxima Dose
              </h2>
              <p className="font-bold text-green-900 text-lg">{upcoming[0].vaccine_name}</p>
              <p className="text-sm text-green-700">
                {new Date(upcoming[0].next_due_date! + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              {overdue.length > 0 && (
                <p className="text-xs text-red-600 mt-1 font-medium">
                  ⚠ {overdue.length} vacina{overdue.length > 1 ? 's' : ''} em atraso
                </p>
              )}
            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-5 flex items-center justify-center text-center">
              <div>
                <Syringe className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Sem doses agendadas</p>
              </div>
            </div>
          )}
        </div>

        {/* Tabela de Preços Históricos Petlove */}
        <PetlovePriceHistory items={petlovePrices} />

        {/* Histórico de Vacinas */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <Syringe className="h-4 w-4 text-slate-400" />
              Histórico de Vacinação
            </h2>
            <span className="text-xs text-slate-400">{vaccines.length} registro{vaccines.length !== 1 ? 's' : ''}</span>
          </div>

          {vaccines.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Syringe className="h-8 w-8 text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Nenhuma vacina registrada</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {vaccines.map(v => {
                const isOverdue = v.next_due_date && v.next_due_date < today
                return (
                  <div key={v.id} className="px-5 py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{v.vaccine_name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Aplicada em: {new Date(v.date_administered + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    {v.next_due_date && (
                      <div className="text-right flex-shrink-0">
                        <p className={`text-xs font-medium ${isOverdue ? 'text-red-600' : 'text-green-600'}`}>
                          {isOverdue ? '⚠ Atrasado' : 'Próxima dose'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(v.next_due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
