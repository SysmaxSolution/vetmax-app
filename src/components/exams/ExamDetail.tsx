'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Mic, MicOff, Loader2, AlertCircle,
  FlaskConical, FileText, ChevronRight, X, BedDouble, LogOut,
  Settings, Plus, Save,
} from 'lucide-react'
import { useClinicalVoiceAssistant } from '@/hooks/useClinicalVoiceAssistant'
import { getClinicVoiceTriggers, updateClinicVoiceTriggers } from '@/lib/actions/clinic-settings'
import { returnToVet, dischargeFromExams } from '@/lib/actions/exams'
import { Toast } from '@/components/ui/toast'
import { PetAvatar } from '@/components/ui/PetAvatar'
import DocumentsSection, { type PrintState } from '@/components/vet/DocumentsSection'
import AttachmentsSection from '@/components/ui/AttachmentsSection'
import WhatsAppNotificationModal from '@/components/whatsapp/WhatsAppNotificationModal'
import { RemoveFromQueueModal } from '@/components/ui/RemoveFromQueueModal'
import AdmitPetModal from '@/components/hospitalization/AdmitPetModal'
import type { VetConsultationDetail } from '@/lib/actions/vet'
import type { DocumentTemplate } from '@/types'
import type { PatientDocument } from '@/lib/actions/documents'
import type { Attachment } from '@/lib/actions/attachments'

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  consultation:        VetConsultationDetail
  clinicName?:         string
  templates?:          DocumentTemplate[]
  initialDocuments?:   PatientDocument[]
  initialAttachments?: Attachment[]
  userRole?:           string
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function calcAge(birthDate: string | null): string {
  if (!birthDate) return 'Não informada'
  const birth = new Date(birthDate)
  const today = new Date()
  const months = (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth())
  if (months < 12) return `${months} ${months === 1 ? 'mês' : 'meses'}`
  const years = Math.floor(months / 12)
  return `${years} ${years === 1 ? 'ano' : 'anos'}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ExamDetail({
  consultation,
  clinicName = 'SysVetMax',
  templates = [],
  initialDocuments = [],
  initialAttachments = [],
  userRole,
}: Props) {
  const router = useRouter()
  const { patient, tutor, vital_signs } = consultation

  // Exam notes for the vet
  const [examNotes,     setExamNotes]     = useState('')
  const [isReturning,   setIsReturning]   = useState(false)
  const [showConfirm,   setShowConfirm]   = useState(false)
  const [showWhatsApp,  setShowWhatsApp]  = useState(false)
  const [showRemoveModal,  setShowRemoveModal]  = useState(false)
  const [showAdmitModal,   setShowAdmitModal]   = useState(false)
  const [isDischargingExam, setIsDischargingExam] = useState(false)

  // Document suggestions from voice dictation
  const [examSuggestions, setExamSuggestions] = useState<Array<{ tipo: string; motivo: string; title: string; summary: string }>>([])

  // Toast & print
  const [toast,     setToast]     = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [printData, setPrintData] = useState<PrintState | null>(null)

  // Handsfree voice assistant
  const [startTriggers,  setStartTriggers]  = useState<string[]>([])
  const [stopTriggers,   setStopTriggers]   = useState<string[]>([])
  const [voiceConfigOpen, setVoiceConfigOpen] = useState(false)
  const [configSaving,   setConfigSaving]   = useState(false)
  const [newStartInput,  setNewStartInput]  = useState('')
  const [newStopInput,   setNewStopInput]   = useState('')

  const handleVoiceAutoSave = useCallback((transcript: string) => {
    if (!transcript.trim()) return
    setExamSuggestions(prev => [...prev, { tipo: 'laudo', motivo: transcript, title: 'Laudo por Voz', summary: transcript }])
    setToast({ type: 'success', message: 'Transcrição capturada. Clique em "Gerar" para preencher o laudo com IA.' })
  }, [])

  const voiceAssistant = useClinicalVoiceAssistant({
    onAutoSave: handleVoiceAutoSave,
    startTriggers,
    stopTriggers,
  })
  const isRecording = voiceAssistant.state === 'RECORDING'
  const liveTranscript = voiceAssistant.transcript

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

  useEffect(() => {
    const handleAfterPrint = () => setPrintData(null)
    window.addEventListener('afterprint', handleAfterPrint)
    return () => window.removeEventListener('afterprint', handleAfterPrint)
  }, [])

  const handlePrint = (data: PrintState) => {
    setPrintData(data)
    setTimeout(() => window.print(), 500)
  }

  // ─── Devolver ao Médico ────────────────────────────────────────────────────
  const handleReturn = async () => {
    setIsReturning(true)
    setShowConfirm(false)
    const res = await returnToVet(consultation.id, examNotes)
    setIsReturning(false)
    if ('error' in res) {
      setToast({ type: 'error', message: res.error })
      return
    }
    setToast({ type: 'success', message: `${patient.name} devolvido ao médico veterinário.` })
    if (tutor?.phone) {
      setShowWhatsApp(true)
    } else {
      setTimeout(() => router.push('/dashboard/exams'), 1200)
    }
  }

  // ─── Dar Alta diretamente dos Exames (E-03) ───────────────────────────────
  const handleExamDischarge = async () => {
    setIsDischargingExam(true)
    const res = await dischargeFromExams(consultation.id)
    setIsDischargingExam(false)
    if ('error' in res) { setToast({ type: 'error', message: res.error }); return }
    setToast({ type: 'success', message: `Alta de ${patient.name} concluída.` })
    setTimeout(() => router.push('/dashboard/exams'), 1200)
  }

  // ─── Print portal ──────────────────────────────────────────────────────────
  const printPortal = printData ? createPortal(
    <div className="vetmax-print-root" style={{ position: 'static', width: '100%', minHeight: '100vh', background: 'white', color: '#000', fontFamily: 'Arial, sans-serif', padding: '40px 56px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ borderBottom: '2px solid black', paddingBottom: 20, marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: '#6b7280', marginBottom: 4 }}>{clinicName} — Laboratório / Exames</p>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#000', lineHeight: 1.2, margin: 0 }}>
              {({ laudo: 'Laudo', receita: 'Receita', encaminhamento: 'Encaminhamento', termo: 'Termo', exame: 'Exame', outro: 'Outro' } as Record<string, string>)[printData.type] ?? printData.type}
            </h1>
            <p style={{ fontSize: 13, color: '#4b5563', marginTop: 4 }}>{printData.name.split('—')[0].trim()}</p>
          </div>
          <p style={{ fontSize: 13, color: '#6b7280', textAlign: 'right' }}>{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 32px', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #d1d5db', fontSize: 13 }}>
          <div><strong>Pet: </strong>{patient.name}</div>
          <div><strong>Tutor: </strong>{tutor.name}</div>
          <div><strong>Espécie: </strong>{patient.species}{patient.breed ? ` — ${patient.breed}` : ''}</div>
          <div><strong>CPF Tutor: </strong>{tutor.cpf}</div>
        </div>
        <div style={{ marginBottom: 40 }}>
          {printData.extracted_fields.map(f => {
            const val = printData.fields[f.field_name]
            if (val === null || val === undefined || val === '') return null
            return (
              <div key={f.field_name} style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#6b7280', marginBottom: 4 }}>{f.label}</p>
                <p style={{ fontSize: 13, color: '#000', lineHeight: 1.6, borderBottom: '1px solid #e5e7eb', paddingBottom: 12, margin: 0 }}>
                  {typeof val === 'boolean' ? (val ? 'Sim' : 'Não') : String(val)}
                </p>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 64, display: 'flex', gap: 64 }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <hr style={{ borderColor: '#000', marginBottom: 8, width: 256, margin: '0 auto 8px' }} />
            <p style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>Responsável Técnico</p>
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

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {printPortal}
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* WhatsApp — Exame Concluído */}
      <WhatsAppNotificationModal
        isOpen={showWhatsApp}
        onClose={() => { setShowWhatsApp(false); router.push('/dashboard/exams') }}
        trigger="exam_completed"
        context={{
          petName:    patient.name,
          tutorName:  tutor.name,
          tutorPhone: tutor.phone ?? '',
          examType:   consultation.visit_reason ?? 'exame',
        }}
        consultationId={consultation.id}
        patientId={patient.id}
      />

      {/* Modal de confirmação */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Devolver ao Médico?</h2>
            <p className="text-sm text-slate-500">
              {patient.name} voltará para o painel do Médico Veterinário com os documentos gerados.
            </p>
            {examNotes.trim() && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                <strong>Notas para o MV:</strong> {examNotes}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowConfirm(false)} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleReturn} disabled={isReturning} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {isReturning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                {isReturning ? 'Devolvendo...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-5">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium text-sm transition-colors">
              <ArrowLeft className="w-4 h-4" />Voltar
            </button>
            {userRole === 'admin' && (
              <button
                onClick={() => setShowRemoveModal(true)}
                className="text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors"
              >
                Remover da Fila
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2.5 py-1 rounded-full flex items-center gap-1">
              <FlaskConical className="w-3 h-3" />Laboratório / Exames
            </span>
          </div>
        </div>

        {/* Alertas */}
        {(patient.allergies || patient.medical_history) && (
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

        {/* Painel de Contexto */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
            <PetAvatar name={patient.name} species={patient.species} photoUrl={patient.photo_url} size="sm" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">{patient.name}</h2>
              <p className="text-xs text-slate-500">
                {SPECIES_LABELS[patient.species] ?? patient.species}
                {patient.breed ? ` — ${patient.breed}` : ''}
              </p>
            </div>
          </div>

          <div className="p-6 grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Animal</p>
              {patient.gender && <InfoRow label="Sexo" value={GENDER_LABELS[patient.gender] ?? patient.gender} />}
              <InfoRow label="Castrado" value={patient.neutered ? 'Sim' : 'Não'} />
              {patient.reproductive_status && (
                <InfoRow label="Status Reprodutivo" value={patient.reproductive_status} />
              )}
              <InfoRow label="Idade" value={calcAge(patient.birth_date)} />
              {patient.medical_history && (
                <InfoRow label="Histórico Médico" value={patient.medical_history} />
              )}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Sinais Vitais (Triagem)</p>
              {vital_signs ? (
                <>
                  <InfoRow label="Peso" value={`${vital_signs.weight} kg`} />
                  <InfoRow label="Temperatura" value={`${vital_signs.temperature}°C`} />
                  {vital_signs.heart_rate > 0 && (
                    <InfoRow label="FC" value={`${vital_signs.heart_rate} bpm`} />
                  )}
                  {vital_signs.mucous_color && (
                    <InfoRow label="Mucosas" value={MUCOUS_LABELS[vital_signs.mucous_color] ?? vital_signs.mucous_color} />
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400 italic">Triagem não realizada</p>
              )}
            </div>
          </div>

          {vital_signs?.chief_complaint && (
            <div className="border-t border-slate-100 px-6 py-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Queixa Principal (Triagem)</p>
              <p className="text-sm text-slate-700 leading-relaxed">{vital_signs.chief_complaint}</p>
            </div>
          )}

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
        </div>

        {/* Notas do MV (read-only context) */}
        {consultation.vet_notes && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                <FileText className="h-4 w-4 text-slate-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Notas do Médico Veterinário</h2>
                <p className="text-xs text-slate-500">Contexto clínico para os exames</p>
              </div>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{consultation.vet_notes}</p>
            </div>
          </div>
        )}

        {/* Motor de Voz — Ditado do Laudo */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              <Mic className="h-4 w-4 text-blue-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-slate-900">Ditado do Laudo</h2>
              <p className="text-xs text-slate-500">
                Diga <strong>"Assistente"</strong> para ditar — a IA usará a transcrição para o laudo
              </p>
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

            {/* Live transcript */}
            {(isRecording || liveTranscript) && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-slate-600 italic min-h-[56px]">
                {liveTranscript || <span className="text-slate-400">Ouvindo... fale normalmente.</span>}
              </div>
            )}

            {/* Sugestões geradas pela voz */}
            {examSuggestions.length > 0 && (
              <div className="space-y-2">
                {examSuggestions.map((s, i) => (
                  <div key={i} className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-blue-700 mb-0.5">Transcrição capturada</p>
                      <p className="text-sm text-slate-700 leading-relaxed line-clamp-2">{s.motivo}</p>
                    </div>
                    <button
                      onClick={() => setExamSuggestions(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-blue-400 hover:text-blue-600 p-1 flex-shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <p className="text-xs text-slate-400 italic">
                  Role para baixo e clique em &quot;Gerar Novo Documento&quot; para usar a transcrição como contexto da IA
                </p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => voiceAssistant.manualToggle()}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  isRecording
                    ? 'bg-red-100 text-red-700 hover:bg-red-200 animate-pulse'
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
              >
                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                {isRecording ? 'Parar Ditado' : 'Iniciar Ditado'}
              </button>
              {!isRecording && (
                <span className="text-xs text-slate-400">ou diga <em>"Assistente"</em></span>
              )}
              {isRecording && (
                <span className="flex items-center gap-1.5 text-xs text-red-600">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  Gravando... (diga "Finalizar" para parar)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Documentos — componente reutilizado do Consultório */}
        <DocumentsSection
          consultation={consultation}
          clinicName={clinicName}
          templates={templates}
          initialDocuments={initialDocuments}
          pendingSuggestions={examSuggestions}
          onSuggestionDismiss={i =>
            setExamSuggestions(prev => prev.filter((_, idx) => idx !== i))
          }
          onPrint={handlePrint}
        />

        {/* Anexos */}
        <AttachmentsSection
          patientId={consultation.patient.id}
          consultationId={consultation.id}
          initialAttachments={initialAttachments}
        />

        {/* Notas para o Médico Veterinário */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <FileText className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Recado para o Médico Veterinário</h2>
              <p className="text-xs text-slate-500">Mensagem interna — ficará visível no painel do MV</p>
            </div>
          </div>
          <div className="p-6">
            <textarea
              value={examNotes}
              onChange={e => setExamNotes(e.target.value)}
              placeholder="Ex: As imagens do Raio-X ficaram um pouco escuras, mas o laudo está anexo. Recomendo repetir em 48h."
              rows={4}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl outline-none resize-none text-sm text-slate-700 leading-relaxed focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
        </div>

        {/* Botões de Desfecho */}
        <div className="bg-white rounded-xl shadow-sm border border-blue-200">
          <div className="p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-1">Desfecho dos Exames</h2>
            <p className="text-xs text-slate-500 mb-4">Selecione o próximo passo para {patient.name}</p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleExamDischarge}
                disabled={isDischargingExam || isReturning}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-green-300 text-green-700 text-sm font-semibold hover:bg-green-50 disabled:opacity-50 transition-colors"
              >
                {isDischargingExam ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                Dar Alta
              </button>
              <button
                onClick={() => setShowAdmitModal(true)}
                disabled={isDischargingExam || isReturning}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-amber-300 text-amber-700 text-sm font-semibold hover:bg-amber-50 disabled:opacity-50 transition-colors"
              >
                <BedDouble className="w-4 h-4" />
                Internar
              </button>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={isReturning || isDischargingExam}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 shadow-sm transition-colors ml-auto"
              >
                {isReturning
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Devolvendo...</>
                  : <><ChevronRight className="w-4 h-4" />Devolver ao Médico</>
                }
              </button>
            </div>
          </div>
        </div>

      </div>

      {showRemoveModal && (
        <RemoveFromQueueModal
          consultationId={consultation.id}
          patientId={patient.id}
          patientName={patient.name}
          module="exams"
          redirectTo="/dashboard/exams"
          onClose={() => setShowRemoveModal(false)}
        />
      )}

      {showAdmitModal && (
        <AdmitPetModal
          patientId={patient.id}
          patientName={patient.name}
          consultationId={consultation.id}
          onClose={() => setShowAdmitModal(false)}
          onSuccess={(_reason, _status) => {
            setShowAdmitModal(false)
            setToast({ type: 'success', message: `${patient.name} internado com sucesso! Acesse o Kanban de Internação.` })
            setTimeout(() => router.push('/dashboard/exams'), 1500)
          }}
        />
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
              <p className="text-[10px] text-slate-400 mb-2">Padrão: "Assistente", "Vet Max", "Gravar evolução", "Iniciar gravação"</p>
              <div className="flex gap-2 mb-2">
                <input type="text" value={newStartInput} onChange={e => setNewStartInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newStartInput.trim()) { e.preventDefault(); setStartTriggers(prev => [...new Set([...prev, newStartInput.trim().toLowerCase()])]); setNewStartInput('') } }}
                  placeholder='Ex: "iniciar laudo"'
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
              <p className="text-[10px] text-slate-400 mb-2">Padrão: "Finalizar", "Pode salvar", "Salvar evolução"</p>
              <div className="flex gap-2 mb-2">
                <input type="text" value={newStopInput} onChange={e => setNewStopInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newStopInput.trim()) { e.preventDefault(); setStopTriggers(prev => [...new Set([...prev, newStopInput.trim().toLowerCase()])]); setNewStopInput('') } }}
                  placeholder='Ex: "gravar laudo"'
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

// ─── Sub-componente ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xs font-medium text-slate-700 text-right max-w-[60%] truncate">{value}</span>
    </div>
  )
}
