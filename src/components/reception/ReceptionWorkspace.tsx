'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { searchTutorsAndPatients, getTutorWithPatients, addPatientToTutor } from '@/lib/actions/tutors'
import { checkInPatient, moveToTriage, moveDirectToVet, getReceptionHistory } from '@/lib/actions/consultations'
import PatientFullModal from '@/components/patients/PatientFullModal'
import { CheckInModal } from './CheckInModal'
import PetTimelineModal from '@/components/pet/PetTimelineModal'
import NewAppointmentModal from './NewAppointmentModal'
import AgendaKanban from './AgendaKanban'
import { getAgendaBoard, type AgendaColumn } from '@/lib/actions/agenda'
import ReceptionSubNav from './ReceptionSubNav'
import WhatsAppNotificationModal from '@/components/whatsapp/WhatsAppNotificationModal'
import { BehaviorTagsBadges } from '@/components/ui/BehaviorTagsBadges'
import { PetAvatar } from '@/components/ui/PetAvatar'
import { useModules } from '@/components/providers/ModulesProvider'
import GroomingCheckinModal from '@/components/grooming/GroomingCheckinModal'
import type { ReceptionQueueItem, ReceptionHistoryItem } from '@/lib/actions/consultations'
import type { SearchResult } from '@/lib/actions/tutors'
import type { VisitReason, PatientSpecies } from '@/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const SPECIES_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  dog:     { label: 'Cão',       emoji: '🐶', color: 'bg-amber-100 text-amber-700' },
  cat:     { label: 'Gato',      emoji: '🐱', color: 'bg-purple-100 text-purple-700' },
  bird:    { label: 'Ave',       emoji: '🐦', color: 'bg-sky-100 text-sky-700' },
  exotic:  { label: 'Silvestre', emoji: '🦜', color: 'bg-green-100 text-green-700' },
  rabbit:  { label: 'Coelho',    emoji: '🐰', color: 'bg-pink-100 text-pink-700' },
  rodent:  { label: 'Roedor',    emoji: '🐹', color: 'bg-orange-100 text-orange-700' },
  reptile: { label: 'Réptil',    emoji: '🦎', color: 'bg-lime-100 text-lime-700' },
  fish:    { label: 'Peixe',     emoji: '🐟', color: 'bg-blue-100 text-blue-700' },
}

const VISIT_REASON_OPTIONS = [
  { value: 'consultation' as VisitReason, label: 'Consulta', emoji: '👨‍⚕️' },
  { value: 'follow_up' as VisitReason, label: 'Retorno', emoji: '📋' },
  { value: 'emergency' as VisitReason, label: 'Emergência', emoji: '🚨' },
  { value: 'vaccination' as VisitReason, label: 'Vacinação', emoji: '💉' },
  { value: 'exam' as VisitReason, label: 'Exame', emoji: '🔬' },
  { value: 'surgery' as VisitReason, label: 'Cirurgia', emoji: '🏥' },
]

const PAYMENT_STATUS_OPTIONS = [
  { value: 'pending' as const, label: 'Pendente' },
  { value: 'paid' as const, label: 'Pago' },
  { value: 'courtesy' as const, label: 'Cortesia' },
]

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  reception:      { label: 'Recepção',     className: 'bg-slate-100 text-slate-600' },
  scheduled:      { label: 'Agendado',     className: 'bg-purple-100 text-purple-700' },
  triage:         { label: 'Em Triagem',   className: 'bg-yellow-100 text-yellow-700' },
  in_progress:    { label: 'No Consultório', className: 'bg-blue-100 text-blue-700' },
  waiting_exam:   { label: 'Ag. Exame',   className: 'bg-indigo-100 text-indigo-700' },
  medication:     { label: 'Medicação',    className: 'bg-amber-100 text-amber-700' },
  completed:      { label: 'Concluído',    className: 'bg-green-100 text-green-700' },
  cancelled:      { label: 'Cancelado',    className: 'bg-red-100 text-red-600' },
}

function SpeciesBadge({ species }: { species: string }) {
  const s = SPECIES_LABELS[species] ?? { label: species, emoji: '🐾', color: 'bg-slate-100 text-slate-600' }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>
      {s.emoji} {s.label}
    </span>
  )
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  initialQueue: ReceptionQueueItem[]
  initialHistory: ReceptionHistoryItem[]
  clinicName: string
  userName: string
  clinicChecklist?: string[]
  clinicId: string
  checkinRequiredFields?: string[]
}

// ─── TutorProfile: mostra Tutor + lista de Pets com botão de novo Pet ─────────
function TutorProfile({
  tutorId,
  onSelectPatient,
  onScheduleAppointment,
  onClose,
  onAddPet,
  onViewFeed,
  onGroomingCheckin,
  onGroomingSchedule,
}: {
  tutorId: string
  onSelectPatient: (patientId: string, patientName: string, tutorId: string, tutorName: string, tutorAddress: string | null, tutorEmergencyContact: string | null) => void
  onScheduleAppointment: (patientId: string, patientName: string, tutorId: string, tutorName: string, tutorAddress: string | null, tutorEmergencyContact: string | null, patientSpecies?: string) => void
  onClose: () => void
  onAddPet: (tutorId: string, tutorName: string) => void
  onViewFeed: (petId: string, petName: string, petSpecies: string, tutorName: string, tutorCpf: string, tutorId: string) => void
  onGroomingCheckin?: (patientId: string, patientName: string, tutorId: string, tutorName: string) => void
  onGroomingSchedule?: (patientId: string, patientName: string, tutorId: string, tutorName: string) => void
}) {
  const activeModules = useModules()
  const groomingActive    = activeModules.length === 0 || activeModules.includes('grooming')
  const consultationActive = activeModules.length === 0 ||
    ['consultation', 'triage', 'exams', 'hospitalization'].some(m => activeModules.includes(m))
  const [data, setData] = useState<Awaited<ReturnType<typeof getTutorWithPatients>> | null>(null)

  useEffect(() => {
    getTutorWithPatients(tutorId).then(setData)
  }, [tutorId])

  if (!data) return (
    <div className="flex items-center justify-center py-12 text-sm text-slate-400">
      <svg className="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Carregando...
    </div>
  )

  if ('error' in data) return (
    <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{data.error}</div>
  )

  const GENDER_LABELS: Record<string, string> = { male: 'Macho', female: 'Fêmea', unknown: 'N/I' }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Tutor header */}
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-700">
            {(data.tutor.name ?? '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-slate-900">{data.tutor.name ?? '—'}</p>
            <p className="text-xs text-slate-500">
              {data.tutor.phone ?? ''}
              {data.tutor.cpf ? ` · CPF: ${data.tutor.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}` : ''}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-200 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Pets list */}
      <div className="px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Pets vinculados ({data.patients.length})
          </p>
          <button
            onClick={() => onAddPet(data.tutor.id, data.tutor.name ?? '')}
            className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Adicionar Novo Pet
          </button>
        </div>

        {data.patients.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">Nenhum pet cadastrado ainda.</p>
        ) : (
          <div className="space-y-2">
            {data.patients.map(p => {
              const sp = SPECIES_LABELS[p.species] ?? { emoji: '🐾', label: p.species, color: 'bg-slate-100 text-slate-600' }
              return (
                <div key={p.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-slate-100 px-4 py-3 hover:border-slate-200 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <PetAvatar name={p.name} species={p.species} photoUrl={p.photo_url} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${sp.color}`}>{sp.label}</span>
                        {p.breed && <span className="text-xs text-slate-500">{p.breed}</span>}
                        {p.gender && p.gender !== 'unknown' && <span className="text-xs text-slate-400">{GENDER_LABELS[p.gender]}</span>}
                        {p.neutered && <span className="text-xs text-slate-400">· Castrado(a)</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      onClick={() => onViewFeed(p.id, p.name, p.species, data.tutor.name ?? '', data.tutor.cpf ?? '', data.tutor.id)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                      title="Ver histórico do pet"
                    >
                      Feed
                    </button>
                    {consultationActive && (
                      <button
                        data-mentor-step="reception-checkin-btn"
                        onClick={() => onSelectPatient(p.id, p.name, data.tutor.id, data.tutor.name ?? '', data.tutor.address || null, data.tutor.emergency_contact || null)}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                      >
                        Check-in
                      </button>
                    )}
                    {consultationActive && (
                      <button
                        onClick={() => onScheduleAppointment(p.id, p.name, data.tutor.id, data.tutor.name ?? '', data.tutor.address || null, data.tutor.emergency_contact || null, p.species)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        Agendar
                      </button>
                    )}
                    {groomingActive && onGroomingCheckin && (
                      <button
                        onClick={() => onGroomingCheckin(p.id, p.name, data.tutor.id, data.tutor.name ?? '')}
                        className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
                        title="Check-in imediato para Banho e Tosa"
                      >
                        ✂️ Check-in B&T
                      </button>
                    )}
                    {groomingActive && onGroomingSchedule && (
                      <button
                        onClick={() => onGroomingSchedule(p.id, p.name, data.tutor.id, data.tutor.name ?? '')}
                        className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-100 transition-colors"
                        title="Agendar Banho e Tosa para data futura"
                      >
                        📅 Agendar B&T
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Age helper ──────────────────────────────────────────────────────────────
function calcAge(birthDate: string | null): string | null {
  if (!birthDate) return null
  const born = new Date(birthDate)
  const now   = new Date()
  const months = (now.getFullYear() - born.getFullYear()) * 12 + (now.getMonth() - born.getMonth())
  if (months < 1)  return '< 1 mês'
  if (months < 12) return `${months} ${months === 1 ? 'mês' : 'meses'}`
  const years = Math.floor(months / 12)
  return `${years} ${years === 1 ? 'ano' : 'anos'}`
}

// ─── Queue Card ───────────────────────────────────────────────────────────────
function QueueCard({ item, onMoveToTriage, triageActive }: { item: ReceptionQueueItem; onMoveToTriage: (id: string) => void; triageActive: boolean }) {
  const hasPendingPayment = item.payment_status === 'pending'
  const age = calcAge(item.patient.birth_date ?? null)
  return (
    <div
      title={triageActive ? 'Duplo clique para chamar triagem' : 'Duplo clique para enviar ao consultório'}
      onDoubleClick={() => onMoveToTriage(item.id)}
      className={`flex items-center gap-4 rounded-2xl border bg-white px-5 py-4 shadow-sm hover:shadow transition-shadow cursor-pointer select-none ${
        hasPendingPayment ? 'border-red-300' : 'border-slate-200'
      }`}
    >
      <PetAvatar name={item.patient.name} species={item.patient.species} photoUrl={item.patient.photo_url} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold text-slate-900">{item.patient.name}</p>
          <SpeciesBadge species={item.patient.species} />
          {age && <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{age}</span>}
          {item.patient.breed && <span className="text-xs text-slate-400">{item.patient.breed}</span>}
          <BehaviorTagsBadges tags={item.patient.behavior_tags} size="xs" />
        </div>
        <p className="text-sm text-slate-500 mt-0.5">
          Tutor: <span className="font-medium text-slate-700">{item.tutor.name}</span>
          {item.tutor.phone && (
            <>
              <span className="mx-1.5 text-slate-300">·</span>
              <a href={`tel:${item.tutor.phone}`} className="text-xs text-blue-600 hover:underline">{item.tutor.phone}</a>
            </>
          )}
        </p>
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {item.tutor.address && (
            <span className="text-xs text-slate-400 truncate max-w-[180px]" title={item.tutor.address}>📍 {item.tutor.address}</span>
          )}
          {item.patient.last_visit && (
            <span className="text-xs text-slate-400">
              Última visita: {new Date(item.patient.last_visit).toLocaleDateString('pt-BR')}
            </span>
          )}
        </div>
        {hasPendingPayment && (
          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-300 animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            Pagamento Pendente
          </span>
        )}
      </div>
      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        <span className="text-xs text-slate-400">{formatTime(item.created_at)}</span>
        <button
          data-mentor-step="reception-call-triage-btn"
          onClick={() => onMoveToTriage(item.id)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors ${triageActive ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
        >
          {triageActive ? 'Chamar Triagem →' : 'Enviar ao Consultório →'}
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function ReceptionWorkspace({ initialQueue, initialHistory, clinicName, userName, clinicChecklist = [], clinicId, checkinRequiredFields }: Props) {
  const [queue, setQueue] = useState<ReceptionQueueItem[]>(initialQueue)
  const [history, setHistory] = useState<ReceptionHistoryItem[]>(initialHistory)

  // Kanban view state
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list')
  const [kanbanColumns, setKanbanColumns] = useState<AgendaColumn[]>([])
  const [loadingKanban, setLoadingKanban] = useState(false)

  useRealtimeSync({ table: 'consultations', clinicId })

  // Sync props → state when server component refreshes
  useEffect(() => { setQueue(initialQueue) }, [initialQueue])
  useEffect(() => { setHistory(initialHistory) }, [initialHistory])
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedTutorId, setSelectedTutorId] = useState<string | null>(null)
  const [modal, setModal] = useState<
    | { type: 'new_tutor_and_pet' }
    | { type: 'add_pet'; tutorId: string; tutorName: string }
    | null
  >(null)
  const [checkInModal, setCheckInModal] = useState<{
    mode: 'new_checkin' | 'scheduled_checkin' | 'edit_existing'
    patientId?: string
    patientName?: string
    tutorId?: string
    tutorName?: string
    tutorAddress?: string | null
    tutorEmergencyContact?: string | null
    consultationId?: string
    visitReason?: VisitReason
    paymentStatus?: string
    scheduledDate?: string | null
  } | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error'; action?: { label: string; href: string } } | null>(null)
  const router = useRouter()
  const [whatsappCtx, setWhatsappCtx] = useState<{ petName: string; tutorName: string; tutorPhone: string; consultationId: string } | null>(null)
  const [groomingModal, setGroomingModal] = useState<{
    patientId: string; patientName: string; tutorId: string; tutorName: string
    mode?: 'checkin' | 'schedule'
  } | null>(null)
  const [feedPet, setFeedPet] = useState<{
    id: string; name: string; species: string; tutorName: string; tutorCpf: string; tutorId?: string
  } | null>(null)
  const [newApptPet, setNewApptPet] = useState<{
    id: string; name: string; species: string; tutorId: string; tutorName: string
  } | null>(null)
  const [isPending, startTransition] = useTransition()
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeModules = useModules()

  function showToast(
    msg: string,
    type: 'success' | 'error' = 'success',
    action?: { label: string; href: string },
  ) {
    setToast({ msg, type, action })
    setTimeout(() => setToast(null), action ? 6000 : 3500)
  }

  // Atalho Alt+N → Novo Cadastro
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey && e.key === 'n') {
        e.preventDefault()
        setModal({ type: 'new_tutor_and_pet' })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Debounced search (300ms)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (query.trim().length < 2) { setSearchResults([]); return }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      const res = await searchTutorsAndPatients(query)
      setSearching(false)
      if (!('error' in res)) setSearchResults(res)
    }, 300)
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query])

  function handleCheckIn(patientId: string, patientName: string, tutorId: string, tutorName: string, tutorAddress: string | null, tutorEmergencyContact: string | null) {
    setCheckInModal({
      mode: 'new_checkin',
      patientId,
      patientName,
      tutorId,
      tutorName,
      tutorAddress,
      tutorEmergencyContact,
    })
  }

  function handleScheduleAppointment(patientId: string, patientName: string, tutorId: string, tutorName: string, _addr: string | null, _emerg: string | null, species?: string) {
    setNewApptPet({ id: patientId, name: patientName, species: species ?? '', tutorId, tutorName })
  }

  function handleEditConsultation(item: ReceptionHistoryItem) {
    // Buscar dados do tutor para pré-preenchimento
    startTransition(async () => {
      const tutorData = await getTutorWithPatients(item.tutor.id)
      if (!('error' in tutorData)) {
        setCheckInModal({
          mode: 'edit_existing',
          patientId: item.patient.id,
          patientName: item.patient.name,
          tutorId: item.tutor.id,
          tutorName: item.tutor.name,
          tutorAddress: tutorData.tutor.address,
          tutorEmergencyContact: tutorData.tutor.emergency_contact,
          consultationId: item.id,
          visitReason: item.visit_reason as VisitReason,
          paymentStatus: item.payment_status,
        })
      }
    })
  }

  function handleModalSuccess(data: { tutorId: string; patientId: string; patientName: string; tutorName: string }) {
    setModal(null)
    // Buscar dados atualizados do tutor
    startTransition(async () => {
      const tutorData = await getTutorWithPatients(data.tutorId)
      if (!('error' in tutorData)) {
        handleCheckIn(
          data.patientId,
          data.patientName,
          data.tutorId,
          data.tutorName,
          tutorData.tutor.address,
          tutorData.tutor.emergency_contact
        )
      }
    })
  }

  function handleCheckInSuccess(data: { consultationId: string; patientName: string; tutorName: string }) {
    setCheckInModal(null)
    showToast(`✓ Check-in de ${data.patientName} (Tutor: ${data.tutorName}) realizado!`)
    setQuery('')
    setSearchResults([])
    setSelectedTutorId(null)
    // Refresh fila e histórico
    startTransition(async () => {
      const { getReceptionQueue } = await import('@/lib/actions/consultations')
      const fresh = await getReceptionQueue()
      if (!('error' in fresh)) setQueue(fresh)

      const historyFresh = await getReceptionHistory()
      if (!('error' in historyFresh)) setHistory(historyFresh)
    })
  }

  const triageActive = activeModules.length === 0 || activeModules.includes('triage')

  function handleMoveToTriage(consultationId: string) {
    startTransition(async () => {
      const item = queue.find(c => c.id === consultationId)
      if (!triageActive) {
        const err = await moveDirectToVet(consultationId)
        if (err) { showToast(err.error, 'error'); return }
        setQueue(q => q.filter(c => c.id !== consultationId))
        showToast('Pet encaminhado direto ao Consultório.', 'success', {
          label: 'Abrir Consultório',
          href:  `/dashboard/vet/${consultationId}`,
        })
        return
      }
      const err = await moveToTriage(consultationId)
      if (err) { showToast(err.error, 'error'); return }
      setQueue(q => q.filter(c => c.id !== consultationId))
      showToast('Pet encaminhado para Triagem.', 'success', {
        label: 'Abrir Triagem',
        href:  `/dashboard/triage/${consultationId}`,
      })
      if (item?.tutor?.phone) {
        setWhatsappCtx({
          petName:        item.patient.name,
          tutorName:      item.tutor.name,
          tutorPhone:     item.tutor.phone,
          consultationId: consultationId,
        })
      }
    })
  }

  const noResults = query.trim().length >= 2 && !searching && searchResults.length === 0

  return (
    <div>
      {/* WhatsApp — Chamada para Triagem */}
      {whatsappCtx && (
        <WhatsAppNotificationModal
          isOpen={!!whatsappCtx}
          onClose={() => setWhatsappCtx(null)}
          trigger="triage_called"
          context={{
            petName:    whatsappCtx.petName,
            tutorName:  whatsappCtx.tutorName,
            tutorPhone: whatsappCtx.tutorPhone,
          }}
          consultationId={whatsappCtx.consultationId}
        />
      )}

      {/* Pet Timeline Modal */}
      {feedPet && (
        <PetTimelineModal
          petId={feedPet.id}
          petName={feedPet.name}
          petSpecies={feedPet.species}
          clinicName={clinicName}
          tutorName={feedPet.tutorName}
          tutorCpf={feedPet.tutorCpf}
          tutorId={feedPet.tutorId}
          onClose={() => setFeedPet(null)}
        />
      )}

      {/* Novo Agendamento Modal */}
      {newApptPet && (
        <NewAppointmentModal
          defaultPet={newApptPet}
          onClose={() => setNewApptPet(null)}
          onSuccess={petName => {
            setNewApptPet(null)
            showToast(`Agendamento criado para ${petName}!`)
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-medium shadow-lg transition-all ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success'
            ? <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
            : <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" /></svg>
          }
          <span>{toast.msg}</span>
          {toast.action && (
            <button
              onClick={() => { router.push(toast.action!.href); setToast(null) }}
              className="ml-1 underline underline-offset-2 font-semibold hover:opacity-80"
            >
              {toast.action.label} →
            </button>
          )}
        </div>
      )}

      <main className="mx-auto max-w-4xl px-3 sm:px-6 py-6 sm:py-8 space-y-8">

        <ReceptionSubNav />

        {/* ── View Toggle: Lista / Kanban ── */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              viewMode === 'list' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Lista
          </button>
          <button
            data-mentor-step="reception-kanban-toggle"
            onClick={async () => {
              setViewMode('kanban')
              if (kanbanColumns.length === 0) {
                setLoadingKanban(true)
                const result = await getAgendaBoard()
                if (!('error' in result)) setKanbanColumns(result)
                setLoadingKanban(false)
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              viewMode === 'kanban' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Kanban
          </button>
        </div>

        {/* ── Kanban View ── */}
        {viewMode === 'kanban' && (
          loadingKanban ? (
            <div className="flex items-center justify-center py-12 text-sm text-slate-500">Carregando Kanban...</div>
          ) : (
            <AgendaKanban
              initialColumns={kanbanColumns}
              clinicId={clinicId}
              checkinRequiredFields={checkinRequiredFields}
              onScheduledCheckin={card => {
                startTransition(async () => {
                  const tutorData = await getTutorWithPatients(card.tutor.id)
                  setCheckInModal({
                    mode: 'scheduled_checkin',
                    patientId:             card.patient.id,
                    patientName:           card.patient.name,
                    tutorId:               card.tutor.id,
                    tutorName:             card.tutor.name,
                    tutorAddress:          !('error' in tutorData) ? tutorData.tutor.address : null,
                    tutorEmergencyContact: !('error' in tutorData) ? tutorData.tutor.emergency_contact : null,
                    consultationId:        card.id,
                    visitReason:           card.visit_reason as VisitReason,
                    scheduledDate:         card.scheduled_date,
                  })
                })
              }}
            />
          )
        )}

        {/* ── BUSCA ── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Busca Inteligente</h2>
              <p className="text-sm text-slate-500">Pesquise por CPF do Tutor, nome do Tutor ou nome do Pet</p>
            </div>
            <button
              data-mentor-step="reception-new-btn"
              onClick={() => setModal({ type: 'new_tutor_and_pet' })}
              title="Alt+N"
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors hover:shadow-md flex-shrink-0"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Novo Cadastro
              <kbd className="hidden sm:inline-flex items-center rounded bg-blue-500 px-1.5 py-0.5 text-[10px] font-medium text-blue-100">Alt+N</kbd>
            </button>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
              {searching
                ? <svg className="h-4 w-4 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                : <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
              }
            </div>
            <input
              data-mentor-step="reception-search-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="CPF, nome do tutor ou nome do pet..."
              className="w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            {query && (
              <button onClick={() => { setQuery(''); setSearchResults([]); setSelectedTutorId(null) }}
                className="absolute inset-y-0 right-4 flex items-center text-slate-400 hover:text-slate-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Resultados da busca */}
          {searchResults.length > 0 && !selectedTutorId && (
            <div className="mt-2 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              {searchResults.map(result => (
                <button
                  key={result.tutor.id}
                  onClick={() => setSelectedTutorId(result.tutor.id)}
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors text-left"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                    {(result.tutor.name ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900">{result.tutor.name ?? '—'}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {result.patients.length === 0
                        ? <span className="text-xs text-slate-400">Nenhum pet cadastrado</span>
                        : result.patients.map(p => {
                            const sp = SPECIES_LABELS[p.species]
                            return (
                              <span key={p.id} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${sp?.color ?? 'bg-slate-100 text-slate-600'}`}>
                                {sp?.emoji ?? '🐾'} {p.name}
                              </span>
                            )
                          })
                      }
                    </div>
                  </div>
                  <svg className="h-4 w-4 flex-shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              ))}
            </div>
          )}

          {/* Perfil do Tutor selecionado */}
          {selectedTutorId && (
            <div className="mt-3">
              <TutorProfile
                tutorId={selectedTutorId}
                onSelectPatient={(patientId, patientName, tutorId, tutorName, tutorAddress, tutorEmergencyContact) => handleCheckIn(patientId, patientName, tutorId, tutorName, tutorAddress, tutorEmergencyContact)}
                onScheduleAppointment={(patientId, patientName, tutorId, tutorName, tutorAddress, tutorEmergencyContact, species) => handleScheduleAppointment(patientId, patientName, tutorId, tutorName, tutorAddress, tutorEmergencyContact, species)}
                onClose={() => setSelectedTutorId(null)}
                onAddPet={(id, name) => setModal({ type: 'add_pet', tutorId: id, tutorName: name })}
                onViewFeed={(petId, petName, petSpecies, tutorName, tutorCpf, tutorId) =>
                  setFeedPet({ id: petId, name: petName, species: petSpecies, tutorName, tutorCpf, tutorId })
                }
                onGroomingCheckin={(patientId, patientName, tutorId, tutorName) =>
                  setGroomingModal({ patientId, patientName, tutorId, tutorName, mode: 'checkin' })
                }
                onGroomingSchedule={(patientId, patientName, tutorId, tutorName) =>
                  setGroomingModal({ patientId, patientName, tutorId, tutorName, mode: 'schedule' })
                }
              />
            </div>
          )}

          {/* Nenhum resultado → botão de cadastro */}
          {noResults && (
            <div className="mt-3 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">🔍</div>
              <div>
                <p className="font-medium text-slate-700">Nenhum resultado para "{query}"</p>
                <p className="text-sm text-slate-500 mt-1">O Tutor ou Pet não está cadastrado nesta clínica.</p>
              </div>
              <button
                onClick={() => setModal({ type: 'new_tutor_and_pet' })}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Cadastrar Novo Tutor e Pet
              </button>
            </div>
          )}
        </section>

        {/* ── FILA DO DIA ── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Fila de Espera</h2>
              <p className="text-sm text-slate-500">Pets aguardando atendimento hoje</p>
            </div>
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-600 px-2 text-xs font-bold text-white">
              {queue.length}
            </span>
          </div>

          {queue.length === 0 ? (
            <div data-mentor-step="reception-queue" className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center">
              <span className="text-4xl">🐾</span>
              <p className="font-medium text-slate-700">Fila vazia</p>
              <p className="text-sm text-slate-400">Use a busca acima para fazer o check-in de um pet.</p>
            </div>
          ) : (
            <div data-mentor-step="reception-queue" className="space-y-3">
              {queue.map(item => (
                <QueueCard key={item.id} item={item} onMoveToTriage={handleMoveToTriage} triageActive={triageActive} />
              ))}
            </div>
          )}
        </section>

        {/* ── HISTÓRICO DE RECEPÇÃO ── */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Atendidos Hoje</h2>
              <p className="text-sm text-slate-500">Todos os pacientes em fluxo clínico hoje</p>
            </div>
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-200 px-2 text-xs font-bold text-slate-600">
              {history.length}
            </span>
          </div>

          {history.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-8 text-center">
              <span className="text-3xl">📊</span>
              <p className="font-medium text-slate-700">Nenhum atendimento registrado</p>
              <p className="text-sm text-slate-400">Os atendimentos processados aparecerão aqui.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map(item => {
                const sp = SPECIES_LABELS[item.patient.species] ?? { emoji: '🐾', color: 'bg-slate-100 text-slate-600' }
                const visitReasonLabel = VISIT_REASON_OPTIONS.find(v => v.value === item.visit_reason)?.label ?? item.visit_reason
                const paymentLabel = PAYMENT_STATUS_OPTIONS.find(p => p.value === item.payment_status)?.label ?? item.payment_status
                return (
                  <button
                    key={item.id}
                    onClick={() => handleEditConsultation(item)}
                    className="w-full flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 hover:bg-slate-50 transition-colors text-left shadow-sm"
                  >
                    <PetAvatar name={item.patient.name} species={item.patient.species} photoUrl={item.patient.photo_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-slate-900">{item.patient.name}</p>
                        <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${sp.color}`}>{item.patient.species}</span>
                      </div>
                      <p className="text-sm text-slate-500 mt-1">
                        Tutor: <span className="font-medium text-slate-700">{item.tutor.name}</span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="text-xs">{formatTime(item.created_at)}</span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      {/* Status do fluxo clínico */}
                      {STATUS_BADGES[item.status] && (
                        <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${STATUS_BADGES[item.status].className}`}>
                          {STATUS_BADGES[item.status].label}
                        </span>
                      )}
                      <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${
                        item.visit_reason === 'emergency' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                      }`}>{visitReasonLabel}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </section>
      </main>

      {/* ── MODAIS ── */}
      {modal?.type === 'new_tutor_and_pet' && (
        <PatientFullModal
          mode="new_tutor_and_pet"
          onClose={() => setModal(null)}
          onSuccess={handleModalSuccess}
        />
      )}
      {modal?.type === 'add_pet' && (
        <PatientFullModal
          mode="add_pet_to_tutor"
          tutorId={modal.tutorId}
          tutorName={modal.tutorName}
          onClose={() => setModal(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {/* ── Grooming Check-in / Agendamento Modal ── */}
      {groomingModal && (
        <GroomingCheckinModal
          patientId={groomingModal.patientId}
          patientName={groomingModal.patientName}
          tutorId={groomingModal.tutorId}
          tutorName={groomingModal.tutorName}
          initialMode={groomingModal.mode}
          onClose={() => setGroomingModal(null)}
          onSuccess={() => {
            const isSchedule = groomingModal.mode === 'schedule'
            setGroomingModal(null)
            setSelectedTutorId(null)
            setQuery('')
            setSearchResults([])
            showToast(
              isSchedule
                ? `✓ Banho e Tosa de ${groomingModal.patientName} agendado!`
                : `✓ Check-in de Banho e Tosa de ${groomingModal.patientName} registrado!`
            )
          }}
        />
      )}

      {/* ── Check-in Modal ── */}
      {checkInModal && (
        <CheckInModal
          patientId={checkInModal.patientId}
          patientName={checkInModal.patientName}
          tutorId={checkInModal.tutorId}
          tutorName={checkInModal.tutorName}
          tutorAddress={checkInModal.tutorAddress}
          tutorEmergencyContact={checkInModal.tutorEmergencyContact}
          mode={checkInModal.mode}
          existingConsultation={
            checkInModal.mode === 'edit_existing' && checkInModal.consultationId
              ? {
                  id: checkInModal.consultationId,
                  visit_reason: checkInModal.visitReason || 'consultation',
                  payment_status: (checkInModal.paymentStatus as any) || 'pending',
                  scheduled_date: checkInModal.scheduledDate ?? null,
                }
              : undefined
          }
          clinicChecklist={clinicChecklist}
          checkinRequiredFields={checkinRequiredFields}
          onClose={() => setCheckInModal(null)}
          onSuccess={handleCheckInSuccess}
        />
      )}
    </div>
  )
}
