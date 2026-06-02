import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getPatientById } from '@/lib/actions/timeline'
import { getPatientVaccines } from '@/lib/actions/vaccines'
import { getPetlovePriceHistoryForPet } from '@/lib/actions/petlove-import'
import { patientHasInsurance, getPetlovePatientHistory } from '@/lib/actions/patient-custom-prices'
import { getInsuranceCard } from '@/lib/actions/insurance-coverage'
import { getPatientChatHistory } from '@/lib/actions/internal-chat'
import PetlovePriceHistory from '@/components/pet/PetlovePriceHistory'
import PetlovePatientHistory from '@/components/pet/PetlovePatientHistory'
import InsuranceCard from '@/components/pet/InsuranceCard'
import GlosaHistoryHint from '@/components/financial/insurance/GlosaHistoryHint'
import Link from 'next/link'
import {
  ArrowLeft, PawPrint, User, Syringe, Calendar,
  Phone, MapPin, Heart, AlertTriangle, CheckCircle2,
  Info, MessageSquare, ChevronDown, ChevronRight,
} from 'lucide-react'

const SPECIES_LABELS: Record<string, string> = {
  dog: 'Cão', cat: 'Gato', bird: 'Ave', rabbit: 'Coelho',
  rodent: 'Roedor', reptile: 'Réptil', fish: 'Peixe', exotic: 'Silvestre/Exótico',
}

export async function generateMetadata(_: { params: Promise<{ id: string }> }) {
  return { title: 'Perfil do Paciente' }
}

export default async function PatientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [patientResult, vaccinesResult, petloveResult, insuranceResult, historyResult, insuranceCardResult, chatHistoryResult] = await Promise.all([
    getPatientById(id),
    getPatientVaccines(id),
    getPetlovePriceHistoryForPet(id),
    patientHasInsurance(id),
    getPetlovePatientHistory(id),
    getInsuranceCard(id),
    getPatientChatHistory(id),
  ])

  if ('error' in patientResult) notFound()

  const patient  = patientResult
  const vaccines = Array.isArray(vaccinesResult) ? vaccinesResult : []
  const petlovePrices = Array.isArray(petloveResult) ? petloveResult : []
  const insurance = 'error' in insuranceResult ? null : insuranceResult
  const insuranceCard = 'error' in insuranceCardResult ? null : insuranceCardResult
  const petloveHistory = Array.isArray(historyResult) ? historyResult : []
  const chatHistory    = Array.isArray(chatHistoryResult) ? chatHistoryResult : []
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

        {/* Banner Cadastro Rápido (criado via importação Petlove) */}
        {patient.created_from === 'petlove_import' && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-amber-900">Cadastro rápido via Petlove</p>
              <p className="text-sm text-amber-800 mt-0.5">
                Este pet foi cadastrado em massa a partir da planilha. <strong>A planilha Petlove não traz alguns campos:</strong>
              </p>
              <ul className="text-xs text-amber-700 mt-1.5 ml-4 list-disc space-y-0.5">
                {!patient.gender || patient.gender === 'unknown' ? <li>Sexo (macho/fêmea)</li> : null}
                {!patient.birth_date ? <li>Data de nascimento</li> : null}
                <li>Peso, alergias, doenças crônicas e foto</li>
                {patient.tutor?.phone === '(não informado)' ? <li>Telefone e CPF do tutor (placeholder gerado)</li> : null}
              </ul>
              <p className="text-xs text-amber-700 mt-1.5">
                Complete na próxima visita do tutor à clínica.
              </p>
            </div>
          </div>
        )}

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

        {/* Card de Convênio — resumo do plano + carência por categoria */}
        {insuranceCard?.has_insurance && (
          <>
            <InsuranceCard data={insuranceCard} />
            <GlosaHistoryHint limit={5} />
          </>
        )}

        {/* Aba/Seção Preços do Convênio — só aparece se o pet tem vínculo ativo */}
        {insurance?.has_insurance && (
          <PetlovePriceHistory items={petlovePrices} />
        )}

        {/* Histórico Petlove — eventos de conciliação (cadastro, plano, preço, título) */}
        <PetlovePatientHistory events={petloveHistory} />

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

        {/* Histórico de Comunicações por Atendimento */}
        {chatHistory.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
                <MessageSquare className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Comunicações por Atendimento</h2>
                <p className="text-xs text-slate-500">Mensagens trocadas pela equipe durante os atendimentos</p>
              </div>
              <span className="ml-auto rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">
                {chatHistory.length} atendimento{chatHistory.length > 1 ? 's' : ''}
              </span>
            </div>

            <div className="divide-y divide-slate-50">
              {chatHistory.map((thread) => {
                const VISIT_LABELS: Record<string, string> = {
                  consultation: 'Consulta', follow_up: 'Retorno', emergency: 'Emergência',
                  vaccination: 'Vacinação', exam: 'Exame', surgery: 'Cirurgia',
                }
                return (
                  <details key={thread.chat_id} className="group">
                    <summary className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-slate-50 transition-colors list-none">
                      <ChevronRight className="h-4 w-4 text-slate-400 group-open:rotate-90 transition-transform flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800">
                          {VISIT_LABELS[thread.visit_reason] ?? thread.visit_reason}
                        </p>
                        <p className="text-xs text-slate-400">
                          {new Date(thread.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {' · '}{thread.messages.length} mensagem{thread.messages.length > 1 ? 'ns' : ''}
                        </p>
                      </div>
                      <span className="flex-shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-600">
                        {thread.messages.length}
                      </span>
                    </summary>

                    <div className="px-5 pb-4 space-y-2 bg-slate-50/50">
                      {thread.messages.map(msg => (
                        <div key={msg.id} className="flex gap-2.5">
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700 mt-0.5">
                            {(msg.sender_name ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-slate-600">
                              {msg.sender_name ?? 'Sistema'}
                              <span className="ml-1.5 font-normal text-slate-400">
                                {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </p>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">
                              {msg.kind === 'attachment' ? `📎 ${msg.body}` : msg.body}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )
              })}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
