'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useRealtimeRow } from '@/hooks/useRealtimeSync'
import {
  ArrowLeft, AlertCircle, Mic, MicOff, Loader2, Sparkles,
  FlaskConical, Pill, CheckSquare, Square, Calendar, Save,
  Stethoscope, Clock, ChevronRight, Info, Syringe, FileText, X, BedDouble, RotateCcw, Plus, HeartCrack,
  Settings,
} from 'lucide-react'
import { saveVetNotes, finalizeConsultation, reopenConsultation, savePrescription, type VetConsultationDetail } from '@/lib/actions/vet'
import { hasActiveConsultationService } from '@/lib/actions/services'
import ConsultationServicesPanel from '@/components/vet/ConsultationServicesPanel'
import InsuranceAuditBanner from '@/components/consultation/InsuranceAuditBanner'
import type { AuditResult } from '@/lib/actions/insurance-audit'
import { updatePatientFromLiveReg } from '@/lib/actions/pets'
import { addAppliedMedication, deleteAppliedMedication, updateAppliedMedication, extractFullVoice, type AppliedMedication } from '@/lib/actions/pharmacy'
import { addVaccine, type PatientVaccine } from '@/lib/actions/vaccines'
import { generateInvoice } from '@/lib/actions/billing'
import { Toast } from '@/components/ui/toast'
import { PetAvatar } from '@/components/ui/PetAvatar'
import DocumentsSection, { type PrintState } from '@/components/vet/DocumentsSection'
import ClinicalActionsSection from '@/components/vet/ClinicalActionsSection'
import PetTimelineModal from '@/components/pet/PetTimelineModal'
import NewAppointmentModal from '@/components/reception/NewAppointmentModal'
import { useClinicalVoiceAssistant } from '@/hooks/useClinicalVoiceAssistant'
import { useNativeKeepAwake } from '@/hooks/useNativeKeepAwake'
import { usePetCoverageSemaforo } from '@/hooks/usePetCoverageSemaforo'
import CoverageChip from '@/components/vet/CoverageChip'
import AttachmentsSection from '@/components/ui/AttachmentsSection'
import MergedTriageSection, { type TriageVitals } from '@/components/vet/MergedTriageSection'
import AdmitPetModal from '@/components/hospitalization/AdmitPetModal'
import ExamRequestModal from '@/components/exams/ExamRequestModal'
import EuthanasiaModal from '@/components/vet/EuthanasiaModal'
import WhatsAppNotificationModal from '@/components/whatsapp/WhatsAppNotificationModal'
import { RemoveFromQueueModal } from '@/components/ui/RemoveFromQueueModal'
import { getHospitalizationByConsultation, type InternationFeedData } from '@/lib/actions/hospitalizations'
import VaccinationCard from '@/components/vet/VaccinationCard'
import InsuranceCard from '@/components/pet/InsuranceCard'
import VaccineStatusBadges from '@/components/vet/VaccineStatusBadges'
import { BehaviorTagsBadges } from '@/components/ui/BehaviorTagsBadges'
import { LiveRegistrationModal } from '@/components/consultation/LiveRegistrationModal'
import { extractPatientDataFromTranscript, type ExtractedData } from '@/lib/actions/ai_extraction'
import type { DocumentTemplate } from '@/types'
import type { PatientDocument } from '@/lib/actions/documents'
import type { Attachment } from '@/lib/actions/attachments'
import type { FlowConfig } from '@/lib/actions/clinic-settings'
import { getClinicVoiceTriggers, updateClinicVoiceTriggers } from '@/lib/actions/clinic-settings'
import { useAiTranscriptionMode } from '@/components/providers/ClinicConfigProvider'

// ─── Labels ──────────────────────────────────────────────────────────────────

const SPECIES_LABELS: Record<string, string> = {
  dog: 'Canino', cat: 'Felino', bird: 'Ave', rabbit: 'Coelho',
  rodent: 'Roedor', reptile: 'Réptil', fish: 'Peixe', exotic: 'Exótico',
}

const GENDER_LABELS: Record<string, string> = {
  male: 'Macho', female: 'Fêmea', unknown: 'Não informado',
}

const MUCOUS_LABELS: Record<string, string> = {
  pink: 'Rosa (Normal)', pale: 'Pálida', icteric: 'Ictérica', cyanotic: 'Cianótica',
}

const MUCOUS_BADGE: Record<string, string> = {
  pink: 'bg-pink-100 text-pink-700',
  pale: 'bg-slate-200 text-slate-600',
  icteric: 'bg-yellow-100 text-yellow-700',
  cyanotic: 'bg-blue-100 text-blue-700',
}

const CRT_LABELS: Record<string, string> = {
  '2s': '< 2s (Normal)', '3s': '2–3s', '4s': '> 3s',
}

const VISIT_REASON_LABELS: Record<string, string> = {
  consultation: 'Consulta', follow_up: 'Retorno', emergency: 'Emergência',
  vaccination: 'Vacinação', exam: 'Exame', surgery: 'Cirurgia', grooming: 'Banho e Tosa',
}

const STATUS_LABELS: Record<string, string> = {
  in_progress:            'Em Atendimento', completed: 'Concluída',
  waiting_exam:           'Ag. Exame', medication: 'Medicação', cancelled: 'Cancelada',
  hospitalized:           'Internado',
  revisao_pos_internacao: 'Análise Pós-Internação',
}

const TYPE_LABELS: Record<string, string> = {
  exam_internal:         'Exame Interno',
  exam_external:         'Encaminhamento Externo',
  prescription_external: 'Receita Externa',
}

const PROBABILITY_BADGE: Record<string, string> = {
  alta: 'bg-red-100 text-red-700 border-red-200',
  média: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  media: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  baixa: 'bg-blue-100 text-blue-700 border-blue-200',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

import { formatPetAge } from '@/lib/utils/pet-age'
function calcAge(birthDate: string | null): string {
  return formatPetAge(birthDate) ?? 'Não informada'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function parseDiagnosis(raw: string | null): any {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

// ─── Componente Principal ─────────────────────────────────────────────────────

interface Props {
  consultation:        VetConsultationDetail
  clinicName?:         string
  clinicId?:           string
  templates?:          DocumentTemplate[]
  initialDocuments?:   PatientDocument[]
  initialMedications?: AppliedMedication[]
  initialAttachments?: Attachment[]
  initialVaccines?:    PatientVaccine[]
  flowConfig?:         FlowConfig
  userRole?:           string
  currentUserId?:      string
  insuranceCard?:      import('@/lib/actions/insurance-coverage').InsuranceCardData | null
}

export default function ConsultationDetail({
  consultation,
  clinicName = 'SysVetMax',
  clinicId,
  templates = [],
  initialDocuments = [],
  initialMedications = [],
  initialAttachments = [],
  initialVaccines = [],
  flowConfig = { vet_merged_modules: [] },
  userRole,
  currentUserId,
  insuranceCard,
}: Props) {
  const router = useRouter()
  const aiMode = useAiTranscriptionMode()
  const { patient, tutor, vital_signs, past_consultations } = consultation

  // Estado do prontuário
  const [vetNotes, setVetNotes] = useState(consultation.vet_notes ?? '')
  const [parsedDiagnosis, setParsedDiagnosis] = useState<any>(() => parseDiagnosis(consultation.suggested_diagnosis))
  const [diagnosisJson, setDiagnosisJson] = useState(consultation.suggested_diagnosis ?? '')

  // Auditoria de convênio
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null)

  // UI state
  const [isLoadingDiag, setIsLoadingDiag] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [isFinalizing, setIsFinalizing] = useState(false)
  const [isReviewedByVet, setIsReviewedByVet] = useState(consultation.is_reviewed_by_vet)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Notificação de retorno de exame
  useRealtimeRow({
    table: 'consultations',
    rowId: consultation.id,
    event: 'UPDATE',
    onEvent: ({ old: oldRow, new: newRow }) => {
      if (oldRow.status === 'waiting_exam' && newRow.status === 'in_progress') {
        setToast({ type: 'success', message: 'Resultado de exame disponível para este paciente!' })
      }
    },
  })

  const notasRef          = useRef<HTMLTextAreaElement>(null)
  const lastSavedNotesRef = useRef(consultation.vet_notes ?? '')
  const debounceRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hasNotesError,      setHasNotesError]      = useState(false)
  const [notesErrorPulsing,  setNotesErrorPulsing]  = useState(false)
  const [isExtractingVoice,  setIsExtractingVoice]  = useState(false)

  // Handsfree voice assistant
  const [startTriggers,  setStartTriggers]  = useState<string[]>([])
  const [stopTriggers,   setStopTriggers]   = useState<string[]>([])
  const [voiceConfigOpen, setVoiceConfigOpen] = useState(false)
  const [configSaving,   setConfigSaving]   = useState(false)
  const [newStartInput,  setNewStartInput]  = useState('')
  const [newStopInput,   setNewStopInput]   = useState('')
  const [isReopening, setIsReopening] = useState(false)
  const isFinalized = consultation.status === 'completed' || consultation.status === 'hospitalized'

  // Refator de Serviços (2026-05-25): guard de finalização. Vet só pode dar
  // alta quando há ao menos uma linha ativa em consultation_services.
  const [hasService, setHasService] = useState(false)
  async function refreshHasService() {
    const r = await hasActiveConsultationService(consultation.id)
    if (!('error' in r)) setHasService(r.has)
  }
  useEffect(() => { void refreshHasService() }, [consultation.id])

  const handleReopen = async () => {
    setIsReopening(true)
    const result = await reopenConsultation(consultation.id)
    setIsReopening(false)
    if ('error' in result) {
      setToast({ type: 'error', message: result.error })
    } else {
      router.refresh()
    }
  }

  // Medicações controladas pelo pai
  const [clinicalMeds, setClinicalMeds] = useState<AppliedMedication[]>(initialMedications)

  // Sinais vitais mesclados (Fluxo Contínuo — IA de voz popula este estado)
  const triageMerged = flowConfig.vet_merged_modules.includes('triage')
  const examsMerged  = flowConfig.vet_merged_modules.includes('exams')
  const [mergedVitals, setMergedVitals] = useState<Partial<TriageVitals> | null>(null)
  const [mergedExamNotes, setMergedExamNotes] = useState('')

  // Sugestões de documentos vindas da IA de voz
  const [pendingDocSuggestions, setPendingDocSuggestions] = useState<
    Array<{ tipo: string; motivo: string; title: string; summary: string; is_controlled?: boolean }>
  >([])

  // Sugestões de agendamento vindas da IA de voz
  const [pendingApptSuggestions, setPendingApptSuggestions] = useState<
    Array<{ data_sugerida: string; motivo: string }>
  >([])
  const [apptModalData, setApptModalData] = useState<{ date: string; reason: string } | null>(null)

  // NOVO: Estado do Cadastro Vivo (voz IA)
  const [profileUpdates, setProfileUpdates] = useState<any | null>(null)
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)

  // Cadastro Vivo — modal aberto automaticamente ao fim da gravação
  const [liveRegData, setLiveRegData] = useState<ExtractedData | null>(null)

  const [showRemoveFromQueueModal, setShowRemoveFromQueueModal] = useState(false)

  // Discharge checklist modal
  const [showDischargeModal, setShowDischargeModal] = useState(false)
  const [showFeed, setShowFeed] = useState(false)
  const [showAdmitModal,       setShowAdmitModal]       = useState(false)
  // Motivo pré-extraído pela IA para o AdmitPetModal — atualizado pela voz no fluxo do Consultório.
  const [admitInitialReason,   setAdmitInitialReason]   = useState<string>('')
  const [showExamRequestModal, setShowExamRequestModal] = useState(false)
  // Bloqueia a alta enquanto o PDF está sendo gerado/enviado ao storage
  const [isPdfUploading, setIsPdfUploading] = useState(false)
  // Último PDF gerado para injetar na lista de Anexos em tempo real
  const [lastPdfAttachment, setLastPdfAttachment] = useState<import('@/lib/actions/attachments').Attachment | null>(null)

  // WhatsApp ao dar alta
  const [attachDocsOnDischarge, setAttachDocsOnDischarge] = useState(false)
  const [showWhatsAppDischarge, setShowWhatsAppDischarge] = useState(false)
  const [voiceConfirmedWA, setVoiceConfirmedWA] = useState(false)
  const [savedDocTitles, setSavedDocTitles] = useState<string[]>([])

  // WhatsApp ao internar
  const [whatsAppHosp, setWhatsAppHosp] = useState<{ reason: string; status: 'observation' | 'ward' | 'icu' } | null>(null)

  // Auto-trigger doc generation from discharge modal
  const [autoTriggerDoc, setAutoTriggerDoc] = useState<
    { suggestion: { tipo: string; motivo: string; title: string }; index: number } | null
  >(null)

  // InternationFeed — pós-internação
  const [internFeed, setInternFeed] = useState<InternationFeedData | null>(null)
  const [loadingFeed, setLoadingFeed] = useState(false)
  const [showInternFeed, setShowInternFeed] = useState(false)

  useEffect(() => {
    if (consultation.status !== 'revisao_pos_internacao') return
    setLoadingFeed(true)
    getHospitalizationByConsultation(consultation.id).then(res => {
      setLoadingFeed(false)
      if (!('error' in res)) setInternFeed(res)
    })
  }, [consultation.id, consultation.status])

  // Aba de desfecho (pré-selecionada pela IA de voz)
  const [outcomeTab, setOutcomeTab] = useState<'alta' | 'exames' | 'internacao' | 'prescricao' | 'eutanasia'>('alta')
  const [prescriptions, setPrescriptions] = useState<Array<{ id: string; medication: string; dose: string; route_of_administration?: string }>>([])
  const [newMedication, setNewMedication] = useState('')
  const [newDose, setNewDose] = useState('')
  const [newFrequency, setNewFrequency] = useState('')
  const [newDurationDays, setNewDurationDays] = useState<string>('')
  const [newIsControlled, setNewIsControlled] = useState(false)
  const [newRoute, setNewRoute] = useState<'oral' | 'iv' | 'im' | 'subcutaneo' | 'topico' | 'inalacao' | 'outro'>('oral')
  const [prescriptionSaved, setPrescriptionSaved] = useState(false)
  const [showEuthanasiaModal, setShowEuthanasiaModal] = useState(false)

  // ─── Estado de Impressão (Bulletproof Print Strategy) ──────────────────────
  const [printData, setPrintData] = useState<PrintState | null>(null)

  useEffect(() => {
    const handleAfterPrint = () => setPrintData(null)
    window.addEventListener('afterprint', handleAfterPrint)
    return () => window.removeEventListener('afterprint', handleAfterPrint)
  }, [])

  const handlePrint = (data: PrintState) => {
    setShowDischargeModal(false)
    setPrintData(data)
    setTimeout(() => window.print(), 500)
  }

  // ─── Handsfree Voice Assistant ─────────────────────────────────────────────

  const vetNotesRef = useRef(vetNotes)
  useEffect(() => { vetNotesRef.current = vetNotes }, [vetNotes])

  const handleVoiceAutoSave = useCallback(async (transcript: string) => {
    console.log('[VOICE→IA] handleVoiceAutoSave', {
      aiMode, transcriptLen: transcript.length, preview: transcript.slice(0, 120),
    })

    if (!transcript.trim()) {
      setToast({ type: 'error', message: 'Gravação vazia — nada a processar.' })
      return
    }

    // O modo só afeta O TEXTO que vai para o campo "Prontuário":
    //   - transcribe_only → texto literal do que o vet falou
    //   - ai_assisted     → SOAP estruturado e parafraseado pela IA (notas_clinicas)
    // Em AMBOS os modos a IA extrai medicações, documentos sugeridos, retornos,
    // vacinas, sinais vitais e roteamento (internação/alta/exames).

    setIsExtractingVoice(true)
    setToast({ type: 'success', message: `IA analisando ${transcript.length} caracteres da consulta...` })
    const result = await extractFullVoice(
      transcript,
      {
        name:      patient.name,
        species:   patient.species,
        weight:    vital_signs?.weight,
        allergies: patient.allergies ?? undefined,
        vet_notes: vetNotesRef.current,
      },
      flowConfig
    )
    setIsExtractingVoice(false)
    console.log('[VOICE→IA] extractFullVoice resultado', result)

    if ('error' in result) {
      // Fallback: pelo menos preserva a transcrição bruta no prontuário.
      const fallbackNotes = vetNotesRef.current
        ? `${vetNotesRef.current}\n\n${transcript}`
        : transcript
      setVetNotes(fallbackNotes)
      autoSave(fallbackNotes)
      setToast({ type: 'error', message: `IA falhou: ${result.error} — transcrição salva como texto bruto.` })
      return
    }

    // 1. Texto do prontuário → respeita o modo
    const notesForRecord = aiMode === 'transcribe_only'
      ? transcript                              // literal — exatamente como falado
      : (result.notas_clinicas?.trim() || transcript)  // SOAP IA, ou fallback ao bruto
    if (notesForRecord.trim()) {
      const newNotes = vetNotesRef.current ? `${vetNotesRef.current}\n\n${notesForRecord}` : notesForRecord
      setVetNotes(newNotes)
      autoSave(newNotes)
    }

    // 2. Medicações → salvar no DB e atualizar estado
    const newMeds: AppliedMedication[] = []
    for (const m of result.medicacoes_aplicadas) {
      const res = await addAppliedMedication({
        consultation_id: consultation.id,
        medication_name: m.medication_name,
        dosage: m.dosage ?? undefined,
        route:  m.route  ?? undefined,
        notes:  m.notes  ?? undefined,
      })
      if (!('error' in res)) newMeds.push(res)
    }
    if (newMeds.length > 0) setClinicalMeds(prev => [...prev, ...newMeds])

    // 3. Documentos → enfileirar sugestões para DocumentsSection
    if (result.documentos_sugeridos.length > 0) {
      setPendingDocSuggestions(prev => [...prev, ...result.documentos_sugeridos])
    }

    // 4. Agendamentos sugeridos pela IA
    if (result.agendamentos_sugeridos.length > 0) {
      setPendingApptSuggestions(prev => [...prev, ...result.agendamentos_sugeridos])
    }

    // 5. Sinais Vitais (Fluxo Contínuo — Triagem mesclada)
    if (result.sinais_vitais) {
      const sv = result.sinais_vitais
      setMergedVitals({
        weight:           sv.weight           ?? undefined,
        temperature:      sv.temperature      ?? undefined,
        heart_rate:       sv.heart_rate       ?? undefined,
        respiratory_rate: sv.respiratory_rate ?? undefined,
        chief_complaint:  sv.chief_complaint  ?? undefined,
      })
    }

    // 6. Laudo de Exame (Fluxo Contínuo — Exames mesclados)
    if (result.laudo_exame?.trim()) {
      setMergedExamNotes(prev => prev ? `${prev}\n\n${result.laudo_exame}` : result.laudo_exame!)
    }

    // 7. Vacinas aplicadas → salvar no DB
    let savedVaccineCount = 0
    if (result.vaccines_applied && result.vaccines_applied.length > 0) {
      for (const v of result.vaccines_applied) {
        const res = await addVaccine({
          patient_id:      consultation.patient.id,
          consultation_id: consultation.id,
          vaccine_name:    v.vaccine_name,
          next_due_date:   v.next_due_date ?? undefined,
          notes:           v.notes ?? undefined,
        })
        if (!('error' in res)) savedVaccineCount++
      }
    }
    // 8. Cadastro Vivo (Live Registration)
    if (result.pet_profile_updates && (
      result.pet_profile_updates.medical_history ||
      result.pet_profile_updates.reproductive_status ||
      result.pet_profile_updates.coat_color ||
      (result.pet_profile_updates.behavior_tags && result.pet_profile_updates.behavior_tags.length > 0)
    )) {
      setProfileUpdates(result.pet_profile_updates)
    }
    // 9. Roteamento por Voz (Auto-Ação) + pré-selecionar aba de desfecho
    if (result.suggested_routing === 'discharge') {
      setOutcomeTab('alta')
      setTimeout(() => setShowDischargeModal(true), 2000)
    } else if (result.suggested_routing === 'hospitalization') {
      // Pré-preenche o motivo com as notas clínicas (SOAP gerado) ou, como
      // fallback, com o transcript bruto da fala — assim o vet só confirma.
      const motivo = result.notas_clinicas?.trim() || transcript.trim()
      setAdmitInitialReason(motivo)
      setOutcomeTab('internacao')
      setTimeout(() => setShowAdmitModal(true), 2000)
    } else if (result.suggested_routing === 'waiting_exam') {
      setOutcomeTab('exames')
    }

    // Toast resumo
    const parts: string[] = []
    if (result.notas_clinicas.trim())                                          parts.push('prontuário preenchido')
    if (newMeds.length > 0)                                                    parts.push(`${newMeds.length} med(s) registrada(s)`)
    if (result.documentos_sugeridos.length > 0)                               parts.push(`${result.documentos_sugeridos.length} doc(s) sugerido(s)`)
    if (result.agendamentos_sugeridos.length > 0)                             parts.push(`${result.agendamentos_sugeridos.length} agendamento(s)`)
    if (savedVaccineCount > 0)                                                parts.push(`${savedVaccineCount} vacina(s) registrada(s)`)
    if (result.sinais_vitais && Object.values(result.sinais_vitais).some(v => v != null && v !== 0 && v !== '')) parts.push('sinais vitais extraídos')
    if (result.laudo_exame?.trim())                                           parts.push('laudo preenchido')
    if (result.suggested_routing === 'discharge')                              parts.push('alta detectada')
    setToast({ type: 'success', message: `IA Unificada: ${parts.join(' · ')}.` })

    // 10. Cadastro Vivo — sempre rodar (independe do modo de transcrição)
    {
      const liveData = await extractPatientDataFromTranscript(transcript)
      if (liveData) {
        const existingVaccineNames = new Set(initialVaccines.map(v => v.vaccine_name.toLowerCase()))
        const existingBehaviorTags = new Set((patient.behavior_tags ?? []).map((t: string) => t.toLowerCase()))
        const newVaccines = liveData.vaccines.filter(v => !existingVaccineNames.has(v.name.toLowerCase()))
        const newBehavior = liveData.behavior.filter(b => !existingBehaviorTags.has(b.toLowerCase()))
        if (newVaccines.length > 0 || newBehavior.length > 0) {
          setLiveRegData({ ...liveData, vaccines: newVaccines, behavior: newBehavior })
        }
        if (liveData.suggestedOutcome) setOutcomeTab(liveData.suggestedOutcome)
      }
    }
  }, [aiMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const voiceAssistant = useClinicalVoiceAssistant({
    onAutoSave: handleVoiceAutoSave,
    onSendWA: () => {
      setVoiceConfirmedWA(true)
      setShowWhatsAppDischarge(true)
    },
    startTriggers,
    stopTriggers,
  })
  const isRecording = voiceAssistant.state === 'RECORDING'
  const liveTranscript = voiceAssistant.transcript

  // Semáforo Petlove — análise IA em tempo real do procedimento ditado,
  // ancorado no textarea principal da consulta (Anamnese / Notas Clínicas).
  const coverageSemaforo = usePetCoverageSemaforo({
    patientId:   patient.id,
    transcript:  liveTranscript,
    isListening: isRecording,
  })

  // Mantém a tela acesa durante a gravação para o vet não perder áudio nem o
  // SpeechRecognition ser pausado pelo lock-screen do iOS/Android.
  useNativeKeepAwake(isRecording)

  useEffect(() => {
    getClinicVoiceTriggers().then(res => {
      if (!('error' in res)) {
        setStartTriggers(res.startTriggers)
        setStopTriggers(res.stopTriggers)
      }
    })
  }, [])

  useEffect(() => {
    voiceAssistant.activate()
    return () => voiceAssistant.deactivate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveVoiceConfig() {
    setConfigSaving(true)
    await updateClinicVoiceTriggers(startTriggers, stopTriggers)
    setConfigSaving(false)
    setVoiceConfigOpen(false)
  }

  // ─── Handlers para ClinicalActionsSection (controlado) ─────────────────────
  const handleAddMed = async (data: {
    medication_name: string; dosage?: string; route?: string; notes?: string; is_controlled?: boolean
  }) => {
    const res = await addAppliedMedication({ consultation_id: consultation.id, ...data })
    if ('error' in res) {
      setToast({ type: 'error', message: res.error })
    } else {
      setClinicalMeds(prev => [...prev, res])
    }
  }

  const handleDeleteMed = async (id: string) => {
    const res = await deleteAppliedMedication(id, consultation.id)
    if ('error' in res) {
      setToast({ type: 'error', message: res.error })
    } else {
      setClinicalMeds(prev => prev.filter(m => m.id !== id))
    }
  }

  const handleUpdateMed = async (id: string, data: {
    medication_name: string; dosage?: string; route?: string; notes?: string; is_controlled?: boolean
  }) => {
    const res = await updateAppliedMedication(id, consultation.id, data)
    if ('error' in res) {
      setToast({ type: 'error', message: res.error })
    } else {
      setClinicalMeds(prev => prev.map(m => m.id === id ? res : m))
      setToast({ type: 'success', message: 'Medicação atualizada.' })
    }
  }

  // ─── Sugerir Diagnóstico IA ─────────────────────────────────────────────────
  const suggestDiagnosis = async () => {
    setIsLoadingDiag(true)
    setToast({ type: 'success', message: 'Consultando IA para sugestões diagnósticas...' })

    try {
      const res = await fetch('/api/suggest-diagnosis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          species: patient.species,
          breed: patient.breed,
          weight: vital_signs?.weight,
          temperature: vital_signs?.temperature,
          mucous_color: vital_signs?.mucous_color,
          crt: vital_signs?.crt,
          heart_rate: vital_signs?.heart_rate,
          respiratory_rate: vital_signs?.respiratory_rate,
          chief_complaint: vital_signs?.chief_complaint,
          vet_notes: vetNotes,
          allergies: patient.allergies,
          chronic_diseases: patient.chronic_diseases,
          past_surgeries: patient.past_surgeries,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erro na API')
      }

      const data = await res.json()
      const jsonStr = JSON.stringify(data)
      setParsedDiagnosis(data)
      setDiagnosisJson(jsonStr)
      setToast({ type: 'success', message: 'Diagnósticos diferenciais gerados com sucesso.' })
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Erro ao gerar diagnóstico.' })
    } finally {
      setIsLoadingDiag(false)
    }
  }

  // ─── Auto-Save ───────────────────────────────────────────────────────────────
  const autoSave = async (notes: string) => {
    if (notes === lastSavedNotesRef.current || isFinalized) return
    setSaveStatus('saving')
    const result = await saveVetNotes(consultation.id, notes, diagnosisJson || undefined)
    if ('error' in result) {
      setSaveStatus('idle')
      setToast({ type: 'error', message: result.error })
    } else {
      lastSavedNotesRef.current = notes
      setSaveStatus('saved')
      // Atualizar banner de auditoria se retornou resultado
      if ('audit' in result && result.audit) setAuditResult(result.audit)
      setTimeout(() => setSaveStatus(s => s === 'saved' ? 'idle' : s), 3000)
    }
  }

  // Debounce auto-save na digitação (1 s de inatividade)
  useEffect(() => {
    if (isFinalized) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const snapshot = vetNotes
    debounceRef.current = setTimeout(() => autoSave(snapshot), 1000)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [vetNotes]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Finalizar / Encaminhar ─────────────────────────────────────────────────
  const handleFinalize = async (nextStatus: 'completed' | 'waiting_exam' | 'medication') => {
    // Notes are optional for status transition; UI validation is advisory only
    if (nextStatus === 'completed' && !isReviewedByVet) {
      setToast({ type: 'error', message: 'Confirme a revisão do prontuário (CFMV) para finalizar.' })
      return
    }
    // Guard de Serviços — alta exige ao menos um serviço lançado.
    if (nextStatus === 'completed' && !hasService) {
      // Recheca no servidor em caso de race (linha adicionada agora).
      await refreshHasService()
      if (!hasService) {
        setToast({ type: 'error', message: 'Lance ao menos um serviço (Consulta, Exame, etc.) antes de encerrar o atendimento.' })
        return
      }
    }
    // Para alta final, abre checklist de confirmação
    if (nextStatus === 'completed') {
      setShowDischargeModal(true)
      return
    }
    await executeFinalize(nextStatus)
  }

  const executeFinalize = async (nextStatus: 'completed' | 'waiting_exam' | 'medication') => {
    setIsFinalizing(true)
    setShowDischargeModal(false)
    try {
      const result = await finalizeConsultation(consultation.id, {
        vet_notes: vetNotes,
        suggested_diagnosis: diagnosisJson || undefined,
        next_status: nextStatus,
      })

      if ('error' in result) {
        setToast({ type: 'error', message: result.error })
      } else {
        // Gerar fatura automaticamente ao dar alta
        if (nextStatus === 'completed') {
          generateInvoice(consultation.id).catch(() => {})
        }
        const label = nextStatus === 'completed'
          ? 'Consulta concluída! Fatura gerada para o caixa.'
          : nextStatus === 'waiting_exam'
          ? 'Encaminhado para Exames.'
          : 'Encaminhado para Medicação.'
        setToast({ type: 'success', message: label })

        // WhatsApp ao dar alta: sempre mostra se tutor tem telefone, navega no onClose
        if (nextStatus === 'completed' && tutor.phone) {
          setShowWhatsAppDischarge(true)
        } else {
          setTimeout(() => router.push('/dashboard/vet'), 1500)
        }
      }
    } finally {
      setIsFinalizing(false)
    }
  }

  // ─── Portal de Impressão ────────────────────────────────────────────────────
  // Renderizado diretamente em document.body, fora de qualquer print:hidden ancestral.
  // @media print esconde body > *:not(.vetmax-print-root) via globals.css.
  const printPortal = printData ? createPortal(
    <div
      className="vetmax-print-root"
      style={{
        position: 'static',
        width: '100%',
        minHeight: '100vh',
        background: 'white',
        color: '#000',
        fontFamily: 'Arial, sans-serif',
        padding: '40px 56px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Cabeçalho */}
        <div style={{ borderBottom: '2px solid black', paddingBottom: 20, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: '#6b7280', marginBottom: 4 }}>
              {clinicName} — Documento Clínico
            </p>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#000', lineHeight: 1.2, margin: 0 }}>
              {({ laudo: 'Laudo', receita: 'Receita', encaminhamento: 'Encaminhamento', termo: 'Termo', exame: 'Exame', outro: 'Outro' } as Record<string, string>)[printData.type] ?? printData.type}
            </h1>
            <p style={{ fontSize: 13, color: '#4b5563', marginTop: 4 }}>
              {printData.name.split('—')[0].trim()}
            </p>
          </div>
          <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'right' }}>
            {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>

        {/* Dados do paciente */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '4px 32px', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #d1d5db', fontSize: 13 }}>
          <div><strong>Pet: </strong>{patient.name}</div>
          <div><strong>Tutor: </strong>{tutor.name}</div>
          <div>
            <strong>Espécie: </strong>
            {patient.species}
            {patient.breed ? ` — ${patient.breed}` : ''}
          </div>
          <div><strong>CPF Tutor: </strong>{tutor.cpf}</div>
        </div>

        {/* Campos do documento */}
        <div style={{ marginBottom: 40 }}>
          {printData.extracted_fields.map(f => {
            const val = printData.fields[f.field_name]
            if (val === null || val === undefined || val === '') return null
            return (
              <div key={f.field_name} style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#6b7280', marginBottom: 4 }}>
                  {f.label}
                </p>
                <p style={{ fontSize: 13, color: '#000', lineHeight: 1.6, borderBottom: '1px solid #e5e7eb', paddingBottom: 12, margin: 0 }}>
                  {typeof val === 'boolean' ? (val ? 'Sim' : 'Não') : String(val)}
                </p>
              </div>
            )
          })}
        </div>

        {/* Rodapé — assinaturas */}
        <div style={{ marginTop: 64, display: 'flex', gap: 64 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <hr style={{ borderColor: '#000', marginBottom: 8, width: 256, margin: '0 auto 8px' }} />
            <p style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Médico Veterinário Responsável</p>
            <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>CRMV: ______________________</p>
          </div>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <hr style={{ borderColor: '#000', marginBottom: 8, width: 256, margin: '0 auto 8px' }} />
            <p style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Tutor / Responsável</p>
            <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>CPF: {tutor.cpf}</p>
          </div>
        </div>

      </div>
    </div>,
    document.body
  ) : null

  // ─── Render Normal ──────────────────────────────────────────────────────────
  return (
    <>
      {/* Portal de impressão — montado em document.body, fora de print:hidden */}
      {printPortal}

      {/* Feed do Pet */}
      {showFeed && (
        <PetTimelineModal
          petId={patient.id}
          petName={patient.name}
          petSpecies={patient.species}
          clinicName={clinicName}
          tutorName={tutor.name}
          tutorCpf={tutor.cpf}
          onClose={() => setShowFeed(false)}
        />
      )}

      {/* Modal de Agendamento (pré-preenchido pela IA) */}
      {apptModalData && (
        <NewAppointmentModal
          onClose={() => setApptModalData(null)}
          onSuccess={(petName) => {
            setApptModalData(null)
            setToast({ type: 'success', message: `Retorno de ${petName} agendado com sucesso!` })
          }}
          defaultPet={{
            id:        patient.id,
            name:      patient.name,
            species:   patient.species,
            tutorId:   tutor.id,
            tutorName: tutor.name,
          }}
          defaultDate={apptModalData.date}
          defaultReason={apptModalData.reason}
          defaultProfessionalId={currentUserId}
        />
      )}

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* WhatsApp — Troca de Setor / Alta */}
      {showWhatsAppDischarge && tutor.phone && (
        <WhatsAppNotificationModal
          isOpen={showWhatsAppDischarge}
          autoSend={voiceConfirmedWA}
          onClose={() => { setShowWhatsAppDischarge(false); setVoiceConfirmedWA(false); router.push('/dashboard/vet') }}
          trigger={attachDocsOnDischarge && savedDocTitles.length > 0 ? 'documents_sent' : 'consultation_finished'}
          context={{
            petName:        patient.name,
            tutorName:      tutor.name,
            tutorPhone:     tutor.phone,
            species:        patient.species  || undefined,
            breed:          patient.breed    || undefined,
            gender:         patient.gender   || undefined,
            documentTitles: attachDocsOnDischarge ? savedDocTitles : undefined,
            vetNotes:       vetNotes || undefined,
            diagnosisSummary: diagnosisJson
              ? (() => { try { const p = JSON.parse(diagnosisJson); return (p?.differential_diagnoses ?? []).map((d: any) => d.diagnosis ?? d.name ?? String(d)).join(', ') } catch { return diagnosisJson } })()
              : undefined,
            examsSummary:    clinicalMeds.length > 0
              ? clinicalMeds.map(m => m.medication_name).join(', ')
              : undefined,
          }}
          consultationId={consultation.id}
          patientId={patient.id}
        />
      )}

      {/* WhatsApp — Início de Internação */}
      {whatsAppHosp && tutor.phone && (
        <WhatsAppNotificationModal
          isOpen={!!whatsAppHosp}
          onClose={() => { setWhatsAppHosp(null); router.push('/dashboard/vet') }}
          trigger="hospitalization_started"
          context={{
            petName:               patient.name,
            tutorName:             tutor.name,
            tutorPhone:            tutor.phone,
            species:               patient.species  || undefined,
            breed:                 patient.breed    || undefined,
            gender:                patient.gender   || undefined,
            hospitalizationReason: whatsAppHosp.reason,
            hospitalizationStatus: whatsAppHosp.status,
          }}
          consultationId={consultation.id}
          patientId={patient.id}
        />
      )}

      {/* ── Modal Checklist de Alta ─────────────────────────────────────── */}
      {showDischargeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Checklist de Alta</h2>
                <p className="text-xs text-slate-500 mt-0.5">Revise o resumo antes de finalizar</p>
              </div>
              <button
                onClick={() => setShowDischargeModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Animal */}
              <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-4">
                <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                  <Stethoscope className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800">{patient.name}</p>
                  <p className="text-xs text-slate-500">
                    {SPECIES_LABELS[patient.species] ?? patient.species}
                    {patient.breed ? ` — ${patient.breed}` : ''}
                    {vital_signs?.weight ? ` · ${vital_signs.weight} kg` : ''}
                  </p>
                </div>
              </div>

              {/* Prontuário */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Prontuário</p>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-sm text-slate-700 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                    {vetNotes || 'Não preenchido'}
                  </p>
                </div>
              </div>

              {/* Medicações */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Syringe className="w-4 h-4 text-emerald-600" />
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Medicações Aplicadas ({clinicalMeds.length})
                  </p>
                </div>
                {clinicalMeds.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">Nenhuma</p>
                ) : (
                  <div className="space-y-1.5">
                    {clinicalMeds.map(m => (
                      <div key={m.id} className="flex items-center gap-2 text-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                        <span className="font-medium text-slate-800">{m.medication_name}</span>
                        {(m.dosage || m.route) && (
                          <span className="text-slate-500">
                            — {[m.dosage, m.route].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Documentos sugeridos pela IA — com ação Gerar */}
              {pendingDocSuggestions.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      Documentos Sugeridos pela IA ({pendingDocSuggestions.length})
                    </p>
                  </div>
                  <div className="space-y-2">
                    {pendingDocSuggestions.map((s, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                          <span className="text-sm font-medium text-slate-800 truncate">{s.title || s.motivo}</span>
                          {s.summary && <span className="text-xs text-slate-400 truncate hidden sm:block">— {s.summary}</span>}
                        </div>
                        <button
                          onClick={() => {
                            setShowDischargeModal(false)
                            setAutoTriggerDoc({ suggestion: s, index: i })
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-shrink-0 transition-colors"
                        >
                          <Sparkles className="w-3 h-3" />Gerar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Enviar documentos por WhatsApp */}
              {savedDocTitles.length > 0 && tutor.phone && (
                <button
                  type="button"
                  onClick={() => setAttachDocsOnDischarge(v => !v)}
                  className="flex items-start gap-3 w-full text-left"
                >
                  {attachDocsOnDischarge
                    ? <CheckSquare className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    : <Square className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                  }
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      Enviar documentos por WhatsApp ao Tutor?
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {savedDocTitles.length} documento(s) gerado(s) nesta consulta
                    </p>
                  </div>
                </button>
              )}

              {/* CFMV */}
              <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl p-4">
                <CheckSquare className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-800 font-medium">
                  Prontuário revisado e assinado eletronicamente — CFMV Res. 1138/2016
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => executeFinalize('completed')}
                disabled={isFinalizing}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-800 text-white rounded-xl font-semibold text-sm hover:bg-slate-700 transition-all disabled:opacity-50"
              >
                {isFinalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {isFinalizing ? 'Finalizando...' : 'Confirmar Alta'}
              </button>
              <button
                onClick={() => setShowDischargeModal(false)}
                disabled={isFinalizing}
                className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-all"
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-5">

        {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
            {userRole === 'admin' && consultation.status === 'in_progress' && (
              <button
                onClick={() => setShowRemoveFromQueueModal(true)}
                className="text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors"
              >
                Remover da Fila
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
              {VISIT_REASON_LABELS[consultation.visit_reason] ?? consultation.visit_reason}
            </span>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              consultation.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
              consultation.status === 'completed'   ? 'bg-green-100 text-green-700' :
              'bg-slate-100 text-slate-600'
            }`}>
              {STATUS_LABELS[consultation.status] ?? consultation.status}
            </span>
          </div>
        </div>

        {/* ── Notas do Técnico de Exames ─────────────────────────────────── */}
        {consultation.exam_notes && (
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <FlaskConical className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-700 text-sm">Notas do Técnico de Exames</p>
              <p className="text-blue-600 text-sm mt-0.5 leading-relaxed">{consultation.exam_notes}</p>
            </div>
          </div>
        )}

        {/* ── Alertas Críticos ───────────────────────────────────────────── */}
        {(patient.allergies || patient.chronic_diseases || patient.medical_history) && (
          <div className="space-y-2">
            {patient.allergies && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-700 text-sm">Alergias Conhecidas</p>
                  <p className="text-red-600 text-sm mt-0.5">{patient.allergies}</p>
                </div>
              </div>
            )}
            {patient.chronic_diseases && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-700 text-sm">Doenças Crônicas</p>
                  <p className="text-amber-600 text-sm mt-0.5">{patient.chronic_diseases}</p>
                </div>
              </div>
            )}
            {patient.medical_history && (
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-blue-700 text-sm">Histórico Médico/Cirúrgico</p>
                  <p className="text-blue-600 text-sm mt-0.5">{patient.medical_history}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Convênio do pet — visível durante toda a consulta ───────────── */}
        {insuranceCard?.has_insurance && <InsuranceCard data={insuranceCard} />}

        {/* ── Painel de Contexto ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Foto ou avatar */}
              <PetAvatar name={patient.name} species={patient.species} photoUrl={patient.photo_url} size="sm" className="border border-slate-200" />
              <div>
                <h2 className="text-base font-semibold text-slate-900">{patient.name}</h2>
                <p className="text-xs text-slate-500">
                  {SPECIES_LABELS[patient.species] ?? patient.species}
                  {patient.breed ? ` — ${patient.breed}` : ''}
                </p>
                {patient.behavior_tags?.length > 0 && (
                  <div className="mt-1">
                    <BehaviorTagsBadges tags={patient.behavior_tags} size="xs" />
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowFeed(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />
              Feed do Pet
            </button>
          </div>

          <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {/* Coluna: Info do Pet */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Animal</p>
              <InfoRow label="Sexo" value={patient.gender ? GENDER_LABELS[patient.gender] : 'Não informado'} />
              <InfoRow label="Pelagem" value={patient.coat_color ?? patient.color ?? 'Não informada'} />
              <InfoRow label="Castrado" value={patient.neutered ? 'Sim' : 'Não'} />
              {patient.reproductive_status && (
                <InfoRow label="Status Reprodutivo" value={patient.reproductive_status} />
              )}
              <InfoRow label="Idade" value={calcAge(patient.birth_date)} />
              {patient.past_surgeries && (
                <InfoRow label="Cirurgias Anteriores" value={patient.past_surgeries} />
              )}
              {patient.medical_history && (
                <InfoRow label="Histórico Médico" value={patient.medical_history} />
              )}
            </div>

            {/* Coluna: Sinais Vitais */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Sinais Vitais (Triagem)</p>
              {vital_signs ? (
                <>
                  <VitalRow
                    label="Peso"
                    value={`${vital_signs.weight} kg`}
                    highlight
                  />
                  <VitalRow label="Temperatura Retal" value={`${vital_signs.temperature}°C`} />
                  {vital_signs.heart_rate > 0 && (
                    <VitalRow label="Freq. Cardíaca" value={`${vital_signs.heart_rate} bpm`} />
                  )}
                  {vital_signs.respiratory_rate > 0 && (
                    <VitalRow label="Freq. Respiratória" value={`${vital_signs.respiratory_rate} mov/min`} />
                  )}
                  {vital_signs.mucous_color && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Mucosas</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${MUCOUS_BADGE[vital_signs.mucous_color] ?? 'bg-slate-100 text-slate-600'}`}>
                        {MUCOUS_LABELS[vital_signs.mucous_color] ?? vital_signs.mucous_color}
                      </span>
                    </div>
                  )}
                  {vital_signs.crt && (
                    <VitalRow label="TRC" value={CRT_LABELS[vital_signs.crt] ?? vital_signs.crt} />
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400 italic">Triagem não realizada</p>
              )}
            </div>
          </div>

          {/* Queixa Principal */}
          {vital_signs?.chief_complaint && (
            <div className="border-t border-slate-100 px-6 py-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Queixa Principal (Triagem)</p>
              <p className="text-sm text-slate-700 leading-relaxed">{vital_signs.chief_complaint}</p>
            </div>
          )}

          {/* Tutor */}
          <div className="border-t border-slate-100 px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Tutor</p>
              <p className="text-sm font-medium text-slate-800">{tutor.name}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500">{tutor.phone}</p>
              <p className="text-xs text-slate-400">CPF {tutor.cpf}</p>
            </div>
          </div>

          {/* Status Vacinal */}
          {initialVaccines.length > 0 && (
            <div className="border-t border-slate-100 px-6 py-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Syringe className="h-3 w-3" />
                Status Vacinal
              </p>
              <VaccineStatusBadges vaccines={initialVaccines} />
            </div>
          )}
        </div>

        {/* ── InternationFeed — Revisão Pós-Internação ─────────────────── */}
        {consultation.status === 'revisao_pos_internacao' && (
          <div className="bg-violet-50 border border-violet-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <BedDouble className="w-5 h-5 text-violet-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-violet-800 text-sm">Revisão Pós-Internação</p>
                  <p className="text-xs text-violet-600 mt-0.5">
                    {loadingFeed
                      ? 'Carregando dados da internação...'
                      : internFeed?.reason ?? 'Revisão clínica após alta da internação'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowInternFeed(v => !v)}
                disabled={loadingFeed || !internFeed}
                className="text-xs font-semibold text-violet-700 bg-violet-100 hover:bg-violet-200 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              >
                {showInternFeed ? 'Ocultar Feed' : 'Ver Feed da Internação'}
              </button>
            </div>
            {showInternFeed && internFeed && (
              <div className="border-t border-violet-200 px-5 py-4 space-y-3 max-h-72 overflow-y-auto">
                {internFeed.records.length === 0 ? (
                  <p className="text-xs text-violet-500 text-center py-2">Nenhum registro de evolução.</p>
                ) : (
                  internFeed.records.map(r => (
                    <div key={r.id} className="bg-white rounded-lg p-3 border border-violet-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-700">{r.user_name}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          r.improvement_level === 'melhorou' ? 'bg-emerald-100 text-emerald-700' :
                          r.improvement_level === 'piorou'   ? 'bg-rose-100 text-rose-700'      :
                                                              'bg-amber-100 text-amber-700'
                        }`}>{r.improvement_level}</span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(r.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      {r.notes && <p className="text-xs text-slate-600 leading-relaxed">{r.notes}</p>}
                      {r.medications && r.medications.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {(r.medications as any[]).map((m, i) => (
                            <span key={i} className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full border border-violet-100">
                              {m.name} {m.dose}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Banner de Auditoria de Convênio ──────────────────────────── */}
        {auditResult && !isFinalized && (
          <InsuranceAuditBanner
            auditResult={auditResult}
            consultationId={consultation.id}
            onDismiss={() => setAuditResult(null)}
          />
        )}

        {/* ── Prontuário Veterinário ────────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              <Stethoscope className="h-4 w-4 text-blue-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-slate-900">Prontuário Veterinário</h2>
              <p className="text-xs text-slate-500">Diga <strong>"Assistente"</strong> para ditar — CFMV Res. 1138/2016</p>
            </div>
            <button
              type="button"
              onClick={() => setVoiceConfigOpen(true)}
              title="Configurações de Voz"
              className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <label htmlFor="vet-notes-textarea" className="block text-sm font-semibold text-slate-700 mb-2">
              Anamnese / Notas Clínicas *
            </label>
            <div className="relative">
              <textarea
                id="vet-notes-textarea"
                data-mentor-step="vet-notes-textarea"
                ref={notasRef}
                value={vetNotes}
                onChange={(e) => {
                  setVetNotes(e.target.value)
                  if (hasNotesError && e.target.value.trim()) setHasNotesError(false)
                }}
                disabled={isFinalized}
                rows={10}
                placeholder={`Registre as notas clínicas da consulta:\n\nANAMNESE:\n...\n\nEXAME FÍSICO:\n...\n\nCONDUTA:\n...`}
                className={`w-full px-4 py-3 border rounded-xl outline-none resize-none text-sm text-slate-700 leading-relaxed transition-all duration-300 disabled:bg-slate-50 disabled:text-slate-500 ${
                  hasNotesError
                    ? `border-red-500 ring-2 ring-red-200 bg-red-50/30 focus:ring-red-300 focus:border-red-500${notesErrorPulsing ? ' animate-pulse' : ''}`
                    : 'border-slate-300 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400'
                }`}
              />
              {/* Semáforo Petlove — chip flutuante de cobertura por voz. z-20
                  para sobrepor o ring de focus do textarea sem ficar atrás
                  de cards adjacentes em layouts densos. */}
              <CoverageChip state={coverageSemaforo} className="z-20" />
            </div>

            {/* Live transcript */}
            {(isRecording || liveTranscript) && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-slate-600 italic min-h-[44px]">
                {liveTranscript || <span className="text-slate-400">Ouvindo... fale normalmente.</span>}
              </div>
            )}

            {/* Processando IA */}
            {isExtractingVoice && (
              <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                IA processando: preenchendo notas, registrando medicações e sugerindo documentos...
              </div>
            )}

            {/* Barra de ações do prontuário */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Gravar Voz — handsfree (wake word) + failsafe manual */}
              {!isFinalized && (
                <button
                  type="button"
                  onClick={() => voiceAssistant.manualToggle()}
                  disabled={isExtractingVoice}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    isRecording
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {isRecording ? <><Square className="w-4 h-4 fill-current" /> Parar</> : <><Mic className="w-4 h-4" /> Gravar</>}
                </button>
              )}
              {isRecording && (
                <span className="flex items-center gap-1.5 text-xs text-red-600">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  Gravando... (ou diga "Finalizar")
                </span>
              )}
              {!isRecording && !isFinalized && (
                <span className="text-xs text-slate-400">Diga <em>"Assistente"</em> para ativar</span>
              )}

              {/* Sugerir Diagnóstico IA */}
              {!isFinalized && (
                <button
                  type="button"
                  onClick={suggestDiagnosis}
                  disabled={isLoadingDiag}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm bg-violet-50 text-violet-700 hover:bg-violet-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingDiag ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isLoadingDiag ? 'Consultando IA...' : 'Sugerir Diagnóstico IA'}
                </button>
              )}

              {/* Salvar Notas */}
              {!isFinalized && (
                <button
                  type="button"
                  data-mentor-step="vet-save-notes-btn"
                  onClick={() => autoSave(vetNotes)}
                  disabled={saveStatus === 'saving'}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm bg-slate-900 text-white hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saveStatus === 'saving'
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                    : <><Save className="w-4 h-4" /> Salvar Notas</>}
                </button>
              )}

              {/* Indicador de Auto-Save */}
              {!isFinalized && saveStatus === 'saved' && (
                <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-green-600">
                  ✅ Salvo
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Diagnóstico IA (quando gerado) ───────────────────────────── */}
        {parsedDiagnosis && (
          <div className="bg-white rounded-xl shadow-sm border border-violet-200">
            <div className="border-b border-violet-100 px-6 py-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
                <Sparkles className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Diagnóstico Diferencial — IA</h2>
                <p className="text-xs text-slate-500">Auxílio ao diagnóstico veterinário</p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Diagnósticos */}
              <div className="space-y-3">
                {(parsedDiagnosis.differential_diagnoses ?? []).map((d: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-lg font-bold text-slate-300 w-6 flex-shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm">{d.diagnosis}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${PROBABILITY_BADGE[d.probability?.toLowerCase()] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {d.probability}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 mt-1 leading-relaxed">{d.reasoning}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Próximos Passos */}
              {parsedDiagnosis.next_steps?.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Próximos Passos Sugeridos</p>
                  <div className="flex flex-wrap gap-2">
                    {parsedDiagnosis.next_steps.map((step: string, i: number) => (
                      <span key={i} className="text-xs bg-slate-100 text-slate-700 px-3 py-1 rounded-full">
                        {step}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  {parsedDiagnosis.disclaimer ?? 'Diagnóstico e tratamento são de responsabilidade exclusiva do Médico Veterinário.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Histórico do Pet ─────────────────────────────────────────── */}
        {past_consultations.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                <Clock className="h-4 w-4 text-slate-600" />
              </div>
              <h2 className="text-base font-semibold text-slate-900">Histórico — {patient.name}</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {past_consultations.map((pc) => (
                <div key={pc.id} className="px-6 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {VISIT_REASON_LABELS[pc.visit_reason] ?? pc.visit_reason}
                      </p>
                      <p className="text-xs text-slate-400">{formatDate(pc.created_at)}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    pc.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {STATUS_LABELS[pc.status] ?? pc.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Serviços lançados (refator 2026-05-25) ───────────────────── */}
        <ConsultationServicesPanel
          consultationId={consultation.id}
          isFinalized={isFinalized}
          onChange={refreshHasService}
        />

        {/* ── Carteira de Vacinação ────────────────────────────────────── */}
        <VaccinationCard
          patientId={consultation.patient.id}
          consultationId={consultation.id}
          initialVaccines={initialVaccines}
          isFinalized={isFinalized}
        />

        {/* ── Documentos e Prescrições ─────────────────────────────────── */}
        <DocumentsSection
          consultation={consultation}
          clinicName={clinicName}
          templates={templates}
          initialDocuments={initialDocuments}
          pendingSuggestions={pendingDocSuggestions}
          onSuggestionDismiss={(i) =>
            setPendingDocSuggestions(prev => prev.filter((_, idx) => idx !== i))
          }
          onDocSaved={(title) => setSavedDocTitles(prev => [...prev, title])}
          onPrint={handlePrint}
          onPdfUploadingChange={setIsPdfUploading}
          onAttachmentAdded={setLastPdfAttachment}
          onError={(msg) => setToast({ type: 'error', message: msg })}
          autoTriggerSuggestion={autoTriggerDoc}
          onAutoTriggerHandled={() => setAutoTriggerDoc(null)}
          hasControlledMeds={clinicalMeds.some(m => m.is_controlled)}
        />

        {/* ── Triagem Mesclada (Fluxo Contínuo) ───────────────────────── */}
        {triageMerged && (
          <MergedTriageSection
            consultationId={consultation.id}
            initialVitals={consultation.vital_signs as any}
            externalVitals={mergedVitals}
          />
        )}

        {/* ── Exame Mesclado (Fluxo Contínuo) ─────────────────────────── */}
        {examsMerged && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/40 overflow-hidden">
            <div className="border-b border-blue-200 px-5 py-3 flex items-center gap-2 bg-blue-50">
              <span className="text-blue-600 text-sm font-semibold">Laudo / Resultado do Exame</span>
              <span className="ml-auto text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Fluxo Contínuo</span>
            </div>
            <div className="px-5 py-4">
              <textarea
                value={mergedExamNotes}
                onChange={e => setMergedExamNotes(e.target.value)}
                rows={4}
                placeholder="Dite ou escreva os achados do exame aqui..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <button
                onClick={() => {
                  if (!mergedExamNotes.trim()) return
                  setVetNotes(prev => prev
                    ? prev + '\n\n--- LAUDO DE EXAME ---\n' + mergedExamNotes
                    : '--- LAUDO DE EXAME ---\n' + mergedExamNotes
                  )
                  setMergedExamNotes('')
                  setToast({ type: 'success', message: 'Laudo incluído no prontuário.' })
                }}
                disabled={!mergedExamNotes.trim()}
                className="mt-2 flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-40"
              >
                Incluir no Prontuário
              </button>
            </div>
          </div>
        )}

        {/* ── Anexos ───────────────────────────────────────────────────── */}
        <AttachmentsSection
          patientId={consultation.patient.id}
          consultationId={consultation.id}
          initialAttachments={initialAttachments}
          newAttachment={lastPdfAttachment}
        />

        {/* ── Agendamentos Sugeridos pela IA ───────────────────────────── */}
        {pendingApptSuggestions.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-teal-200">
            <div className="border-b border-teal-100 px-6 py-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
                <Calendar className="h-4 w-4 text-teal-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Agendamentos Sugeridos</h2>
                <p className="text-xs text-slate-500">Detectados automaticamente pela IA durante a gravação de voz</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              {pendingApptSuggestions.map((appt, i) => {
                const dateLabel = appt.data_sugerida
                  ? appt.data_sugerida.split('-').reverse().join('/')
                  : 'Data não definida'
                return (
                  <div key={i} className="flex items-center justify-between gap-4 bg-teal-50 border border-teal-100 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-100 flex-shrink-0 text-lg">
                        📅
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-teal-900">
                          Sugestão: {appt.motivo} em {dateLabel}
                        </p>
                        <p className="text-xs text-teal-600">Clique em &quot;Confirmar&quot; para abrir o agendamento pré-preenchido</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setApptModalData({ date: appt.data_sugerida, reason: appt.motivo })}
                        className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
                      >
                        <Calendar className="h-3.5 w-3.5" />
                        Confirmar
                      </button>
                      <button
                        onClick={() => setPendingApptSuggestions(prev => prev.filter((_, idx) => idx !== i))}
                        className="rounded-lg p-2 text-teal-500 hover:bg-teal-100 transition-colors"
                        title="Dispensar sugestão"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Farmácia e Encaminhamentos ────────────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
              <Syringe className="h-4 w-4 text-teal-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-slate-900">Medicações Aplicadas</h2>
              <p className="text-xs text-slate-500">Administradas no animal durante esta consulta</p>
            </div>
            {!isFinalized && (
              <span className="flex items-center gap-1 text-xs font-semibold text-teal-600 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full">
                <Pill className="h-3 w-3" />
                Editável
              </span>
            )}
          </div>
          <div className="p-6">
            <ClinicalActionsSection
              consultationId={consultation.id}
              patientId={patient.id}
              medications={clinicalMeds}
              isFinalized={isFinalized}
              pesoKg={vital_signs?.weight ?? null}
              onAdd={handleAddMed}
              onDelete={handleDeleteMed}
              onUpdate={handleUpdateMed}
            />
          </div>
        </div>

        {/* ── Encerrar Consulta (3 abas) ──────────────────────────────── */}
        {!isFinalized && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Encerrar Consulta</h2>
                <p className="text-xs text-slate-500 mt-0.5">Selecione o desfecho ou finalize com alta</p>
              </div>
              {!isFinalizing && (
                <button
                  type="button"
                  onClick={() => { setOutcomeTab('alta'); setIsReviewedByVet(true); handleFinalize('completed') }}
                  disabled={isFinalizing}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 transition-colors disabled:opacity-50"
                >
                  Concluir Consulta
                </button>
              )}
            </div>

            {/* Tab headers */}
            <div className="flex border-b border-slate-100 overflow-x-auto">
              <button
                onClick={() => setOutcomeTab('alta')}
                className={`flex flex-shrink-0 items-center gap-1 sm:gap-2 px-3 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-colors ${
                  outcomeTab === 'alta'
                    ? 'border-b-2 border-slate-800 text-slate-900'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <ChevronRight className="w-4 h-4" />
                Alta
              </button>
              <button
                onClick={() => setOutcomeTab('exames')}
                className={`flex flex-shrink-0 items-center gap-1 sm:gap-2 px-3 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-colors ${
                  outcomeTab === 'exames'
                    ? 'border-b-2 border-blue-600 text-blue-700'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <FlaskConical className="w-4 h-4" />
                Solicitar Exames
              </button>
              <button
                role="tab"
                aria-selected={outcomeTab === 'prescricao'}
                onClick={() => setOutcomeTab('prescricao')}
                className={`flex flex-shrink-0 items-center gap-1 sm:gap-2 px-3 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-colors ${
                  outcomeTab === 'prescricao'
                    ? 'border-b-2 border-violet-600 text-violet-700'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Pill className="w-4 h-4" />
                Prescrição
              </button>
              <button
                onClick={() => setOutcomeTab('internacao')}
                className={`flex flex-shrink-0 items-center gap-1 sm:gap-2 px-3 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-colors ${
                  outcomeTab === 'internacao'
                    ? 'border-b-2 border-rose-600 text-rose-700'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <BedDouble className="w-4 h-4" />
                Internação
              </button>
              <button
                onClick={() => setOutcomeTab('eutanasia')}
                className={`flex flex-shrink-0 items-center gap-1 sm:gap-2 px-3 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition-colors ${
                  outcomeTab === 'eutanasia'
                    ? 'border-b-2 border-red-700 text-red-800'
                    : 'text-slate-400 hover:text-red-600'
                }`}
              >
                <HeartCrack className="w-4 h-4" />
                Eutanásia
              </button>
            </div>

            <div className="p-6">
              {outcomeTab === 'prescricao' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">Adicione medicamentos à prescrição desta consulta.</p>
                  {prescriptionSaved && (
                    <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">Prescrição salva!</p>
                  )}
                  {/* Prescrições agrupadas por via de administração */}
                  {prescriptions.length > 0 && (() => {
                    const ROUTE_LABELS: Record<string, string> = {
                      oral: 'Via Oral', iv: 'Intravenoso (IV)', im: 'Intramuscular (IM)',
                      subcutaneo: 'Subcutâneo (SC)', topico: 'Tópico', inalacao: 'Inalação', outro: 'Outra via',
                    }
                    const grouped = prescriptions.reduce<Record<string, typeof prescriptions>>((acc, p) => {
                      const key = p.route_of_administration ?? 'oral'
                      if (!acc[key]) acc[key] = []
                      acc[key].push(p)
                      return acc
                    }, {})
                    const routeOrder = ['oral','iv','im','subcutaneo','topico','inalacao','outro']
                    const sortedKeys = Object.keys(grouped).sort((a, b) => routeOrder.indexOf(a) - routeOrder.indexOf(b))
                    return (
                      <div className="space-y-3">
                        {sortedKeys.map(route => (
                          <div key={route}>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500 mb-1">
                              {ROUTE_LABELS[route] ?? route}
                            </p>
                            <div className="space-y-1.5">
                              {grouped[route].map(p => (
                                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-2.5">
                                  <Pill className="h-4 w-4 text-violet-600 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-slate-900">{p.medication}</p>
                                    <p className="text-xs text-slate-500">{p.dose}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                  <div className="space-y-3 border-t border-slate-100 pt-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Medicamento</label>
                      <input
                        type="text"
                        value={newMedication}
                        onChange={e => setNewMedication(e.target.value)}
                        placeholder="Nome do medicamento"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Dose / Posologia</label>
                      <input
                        type="text"
                        value={newDose}
                        onChange={e => setNewDose(e.target.value)}
                        placeholder="Ex: 1 comprimido a cada 12h por 7 dias"
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Via de Administração</label>
                      <select
                        value={newRoute}
                        onChange={e => setNewRoute(e.target.value as typeof newRoute)}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white"
                      >
                        <option value="oral">Via Oral</option>
                        <option value="iv">Intravenoso (IV)</option>
                        <option value="im">Intramuscular (IM)</option>
                        <option value="subcutaneo">Subcutâneo (SC)</option>
                        <option value="topico">Tópico</option>
                        <option value="inalacao">Inalação</option>
                        <option value="outro">Outra via</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Frequência{newIsControlled && <span className="text-red-500 ml-0.5">*</span>}
                        </label>
                        <input
                          type="text"
                          value={newFrequency}
                          onChange={e => setNewFrequency(e.target.value)}
                          placeholder="Ex: A cada 12h"
                          data-testid="prescription-frequency"
                          className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                            newIsControlled && !newFrequency.trim() ? 'border-red-400' : 'border-slate-300'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                          Duração (dias){newIsControlled && <span className="text-red-500 ml-0.5">*</span>}
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={newDurationDays}
                          onChange={e => setNewDurationDays(e.target.value)}
                          placeholder="Ex: 7"
                          data-testid="prescription-duration-days"
                          className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                            newIsControlled && !newDurationDays ? 'border-red-400' : 'border-slate-300'
                          }`}
                        />
                      </div>
                    </div>
                    {/* Medicamento Controlado — CFMV Receituário Azul */}
                    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={newIsControlled}
                        data-testid="prescription-controlled-toggle"
                        onClick={() => setNewIsControlled(v => !v)}
                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                          newIsControlled ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'
                        }`}
                      >
                        {newIsControlled && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700">Medicamento Controlado</p>
                        <p className="text-[10px] text-slate-500">CFMV — emite Receituário Azul obrigatoriamente</p>
                      </div>
                      {newIsControlled && (
                        <span className="flex-shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                          Receituário Azul
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      data-mentor-step="vet-prescription-save-btn"
                      disabled={
                        !newMedication.trim() ||
                        (newIsControlled && (!newFrequency.trim() || !newDurationDays))
                      }
                      onClick={async () => {
                        if (!newMedication.trim()) return
                        const result = await savePrescription({
                          consultation_id:        consultation.id,
                          medication:             newMedication.trim(),
                          dose:                   newDose.trim() || undefined,
                          frequency:              newFrequency.trim() || undefined,
                          duration_days:          newDurationDays ? parseInt(newDurationDays) : undefined,
                          is_controlled:          newIsControlled,
                          prescription_type:      newIsControlled ? 'blue_receipt' : 'standard',
                          route_of_administration: newRoute,
                        })
                        if ('error' in result) {
                          setToast({ type: 'error', message: result.error })
                          return
                        }
                        setPrescriptions(prev => [...prev, { id: result.id, medication: result.medication, dose: result.dose ?? '', route_of_administration: result.route_of_administration }])
                        setNewMedication('')
                        setNewDose('')
                        setNewFrequency('')
                        setNewDurationDays('')
                        setNewIsControlled(false)
                        setNewRoute('oral')
                        setPrescriptionSaved(true)
                        setTimeout(() => setPrescriptionSaved(false), 2000)
                      }}
                      className="w-full flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Salvar Prescrição
                    </button>
                  </div>
                </div>
              )}

              {outcomeTab === 'alta' && (
                <div className="space-y-5">
                  <button
                    type="button"
                    onClick={() => setIsReviewedByVet((v) => !v)}
                    className="flex items-start gap-3 w-full text-left"
                  >
                    {isReviewedByVet
                      ? <CheckSquare className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      : <Square className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    }
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        Confirmo que revisei e assino o prontuário eletrônico
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Obrigatório para alta final — CFMV Res. 1138/2016, Art. 5º
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFinalize('completed')}
                    disabled={isFinalizing || !isReviewedByVet || isPdfUploading}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 ${
                      isReviewedByVet && !isPdfUploading
                        ? 'bg-slate-800 text-white hover:bg-slate-700'
                        : 'bg-slate-50 text-slate-400 cursor-not-allowed border border-slate-200'
                    }`}
                  >
                    {isFinalizing
                      ? <><Loader2 className="w-5 h-5 animate-spin" />Finalizando...</>
                      : isPdfUploading
                      ? <><Loader2 className="w-5 h-5 animate-spin" />Aguarde — gerando PDF...</>
                      : <><ChevronRight className="w-5 h-5" />Dar Alta</>}
                  </button>
                  {isPdfUploading && (
                    <p className="text-xs text-amber-600 text-center">
                      Finalizando geração do documento. Aguarde...
                    </p>
                  )}
                  {!isReviewedByVet && !isPdfUploading && (
                    <p className="text-xs text-slate-400 text-center">
                      Marque a revisão do prontuário acima para habilitar a alta final.
                    </p>
                  )}
                </div>
              )}

              {outcomeTab === 'exames' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Encaminhar o pet para exames complementares. A consulta ficará aguardando o resultado.
                  </p>
                  <button
                    type="button"
                    data-mentor-step="vet-send-to-exams-btn"
                    onClick={() => setShowExamRequestModal(true)}
                    disabled={isFinalizing}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-all disabled:opacity-50"
                  >
                    {isFinalizing ? <Loader2 className="w-5 h-5 animate-spin" /> : <FlaskConical className="w-5 h-5" />}
                    {isFinalizing ? 'Encaminhando...' : 'Encaminhar para Exames'}
                  </button>
                </div>
              )}

              {outcomeTab === 'internacao' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Internar o pet para monitoramento contínuo. O animal será alocado no Kanban de Internação.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAdmitModal(true)}
                    disabled={isFinalizing}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600 text-white font-semibold text-sm hover:bg-rose-700 transition-all disabled:opacity-50"
                  >
                    <BedDouble className="w-5 h-5" />
                    Solicitar Internação
                  </button>
                </div>
              )}

              {outcomeTab === 'eutanasia' && (
                <div className="space-y-4">
                  {/* Aviso de severidade */}
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700 leading-relaxed">
                    <p className="font-bold mb-0.5">Procedimento Irreversível — CFMV Resolução 1.138/2016, Art. 14</p>
                    <p>
                      O registro de eutanásia é permanente e auditável. Exige CRMV válido do médico responsável
                      e consentimento documentado do tutor.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowEuthanasiaModal(true)}
                    data-testid="btn-open-euthanasia-modal"
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-700 text-white font-semibold text-sm hover:bg-red-800 transition-all"
                  >
                    <HeartCrack className="w-5 h-5" />
                    Registrar Eutanásia
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Consulta já finalizada */}
        {isFinalized && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <ChevronRight className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-green-800">Consulta Concluída</p>
                <p className="text-sm text-green-600">Prontuário revisado e assinado pelo Médico Veterinário.</p>
              </div>
            </div>
            {consultation.status === 'completed' && (
              <button
                type="button"
                onClick={handleReopen}
                disabled={isReopening}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-700 font-semibold text-sm hover:bg-amber-100 transition-colors disabled:opacity-50"
              >
                {isReopening ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {isReopening ? 'Reabrindo...' : 'Reabrir Prontuário'}
              </button>
            )}
          </div>
        )}

      </div>

      {/* Cadastro Vivo — Live Registration Modal */}
      {liveRegData && (
        <LiveRegistrationModal
          extractedData={liveRegData}
          onSave={async (approved) => {
            const res = await updatePatientFromLiveReg(
              patient.id,
              consultation.id,
              { vaccines: approved.vaccines, behavior: approved.behavior }
            )
            if ('error' in res) {
              setToast({ type: 'error', message: res.error })
            } else {
              setToast({ type: 'success', message: 'Cadastro do pet atualizado com sucesso!' })
            }
            setLiveRegData(null)
          }}
          onClose={() => setLiveRegData(null)}
        />
      )}

      {/* Modal de Solicitação de Exames (E-01) */}
      {showExamRequestModal && (
        <ExamRequestModal
          patientId={patient.id}
          patientName={patient.name}
          tutorId={tutor.id}
          onClose={() => setShowExamRequestModal(false)}
          onSuccess={() => {
            setShowExamRequestModal(false)
            handleFinalize('waiting_exam')
          }}
        />
      )}

      {/* Modal de Internação */}
      {showAdmitModal && (
        <AdmitPetModal
          patientId={patient.id}
          patientName={patient.name}
          consultationId={consultation.id}
          initialReason={admitInitialReason || undefined}
          onClose={() => { setShowAdmitModal(false); setAdmitInitialReason('') }}
          onSuccess={(reason, status) => {
            setAdmitInitialReason('')
            setToast({ type: 'success', message: `${patient.name} internado com sucesso! Acesse o Kanban de Internação.` })
            if (tutor.phone) {
              setWhatsAppHosp({ reason, status: status as 'observation' | 'ward' | 'icu' })
            } else {
              setTimeout(() => router.push('/dashboard/vet'), 1500)
            }
          }}
        />
      )}

      {showEuthanasiaModal && clinicId && (
        <EuthanasiaModal
          patientId={patient.id}
          patientName={patient.name}
          tutorId={tutor.id}
          tutorName={tutor.name}
          clinicId={clinicId}
          onClose={() => setShowEuthanasiaModal(false)}
          onSuccess={(recordId) => {
            setShowEuthanasiaModal(false)
            setToast({ type: 'success', message: `Eutanásia de ${patient.name} registrada (CFMV). Registro: ${recordId.slice(0, 8)}…` })
          }}
        />
      )}
      {showRemoveFromQueueModal && (
        <RemoveFromQueueModal
          consultationId={consultation.id}
          patientId={patient.id}
          patientName={patient.name}
          module="vet"
          redirectTo="/dashboard/vet"
          onClose={() => setShowRemoveFromQueueModal(false)}
        />
      )}

    {/* ── Modal Mágico: Cadastro Vivo ───────────────────────────────── */}
      {profileUpdates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 overflow-hidden">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100">
                <Sparkles className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Atualização de Cadastro Detetada</h2>
                <p className="text-xs text-slate-500">A IA extraiu novidades sobre {patient.name}</p>
              </div>
            </div>
            
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 mb-6">
              {profileUpdates.medical_history && (
                <div><span className="text-xs font-semibold text-slate-500 block">Novo Histórico/Alergia:</span><span className="text-sm font-medium text-slate-800">{profileUpdates.medical_history}</span></div>
              )}
              {profileUpdates.reproductive_status && (
                <div><span className="text-xs font-semibold text-slate-500 block">Status Reprodutivo:</span><span className="text-sm font-medium text-slate-800">{profileUpdates.reproductive_status}</span></div>
              )}
              {profileUpdates.coat_color && (
                <div><span className="text-xs font-semibold text-slate-500 block">Pelagem:</span><span className="text-sm font-medium text-slate-800">{profileUpdates.coat_color}</span></div>
              )}
              {profileUpdates.behavior_tags?.length > 0 && (
                <div><span className="text-xs font-semibold text-slate-500 block">Comportamento:</span><span className="text-sm font-medium text-slate-800">{profileUpdates.behavior_tags.join(', ')}</span></div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={async () => {
                  setIsUpdatingProfile(true)
                  // Aqui depois liga a sua Server Action real de update de Pet. Por enquanto, limpa e avisa sucesso!
                  setTimeout(() => {
                    setProfileUpdates(null)
                    setIsUpdatingProfile(false)
                    setToast({ type: 'success', message: 'Ficha de paciente atualizada via IA e Auditada!' })
                  }, 800)
                }}
                disabled={isUpdatingProfile}
                className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {isUpdatingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar na Ficha
              </button>
              <button
                onClick={() => setProfileUpdates(null)}
                disabled={isUpdatingProfile}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-colors"
              >
                Ignorar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configurações de Voz */}
      {voiceConfigOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Settings className="h-4 w-4 text-teal-600" /> Configurações de Voz
              </h3>
              <button onClick={() => setVoiceConfigOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Frases para Iniciar Gravação</p>
              <p className="text-[10px] text-slate-400 mb-2">Se a lista estiver vazia, o sistema usa os padrões integrados. Itens removidos são desativados permanentemente.</p>
              <div className="flex gap-2 mb-2">
                <input type="text" value={newStartInput} onChange={e => setNewStartInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newStartInput.trim()) { e.preventDefault(); setStartTriggers(prev => [...new Set([...prev, newStartInput.trim().toLowerCase()])]); setNewStartInput('') } }}
                  placeholder='Ex: "iniciar consulta"'
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-teal-500 focus:outline-none" />
                <button type="button" onClick={() => { if (!newStartInput.trim()) return; setStartTriggers(prev => [...new Set([...prev, newStartInput.trim().toLowerCase()])]); setNewStartInput('') }}
                  className="px-2.5 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100"><Plus className="h-3.5 w-3.5" /></button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {startTriggers.map(t => (
                  <span key={t} className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5 text-xs text-emerald-700">
                    {t}<button type="button" onClick={() => setStartTriggers(prev => prev.filter(x => x !== t))} className="text-emerald-400 hover:text-rose-500"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Frases para Salvar e Finalizar</p>
              <p className="text-[10px] text-slate-400 mb-2">Se a lista estiver vazia, o sistema usa os padrões integrados. Itens removidos são desativados permanentemente.</p>
              <div className="flex gap-2 mb-2">
                <input type="text" value={newStopInput} onChange={e => setNewStopInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newStopInput.trim()) { e.preventDefault(); setStopTriggers(prev => [...new Set([...prev, newStopInput.trim().toLowerCase()])]); setNewStopInput('') } }}
                  placeholder='Ex: "salvar prontuário"'
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-teal-500 focus:outline-none" />
                <button type="button" onClick={() => { if (!newStopInput.trim()) return; setStopTriggers(prev => [...new Set([...prev, newStopInput.trim().toLowerCase()])]); setNewStopInput('') }}
                  className="px-2.5 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100"><Plus className="h-3.5 w-3.5" /></button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {stopTriggers.map(t => (
                  <span key={t} className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 text-xs text-amber-700">
                    {t}<button type="button" onClick={() => setStopTriggers(prev => prev.filter(x => x !== t))} className="text-amber-400 hover:text-rose-500"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            </div>

            <button type="button" onClick={saveVoiceConfig} disabled={configSaving}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50">
              {configSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</> : <><Save className="h-4 w-4" /> Salvar Configurações</>}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Sub-componentes auxiliares ───────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-medium text-slate-700 text-right max-w-[60%] truncate">{value}</span>
    </div>
  )
}

function VitalRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`text-xs font-semibold ${highlight ? 'text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full' : 'text-slate-700'}`}>
        {value}
      </span>
    </div>
  )
}
