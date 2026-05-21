'use client'

import { useState, useTransition, useEffect } from 'react'
import { useFocusedVoiceCapture } from '@/hooks/useFocusedVoiceCapture'
import { getClinicVoiceTriggers } from '@/lib/actions/clinic-settings'
import Link from 'next/link'
import { FlaskConical, CheckCircle2, Clock, History, Pencil, Plus, X, LogOut, BedDouble, Mic, MicOff } from 'lucide-react'
import type { ExamQueueItem, ExamHistoryItem, ExamRequest } from '@/lib/actions/exams'
import { requestExam, saveExamResult, dischargeFromExams } from '@/lib/actions/exams'
import { createHospitalization } from '@/lib/actions/hospitalizations'
import { searchPatientsForTriage, type TriagePatientSearchResult } from '@/lib/actions/triage'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { BehaviorTagsBadges } from '@/components/ui/BehaviorTagsBadges'
import { PetAvatar } from '@/components/ui/PetAvatar'

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
  in_progress:  'Devolvido ao MV',
  waiting_exam: 'Ag. Exame',
  medication:   'Em Medicação',
  completed:    'Concluída',
}

function calcWaiting(createdAt: string): string {
  const diff = Date.now() - new Date(createdAt).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes} min aguardando`
  const hours = Math.floor(minutes / 60)
  return `${hours}h${minutes % 60 > 0 ? ` ${minutes % 60}min` : ''} aguardando`
}

// ─── ExamCard ─────────────────────────────────────────────────────────────────

function ExamCard({
  item,
  onDischarge,
  onSendToHospitalization,
}: {
  item: ExamQueueItem
  onDischarge: (id: string, name: string) => void
  onSendToHospitalization: (item: ExamQueueItem) => void
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 hover:shadow-sm hover:border-blue-200 transition-all">
      {/* Avatar */}
      <PetAvatar name={item.patient.name} species={item.patient.species} photoUrl={item.patient.photo_url} size="md" />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-slate-900">{item.patient.name}</p>
          {item.patient.breed && (
            <span className="text-xs text-slate-400">{item.patient.breed}</span>
          )}
          <BehaviorTagsBadges tags={item.patient.behavior_tags} size="xs" />
        </div>
        <div className="mt-0.5 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-slate-500">Tutor: {item.tutor.name}</span>
          {item.tutor.phone && (
            <span className="text-xs text-slate-400">{item.tutor.phone}</span>
          )}
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {VISIT_REASON_LABELS[item.visit_reason] ?? item.visit_reason}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-xs text-amber-600 font-medium">{calcWaiting(item.created_at)}</span>
        </div>
      </div>

      {/* Ações */}
      <div className="flex flex-col gap-2 flex-shrink-0">
        <Link
          href={`/dashboard/exams/${item.id}`}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
        >
          <FlaskConical className="h-4 w-4" />
          Iniciar Exame
        </Link>
        <button
          type="button"
          onClick={() => onDischarge(item.id, item.patient.name)}
          title="Pet não retorna ao consultório — concluir atendimento"
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Dar Alta
        </button>
        <button
          type="button"
          onClick={() => onSendToHospitalization(item)}
          title="Encaminhar para internação"
          className="flex items-center gap-1.5 rounded-xl border border-indigo-200 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors"
        >
          <BedDouble className="h-4 w-4" />
          Internar
        </button>
      </div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  queue:         ExamQueueItem[]
  history:       ExamHistoryItem[]
  examRequests:  ExamRequest[]
  clinicId:      string
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExamsWorkspace({ queue, history, examRequests, clinicId }: Props) {
  useRealtimeSync({ table: 'consultations', clinicId })
  useRealtimeSync({ table: 'exam_requests', clinicId })

  const [tab, setTab] = useState<'fila' | 'historico'>('fila')
  const [showNewExamModal, setShowNewExamModal] = useState(false)
  const [examType, setExamType] = useState('hemogram')
  const [examLoading, setExamLoading] = useState(false)
  const [examSuccess, setExamSuccess] = useState('')
  const [examError, setExamError] = useState('')
  const [localQueue, setLocalQueue] = useState<ExamQueueItem[]>(queue)
  const [localExamRequests, setLocalExamRequests] = useState<ExamRequest[]>(examRequests)
  const [resultModalId, setResultModalId] = useState<string | null>(null)
  const [resultText, setResultText] = useState('')
  const [resultLoading, setResultLoading] = useState(false)
  const [resultSuccess, setResultSuccess] = useState('')
  const [examPatientSearch, setExamPatientSearch] = useState('')
  const [examPatientResults, setExamPatientResults] = useState<TriagePatientSearchResult[]>([])
  const [examPatientSelected, setExamPatientSelected] = useState<TriagePatientSearchResult | null>(null)
  const [examNotes, setExamNotes] = useState('Exame solicitado manualmente no módulo de Exames.')
  const [isPending, startTransition] = useTransition()
  const [hospItem, setHospItem] = useState<ExamQueueItem | null>(null)
  const [hospReason, setHospReason] = useState('')
  const [hospLoading, setHospLoading] = useState(false)
  const [stopTriggers, setStopTriggers] = useState<string[]>([])
  useEffect(() => {
    getClinicVoiceTriggers().then(res => {
      if (!('error' in res)) setStopTriggers(res.stopTriggers)
    })
  }, [])
  const hospVoice = useFocusedVoiceCapture({
    stopTriggers,
    onInterim: (text) => setHospReason(text),
    onFinal:   (text) => { if (text) setHospReason(text) },
  })

  async function handleDischarge(consultationId: string, petName: string) {
    if (!confirm(`Dar alta para ${petName}? O atendimento será concluído sem retorno ao consultório.`)) return
    startTransition(async () => {
      const res = await dischargeFromExams(consultationId)
      if ('error' in res) { setExamError(res.error); return }
      setLocalQueue(prev => prev.filter(i => i.id !== consultationId))
      setExamSuccess(`✓ Alta de ${petName} registrada.`)
      setTimeout(() => setExamSuccess(''), 3500)
    })
  }

  async function handleHospSubmit() {
    if (!hospItem) return
    if (!hospReason.trim()) { setExamError('Informe o motivo da internação.'); return }
    setHospLoading(true)
    const res = await createHospitalization({
      patient_id:      hospItem.patient.id,
      consultation_id: hospItem.id,
      status:          'observation',
      reason:          hospReason.trim(),
    })
    setHospLoading(false)
    if ('error' in res) { setExamError(res.error); return }
    setLocalQueue(prev => prev.filter(i => i.id !== hospItem.id))
    setHospItem(null)
    setHospReason('')
    setExamSuccess(`✓ ${hospItem.patient.name} encaminhado(a) para internação.`)
    setTimeout(() => setExamSuccess(''), 3500)
  }

  async function handleExamPatientSearch(q: string) {
    setExamPatientSearch(q)
    setExamPatientSelected(null)
    if (q.trim().length < 2) { setExamPatientResults([]); return }
    const r = await searchPatientsForTriage(q)
    setExamPatientResults(Array.isArray(r) ? r : [])
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-4xl px-3 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Laboratório / Exames</h1>
            <p className="mt-0.5 text-sm text-slate-500">Pacientes aguardando exame e geração de laudos</p>
          </div>
          <button
            type="button"
            data-mentor-step="exams-request-btn"
            onClick={() => setShowNewExamModal(true)}
            aria-hidden={showNewExamModal ? 'true' : undefined}
            tabIndex={showNewExamModal ? -1 : undefined}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
            Solicitar Exame
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
            <FlaskConical className="h-4 w-4" />
            Fila de Exames
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

        {/* ── Fila de Exames ───────────────────────────────────────────────── */}
        {tab === 'fila' && (
          <div data-mentor-step="exams-queue" className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                  <FlaskConical className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Fila de Exames</h2>
                  <p className="text-xs text-slate-500">Encaminhados pelo médico veterinário</p>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${
                localQueue.length > 0
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-100 text-slate-500'
              }`}>
                {localQueue.length} paciente{localQueue.length !== 1 ? 's' : ''}
              </span>
            </div>

            {examSuccess && (
              <div className="mx-4 mt-4 rounded-xl bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-700 font-medium">
                {examSuccess}
              </div>
            )}
            {localQueue.length === 0 && localExamRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
                  <CheckCircle2 className="h-7 w-7 text-green-400" />
                </div>
                <p className="text-sm font-medium text-slate-500">Nenhum exame pendente no momento</p>
                <p className="text-xs text-slate-400 mt-1">
                  Os pacientes aparecem aqui quando o médico encaminha para exames
                </p>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {localQueue.map(item => (
                  <ExamCard
                    key={item.id}
                    item={item}
                    onDischarge={handleDischarge}
                    onSendToHospitalization={setHospItem}
                  />
                ))}
                {localExamRequests.map(req => (
                  <div
                    key={req.id}
                    onClick={() => { setResultModalId(req.id); setResultText('') }}
                    className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 hover:shadow-sm hover:border-blue-200 transition-all cursor-pointer"
                  >
                    <PetAvatar name={req.patient.name} species={req.patient.species} photoUrl={req.patient.photo_url} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900">{req.patient.name}</p>
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{req.exam_type}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="text-xs text-slate-500">Tutor: {req.tutor.name}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Preencher exame"
                      onClick={e => { e.stopPropagation(); setResultModalId(req.id); setResultText('') }}
                      className="flex-shrink-0 flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      <FlaskConical className="h-4 w-4" />
                      Registrar Resultado
                    </button>
                  </div>
                ))}
              </div>
            )}
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
                  <h2 className="text-base font-semibold text-slate-900">Exames Realizados Hoje</h2>
                  <p className="text-xs text-slate-500">Clique em "Editar" para corrigir ou complementar o laudo</p>
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
                  <p className="text-sm font-medium text-slate-500">Nenhum exame realizado ainda hoje</p>
                </div>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50/50 transition-colors">
                    {/* Avatar */}
                    <PetAvatar name={item.patient.name} species={item.patient.species} photoUrl={item.patient.photo_url} size="sm" />

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
                      {item.exam_notes && (
                        <p className="text-xs text-slate-400 mt-0.5 italic truncate max-w-[300px]">
                          &ldquo;{item.exam_notes}&rdquo;
                        </p>
                      )}
                    </div>

                    {/* Ação */}
                    <Link
                      href={`/dashboard/exams/${item.id}`}
                      className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar Exame
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </main>

      {/* Modal: Solicitar Exame */}
      {showNewExamModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Solicitar Novo Exame</h2>
              <button onClick={() => { setShowNewExamModal(false); setExamSuccess(''); setExamError(''); setExamPatientSearch(''); setExamPatientResults([]); setExamPatientSelected(null); setExamNotes('Exame solicitado manualmente no módulo de Exames.') }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            {examSuccess && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{examSuccess}</p>}
            {examError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{examError}</p>}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">Paciente</label>
              <input
                type="text"
                placeholder="Buscar por pet ou tutor..."
                value={examPatientSelected ? examPatientSelected.name + ' — ' + examPatientSelected.tutor.name : examPatientSearch}
                onChange={e => handleExamPatientSearch(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {examPatientResults.length > 0 && !examPatientSelected && (
                <div className="absolute z-10 top-full left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                  {examPatientResults.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => { setExamPatientSelected(r); setExamPatientResults([]) }}
                      className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm"
                    >
                      <span className="font-semibold">{r.name}</span>
                      <span className="text-slate-500 ml-2">Tutor: {r.tutor.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nota Clínica</label>
              <textarea
                value={examNotes}
                onChange={e => setExamNotes(e.target.value)}
                rows={2}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Motivo ou observação clínica..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Exame</label>
              <select
                value={examType}
                onChange={e => setExamType(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="hemograma">Hemograma Completo</option>
                <option value="bioquimico">Perfil Bioquímico</option>
                <option value="urinanalise">Urinálise</option>
                <option value="coproparasitologico">Coproparasitológico</option>
                <option value="ultrassom">Ultrassom</option>
                <option value="raio_x">Raio-X</option>
                <option value="eletrocardiograma">Eletrocardiograma (ECG)</option>
                <option value="citologia">Citologia</option>
                <option value="cultura">Cultura e Antibiograma</option>
                <option value="teste_rapido">Teste Rápido (FIV/FeLV/4DX)</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowNewExamModal(false)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={examLoading}
                onClick={async () => {
                  setExamLoading(true)
                  setExamError('')
                  if (examPatientSelected) {
                    const result = await requestExam({
                      patient_id: examPatientSelected.id,
                      tutor_id: examPatientSelected.tutor.id,
                      exam_type: examType,
                      notes: examNotes.trim() || 'Exame solicitado manualmente no módulo de Exames.',
                    })
                    if ('error' in result) {
                      setExamError(result.error)
                      setExamLoading(false)
                      return
                    }
                  }
                  setExamSuccess('Exame solicitado com sucesso! Adicionado à fila.')
                  setExamLoading(false)
                  setTimeout(() => { setShowNewExamModal(false); setExamSuccess(''); setExamPatientSearch(''); setExamPatientResults([]); setExamPatientSelected(null); setExamNotes('Exame solicitado manualmente no módulo de Exames.') }, 1500)
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {examLoading ? 'Solicitando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar Resultado */}
      {resultModalId && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Registrar Resultado do Exame</h2>
              <button onClick={() => setResultModalId(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            {resultSuccess && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{resultSuccess}</p>}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Resultado / Laudo</label>
              <textarea
                data-mentor-step="exams-result-textarea"
                value={resultText}
                onChange={e => setResultText(e.target.value)}
                placeholder="Descreva o resultado do exame..."
                rows={4}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setResultModalId(null)}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={resultLoading || !resultText.trim()}
                onClick={async () => {
                  if (!resultModalId || !resultText.trim()) return
                  setResultLoading(true)
                  const res = await saveExamResult(resultModalId, resultText.trim())
                  setResultLoading(false)
                  if ('error' in res) {
                    alert(res.error)
                  } else {
                    setResultSuccess('Resultado registrado! Exame concluído.')
                    setLocalExamRequests(prev => prev.filter(r => r.id !== resultModalId))
                    setTimeout(() => { setResultModalId(null); setResultSuccess('') }, 1500)
                  }
                }}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {resultLoading ? 'Salvando...' : 'Registrar Resultado'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Internar Paciente */}
      {hospItem && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BedDouble className="h-5 w-5 text-indigo-600" />
                <h2 className="text-base font-semibold text-slate-900">Encaminhar para Internação</h2>
              </div>
              <button onClick={() => { setHospItem(null); setHospReason(''); setExamError('') }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Animal: <span className="font-semibold">{hospItem.patient.name}</span>
            </p>
            {examError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{examError}</p>}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-700">
                  Motivo da Internação <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  title={hospVoice.isRecording ? 'Parar gravação ou diga "encerrar gravação"' : 'Ditar motivo por voz'}
                  onClick={hospVoice.toggle}
                  className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${hospVoice.isRecording ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'}`}
                >
                  {hospVoice.isRecording ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  {hospVoice.isRecording ? 'Parar' : 'Voz'}
                </button>
              </div>
              <textarea
                value={hospReason}
                onChange={e => setHospReason(e.target.value)}
                placeholder="Ex: Necessita de observação pós-exame, hidratação IV..."
                rows={3}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setHospItem(null); setHospReason(''); setExamError('') }}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={hospLoading || !hospReason.trim()}
                onClick={handleHospSubmit}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <BedDouble className="h-4 w-4" />
                {hospLoading ? 'Internando...' : 'Confirmar Internação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
