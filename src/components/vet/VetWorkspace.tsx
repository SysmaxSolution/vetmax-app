'use client'

import { useState, useTransition, useEffect } from 'react'
import Link from 'next/link'
import { Clock, CheckCircle2, ArrowRight, Stethoscope, AlertCircle, Weight, Thermometer, History, Pencil, Plus, X, Search, UserPlus } from 'lucide-react'
import type { VetQueueItem, VetCompletedItem } from '@/lib/actions/vet'
import { addPatientDirectToVet } from '@/lib/actions/vet'
import { searchPatientsForTriage, type TriagePatientSearchResult } from '@/lib/actions/triage'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { BehaviorTagsBadges } from '@/components/ui/BehaviorTagsBadges'
import PatientFullModal from '@/components/patients/PatientFullModal'
import AttendanceCardMenu from '@/components/shared/AttendanceCardMenu'
import { VISIT_REASON_OPTIONS as CANONICAL_VISIT_REASONS, VISIT_REASON_LABELS } from '@/lib/visit-reasons'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SPECIES_LABELS: Record<string, string> = {
  dog: 'Canino', cat: 'Felino', bird: 'Ave', rabbit: 'Coelho',
  rodent: 'Roedor', reptile: 'Réptil', fish: 'Peixe', exotic: 'Exótico',
}

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐕', cat: '🐱', bird: '🐦', rabbit: '🐰',
  rodent: '🐭', reptile: '🦎', fish: '🐠', exotic: '✨',
}

// HF3 (05/06): labels vêm do catálogo único (src/lib/visit-reasons.ts) —
// a lista local não tinha "Microchipagem".

const STATUS_BADGE: Record<string, string> = {
  in_progress:              'bg-indigo-100 text-indigo-700',
  waiting_exam:             'bg-orange-100 text-orange-700',
  medication:               'bg-pink-100 text-pink-700',
  completed:                'bg-green-100 text-green-700',
  revisao_pos_internacao:   'bg-violet-100 text-violet-700',
}

const STATUS_LABEL: Record<string, string> = {
  in_progress:              'Em Consulta',
  waiting_exam:             'Ag. Exame',
  medication:               'Em Medicação',
  completed:                'Concluída',
  revisao_pos_internacao:   'Análise Pós-Internação',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface VetWorkspaceProps {
  queue:     VetQueueItem[]
  completed: VetCompletedItem[]
  clinicId:  string
}

// ─── Component ────────────────────────────────────────────────────────────────

// HF3 (05/06): lista paralela local violava o catálogo único de motivos
// (src/lib/visit-reasons.ts) e deixava "Microchipagem" de fora do Incluir
// Paciente. 'grooming' não entra — é fluxo separado (grooming_sessions).
const VISIT_REASON_OPTIONS = CANONICAL_VISIT_REASONS
  .filter(o => o.value !== 'grooming')
  .map(o => ({ value: o.value, label: `${o.emoji} ${o.label}` }))

export default function VetWorkspace({ queue, completed, clinicId }: VetWorkspaceProps) {
  useRealtimeSync({ table: 'consultations', clinicId })

  const [localQueue, setLocalQueue] = useState<VetQueueItem[]>(queue)
  useEffect(() => { setLocalQueue(queue) }, [queue])

  const [tab, setTab] = useState<'fila' | 'historico'>('fila')
  const [showAddModal, setShowAddModal]       = useState(false)
  const [addTab, setAddTab]                   = useState<'buscar' | 'novo'>('buscar')
  const [addSearch, setAddSearch]             = useState('')
  const [addResults, setAddResults]           = useState<TriagePatientSearchResult[]>([])
  const [addSelected, setAddSelected]         = useState<TriagePatientSearchResult | null>(null)
  const [addReason, setAddReason]             = useState('consultation')
  const [addLoading, setAddLoading]           = useState(false)
  const [addError, setAddError]               = useState('')
  const [addSuccess, setAddSuccess]           = useState('')
  const [showNewPatientModal, setShowNewPatientModal] = useState(false)
  const [pendingNewPetId, setPendingNewPetId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  async function handleAddSearch(q: string) {
    setAddSearch(q)
    setAddSelected(null)
    if (q.trim().length < 2) { setAddResults([]); return }
    try {
      const r = await searchPatientsForTriage(q)
      setAddResults(Array.isArray(r) ? r : [])
    } catch {
      // HF6 (05/06): rejeição não pode travar a busca de pacientes
      setAddResults([])
      setAddError('Falha na busca — tente novamente.')
    }
  }

  async function handleAddSubmit() {
    if (!addSelected) { setAddError('Selecione um animal.'); return }
    setAddLoading(true)
    setAddError('')
    const res = await addPatientDirectToVet({
      patient_id:   addSelected.id,
      tutor_id:     addSelected.tutor.id,
      visit_reason: addReason,
    })
    setAddLoading(false)
    if ('error' in res) { setAddError(res.error); return }
    setAddSuccess(`✓ ${addSelected.name} incluído na fila!`)
    setTimeout(() => {
      setShowAddModal(false); setAddSearch(''); setAddResults([]); setAddSelected(null)
      setAddReason('consultation'); setAddSuccess(''); setAddError('')
    }, 1500)
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-4xl px-3 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Consultório Veterinário</h1>
            <p className="mt-0.5 text-sm text-slate-500">Atendimento clínico e prontuário eletrônico</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
            Incluir Paciente
          </button>
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
            {localQueue.length > 0 && (
              <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                tab === 'fila' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {localQueue.length}
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
            {completed.length > 0 && (
              <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                tab === 'historico' ? 'bg-teal-100 text-teal-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {completed.length}
              </span>
            )}
          </button>
        </div>

        {/* ── Fila de Espera ───────────────────────────────────────────────── */}
        {tab === 'fila' && (
          <div data-mentor-step="vet-queue" className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                  <Stethoscope className="h-4 w-4 text-slate-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Aguardando Atendimento</h2>
                  <p className="text-xs text-slate-500">Triagens prontas para consulta</p>
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                {localQueue.length} consulta{localQueue.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
              {localQueue.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-600">Fila vazia!</p>
                  <p className="text-xs text-slate-400 mt-1">Nenhum animal aguardando atendimento</p>
                </div>
              ) : (
                localQueue.map((item) => (
                  <Link
                    key={item.id}
                    href={`/dashboard/vet/${item.id}`}
                    className="block p-5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Mobile (05/06): badges quebram linha em telas estreitas */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                          <h3 className="font-semibold text-slate-900">{item.patient.name}</h3>
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {SPECIES_EMOJI[item.patient.species] ?? '🐾'} {SPECIES_LABELS[item.patient.species] ?? item.patient.species}
                          </span>
                          {item.visit_reason === 'emergency' && (
                            <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                              🚨 Emergência
                            </span>
                          )}
                          {item.status === 'revisao_pos_internacao' && (
                            <span className="text-xs font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
                              🏥 Análise Pós-Internação
                            </span>
                          )}
                          {!item.vital_signs && (
                            <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                              Sem triagem prévia
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-500">
                          Tutor: <span className="font-medium text-slate-600">{item.tutor.name}</span>
                          {' · '}{VISIT_REASON_LABELS[item.visit_reason] ?? item.visit_reason}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {item.vital_signs?.weight && item.vital_signs.weight > 0 && (
                            <span className="flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                              <Weight className="w-3 h-3" />
                              {item.vital_signs.weight} kg
                            </span>
                          )}
                          {item.vital_signs?.temperature && item.vital_signs.temperature > 0 && (
                            <span className="flex items-center gap-1 text-xs font-semibold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">
                              <Thermometer className="w-3 h-3" />
                              {item.vital_signs.temperature}°C
                            </span>
                          )}
                          {item.vital_signs?.heart_rate && item.vital_signs.heart_rate > 0 && (
                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                              FC: {item.vital_signs.heart_rate} bpm
                            </span>
                          )}
                          {item.patient.allergies && (
                            <span className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                              <AlertCircle className="w-3 h-3" />
                              Alérgico
                            </span>
                          )}
                          <BehaviorTagsBadges tags={item.patient.behavior_tags} size="xs" />
                        </div>
                        {item.vital_signs?.chief_complaint && (
                          <p className="text-xs text-slate-400 mt-1.5 italic line-clamp-1">
                            &ldquo;{item.vital_signs.chief_complaint}&rdquo;
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0 flex items-center gap-1 mt-0">
                        <AttendanceCardMenu
                          entity="consultation"
                          id={item.id}
                          patientName={item.patient.name}
                          onCancelled={() => setLocalQueue(q => q.filter(i => i.id !== item.id))}
                        />
                        <ArrowRight className="w-5 h-5 text-slate-400 mt-1" />
                      </div>
                    </div>
                  </Link>
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
                  <h2 className="text-base font-semibold text-slate-900">Atendimentos Realizados Hoje</h2>
                  <p className="text-xs text-slate-500">Clique em "Editar" para reabrir o prontuário</p>
                </div>
              </div>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-700">
                {completed.length} registro{completed.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
              {completed.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Clock className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm font-medium text-slate-500">Nenhum atendimento realizado ainda hoje</p>
                </div>
              ) : (
                completed.map((item) => (
                  <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                      {/* Avatar */}
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg overflow-hidden">
                        {item.patient.photo_url
                          ? <img src={item.patient.photo_url} alt={item.patient.name} className="h-full w-full object-cover" />
                          : SPECIES_EMOJI[item.patient.species] ?? '🐾'}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-900">{item.patient.name}</p>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[item.status] ?? 'bg-slate-100 text-slate-600'}`}>
                            {STATUS_LABEL[item.status] ?? item.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {SPECIES_LABELS[item.patient.species] ?? item.patient.species} · Tutor: {item.tutor.name}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {VISIT_REASON_LABELS[item.visit_reason] ?? item.visit_reason}
                        </p>
                      </div>
                    </div>

                    {/* Ação */}
                    <Link
                      href={`/dashboard/vet/${item.id}`}
                      className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors ml-[52px] sm:ml-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar Consulta
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </main>

      {/* Modal: Incluir Paciente Diretamente */}
      {showAddModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-blue-600" />
                <h2 className="text-base font-semibold text-slate-900">Incluir Paciente no Consultório</h2>
              </div>
              <button onClick={() => { setShowAddModal(false); setAddTab('buscar'); setAddSearch(''); setAddResults([]); setAddSelected(null); setAddError('') }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Abas */}
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => { setAddTab('buscar'); setAddError('') }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${addTab === 'buscar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Search className="h-3.5 w-3.5" /> Buscar Existente
              </button>
              <button
                type="button"
                onClick={() => { setAddTab('novo'); setAddError('') }}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${addTab === 'novo' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <UserPlus className="h-3.5 w-3.5" /> Novo Cadastro
              </button>
            </div>

            {addSuccess && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{addSuccess}</p>}
            {addError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{addError}</p>}

            {addTab === 'buscar' && (
              <>
                <div className="relative">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Buscar Animal</label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                      <Search className="h-4 w-4 text-slate-400" />
                    </div>
                    <input
                      type="text"
                      placeholder="Nome do pet ou tutor..."
                      value={addSelected ? `${addSelected.name} — ${addSelected.tutor.name}` : addSearch}
                      onChange={e => handleAddSearch(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      autoFocus
                    />
                  </div>
                  {addResults.length > 0 && !addSelected && (
                    <div className="absolute z-10 top-full left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                      {addResults.map(r => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => { setAddSelected(r); setAddResults([]) }}
                          className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm border-b border-slate-100 last:border-0"
                        >
                          <span className="font-semibold">{r.name}</span>
                          <span className="text-slate-500 ml-2">Tutor: {r.tutor.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Motivo da Visita</label>
                  <select
                    value={addReason}
                    onChange={e => setAddReason(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {VISIT_REASON_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  O pet entrará diretamente no Consultório. Vitais devem ser coletados durante a consulta.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowAddModal(false); setAddTab('buscar'); setAddSearch(''); setAddResults([]); setAddSelected(null); setAddError('') }}
                    className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={addLoading || !addSelected}
                    onClick={handleAddSubmit}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    {addLoading ? 'Incluindo...' : 'Incluir na Fila'}
                  </button>
                </div>
              </>
            )}

            {addTab === 'novo' && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Cadastre tutor e pet e inicie a consulta imediatamente.
                </p>
                {/* HF4 (05/06): motivo escolhido aqui é respeitado no novo cadastro */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Motivo da Visita</label>
                  <select
                    value={addReason}
                    onChange={e => setAddReason(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {VISIT_REASON_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setShowNewPatientModal(true) }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
                >
                  <UserPlus className="h-4 w-4" />
                  Abrir Formulário de Cadastro
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setAddTab('buscar') }}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PatientFullModal para novo cadastro direto do Consultório */}
      {showNewPatientModal && (
        <PatientFullModal
          mode="new_tutor_and_pet"
          onClose={() => setShowNewPatientModal(false)}
          onSuccess={async (result) => {
            setShowNewPatientModal(false)
            if (result?.patientId) {
              setAddLoading(true)
              // HF4 (05/06): respeita o motivo escolhido no modal (antes era
              // hardcoded 'consultation').
              const res = await addPatientDirectToVet({
                patient_id:   result.patientId,
                tutor_id:     result.tutorId ?? '',
                visit_reason: addReason,
              })
              setAddLoading(false)
              if (!('error' in res)) {
                setAddSuccess(`✓ ${result.patientName ?? 'Pet'} incluído na fila!`)
                setTimeout(() => setAddSuccess(''), 3000)
              }
            }
          }}
        />
      )}
    </div>
  )
}
