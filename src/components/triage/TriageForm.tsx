'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  submitTriageAndMoveToDoctor,
  updateTriageVitalSigns,
  extractFieldsFromTranscription,
  updatePatientReproductiveStatus,
  type TriageConsultationDetail,
} from '@/lib/actions/triage'
import { addVaccine, type PatientVaccine } from '@/lib/actions/vaccines'
import {
  AlertCircle,
  Mic,
  Square,
  ArrowLeft,
  Save,
  FileText,
  Sparkles,
  Loader2,
  CheckCircle2,
  Syringe,
} from 'lucide-react'
import type { VitalSigns, MucousColor, CRT, DocumentTemplate, ExtractedField, ReproductiveStatus } from '@/types'
import { REPRODUCTIVE_STATUS_OPTIONS } from '@/types'
import { Toast } from '@/components/ui/toast'
import { DatePicker } from '@/components/ui/DatePicker'
import VaccinationCard from '@/components/vet/VaccinationCard'
import VaccineStatusBadges from '@/components/vet/VaccineStatusBadges'
import { BehaviorTagsBadges } from '@/components/ui/BehaviorTagsBadges'
import WhatsAppNotificationModal from '@/components/whatsapp/WhatsAppNotificationModal'

interface TriageFormProps {
  consultation:   TriageConsultationDetail
  isEditMode:     boolean
  templates:      DocumentTemplate[]
  initialVaccines?: PatientVaccine[]
  triageRequiredFields?: string[]
}

const MUCOUS_COLORS: { value: MucousColor; label: string; color: string }[] = [
  { value: 'pink', label: 'Rosa (Normal)', color: 'bg-pink-200' },
  { value: 'pale', label: 'Pálida', color: 'bg-slate-200' },
  { value: 'icteric', label: 'Ictérica', color: 'bg-yellow-200' },
  { value: 'cyanotic', label: 'Cianótica', color: 'bg-blue-200' },
]

const CRT_OPTIONS: { value: CRT; label: string }[] = [
  { value: '2s', label: '< 2 segundos (Normal)' },
  { value: '3s', label: '2-3 segundos' },
  { value: '4s', label: '> 3 segundos' },
]

export default function TriageForm({
  consultation,
  isEditMode,
  templates,
  initialVaccines = [],
  triageRequiredFields = ['weight', 'temperature', 'chief_complaint'],
}: TriageFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [showWhatsApp, setShowWhatsApp] = useState(false)
  const [isExtractingFields, setIsExtractingFields] = useState(false)
  const recognitionRef = useRef<any>(null)
  const finalTranscriptRef = useRef('')
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  // Template state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [templateFieldValues, setTemplateFieldValues] = useState<
    Record<string, string | number | boolean>
  >({})
  const [mappedFieldNames, setMappedFieldNames] = useState<Set<string>>(new Set())

  // Voice transcript state
  const [liveTranscript, setLiveTranscript] = useState<string>('')
  const [savedTranscript, setSavedTranscript] = useState<string>('')
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set())

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) || null

  // Form state — vital signs
  const [vitalSigns, setVitalSigns] = useState<VitalSigns>(
    consultation.vital_signs || {
      weight: 0,
      temperature: 0,
      heart_rate: 0,
      respiratory_rate: 0,
      mucous_color: 'pink',
      crt: '2s',
      chief_complaint: '',
    }
  )

  // AI-saved vaccines (merged into VaccinationCard)
  const [aiVaccines, setAiVaccines] = useState<PatientVaccine[]>([])

  // Inline validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // ─── Voice Recording ──────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const SpeechRecognition =
        (window as any).webkitSpeechRecognition ||
        (window as any).SpeechRecognition

      if (!SpeechRecognition) {
        setToastMessage({
          type: 'error',
          message: 'Navegador não suporta reconhecimento de voz. Use Chrome.',
        })
        return
      }

      const recognition = new SpeechRecognition()
      recognition.lang = 'pt-BR'
      recognition.continuous = true
      recognition.interimResults = true

      // Captura o texto já salvo para concatenação não-destrutiva
      const prevSaved = savedTranscript
      finalTranscriptRef.current = ''

      recognition.onstart = () => {
        setIsRecording(true)
        setLiveTranscript(prevSaved)
      }

      recognition.onresult = (event: any) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscriptRef.current += event.results[i][0].transcript + ' '
          } else {
            interim = event.results[i][0].transcript
          }
        }
        // Auto-stop: reinicia o timer de 15s a cada resultado de fala
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = setTimeout(() => recognition.stop(), 15_000)

        const combined = [prevSaved, finalTranscriptRef.current + interim].filter(Boolean).join(' ')
        setLiveTranscript(combined)
      }

      recognition.onerror = (event: any) => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        setToastMessage({
          type: 'error',
          message: `Erro de reconhecimento: ${event.error}`,
        })
        setIsRecording(false)
      }

      recognition.onend = async () => {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        setIsRecording(false)
        const newChunk = finalTranscriptRef.current.trim()
        // Concatenação não-destrutiva: preserva o que já estava salvo
        const fullTranscript = [prevSaved, newChunk].filter(Boolean).join(' ')
        setLiveTranscript(fullTranscript)
        setSavedTranscript(fullTranscript)

        if (!newChunk) return

        await extractAndFillVitalSigns(newChunk)

        // If template selected, also map to template fields
        if (selectedTemplate) {
          await mapVoiceToTemplateFields(newChunk, selectedTemplate.extracted_fields)
        }
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch {
      setToastMessage({
        type: 'error',
        message: 'Erro ao acessar microfone. Verifique as permissões.',
      })
    }
  }

  const stopRecording = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }

  // ─── AI: Extract Vital Signs + Vaccines from Transcription ──────────────────
  const extractAndFillVitalSigns = async (transcript: string) => {
    setIsExtractingFields(true)
    try {
      const result = await extractFieldsFromTranscription(transcript)

      if ('error' in result) {
        setToastMessage({ type: 'error', message: result.error })
        return
      }

      const { vital_signs, vaccines_applied } = result
      const filled = Object.keys(vital_signs)

      setVitalSigns((prev) => ({
        ...prev,
        ...(vital_signs.weight !== undefined && { weight: vital_signs.weight }),
        ...(vital_signs.temperature !== undefined && { temperature: vital_signs.temperature }),
        ...(vital_signs.heart_rate !== undefined && { heart_rate: vital_signs.heart_rate }),
        ...(vital_signs.respiratory_rate !== undefined && { respiratory_rate: vital_signs.respiratory_rate }),
        ...(vital_signs.mucous_color !== undefined && { mucous_color: vital_signs.mucous_color }),
        ...(vital_signs.crt !== undefined && { crt: vital_signs.crt }),
        ...(vital_signs.chief_complaint !== undefined && { chief_complaint: vital_signs.chief_complaint }),
      }))

      if (filled.length > 0) setAiFilledFields(new Set(filled))

      // Save AI-extracted vaccines to DB and merge into card
      let savedCount = 0
      const savedVaccines: PatientVaccine[] = []
      for (const v of vaccines_applied ?? []) {
        const res = await addVaccine({
          patient_id:      consultation.patient.id,
          consultation_id: consultation.id,
          vaccine_name:    v.vaccine_name,
          next_due_date:   v.next_due_date ?? undefined,
          notes:           v.notes ?? undefined,
        })
        if (!('error' in res)) { savedVaccines.push(res); savedCount++ }
      }
      if (savedVaccines.length > 0) setAiVaccines(prev => [...savedVaccines, ...prev])

      const parts: string[] = []
      if (filled.length > 0) parts.push(`${filled.length} sinal(is) vital(is) preenchido(s)`)
      if (savedCount > 0)    parts.push(`${savedCount} vacina(s) registrada(s)`)

      if (parts.length > 0) {
        setToastMessage({ type: 'success', message: `IA: ${parts.join(' · ')}. Revise antes de salvar.` })
      } else {
        setToastMessage({ type: 'error', message: 'Nenhum dado identificado. Verifique a transcrição.' })
      }
    } catch {
      setToastMessage({ type: 'error', message: 'Erro ao processar transcrição com IA.' })
    } finally {
      setIsExtractingFields(false)
    }
  }

  // ─── Template Field Mapping ───────────────────────────────────────────────
  const mapVoiceToTemplateFields = async (
    transcript: string,
    fields: ExtractedField[]
  ) => {
    try {
      const response = await fetch('/api/voice-map-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          fields: fields.map((f) => ({
            field_name: f.field_name,
            label: f.label,
            type: f.type,
            description: f.description,
          })),
        }),
      })

      if (!response.ok) return

      const data = await response.json()
      const mapped = data.mapped_fields as Record<string, string | number | boolean>
      const mappedKeys = Object.keys(mapped)

      if (mappedKeys.length > 0) {
        setTemplateFieldValues((prev) => ({ ...prev, ...mapped }))
        setMappedFieldNames((prev) => new Set([...prev, ...mappedKeys]))
      }
    } catch {
      // Template mapping is best-effort — don't show error
    }
  }

  // ─── Form Submission ──────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const errors: Record<string, string> = {}

      if (triageRequiredFields.includes('weight') && (!vitalSigns.weight || vitalSigns.weight <= 0)) {
        errors.weight = 'Peso obrigatório (> 0 kg)'
      }
      if (triageRequiredFields.includes('temperature') && (!vitalSigns.temperature || vitalSigns.temperature <= 0)) {
        errors.temperature = 'Temperatura obrigatória (> 0 °C)'
      }
      if (triageRequiredFields.includes('chief_complaint') && !vitalSigns.chief_complaint?.trim()) {
        errors.chief_complaint = 'Queixa principal obrigatória'
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors)
        setToastMessage({ type: 'error', message: 'Preencha os campos obrigatórios destacados.' })
        setIsLoading(false)
        return
      }

      setFieldErrors({})

      const fullVitalSigns: VitalSigns & {
        template_fields?: Record<string, any>
        template_id?: string
        transcription?: string
      } = { ...vitalSigns }

      if (selectedTemplate && Object.keys(templateFieldValues).length > 0) {
        fullVitalSigns.template_fields = templateFieldValues
        fullVitalSigns.template_id = selectedTemplate.id
      }

      if (savedTranscript) {
        fullVitalSigns.transcription = savedTranscript
      }

      let result
      if (isEditMode) {
        result = await updateTriageVitalSigns(consultation.id, fullVitalSigns)
      } else {
        result = await submitTriageAndMoveToDoctor(consultation.id, fullVitalSigns)
      }

      if ('error' in result) {
        setToastMessage({ type: 'error', message: result.error })
      } else {
        setToastMessage({
          type: 'success',
          message: isEditMode
            ? 'Triagem atualizada com sucesso!'
            : 'Triagem salva e enviada ao Médico Veterinário!',
        })
        if (!isEditMode && consultation.tutor?.phone) {
          setShowWhatsApp(true)
        } else {
          setTimeout(() => router.push('/dashboard/triage'), 1500)
        }
      }
    } catch {
      setToastMessage({ type: 'error', message: 'Erro inesperado ao salvar. Tente novamente.' })
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Template Field Rendering ─────────────────────────────────────────────
  const renderTemplateField = (field: ExtractedField) => {
    const value = templateFieldValues[field.field_name] ?? ''
    const wasMapped = mappedFieldNames.has(field.field_name)

    const baseClass =
      'w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
    const borderClass = wasMapped ? 'border-green-400 bg-green-50' : 'border-slate-300'

    const handleChange = (val: string | number | boolean) => {
      setTemplateFieldValues((prev) => ({ ...prev, [field.field_name]: val }))
    }

    return (
      <div key={field.field_name} className="relative">
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
          {wasMapped && <CheckCircle2 className="inline w-3.5 h-3.5 text-green-600 ml-1.5" />}
        </label>
        <p className="text-xs text-slate-400 mb-1.5">{field.description}</p>

        {field.type === 'textarea' ? (
          <textarea
            value={String(value)}
            onChange={(e) => handleChange(e.target.value)}
            className={`${baseClass} ${borderClass} h-20 resize-none`}
          />
        ) : field.type === 'number' ? (
          <input
            type="number"
            step="any"
            value={value === '' ? '' : Number(value)}
            onChange={(e) => handleChange(parseFloat(e.target.value) || 0)}
            className={`${baseClass} ${borderClass}`}
          />
        ) : field.type === 'boolean' ? (
          <select
            value={String(value)}
            onChange={(e) => handleChange(e.target.value === 'true')}
            className={`${baseClass} ${borderClass}`}
          >
            <option value="">Selecione...</option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        ) : field.type === 'date' ? (
          <DatePicker value={String(value)} onChange={v => handleChange(v)} />
        ) : (
          <input
            type="text"
            value={String(value)}
            onChange={(e) => handleChange(e.target.value)}
            className={`${baseClass} ${borderClass}`}
          />
        )}
      </div>
    )
  }

  // ─── AI field highlight helper ────────────────────────────────────────────
  const aiHighlight = (field: string) =>
    aiFilledFields.has(field)
      ? 'border-green-400 bg-green-50'
      : ''

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* WhatsApp — Triagem Concluída */}
      <WhatsAppNotificationModal
        isOpen={showWhatsApp}
        onClose={() => { setShowWhatsApp(false); router.push('/dashboard/triage') }}
        trigger="triage_completed"
        context={{
          petName:     consultation.patient.name,
          tutorName:   consultation.tutor.name,
          tutorPhone:  consultation.tutor.phone,
          species:     consultation.patient.species,
          weight:      vitalSigns.weight ?? undefined,
          temperature: vitalSigns.temperature ?? undefined,
        }}
        consultationId={consultation.id}
      />

      {toastMessage && (
        <Toast
          type={toastMessage.type}
          message={toastMessage.message}
          onClose={() => setToastMessage(null)}
        />
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar à Fila
          </button>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
            isEditMode
              ? 'bg-amber-100 text-amber-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {isEditMode ? 'Edição de Triagem' : 'Triagem em Andamento'}
          </span>
        </div>

        {/* CTA Banner */}
        {!isEditMode && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-3 flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-bold">1</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-900">Preencha os Sinais Vitais e Queixa Principal</p>
              <p className="text-xs text-blue-700 mt-0.5">Peso e temperatura são obrigatórios para encaminhar ao médico veterinário.</p>
            </div>
          </div>
        )}

        {/* Patient Information Card */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              {/* Foto ou avatar */}
              <div className="h-16 w-16 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                {consultation.patient.photo_url ? (
                  <img src={consultation.patient.photo_url} alt={consultation.patient.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl">
                    {consultation.patient.species === 'dog' ? '🐕' : consultation.patient.species === 'cat' ? '🐱' : consultation.patient.species === 'bird' ? '🐦' : '🐾'}
                  </span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-2xl font-bold text-slate-900">
                    {consultation.patient.name}
                  </h2>
                  <span className="text-sm bg-slate-100 text-slate-700 px-2 py-1 rounded font-medium">
                    {consultation.patient.species === 'dog' && '🐕 '}
                    {consultation.patient.species === 'cat' && '🐱 '}
                    {consultation.patient.species === 'bird' && '🐦 '}
                    {consultation.patient.species === 'rabbit' && '🐰 '}
                    {consultation.patient.species === 'rodent' && '🐭 '}
                    {consultation.patient.species === 'reptile' && '🦎 '}
                    {consultation.patient.species === 'fish' && '🐠 '}
                    {consultation.patient.species === 'exotic' && '✨ '}
                    {consultation.patient.species.charAt(0).toUpperCase() + consultation.patient.species.slice(1)}
                  </span>
                </div>
                <p className="text-slate-600">{consultation.patient.breed || 'Raça desconhecida'}</p>
                {consultation.patient.behavior_tags?.length > 0 && (
                  <div className="mt-2">
                    <BehaviorTagsBadges tags={consultation.patient.behavior_tags} size="sm" />
                  </div>
                )}
                {consultation.patient.color && (
                  <p className="text-sm text-slate-600 mt-0.5">
                    <span className="font-medium">Pelagem:</span> {consultation.patient.color}
                  </p>
                )}
                {consultation.patient.gender && (
                  <p className="text-sm text-slate-600 mt-0.5">
                    <span className="font-medium">Sexo:</span>{' '}
                    {consultation.patient.gender === 'male' ? 'Macho' : consultation.patient.gender === 'female' ? 'Fêmea' : 'Desconhecido'}
                  </p>
                )}
                <div className="mt-3">
                  <span className={`inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full ${
                    consultation.visit_reason === 'emergency'
                      ? 'bg-red-100 text-red-700'
                      : consultation.visit_reason === 'follow_up'
                      ? 'bg-blue-100 text-blue-700'
                      : consultation.visit_reason === 'vaccination'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-700'
                  }`}>
                    {consultation.visit_reason === 'consultation' && 'Consulta'}
                    {consultation.visit_reason === 'follow_up' && 'Retorno'}
                    {consultation.visit_reason === 'emergency' && '🚨 Emergência'}
                    {consultation.visit_reason === 'vaccination' && 'Vacinação'}
                    {consultation.visit_reason === 'exam' && 'Exame'}
                    {consultation.visit_reason === 'surgery' && 'Cirurgia'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {consultation.patient.allergies && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-700 text-sm">Alergias</p>
                    <p className="text-red-600 text-xs mt-1">{consultation.patient.allergies}</p>
                  </div>
                </div>
              )}
              {consultation.patient.chronic_diseases && (
                <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-yellow-700 text-sm">Doenças Crônicas</p>
                    <p className="text-yellow-600 text-xs mt-1">{consultation.patient.chronic_diseases}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200 space-y-1">
            <p className="text-sm">
              <span className="font-medium text-slate-700">Tutor:</span> {consultation.tutor.name}
            </p>
            <p className="text-sm text-slate-600">{consultation.tutor.phone}</p>
            <div className="mt-1">
              <label className="text-xs font-medium text-slate-600">Status Reprodutivo</label>
              <select
                value={consultation.patient.reproductive_status ?? ''}
                onChange={async (e) => {
                  await updatePatientReproductiveStatus(consultation.patient.id, e.target.value)
                }}
                className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="">Selecione...</option>
                {REPRODUCTIVE_STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {consultation.patient.medical_history && (
              <div className="mt-2 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-700 text-xs">Histórico Médico/Cirúrgico</p>
                  <p className="text-blue-600 text-xs mt-0.5">{consultation.patient.medical_history}</p>
                </div>
              </div>
            )}
          </div>

          {/* Status Vacinal */}
          {[...initialVaccines, ...aiVaccines].length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-200">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Syringe className="h-3 w-3" />
                Status Vacinal
              </p>
              <VaccineStatusBadges vaccines={[...aiVaccines, ...initialVaccines.filter(v => !aiVaccines.some(a => a.id === v.id))]} />
            </div>
          )}
        </div>

        {/* ─── Motor de Voz Inteligente ──────────────────────────────────────── */}
        <div data-mentor-step="triage-voice-btn" className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-sm border border-blue-200 p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Motor de Voz Inteligente</h3>
              <p className="text-xs text-slate-500">Fale os sinais vitais — a IA preenche os campos automaticamente</p>
            </div>
          </div>

          {/* Start / Stop Voice Buttons */}
          <div className="flex items-center gap-4 mb-4">
            {!isRecording ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={isExtractingFields}
                className="flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-sm bg-green-600 text-white hover:bg-green-700 shadow-sm shadow-green-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mic className="w-4 h-4" />
                🎤 Iniciar Gravação
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="flex items-center gap-2.5 px-6 py-3 rounded-xl font-semibold text-sm bg-red-500 text-white hover:bg-red-600 shadow-sm shadow-red-200 transition-all"
              >
                <Square className="w-4 h-4 fill-current" />
                ⏹ Parar Gravação
              </button>
            )}

            {isRecording && (
              <span className="flex items-center gap-1.5 text-sm text-red-600 font-medium">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                Gravando... (para sozinho após 15s de silêncio)
              </span>
            )}

            {isExtractingFields && (
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                IA processando transcrição...
              </div>
            )}

            {aiFilledFields.size > 0 && !isExtractingFields && (
              <div className="flex items-center gap-1.5 text-sm text-green-700 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                {aiFilledFields.size} campo(s) preenchido(s) pela IA
              </div>
            )}
          </div>

          {/* Live Transcript Textarea */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Transcrição em Tempo Real
            </label>
            <textarea
              readOnly
              value={liveTranscript}
              placeholder={isRecording ? 'Aguardando fala...' : 'Clique em "🎤 Iniciar Escuta Ativa" e fale os sinais vitais do animal. Ex: "Peso doze vírgula cinco quilos, temperatura trinta e oito vírgula cinco, frequência cardíaca oitenta e cinco..."'}
              className={`w-full h-24 px-4 py-3 border rounded-lg text-sm text-slate-700 resize-none bg-white/70 ${
                isRecording ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200'
              }`}
            />
          </div>

          {/* Template Selector */}
          {templates.length > 0 && (
            <div className="mt-4 pt-4 border-t border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-slate-500" />
                <label className="text-sm font-medium text-slate-700">
                  Template Clínico (opcional)
                </label>
              </div>
              <select
                value={selectedTemplateId}
                onChange={(e) => {
                  setSelectedTemplateId(e.target.value)
                  setTemplateFieldValues({})
                  setMappedFieldNames(new Set())
                }}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white text-sm"
              >
                <option value="">Sem template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.type}) — {t.extracted_fields.length} campos
                  </option>
                ))}
              </select>

              {/* Template Fields */}
              {selectedTemplate && selectedTemplate.extracted_fields.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                    Campos do Template: {selectedTemplate.name}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedTemplate.extracted_fields.map(renderTemplateField)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Triage Form */}
        <form id="triage-form" onSubmit={handleSubmit} className="space-y-6 pb-24">
          {/* Vital Signs Grid */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-900">Sinais Vitais</h3>
              <span className="text-xs text-slate-400">* Campos obrigatórios</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="vital-weight" className="block text-sm font-medium text-slate-700 mb-2">
                  Peso (kg){triageRequiredFields.includes('weight') ? ' *' : ''}
                  {aiFilledFields.has('weight') && (
                    <CheckCircle2 className="inline w-3.5 h-3.5 text-green-600 ml-1.5" />
                  )}
                </label>
                <input
                  id="vital-weight"
                  type="number"
                  step="0.1"
                  min="0"
                  value={vitalSigns.weight || ''}
                  onChange={(e) => {
                    setVitalSigns((prev) => ({ ...prev, weight: parseFloat(e.target.value) || 0 }))
                    if (fieldErrors.weight) setFieldErrors((prev) => { const n = { ...prev }; delete n.weight; return n })
                    setAiFilledFields((prev) => { const n = new Set(prev); n.delete('weight'); return n })
                  }}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                    fieldErrors.weight ? 'border-red-400 bg-red-50' : aiHighlight('weight') || 'border-slate-300'
                  }`}
                  placeholder="Ex: 12.5"
                />
                {fieldErrors.weight && <p className="text-xs text-red-600 mt-1">{fieldErrors.weight}</p>}
              </div>

              <div>
                <label htmlFor="vital-temperature" className="block text-sm font-medium text-slate-700 mb-2">
                  Temperatura Retal (°C){triageRequiredFields.includes('temperature') ? ' *' : ''}
                  {aiFilledFields.has('temperature') && (
                    <CheckCircle2 className="inline w-3.5 h-3.5 text-green-600 ml-1.5" />
                  )}
                </label>
                <input
                  id="vital-temperature"
                  type="number"
                  step="0.1"
                  min="0"
                  value={vitalSigns.temperature || ''}
                  onChange={(e) => {
                    setVitalSigns((prev) => ({ ...prev, temperature: parseFloat(e.target.value) || 0 }))
                    if (fieldErrors.temperature) setFieldErrors((prev) => { const n = { ...prev }; delete n.temperature; return n })
                    setAiFilledFields((prev) => { const n = new Set(prev); n.delete('temperature'); return n })
                  }}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
                    fieldErrors.temperature ? 'border-red-400 bg-red-50' : aiHighlight('temperature') || 'border-slate-300'
                  }`}
                  placeholder="Ex: 38.5"
                />
                {fieldErrors.temperature && <p className="text-xs text-red-600 mt-1">{fieldErrors.temperature}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Frequência Cardíaca (bpm)
                  {aiFilledFields.has('heart_rate') && (
                    <CheckCircle2 className="inline w-3.5 h-3.5 text-green-600 ml-1.5" />
                  )}
                </label>
                <input
                  type="number"
                  min="0"
                  value={vitalSigns.heart_rate || ''}
                  onChange={(e) => {
                    setVitalSigns((prev) => ({ ...prev, heart_rate: parseInt(e.target.value) || 0 }))
                    setAiFilledFields((prev) => { const n = new Set(prev); n.delete('heart_rate'); return n })
                  }}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${aiHighlight('heart_rate') || 'border-slate-300'}`}
                  placeholder="Ex: 85"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Frequência Respiratória (mov/min)
                  {aiFilledFields.has('respiratory_rate') && (
                    <CheckCircle2 className="inline w-3.5 h-3.5 text-green-600 ml-1.5" />
                  )}
                </label>
                <input
                  type="number"
                  min="0"
                  value={vitalSigns.respiratory_rate || ''}
                  onChange={(e) => {
                    setVitalSigns((prev) => ({ ...prev, respiratory_rate: parseInt(e.target.value) || 0 }))
                    setAiFilledFields((prev) => { const n = new Set(prev); n.delete('respiratory_rate'); return n })
                  }}
                  className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${aiHighlight('respiratory_rate') || 'border-slate-300'}`}
                  placeholder="Ex: 25"
                />
              </div>
            </div>

            {/* Mucous Color */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-slate-700 mb-3">
                Cor de Mucosa
                {aiFilledFields.has('mucous_color') && (
                  <CheckCircle2 className="inline w-3.5 h-3.5 text-green-600 ml-1.5" />
                )}
              </label>
              <div className="grid grid-cols-2 gap-3">
                {MUCOUS_COLORS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setVitalSigns((prev) => ({ ...prev, mucous_color: option.value }))
                      setAiFilledFields((prev) => { const n = new Set(prev); n.delete('mucous_color'); return n })
                    }}
                    className={`p-3 rounded-lg border-2 transition-all text-sm font-medium ${
                      vitalSigns.mucous_color === option.value
                        ? aiFilledFields.has('mucous_color')
                          ? 'border-green-500 bg-green-50'
                          : 'border-blue-500 bg-slate-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded mx-auto mb-2 ${option.color}`} />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* CRT */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-slate-700 mb-3">
                TRC (Tempo de Reenchimento Capilar)
                {aiFilledFields.has('crt') && (
                  <CheckCircle2 className="inline w-3.5 h-3.5 text-green-600 ml-1.5" />
                )}
              </label>
              <div className="space-y-2">
                {CRT_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="crt"
                      value={option.value}
                      checked={vitalSigns.crt === option.value}
                      onChange={(e) => {
                        setVitalSigns((prev) => ({ ...prev, crt: e.target.value as CRT }))
                        setAiFilledFields((prev) => { const n = new Set(prev); n.delete('crt'); return n })
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-slate-700">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* ── Carteira de Vacinação ───────────────────────────────────────── */}
          <VaccinationCard
            patientId={consultation.patient.id}
            consultationId={consultation.id}
            initialVaccines={initialVaccines}
            externalVaccines={aiVaccines}
            isFinalized={false}
          />

          {/* Chief Complaint */}
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Queixa Principal{triageRequiredFields.includes('chief_complaint') ? ' *' : ''}
              {aiFilledFields.has('chief_complaint') && (
                <span className="ml-2 text-xs font-normal text-green-600 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> preenchida pela IA
                </span>
              )}
            </h3>
            <label htmlFor="chief-complaint-field" className="sr-only">Anamnese / Histórico / Observações</label>
            <textarea
              id="chief-complaint-field"
              value={vitalSigns.chief_complaint}
              onChange={(e) => {
                setVitalSigns((prev) => ({ ...prev, chief_complaint: e.target.value }))
                if (fieldErrors.chief_complaint) setFieldErrors((prev) => { const n = { ...prev }; delete n.chief_complaint; return n })
                setAiFilledFields((prev) => { const n = new Set(prev); n.delete('chief_complaint'); return n })
              }}
              className={`w-full h-32 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none ${
                fieldErrors.chief_complaint ? 'border-red-400 bg-red-50' : aiHighlight('chief_complaint') || 'border-slate-300'
              }`}
              placeholder="Use o Motor de Voz acima ou digite aqui a queixa principal do animal..."
            />
            {fieldErrors.chief_complaint && <p className="text-xs text-red-600 mt-1">{fieldErrors.chief_complaint}</p>}
          </div>

          <div className="h-4" />
        </form>

      </div>

      {/* ─── Sticky Action Bar ─────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-5 py-2.5 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors text-sm"
          >
            Cancelar
          </button>

          <button
            data-mentor-step="triage-save-btn"
            form="triage-form"
            type="submit"
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {isEditMode ? 'Atualizar Triagem' : 'Salvar e Enviar para Consultório'}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  )
}
