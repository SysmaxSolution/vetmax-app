'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Clock, CheckCircle2, ChevronRight, Stethoscope, History, Pencil, Plus, ArrowRight } from 'lucide-react'
import type { TriageQueueItem, TriageHistoryItem } from '@/lib/actions/triage'
import { addToTriageQueue, forwardTriageRecord } from '@/lib/actions/triage'
import { searchPatientsForTriage, type TriagePatientSearchResult } from '@/lib/actions/triage'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { BehaviorTagsBadges } from '@/components/ui/BehaviorTagsBadges'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VISIT_REASON_LABELS: Record<string, string> = {
  consultation: 'Consulta', follow_up: 'Retorno', emergency: 'Emergência',
  vaccination: 'Vacinação', exam: 'Exame', surgery: 'Cirurgia', grooming: 'Banho e Tosa',
}

const STATUS_BADGE: Record<string, string> = {
  in_progress:  'bg-indigo-100 text-indigo-700',
  waiting_exam: 'bg-orange-100 text-orange-700',
  medication:   'bg-pink-100 text-pink-700',
  completed:    'bg-green-100 text-green-700',
}

const STATUS_LABEL: Record<string, string> = {
  in_progress:  'Em Consulta com MV',
  waiting_exam: 'Aguardando Exame',
  medication:   'Em Medicação',
  completed:    'Concluída',
}

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐕', cat: '🐱', bird: '🐦', rabbit: '🐰',
  rodent: '🐭', reptile: '🦎', fish: '🐠', exotic: '✨',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface NurseWorkspaceProps {
  queue:    TriageQueueItem[]
  history:  TriageHistoryItem[]
  clinicId: string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NurseWorkspace({ queue, history, clinicId }: NurseWorkspaceProps) {
  useRealtimeSync({ table: 'consultations', clinicId })

  const [tab, setTab] = useState<'fila' | 'historico'>('fila')
  const [showAddModal, setShowAddModal] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [addComplaint, setAddComplaint] = useState('')
  const [addSuccessMsg, setAddSuccessMsg] = useState('')
  const [forwardingId, setForwardingId] = useState<string | null>(null)
  const [patientSearch, setPatientSearch] = useState('')
  const [patientResults, setPatientResults] = useState<TriagePatientSearchResult[]>([])
  const [selectedPatient, setSelectedPatient] = useState<TriagePatientSearchResult | null>(null)
  const [patientSearching, setPatientSearching] = useState(false)

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-4xl px-3 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Triagem Veterinária</h1>
          <p className="mt-0.5 text-sm text-slate-500">Coleta de sinais vitais e avaliação inicial do paciente</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
          <button
            type="button"
            onClick={() => setTab('fila')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              tab === 'fila'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Stethoscope className="h-4 w-4" />
            Fila de Espera
            {queue.length > 0 && (
              <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                tab === 'fila' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {queue.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('historico')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              tab === 'historico'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <History className="h-4 w-4" />
            Histórico de Hoje
            {history.length > 0 && (
              <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                tab === 'historico' ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {history.length}
              </span>
            )}
          </button>
        </div>

        {/* ── Fila de Espera ───────────────────────────────────────────────── */}
        {tab === 'fila' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                  <Stethoscope className="h-4 w-4 text-slate-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Fila de Triagem</h2>
                  <p className="text-xs text-slate-500">Animais aguardando avaliação inicial</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                  {queue.length} animal{queue.length !== 1 ? 'is' : ''}
                </span>
                <button
                  type="button"
                  data-mentor-step="triage-add-btn"
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar Paciente
                </button>
              </div>
            </div>

            <div data-mentor-step="nurse-queue" className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
              {queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-600">Fila vazia!</p>
                  <p className="text-xs text-slate-400 mt-1">Nenhum animal aguardando triagem</p>
                </div>
              ) : (
                queue.map((item) => (
                  <div key={item.id} className="relative">
                    <Link
                      href={`/dashboard/triage/${item.id}`}
                      className="block p-5 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-slate-900">{item.patient.name}</h3>
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                              {SPECIES_EMOJI[item.patient.species] ?? '🐾'} {item.patient.species}
                            </span>
                            {item.visit_reason === 'emergency' && (
                              <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                🚨 Emergência
                              </span>
                            )}
                            {item.source === 'triage_record' && (
                              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                                Triagem
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-500">{item.patient.breed || 'Raça desconhecida'}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            Tutor: <span className="font-medium text-slate-600">{item.tutor.name}</span>
                            {item.tutor.phone && ` · ${item.tutor.phone}`}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.patient.allergies && (
                              <span className="flex items-center gap-1 text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full">
                                <AlertCircle className="w-3 h-3" />Alérgico
                              </span>
                            )}
                            {item.patient.chronic_diseases && (
                              <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
                                <AlertCircle className="w-3 h-3" />Doença Crônica
                              </span>
                            )}
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                              {VISIT_REASON_LABELS[item.visit_reason] ?? item.visit_reason}
                            </span>
                            <BehaviorTagsBadges tags={item.patient.behavior_tags} size="xs" />
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0 mt-1" />
                      </div>
                    </Link>
                    {item.source === 'triage_record' && (
                      <div className="px-5 pb-3 flex justify-end">
                        <button
                          type="button"
                          disabled={forwardingId === item.id}
                          onClick={async (e) => {
                            e.preventDefault()
                            setForwardingId(item.id)
                            await forwardTriageRecord(item.id)
                            setForwardingId(null)
                          }}
                          className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          {forwardingId === item.id ? 'Encaminhando...' : 'Encaminhar para Consultório'}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── Histórico de Hoje ─────────────────────────────────────────────── */}
        {tab === 'historico' && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
                  <History className="h-4 w-4 text-teal-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Triagens Realizadas Hoje</h2>
                  <p className="text-xs text-slate-500">Clique em "Editar" para corrigir sinais vitais</p>
                </div>
              </div>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-700">
                {history.length} registro{history.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Clock className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-500">Nenhuma triagem realizada ainda hoje</p>
                </div>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/50 transition-colors">
                    {/* Avatar */}
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg">
                      {SPECIES_EMOJI[item.patient.species] ?? '🐾'}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900">{item.patient.name}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[item.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {STATUS_LABEL[item.status] ?? item.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {item.patient.breed || 'Raça desconhecida'} · Tutor: {item.tutor.name}
                      </p>
                      {item.vital_signs && (
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            {item.vital_signs.weight} kg
                          </span>
                          <span className="text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                            {item.vital_signs.temperature}°C
                          </span>
                          {item.vital_signs.chief_complaint && (
                            <span className="text-xs text-slate-400 italic truncate max-w-[200px]">
                              "{item.vital_signs.chief_complaint}"
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Ação */}
                    <Link
                      href={`/dashboard/triage/${item.id}?edit=true`}
                      className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar Triagem
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </main>

      {/* Modal: Adicionar à Fila de Triagem */}
      {showAddModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Registrar na Fila de Triagem</h2>
            {addSuccessMsg && (
              <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                {addSuccessMsg}
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tutor / Animal</label>
              {selectedPatient ? (
                <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                  <span className="text-sm font-medium text-blue-900">{selectedPatient.name} — {selectedPatient.tutor.name}</span>
                  <button type="button" onClick={() => { setSelectedPatient(null); setPatientSearch(''); setPatientResults([]) }} className="text-xs text-blue-600 hover:underline ml-2">Trocar</button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={async e => {
                      const q = e.target.value
                      setPatientSearch(q)
                      if (q.trim().length < 2) { setPatientResults([]); return }
                      setPatientSearching(true)
                      const res = await searchPatientsForTriage(q.trim())
                      setPatientSearching(false)
                      if (!('error' in res)) setPatientResults(res.slice(0, 5))
                    }}
                    placeholder="Buscar por tutor, CPF ou animal..."
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {patientResults.length > 0 && (
                    <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                      {patientResults.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setSelectedPatient(p); setPatientSearch(''); setPatientResults([]) }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                        >
                          <span className="font-medium">{p.name}</span> <span className="text-slate-500">— {p.tutor.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {patientSearching && <p className="text-xs text-slate-400 mt-1">Buscando...</p>}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Motivo / Queixa Principal
              </label>
              <input
                type="text"
                value={addComplaint}
                onChange={e => setAddComplaint(e.target.value)}
                placeholder="Descreva o motivo da visita..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowAddModal(false); setAddComplaint(''); setAddSuccessMsg(''); setSelectedPatient(null); setPatientSearch(''); setPatientResults([]) }}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={addLoading || !addComplaint.trim()}
                onClick={async () => {
                  setAddLoading(true)
                  const result = await addToTriageQueue({
                    chief_complaint: addComplaint.trim(),
                    patient_id: selectedPatient?.id,
                    tutor_id: selectedPatient?.tutor.id,
                  })
                  setAddLoading(false)
                  if ('error' in result) {
                    setAddSuccessMsg('')
                    alert(result.error)
                  } else {
                    setAddSuccessMsg('Adicionado à fila com sucesso!')
                    setAddComplaint('')
                    setSelectedPatient(null)
                    setPatientSearch('')
                    setPatientResults([])
                    setTimeout(() => { setShowAddModal(false); setAddSuccessMsg('') }, 1500)
                  }
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {addLoading ? 'Registrando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
