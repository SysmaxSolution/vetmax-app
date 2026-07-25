'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Activity, Pill, History,
  TrendingUp, TrendingDown, Minus, Loader2, Save,
  User, ClipboardList, Mic, MicOff, Plus, Trash2, Clock,
  Paperclip, FileText, Image as ImageIcon, File, Upload, ExternalLink,
  Brain, AlertTriangle, CheckCircle, Siren, MessageSquare, Volume2, VolumeX,
  ChevronDown, ChevronUp, MessageCircle, Settings, HeartPulse, Droplets, Receipt, BedDouble, ListChecks,
  Pencil, Calendar, StickyNote, Tag,
} from 'lucide-react'
import {
  addClinicalEvolution,
  cancelHospitalization,
  getHospitalizationDocuments,
  saveHospitalizationDocument,
  deleteHospitalizationDocument,
  updateHospitalizationDocumentMetadata,
  type HospitalizationCard,
  type HospitalizationRecord,
  type StructuredMed,
  type HospDocument,
  type HospDocumentMetadata,
} from '@/lib/actions/hospitalizations'
import { createClient } from '@/lib/supabase/client'
import { extractHospitalizationVoice } from '@/lib/actions/pharmacy'
import { generateClinicalSummary, type ClinicalSummaryResult, askPatientHistory, type VoiceChatResult, extractUnifiedClinicalVoice } from '@/lib/actions/ai_extraction'
import { useUnifiedVoiceDraft } from '@/hooks/useUnifiedClinicalVoice'
import VoiceReviewPanel from './VoiceReviewPanel'
import { formatClinicTime, formatClinicDate } from '@/lib/time'
import { generatePrescriptionPdf, type PrescriptionData } from '@/lib/actions/reports'
import ConsultationQuotationBadge from '@/components/billing/ConsultationQuotationBadge'
import PrescriptionModal from './PrescriptionModal'
import WhatsAppNotificationModal from '@/components/whatsapp/WhatsAppNotificationModal'
import InsuranceCard from '@/components/pet/InsuranceCard'
import { getInsuranceCard, type InsuranceCardData } from '@/lib/actions/insurance-coverage'
import { useClinicalVoiceAssistant } from '@/hooks/useClinicalVoiceAssistant'
import { useFocusedVoiceCapture } from '@/hooks/useFocusedVoiceCapture'
import { usePetCoverageSemaforo } from '@/hooks/usePetCoverageSemaforo'
import CoverageChip from '@/components/vet/CoverageChip'
import { useNativeKeepAwake } from '@/hooks/useNativeKeepAwake'
import { getClinicVoiceTriggers, updateClinicVoiceTriggers } from '@/lib/actions/clinic-settings'
import { useAiTranscriptionMode, useInternacaoCompleta } from '@/components/providers/ClinicConfigProvider'
import VitalsTab from './VitalsTab'
import FluidTherapyTab from './FluidTherapyTab'
import MedicationApplicationModal from './MedicationApplicationModal'
import ContaTab from './ContaTab'
import DadosClinicosTab from './DadosClinicosTab'
import TarefasTab from './TarefasTab'
import { listHospitalizationPrescriptions, type HospPrescription } from '@/lib/actions/hospitalization-prescriptions'

interface Props {
  card:             HospitalizationCard
  onClose:          () => void
  prefilledStatus?: 'piorou' | 'estavel' | 'melhorou'
  onSaved?:         () => void
  /** Disparado após Alta Médica/Administrativa (Conta tab) — board atualiza o card. */
  onStatusChanged?: (newStatus: string) => void
  /** Disparado ao salvar Dados Clínicos (isolamento/leito/alta) — badge acende no board. */
  onCardUpdated?: (patch: { isolation_required?: boolean; box_id?: string | null; estimated_discharge?: string | null }) => void
  /** Aba inicial da coluna direita (ex.: abrir direto em 'tarefas' a partir do Mapa de Execução). */
  initialTab?: 'timeline' | 'documents' | 'vitals' | 'fluids' | 'conta' | 'dados' | 'tarefas'
}

export default function HospitalizationDetailModal({ card, onClose, prefilledStatus, onSaved, onStatusChanged, onCardUpdated, initialTab }: Props) {
  const aiMode = useAiTranscriptionMode()
  const internacaoCompleta = useInternacaoCompleta()
  const admissionWeight = (card as { weight_at_admission?: number | null }).weight_at_admission ?? null
  // Aprazamento de prescrições direto do card (popula o Mapa de Execução).
  const [showMedModal, setShowMedModal] = useState(false)
  const [showCancelHosp, setShowCancelHosp] = useState(false)
  const [cancelHospReason, setCancelHospReason] = useState('')
  const [cancellingHosp, setCancellingHosp] = useState(false)
  const [cancelHospError, setCancelHospError] = useState<string | null>(null)
  const [prescriptions, setPrescriptions] = useState<HospPrescription[]>([])
  const reloadPrescriptions = useCallback(async () => {
    const res = await listHospitalizationPrescriptions(card.id)
    if (Array.isArray(res)) setPrescriptions(res)
  }, [card.id])
  useEffect(() => { if (internacaoCompleta) void reloadPrescriptions() }, [internacaoCompleta, reloadPrescriptions])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [records, setRecords] = useState<HospitalizationRecord[]>([])
  const [loadingRecords, setLoadingRecords] = useState(true)

  // Estados do Formulário
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<'piorou' | 'estavel' | 'melhorou'>(prefilledStatus ?? 'estavel')
  const [meds, setMeds] = useState<StructuredMed[]>([])

  // WhatsApp
  type WhatsAppPendingCtx = { trigger: 'hospitalization_evolution_saved' | 'hospitalization_discharge'; notes: string; statusSaved: 'piorou' | 'estavel' | 'melhorou'; medNames: string[]; attachedDocNames?: string[] }
  const [whatsappPending,  setWhatsappPending]  = useState<WhatsAppPendingCtx | null>(null)
  const [voiceConfirmedWA, setVoiceConfirmedWA] = useState(false)
  // Ref para guardar o "último contexto salvo" e disparar WA por voz (quando o
  // hook detectar "sim/enviar"). Sem esse ref a voz não saberia qual ctx montar.
  const lastSavedWaCtxRef = useRef<WhatsAppPendingCtx | null>(null)
  const [insuranceCard, setInsuranceCard] = useState<InsuranceCardData | null>(null)

  // Carrega card do convênio assim que o modal abre (uma vez por pet)
  useEffect(() => {
    if (!card?.patient?.id) return
    let cancelled = false
    getInsuranceCard(card.patient.id).then(res => {
      if (cancelled || 'error' in res) return
      setInsuranceCard(res)
    })
    return () => { cancelled = true }
  }, [card?.patient?.id])
  const [selectedDocIds,   setSelectedDocIds]   = useState<Set<string>>(new Set())
  const [docPickerOpen,    setDocPickerOpen]    = useState(false)
  
  // Estado da Voz
  const [isProcessingVoice, setIsProcessingVoice] = useState(false)
  // Voz unificada (Internação Completa): draft multi-aba revisável.
  const uvoice = useUnifiedVoiceDraft('hospitalization')
  const [unifiedRefreshKey, setUnifiedRefreshKey] = useState(0)

  // Handsfree voice assistant
  const [startTriggers,  setStartTriggers]  = useState<string[]>([])
  const [stopTriggers,   setStopTriggers]   = useState<string[]>([])
  const [voiceConfigOpen, setVoiceConfigOpen] = useState(false)
  const [configSaving,   setConfigSaving]   = useState(false)
  const [newStartInput,  setNewStartInput]  = useState('')
  const [newStopInput,   setNewStopInput]   = useState('')

  // Toast de confirmação de save
  const [saveToast, setSaveToast] = useState<string | null>(null)

  // Aba ativa na coluna direita. Sinais Vitais e Fluidoterapia só sob a flag
  // Internação Completa.
  const [activeRightTab, setActiveRightTab] = useState<'timeline' | 'documents' | 'vitals' | 'fluids' | 'conta' | 'dados' | 'tarefas'>(initialTab ?? 'timeline')

  // Estado da IA Clínica
  const [aiSuggestion, setAiSuggestion] = useState<ClinicalSummaryResult | null>(null)
  const [isLoadingAI, setIsLoadingAI] = useState(false)

  // Estado do Receituário
  const [prescriptionData, setPrescriptionData] = useState<PrescriptionData | null>(null)
  const [isLoadingPrescription, setIsLoadingPrescription] = useState(false)

  // Estado dos Documentos
  const [documents, setDocuments] = useState<HospDocument[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [stagedDoc, setStagedDoc] = useState<{ file: File; title: string; document_date: string; notes: string } | null>(null)
  const [editingDocId, setEditingDocId] = useState<string | null>(null)
  const [editingDocForm, setEditingDocForm] = useState<HospDocumentMetadata>({})
  const [savingDocEdit, setSavingDocEdit] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // userId para escopar a chave do localStorage por usuário (evita compartilhamento entre sessões)
  const [userId, setUserId] = useState<string>('')
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) return
      const uid = data.user.id
      setUserId(uid)
      // Sincroniza isMuted com a chave escopada assim que o userId estiver disponível
      setIsMuted(localStorage.getItem(`vetmax_tts_muted_${uid}`) === 'true')
    })
  }, [])

  // Estado de mudo (TTS) — persistido no localStorage com escopo por usuário
  const [isMuted, setIsMuted] = useState<boolean>(false)

  // Estado do Chat por Voz (RAG)
  const [voiceQuestion, setVoiceQuestion] = useState('')
  const [voiceChatAnswer, setVoiceChatAnswer] = useState<VoiceChatResult | null>(null)
  const [isAskingHistory, setIsAskingHistory] = useState(false)
  const [isVoiceQuestion, setIsVoiceQuestion] = useState(false)

  // Carregar histórico
  useEffect(() => {
    async function fetchHistory() {
      const supabase = createClient()
      const { data } = await supabase
        .from('hospitalization_records')
        .select('*')
        .eq('hospitalization_id', card.id)
        .order('created_at', { ascending: false })
      
      if (data) setRecords(data as HospitalizationRecord[])
      setLoadingRecords(false)
    }
    fetchHistory()
  }, [card.id])

  // Pré-carrega documentos silenciosamente no mount (para o picker no formulário)
  useEffect(() => {
    getHospitalizationDocuments(card.id).then(result => {
      if (!('error' in result)) setDocuments(result)
    })
  }, [card.id])

  // Recarrega com spinner ao abrir a aba de documentos
  useEffect(() => {
    if (activeRightTab !== 'documents') return
    setLoadingDocs(true)
    getHospitalizationDocuments(card.id).then(result => {
      if (!('error' in result)) setDocuments(result)
      setLoadingDocs(false)
    })
  }, [card.id, activeRightTab])

  // --- Handsfree Voice Engine (Ala de Internação) ---

  const handleVoiceAutoSave = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return
    setIsProcessingVoice(true)
    try {
      // Internação Completa: extração multi-domínio. Preenche a evolução
      // (esquerda) E acumula um draft das abas (Sinais Vitais, Fluido, Dados,
      // Tarefas, Medicações) que o usuário revisa antes de persistir.
      if (internacaoCompleta) {
        const uni = await uvoice.ingest(transcript.trim())
        if (uni) {
          const noteText = aiMode === 'transcribe_only' ? transcript : (uni.notes || transcript)
          if (noteText.trim()) setNotes(prev => prev + (prev ? '\n' : '') + noteText)
          if (uni.improvement_level) setStatus(uni.improvement_level)
        } else {
          setNotes(prev => prev + (prev ? ' ' : '') + transcript)
        }
        return
      }
      // Modo legado (flag off): só evolução (notes/status/medicações aplicadas).
      const iaResult = await extractHospitalizationVoice(transcript.trim())
      if (iaResult && !iaResult.error) {
        const noteText = aiMode === 'transcribe_only'
          ? transcript                                  // literal
          : (iaResult.notes || transcript)              // SOAP da IA ou fallback
        setNotes(prev => prev + (prev ? '\n' : '') + noteText)
        if (iaResult.improvement_level) setStatus(iaResult.improvement_level)
        if (iaResult.medications && iaResult.medications.length > 0) {
          setMeds(prev => [...prev, ...iaResult.medications])
        }
      } else {
        setNotes(prev => prev + (prev ? ' ' : '') + transcript)
      }
    } catch (e) {
      console.error('Erro na IA:', e)
      setNotes(prev => prev + (prev ? ' ' : '') + transcript)
    } finally {
      setIsProcessingVoice(false)
    }
  }, [aiMode, internacaoCompleta]) // eslint-disable-line react-hooks/exhaustive-deps

  const voiceAssistant = useClinicalVoiceAssistant({
    onAutoSave: handleVoiceAutoSave,
    onSendWA: () => {
      // O modal WA já foi aberto pelo handleVoiceAutoSave via setWhatsappPending.
      // Aqui apenas marcamos para o modal enviar automaticamente.
      setVoiceConfirmedWA(true)
      if (!whatsappPending && lastSavedWaCtxRef.current) {
        setWhatsappPending(lastSavedWaCtxRef.current)
      }
    },
    startTriggers,
    stopTriggers,
  })
  const isRecording = voiceAssistant.state === 'RECORDING'
  useNativeKeepAwake(isRecording)

  // Semáforo Petlove — ancorado no textarea "Observações Clínicas" da evolução.
  const coverageSemaforo = usePetCoverageSemaforo({
    patientId:   card.patient.id,
    transcript:  voiceAssistant.transcript,
    isListening: isRecording,
  })

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

  // --- TTS helpers ---
  // IMPORTANTE: só afeta o áudio — o texto exibido na UI usa o original (voiceChatAnswer.answer)
  function cleanTextForSpeech(text: string): string {
    return text
      // ── 1. Markdown estrutural ─────────────────────────────────────
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // [label](url) → label
      .replace(/\[\^[^\]]*\]/g, '')              // footnotes [^1]
      .replace(/\[[^\]]*\]/g, '')                // colchetes residuais
      .replace(/^#{1,6}\s*/gm, '')               // cabeçalhos # ## ###
      .replace(/[*_~`|]+/g, '')                  // negrito, itálico, código, tabela
      .replace(/>/g, '')                         // blockquote >

      // ── 2. Abreviações veterinárias → por extenso ──────────────────
      // Posologia
      .replace(/\bSID\b/gi,  'uma vez ao dia')
      .replace(/\bBID\b/gi,  'duas vezes ao dia')
      .replace(/\bTID\b/gi,  'três vezes ao dia')
      .replace(/\bQID\b/gi,  'quatro vezes ao dia')
      .replace(/\bSOS\b/gi,  'se necessário')
      .replace(/\bSN\b/g,    'se necessário')
      // Profissões
      .replace(/\bMV\b/g,    'Médico Veterinário')
      .replace(/\bAV\b/g,    'Auxiliar Veterinário')
      // Espécies / raça
      .replace(/\bSRD\b/g,   'sem raça definida')
      // Vias de administração (word-boundary evita colisão com palavras)
      .replace(/\bIV\b/g,    'intravenoso')
      .replace(/\bIM\b/g,    'intramuscular')
      .replace(/\bSC\b/g,    'subcutâneo')
      .replace(/\bVO\b/g,    'via oral')
      .replace(/\bVR\b/g,    'via retal')
      .replace(/\bIN\b/g,    'intranasal')
      // Unidades — número + unidade (evita falsos positivos sem dígito)
      .replace(/(\d+(?:[.,]\d+)?)\s*kg\b/gi,  '$1 quilos')
      .replace(/(\d+(?:[.,]\d+)?)\s*mg\b/gi,  '$1 miligramas')
      .replace(/(\d+(?:[.,]\d+)?)\s*ml\b/gi,  '$1 mililitros')
      .replace(/(\d+(?:[.,]\d+)?)\s*g\b/g,    '$1 gramas')
      .replace(/(\d+(?:[.,]\d+)?)\s*h\b/g,    '$1 horas')
      .replace(/(\d+(?:[.,]\d+)?)\s*min\b/gi, '$1 minutos')
      .replace(/(\d+(?:[.,]\d+)?)\s*°C\b/g,   '$1 graus Celsius')
      .replace(/(\d+(?:[.,]\d+)?)\s*bpm\b/gi, '$1 batimentos por minuto')
      .replace(/(\d+(?:[.,]\d+)?)\s*rpm\b/gi, '$1 movimentos respiratórios por minuto')
      .replace(/(\d+(?:[.,]\d+)?)\s*%/g,      '$1 por cento')

      // ── 3. Prosódia — pausas naturais ─────────────────────────────
      // Ponto-e-vírgula → vírgula (pausa breve, não quebra o fluxo)
      .replace(/;/g, ',')
      // Dois-pontos → vírgula + espaço (evita leitura acelerada de listas)
      .replace(/:\s*/g, ', ')

      // ── 4. Limpeza final ──────────────────────────────────────────
      .replace(/[!?]{2,}/g, m => m[0])   // !! → !
      .replace(/\.{4,}/g,   '...')        // .... → ...
      .replace(/\s{2,}/g,   ' ')          // espaços múltiplos
      .trim()
  }

  const toggleMute = () => {
    setIsMuted(prev => {
      const next = !prev
      const key = userId ? `vetmax_tts_muted_${userId}` : 'vetmax_tts_muted'
      localStorage.setItem(key, String(next))
      if (next) window.speechSynthesis?.cancel()
      return next
    })
  }

  // Seleciona a voz de maior fidelidade disponível para pt-BR.
  // Ordem de preferência: Google Natural > Google > Premium > Maria > qualquer pt-BR.
  function getBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    const ptBR = voices.filter(v => v.lang === 'pt-BR' || v.lang === 'pt_BR')
    if (!ptBR.length) return null

    const priority = [
      (v: SpeechSynthesisVoice) => /google.*natural/i.test(v.name),
      (v: SpeechSynthesisVoice) => /google/i.test(v.name),
      (v: SpeechSynthesisVoice) => /natural|premium|enhanced/i.test(v.name),
      (v: SpeechSynthesisVoice) => /maria/i.test(v.name),
    ]
    for (const match of priority) {
      const found = ptBR.find(match)
      if (found) return found
    }
    return ptBR[0] // fallback: primeira voz pt-BR disponível
  }

  // Dispara a síntese de voz com prosódia profissional.
  // Delay de 100 ms garante que o buffer do browser esteja pronto antes do play.
  function speakText(text: string) {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()

    setTimeout(() => {
      const utterance = new SpeechSynthesisUtterance(cleanTextForSpeech(text))
      utterance.lang  = 'pt-BR'
      utterance.pitch = 1.0   // equilíbrio — nem grave demais, nem agudo
      utterance.rate  = 1.05  // ágil sem parecer apressado

      // Tenta aplicar a melhor voz; se a lista ainda estiver vazia (bug Chrome),
      // aguarda o evento 'voiceschanged' e reattempta uma única vez.
      const voices = window.speechSynthesis.getVoices()
      const best   = getBestVoice(voices)
      if (best) {
        utterance.voice = best
      } else {
        const onVoicesReady = () => {
          const v = getBestVoice(window.speechSynthesis.getVoices())
          if (v) utterance.voice = v
          window.speechSynthesis.speak(utterance)
          window.speechSynthesis.removeEventListener('voiceschanged', onVoicesReady)
        }
        window.speechSynthesis.addEventListener('voiceschanged', onVoicesReady)
        return // speak() será chamado dentro do listener
      }

      window.speechSynthesis.speak(utterance)
    }, 100)
  }

  // --- RAG Voice Chat: Perguntar ao Prontuário ---
  const handleAskHistory = async (question: string) => {
    if (!question.trim()) return
    setIsAskingHistory(true)
    setVoiceChatAnswer(null)
    const result = await askPatientHistory(card.id, question)
    if ('error' in result) {
      alert('Erro ao consultar prontuário: ' + result.error)
    } else {
      setVoiceChatAnswer(result)
      if (!isMuted) speakText(result.answer)
    }
    setIsAskingHistory(false)
  }

  // Microfone de "pergunta ao histórico" — padrão clínico (stop triggers da clínica).
  const voiceQuestionMic = useFocusedVoiceCapture({
    stopTriggers,
    onInterim: (text) => setVoiceQuestion(text),
    onFinal: async (final) => {
      setIsVoiceQuestion(false)
      const question = final.trim()
      if (question) {
        setVoiceQuestion(question)
        await handleAskHistory(question)
      }
    },
  })
  const toggleVoiceQuestion = () => {
    if (voiceQuestionMic.isRecording) { voiceQuestionMic.stop(); return }
    setIsVoiceQuestion(true)
    voiceQuestionMic.start()
  }

  // --- IA: Sugestão de Conduta Clínica ---
  async function handleAiSuggest() {
    setIsLoadingAI(true)
    setAiSuggestion(null)
    const result = await generateClinicalSummary(card.id)
    if ('error' in result) {
      alert('Erro na análise de IA: ' + result.error)
    } else {
      setAiSuggestion(result)
    }
    setIsLoadingAI(false)
  }

  // --- Receituário via IA ---
  async function handleGeneratePrescription() {
    setIsLoadingPrescription(true)
    const suggestedText = aiSuggestion?.summary ?? ''
    const medications   = meds.filter(m => m.name.trim() !== '')
    const result = await generatePrescriptionPdf(card.id, suggestedText, medications)
    if ('error' in result) {
      alert('Erro ao preparar receituário: ' + result.error)
    } else {
      setPrescriptionData(result)
    }
    setIsLoadingPrescription(false)
  }

  // --- Helpers ---
  function resetForm() {
    setNotes('')
    setMeds([])
    setStatus(prefilledStatus ?? 'estavel')
    setSelectedDocIds(new Set())
    setDocPickerOpen(false)
  }

  // --- Gestão de Medicação Manual ---
  const addEmptyMed = () => setMeds([...meds, { name: '', dose: '', route: '', notes: '' }])
  const removeMed = (index: number) => setMeds(meds.filter((_, i) => i !== index))
  const updateMed = (index: number, field: keyof StructuredMed, value: string) => {
    const newMeds = [...meds]
    newMeds[index][field] = value
    setMeds(newMeds)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!notes.trim() && meds.length === 0) return
    if (isSubmitting) return

    setIsSubmitting(true)
    try {
      const result = await addClinicalEvolution({
        hospitalization_id: card.id,
        notes: notes,
        medications: meds.filter(m => m.name.trim() !== ''),
        improvement_level: status
      })

      if ('error' in result) {
        alert('Falha ao salvar: ' + result.error)
        return
      }

      setSaveToast('Evolução registrada com sucesso!')
      setTimeout(() => setSaveToast(null), 3000)

      // Recarrega timeline
      const supabase = createClient()
      const { data } = await supabase
        .from('hospitalization_records')
        .select('*')
        .eq('hospitalization_id', card.id)
        .order('created_at', { ascending: false })
      if (data) setRecords(data as HospitalizationRecord[])

      // Trigger WhatsApp — onSaved() deferido para o onClose do modal WA para não
      // desmontar este componente antes do modal de WhatsApp aparecer.
      if (card.tutor?.phone) {
        const isDischarge = card.status === 'ready_for_discharge'
        const selDocs = selectedDocIds.size > 0
          ? documents.filter(d => selectedDocIds.has(d.id)).map(d => d.file_name)
          : undefined
        const ctx: WhatsAppPendingCtx = {
          trigger:          isDischarge ? 'hospitalization_discharge' : 'hospitalization_evolution_saved',
          notes:            notes,
          statusSaved:      status,
          medNames:         meds.filter(m => m.name.trim()).map(m => m.name),
          attachedDocNames: selDocs,
        }
        lastSavedWaCtxRef.current = ctx
        setWhatsappPending(ctx)
      } else {
        resetForm()
        onSaved?.()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // --- Gestão de Documentos ---
  // Em vez de upload imediato, mostra área de staging para o usuário preencher
  // título / data / observação (opcionais) antes de confirmar.
  function stageFileForUpload(file: File) {
    setStagedDoc({ file, title: '', document_date: '', notes: '' })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function confirmStagedUpload() {
    if (!stagedDoc) return
    setIsUploading(true)
    const file = stagedDoc.file
    const supabase = createClient()
    const safeName = file.name.replace(/\s+/g, '_')
    const path = `${card.clinic_id}/${card.id}/${Date.now()}-${safeName}`
    const fileType = file.type.startsWith('image/') ? 'image' : file.type === 'application/pdf' ? 'pdf' : 'other'

    const { error: uploadErr } = await supabase.storage
      .from('clinical-documents')
      .upload(path, file, { upsert: false })

    if (uploadErr) {
      alert('Erro no upload: ' + uploadErr.message)
      setIsUploading(false)
      return
    }

    const result = await saveHospitalizationDocument({
      hospitalization_id: card.id,
      file_name:          file.name,
      file_type:          fileType,
      storage_path:       path,
      title:              stagedDoc.title,
      document_date:      stagedDoc.document_date || null,
      notes:              stagedDoc.notes,
    })

    if ('error' in result) {
      alert('Erro ao salvar: ' + result.error)
    } else {
      const docs = await getHospitalizationDocuments(card.id)
      if (!('error' in docs)) setDocuments(docs)
      const { data } = await supabase.from('hospitalization_records').select('*').eq('hospitalization_id', card.id).order('created_at', { ascending: false })
      if (data) setRecords(data as HospitalizationRecord[])
      onSaved?.()
      setStagedDoc(null)
    }
    setIsUploading(false)
  }

  async function saveDocMetadata(docId: string) {
    setSavingDocEdit(true)
    const res = await updateHospitalizationDocumentMetadata(docId, {
      title:         editingDocForm.title,
      document_date: editingDocForm.document_date || null,
      notes:         editingDocForm.notes,
    })
    setSavingDocEdit(false)
    if ('error' in res) { alert('Erro: ' + res.error); return }
    setDocuments(prev => prev.map(d => d.id === docId ? {
      ...d,
      title:         (editingDocForm.title?.trim() || null),
      document_date: (editingDocForm.document_date || null),
      notes:         (editingDocForm.notes?.trim() || null),
    } : d))
    setEditingDocId(null)
    setEditingDocForm({})
  }

  async function handleDownload(doc: HospDocument) {
    const supabase = createClient()
    const { data } = await supabase.storage.from('clinical-documents').createSignedUrl(doc.storage_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleDeleteDoc(doc: HospDocument) {
    if (!confirm(`Remover "${doc.file_name}"?`)) return
    const result = await deleteHospitalizationDocument(doc.id, doc.storage_path)
    if ('error' in result) { alert('Erro: ' + result.error); return }
    setDocuments(prev => prev.filter(d => d.id !== doc.id))
  }

  function onDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragging(true) }
  function onDragLeave() { setIsDragging(false) }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) stageFileForUpload(file)
  }

  return (
    <>
    {/* Toast de confirmação de save */}
    {saveToast && (
      <div className="fixed top-5 right-5 z-[60] flex items-center gap-3 bg-emerald-600 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg animate-fade-in">
        <CheckCircle className="h-4 w-4 flex-shrink-0" />
        {saveToast}
      </div>
    )}

    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-violet-600 flex items-center justify-center text-white shadow-lg shadow-violet-200">
              <Activity className="h-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-slate-900 leading-tight">Evolução: <span className="text-violet-600">{card.patient.name}</span></h2>
                {card.consultation_id && <ConsultationQuotationBadge consultationId={card.consultation_id} />}
              </div>
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{card.patient.species} • {card.patient.breed || 'SRD'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {internacaoCompleta && (
              <button
                type="button"
                onClick={() => setShowMedModal(true)}
                data-testid="open-medications-btn"
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-3 py-1.5 rounded-full transition-colors shadow-sm"
                title="Medicações e aprazamento"
              >
                <Pill className="h-3.5 w-3.5" />
                Medicações
              </button>
            )}
            {card.status === 'ready_for_discharge' && card.tutor?.phone && (
              <button
                type="button"
                onClick={() => setWhatsappPending({
                  trigger: 'hospitalization_discharge',
                  notes: records[0]?.notes ?? '',
                  statusSaved: 'melhorou',
                  medNames: records[0]?.medications?.map((m: any) => m.name).filter(Boolean) ?? [],
                })}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-full transition-colors shadow-sm"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Enviar Relatório de Alta
              </button>
            )}
            <button
              type="button"
              onClick={() => { setShowCancelHosp(true); setCancelHospError(null) }}
              className="flex items-center gap-1.5 border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold px-3 py-1.5 rounded-full transition-colors"
              title="Cancelar internação criada por engano"
            >
              Cancelar internação
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Confirmação de cancelamento da internação */}
        {showCancelHosp && (
          <div className="mx-6 mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 space-y-3">
            <p className="text-sm font-bold text-rose-800">Cancelar esta internação?</p>
            <p className="text-xs text-rose-700">
              Use apenas para admissões criadas por engano (ex.: duplicata). O registro sai do mapa e fica no histórico como cancelado.
              Para encerramento normal, utilize o fluxo de Alta.
            </p>
            <textarea
              value={cancelHospReason}
              onChange={e => setCancelHospReason(e.target.value)}
              placeholder="Motivo do cancelamento (obrigatório)"
              rows={2}
              className="w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-300"
            />
            {cancelHospError && <p className="text-xs font-semibold text-rose-700">{cancelHospError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={cancellingHosp || !cancelHospReason.trim()}
                onClick={async () => {
                  setCancellingHosp(true); setCancelHospError(null)
                  const res = await cancelHospitalization(card.id, cancelHospReason)
                  setCancellingHosp(false)
                  if ('error' in res) { setCancelHospError(res.error); return }
                  onSaved?.()
                  onClose()
                }}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {cancellingHosp ? 'Cancelando…' : 'Confirmar cancelamento'}
              </button>
              <button
                type="button"
                onClick={() => setShowCancelHosp(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Voltar
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Coluna Esquerda: Formulário de Nova Evolução */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-violet-600" /> Registro de Plantão
                </h3>
                <div className="flex items-center gap-1.5">
                  {/* Botão de configuração de voz */}
                  <button
                    type="button"
                    onClick={() => setVoiceConfigOpen(true)}
                    title="Configurações de Voz"
                    className="p-1 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </button>
                  {/* Failsafe manual + indicador handsfree */}
                  <button
                    type="button"
                    data-testid="hospitalization-mic-btn"
                    aria-label={isRecording ? 'Parar gravação de voz' : 'Iniciar gravação de voz (microfone)'}
                    onClick={() => voiceAssistant.manualToggle()}
                    disabled={isProcessingVoice}
                    title={isRecording ? 'Parar (ou diga "Finalizar")' : 'Gravar (ou diga "Assistente")'}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      isRecording ? 'bg-rose-100 text-rose-700 animate-pulse' :
                      isProcessingVoice ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {isProcessingVoice ? <Loader2 className="h-3 w-3 animate-spin" /> : isRecording ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
                    {isRecording ? 'Ouvindo...' : isProcessingVoice ? 'IA Processando...' : 'Gravar Evolução'}
                  </button>
                </div>
              </div>
              
              {/* Convênio do pet — visível durante toda a internação */}
              {insuranceCard?.has_insurance && (
                <div className="mb-4">
                  <InsuranceCard data={insuranceCard} />
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Estado */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'piorou', icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
                    { id: 'estavel', icon: Minus, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
                    { id: 'melhorou', icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
                  ].map((opt) => (
                    <button
                      key={opt.id} type="button" onClick={() => setStatus(opt.id as any)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${status === opt.id ? `${opt.border} ${opt.bg} shadow-sm` : 'border-transparent bg-slate-50 opacity-60 hover:opacity-100'}`}
                    >
                      <opt.icon className={`h-5 w-5 ${opt.color}`} />
                      <span className="text-[10px] font-bold capitalize">{opt.id}</span>
                    </button>
                  ))}
                </div>

                {/* Notas */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Observações Clínicas</label>
                  <div className="relative mt-1">
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: Animal mais alerta, aceitou alimentação..." className="w-full p-3 rounded-xl border-slate-200 text-sm focus:ring-violet-500 focus:border-violet-500 min-h-[100px]" />
                    {/* Semáforo Petlove — chip flutuante de cobertura por voz. */}
                    <CoverageChip state={coverageSemaforo} className="z-20" />
                  </div>
                </div>

                {/* Medicações Estruturadas */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Medicações Aplicadas</label>
                    <button type="button" onClick={addEmptyMed} className="text-[10px] font-bold text-violet-600 flex items-center gap-1 hover:text-violet-700">
                      <Plus className="h-3 w-3" /> Adicionar Manual
                    </button>
                  </div>
                  <div className="space-y-3">
                    {meds.map((med, index) => (
                      <div key={index} className="flex gap-3 items-start bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1">
                          {/* Campo: Medicamento */}
                          <div className="col-span-2">
                            <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Medicamento</label>
                            <input 
                              placeholder="Ex: Soro Fisiológico" 
                              value={med.name} 
                              onChange={e => updateMed(index, 'name', e.target.value)} 
                              className="w-full mt-0.5 text-xs p-2 rounded-md border border-slate-300 bg-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none" 
                            />
                          </div>
                          {/* Campo: Dose */}
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Dose</label>
                            <input 
                              placeholder="Ex: 2ml" 
                              value={med.dose} 
                              onChange={e => updateMed(index, 'dose', e.target.value)} 
                              className="w-full mt-0.5 text-xs p-2 rounded-md border border-slate-300 bg-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none" 
                            />
                          </div>
                          {/* Campo: Via */}
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Via</label>
                            <input 
                              placeholder="Ex: IV, SC, Oral" 
                              value={med.route} 
                              onChange={e => updateMed(index, 'route', e.target.value)} 
                              className="w-full mt-0.5 text-xs p-2 rounded-md border border-slate-300 bg-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none" 
                            />
                          </div>
                          {/* Campo: Observações */}
                          <div className="col-span-2">
                            <label className="text-[9px] font-bold text-slate-400 uppercase ml-1">Posologia / Observações</label>
                            <input 
                              placeholder="Frequência ou observações..." 
                              value={med.notes} 
                              onChange={e => updateMed(index, 'notes', e.target.value)} 
                              className="w-full mt-0.5 text-xs p-2 rounded-md border border-slate-300 bg-white focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none" 
                            />
                          </div>
                        </div>
                        {/* Botão Remover */}
                        <button 
                          type="button" 
                          onClick={() => removeMed(index)} 
                          className="p-2 mt-4 text-rose-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition-colors"
                          title="Remover medicação"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Seletor de Documentos para WhatsApp */}
                {card.tutor?.phone && documents.length > 0 && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setDocPickerOpen(v => !v)}
                      className="flex items-center gap-2 text-xs font-semibold text-violet-700 hover:text-violet-900 transition-colors"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      Anexar documento?
                      <span className="text-violet-400 font-normal">
                        ({selectedDocIds.size > 0 ? `${selectedDocIds.size} de ${documents.length}` : `${documents.length} disponíve${documents.length !== 1 ? 'is' : 'l'}`})
                      </span>
                      {docPickerOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {docPickerOpen && (
                      <div className="space-y-1.5 pl-4 border-l-2 border-violet-100 ml-1">
                        {documents.map(doc => {
                          const checked = selectedDocIds.has(doc.id)
                          return (
                            <label
                              key={doc.id}
                              className="flex items-center gap-2 cursor-pointer group"
                              onClick={() => setSelectedDocIds(prev => {
                                const next = new Set(prev)
                                if (next.has(doc.id)) next.delete(doc.id)
                                else next.add(doc.id)
                                return next
                              })}
                            >
                              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${checked ? 'bg-violet-600 border-violet-600' : 'border-slate-300 group-hover:border-violet-400'}`}>
                                {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                              </div>
                              <div className="flex items-center gap-1.5 min-w-0">
                                {doc.file_type === 'pdf'   ? <FileText  className="h-3 w-3 text-rose-400 flex-shrink-0" />
                                : doc.file_type === 'image' ? <ImageIcon className="h-3 w-3 text-sky-400 flex-shrink-0" />
                                : <File className="h-3 w-3 text-slate-400 flex-shrink-0" />}
                                <span className="text-xs text-slate-600 truncate">{doc.file_name}</span>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                <button type="submit" disabled={isSubmitting} data-mentor-step="hosp-save-evolution-btn" className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-violet-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar Ficha no Prontuário
                </button>
              </form>

              {/* ─── Botão IA ────────────────────────────────────────────── */}
              <button
                type="button"
                onClick={handleAiSuggest}
                disabled={isLoadingAI}
                className="w-full mt-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoadingAI
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Brain className="h-4 w-4" />
                }
                {isLoadingAI ? 'Analisando Prontuário...' : 'Sugerir Conduta via IA'}
              </button>

              {/* ─── Botão Receituário via IA ───────────────────────────── */}
              <button
                type="button"
                onClick={handleGeneratePrescription}
                disabled={isLoadingPrescription}
                className="w-full mt-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoadingPrescription
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <FileText className="h-4 w-4" />
                }
                {isLoadingPrescription ? 'Preparando Receituário...' : 'Gerar Receita via IA'}
              </button>

              {/* ─── Painel de Resultado IA ──────────────────────────────── */}
              {aiSuggestion && (
                <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 overflow-hidden">
                  {/* Cabeçalho com recomendação */}
                  <div className={`flex items-center gap-3 px-4 py-3 ${
                    aiSuggestion.recommendation === 'alta'    ? 'bg-emerald-100 text-emerald-800' :
                    aiSuggestion.recommendation === 'uti'     ? 'bg-rose-100 text-rose-800'      :
                                                                'bg-amber-100 text-amber-800'
                  }`}>
                    {aiSuggestion.recommendation === 'alta'  && <CheckCircle className="h-5 w-5 flex-shrink-0" />}
                    {aiSuggestion.recommendation === 'uti'   && <Siren className="h-5 w-5 flex-shrink-0" />}
                    {aiSuggestion.recommendation === 'atencao' && <AlertTriangle className="h-5 w-5 flex-shrink-0" />}
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider">
                        Conduta Sugerida: {aiSuggestion.recommendation.toUpperCase()}
                      </p>
                      <p className="text-xs mt-0.5">{aiSuggestion.recommendation_label}</p>
                    </div>
                  </div>

                  {/* Resumo SOAP */}
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-bold text-indigo-500 uppercase mb-1.5 flex items-center gap-1">
                      <Brain className="h-3 w-3" /> Resumo de Passagem de Turno (SOAP)
                    </p>
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{aiSuggestion.summary}</p>
                  </div>

                  {/* Disclaimer CFMV */}
                  <div className="px-4 py-2.5 bg-slate-100/80 border-t border-indigo-100">
                    <p className="text-[10px] text-slate-500 leading-tight">
                      ⚠️ {aiSuggestion.disclaimer}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Coluna Direita: Tabbed (Linha do Tempo + Documentos) */}
          <div className="bg-slate-50/50 rounded-2xl border border-slate-100 h-[calc(100vh-200px)] flex flex-col overflow-hidden">

            {/* Voz unificada (Internação Completa): grava e roteia p/ todas as abas */}
            {internacaoCompleta && (
              <div className="flex-shrink-0 max-h-[48%] overflow-y-auto p-2 border-b border-slate-200">
                <VoiceReviewPanel
                  context="hospitalization"
                  hospitalizationId={card.id}
                  draft={uvoice.draft}
                  setDraft={uvoice.setDraft}
                  isRecording={isRecording}
                  isProcessing={isProcessingVoice || uvoice.isProcessing}
                  transcript={voiceAssistant.transcript}
                  hasDraft={uvoice.hasDraft}
                  lastSummary={uvoice.summary}
                  error={uvoice.error}
                  onToggleMic={() => voiceAssistant.manualToggle()}
                  clearDraft={uvoice.clear}
                  onPersisted={(r) => {
                    setSaveToast(`Salvo por voz: ${[r.vitals && 'vitais', r.fluids && `${r.fluids} fluido(s)`, r.tasks && `${r.tasks} tarefa(s)`, r.medications && `${r.medications} medicação(ões)`, r.clinical_data && 'dados clínicos'].filter(Boolean).join(', ') || 'registros'}.`)
                    setTimeout(() => setSaveToast(null), 4000)
                    void reloadPrescriptions(); onSaved?.()
                    setUnifiedRefreshKey(k => k + 1)
                  }}
                />
              </div>
            )}

            {/* Tabs */}
            <div className="border-b border-slate-200 bg-slate-100/80 backdrop-blur-md z-10 flex items-center overflow-x-auto">
              <button
                onClick={() => setActiveRightTab('timeline')}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all ${
                  activeRightTab === 'timeline'
                    ? 'border-violet-600 text-violet-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <History className="h-3.5 w-3.5" /> Linha do Tempo
              </button>
              <button
                onClick={() => setActiveRightTab('documents')}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all ${
                  activeRightTab === 'documents'
                    ? 'border-violet-600 text-violet-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Paperclip className="h-3.5 w-3.5" /> Documentos e Exames
                {documents.length > 0 && (
                  <span className="bg-violet-100 text-violet-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {documents.length}
                  </span>
                )}
              </button>

              {/* Abas clínicas avançadas (Internação Completa) */}
              {internacaoCompleta && (
                <>
                  <button
                    onClick={() => setActiveRightTab('vitals')}
                    data-testid="tab-vitals"
                    className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all ${
                      activeRightTab === 'vitals'
                        ? 'border-rose-600 text-rose-700'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <HeartPulse className="h-3.5 w-3.5" /> Sinais Vitais
                  </button>
                  <button
                    onClick={() => setActiveRightTab('fluids')}
                    data-testid="tab-fluids"
                    className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all ${
                      activeRightTab === 'fluids'
                        ? 'border-cyan-600 text-cyan-700'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Droplets className="h-3.5 w-3.5" /> Fluidoterapia
                  </button>
                  <button
                    onClick={() => setActiveRightTab('conta')}
                    data-testid="tab-conta"
                    className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all ${
                      activeRightTab === 'conta'
                        ? 'border-emerald-600 text-emerald-700'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Receipt className="h-3.5 w-3.5" /> Conta
                  </button>
                  <button
                    onClick={() => setActiveRightTab('dados')}
                    data-testid="tab-dados"
                    className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
                      activeRightTab === 'dados' ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <BedDouble className="h-3.5 w-3.5" /> Dados Clínicos
                  </button>
                  <button
                    onClick={() => setActiveRightTab('tarefas')}
                    data-testid="tab-tarefas"
                    className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
                      activeRightTab === 'tarefas' ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <ListChecks className="h-3.5 w-3.5" /> Tarefas
                  </button>
                </>
              )}

              {/* Botão de Voz: Perguntar ao Prontuário */}
              <button
                type="button"
                onClick={toggleVoiceQuestion}
                disabled={isAskingHistory}
                title="Perguntar ao prontuário por voz"
                className={`ml-auto flex items-center gap-1.5 px-3 py-2 mx-2 rounded-full text-xs font-bold border transition-all ${
                  isVoiceQuestion
                    ? 'bg-violet-600 border-violet-600 text-white animate-pulse shadow-md shadow-violet-200'
                    : isAskingHistory
                    ? 'bg-violet-100 border-violet-200 text-violet-600'
                    : 'bg-white border-violet-200 text-violet-600 hover:bg-violet-50'
                }`}
              >
                {isAskingHistory
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : isVoiceQuestion
                  ? <Mic className="h-3.5 w-3.5" />
                  : <MessageSquare className="h-3.5 w-3.5" />
                }
                {isVoiceQuestion ? 'Ouvindo...' : isAskingHistory ? 'IA...' : 'Perguntar'}
              </button>
            </div>

            {/* ─── Aba: Linha do Tempo ─── */}
            {activeRightTab === 'timeline' && (
              <div className="flex-1 overflow-y-auto p-5">

                {/* ─── Balão de Chat por Voz ─── */}
                {(voiceQuestion || voiceChatAnswer || isAskingHistory) && (
                  <div className="mb-4 rounded-2xl border border-violet-200 bg-white shadow-sm overflow-hidden">
                    {/* Pergunta */}
                    {voiceQuestion && (
                      <div className="flex items-start gap-2.5 px-4 pt-3 pb-2">
                        <div className="h-6 w-6 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Mic className="h-3 w-3 text-white" />
                        </div>
                        <p className="text-xs text-slate-700 italic">"{voiceQuestion}"</p>
                      </div>
                    )}

                    {/* Loading */}
                    {isAskingHistory && (
                      <div className="flex items-center gap-2 px-4 py-3 border-t border-violet-50">
                        <Loader2 className="h-4 w-4 text-violet-500 animate-spin flex-shrink-0" />
                        <span className="text-xs text-violet-600">Consultando prontuário...</span>
                      </div>
                    )}

                    {/* Resposta da IA */}
                    {voiceChatAnswer && !isAskingHistory && (
                      <>
                        <div className="flex items-start gap-2.5 px-4 py-3 border-t border-violet-50 bg-violet-50/40">
                          <div className="h-6 w-6 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Brain className="h-3 w-3 text-white" />
                          </div>
                          <p className="text-xs text-slate-800 leading-relaxed flex-1">{voiceChatAnswer.answer}</p>
                          {/* Mudo: VolumeX (cinza) → clique ativa e relê.
                              Ativo: Volume2 (índigo) → clique silencia. */}
                          <button
                            onClick={() => {
                              if (isMuted) {
                                toggleMute()
                                speakText(voiceChatAnswer.answer)
                              } else {
                                toggleMute()
                              }
                            }}
                            className={`p-1 flex-shrink-0 transition-colors ${isMuted ? 'text-slate-300 hover:text-slate-500' : 'text-indigo-400 hover:text-indigo-600'}`}
                            title={isMuted ? 'Ativar voz e reler' : 'Silenciar'}
                          >
                            {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                        <div className="px-4 py-2 bg-slate-50 border-t border-violet-100 flex items-center justify-between">
                          <p className="text-[10px] text-slate-400 flex-1 leading-tight">⚠️ {voiceChatAnswer.disclaimer}</p>
                          <button
                            onClick={() => { setVoiceChatAnswer(null); setVoiceQuestion(''); window.speechSynthesis?.cancel() }}
                            className="ml-3 text-[10px] font-bold text-slate-500 hover:text-slate-700 flex items-center gap-1 flex-shrink-0"
                          >
                            <X className="h-3 w-3" /> Fechar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {loadingRecords ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
                ) : records.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-xs">Nenhum registro ainda.</div>
                ) : (
                  <div className="space-y-5">
                    {records.map((record) => (
                      <div key={record.id} className="relative pl-8 border-l-2 border-slate-200 pb-2">
                        <div className={`absolute -left-[11px] top-1 h-5 w-5 rounded-full border-4 border-slate-50 flex items-center justify-center shadow-sm ${
                          record.improvement_level === 'melhorou' ? 'bg-emerald-500' :
                          record.improvement_level === 'piorou' ? 'bg-rose-500' : 'bg-amber-500'
                        }`} />
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                          <div className="flex items-start justify-between mb-3 pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center"><User className="h-3 w-3 text-slate-500" /></div>
                              <div>
                                <span className="text-xs font-bold text-slate-800 block">{record.user_name}</span>
                                <span className="text-[10px] text-slate-400 capitalize">{record.improvement_level}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center gap-1 text-slate-700 font-bold text-xs justify-end">
                                <Clock className="h-3 w-3 text-violet-500" />
                                {formatClinicTime(record.created_at)}
                              </div>
                              <span className="text-[10px] text-slate-400">{formatClinicDate(record.created_at)}</span>
                            </div>
                          </div>
                          {record.notes && (
                            <p className="text-sm text-slate-600 leading-relaxed mb-3 whitespace-pre-wrap">{record.notes}</p>
                          )}
                          {record.medications && record.medications.length > 0 && (
                            <div className="space-y-2 mt-3 pt-3 border-t border-slate-50">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Medicação Aplicada:</span>
                              {record.medications.map((med, idx) => (
                                <div key={idx} className="flex flex-col bg-violet-50/50 p-2.5 rounded-lg border border-violet-100">
                                  <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-violet-900 flex items-center gap-1"><Pill className="h-3 w-3 text-violet-500"/> {med.name}</span>
                                    <span className="text-[10px] font-bold bg-white text-violet-700 px-2 py-0.5 rounded-md shadow-sm">{med.dose} • {med.route}</span>
                                  </div>
                                  {med.notes && <span className="text-[10px] text-violet-600 mt-1">{med.notes}</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─── Aba: Documentos e Exames ─── */}
            {activeRightTab === 'documents' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {/* Staging — arquivo selecionado, esperando metadata + confirmação */}
                {stagedDoc && (
                  <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-violet-100 flex items-center justify-center">
                        <Paperclip className="h-4 w-4 text-violet-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{stagedDoc.file.name}</p>
                        <p className="text-[10px] text-slate-500">{(stagedDoc.file.size / 1024).toFixed(0)} KB · pronto para enviar</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStagedDoc(null)}
                        disabled={isUploading}
                        className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        title="Cancelar"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">Detalhes (opcionais)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="block">
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 mb-1">
                          <Tag className="h-3 w-3" /> Título
                        </span>
                        <input
                          type="text"
                          value={stagedDoc.title}
                          onChange={e => setStagedDoc({ ...stagedDoc, title: e.target.value })}
                          placeholder="ex.: Raio-X tórax"
                          disabled={isUploading}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-violet-400 focus:outline-none disabled:bg-slate-50"
                        />
                      </label>
                      <label className="block">
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 mb-1">
                          <Calendar className="h-3 w-3" /> Data do documento
                        </span>
                        <input
                          type="date"
                          value={stagedDoc.document_date}
                          onChange={e => setStagedDoc({ ...stagedDoc, document_date: e.target.value })}
                          disabled={isUploading}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-violet-400 focus:outline-none disabled:bg-slate-50"
                        />
                      </label>
                    </div>
                    <label className="block">
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 mb-1">
                        <StickyNote className="h-3 w-3" /> Observação
                      </span>
                      <textarea
                        value={stagedDoc.notes}
                        onChange={e => setStagedDoc({ ...stagedDoc, notes: e.target.value })}
                        rows={2}
                        placeholder="Notas livres sobre o documento..."
                        disabled={isUploading}
                        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-violet-400 focus:outline-none disabled:bg-slate-50 resize-none"
                      />
                    </label>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setStagedDoc(null)}
                        disabled={isUploading}
                        className="rounded-lg px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={confirmStagedUpload}
                        disabled={isUploading}
                        className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50"
                      >
                        {isUploading
                          ? <><Loader2 className="h-3 w-3 animate-spin" /> Enviando...</>
                          : <><Upload className="h-3 w-3" /> Enviar anexo</>
                        }
                      </button>
                    </div>
                  </div>
                )}

                {/* Dropzone — escondida durante staging */}
                {!stagedDoc && (
                  <div
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all ${
                      isDragging ? 'border-violet-400 bg-violet-50' : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50/80'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,image/*"
                      onChange={e => { const f = e.target.files?.[0]; if (f) stageFileForUpload(f) }}
                    />
                    <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center">
                      <Upload className="h-5 w-5 text-violet-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-slate-700">Arraste ou clique para anexar</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">PDF ou Imagem (máx. 50 MB)</p>
                    </div>
                  </div>
                )}

                {/* Lista de Documentos */}
                {loadingDocs ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
                ) : documents.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-4">Nenhum documento anexado.</p>
                ) : (
                  <div className="space-y-2">
                    {documents.map(doc => {
                      const isEditingDoc = editingDocId === doc.id
                      const hasMeta = !!(doc.title || doc.document_date || doc.notes)
                      const headline = doc.title?.trim() || doc.file_name
                      const docDate = doc.document_date
                        ? (() => {
                            const [y, m, d] = doc.document_date.split('-').map(Number)
                            return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                          })()
                        : null
                      return (
                        <div key={doc.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                          <div className="flex items-start gap-3">
                            <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              doc.file_type === 'pdf'   ? 'bg-rose-50 text-rose-500' :
                              doc.file_type === 'image' ? 'bg-sky-50 text-sky-500'  : 'bg-slate-50 text-slate-400'
                            }`}>
                              {doc.file_type === 'pdf'   ? <FileText  className="h-4 w-4" /> :
                               doc.file_type === 'image' ? <ImageIcon className="h-4 w-4" /> : <File className="h-4 w-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">{headline}</p>
                              {doc.title && doc.title.trim() && (
                                <p className="text-[10px] text-slate-400 truncate">{doc.file_name}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0 text-[10px] text-slate-400">
                                {docDate && (
                                  <span className="inline-flex items-center gap-1 text-slate-500">
                                    <Calendar className="h-2.5 w-2.5" /> {docDate}
                                  </span>
                                )}
                                <span>{doc.user_name} • Enviado em {formatClinicDate(doc.created_at)}</span>
                              </div>
                              {doc.notes && doc.notes.trim() && (
                                <p className="text-[11px] text-slate-600 mt-1 italic">"{doc.notes}"</p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                onClick={() => handleDownload(doc)}
                                className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                                title="Visualizar / Baixar"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  if (isEditingDoc) {
                                    setEditingDocId(null); setEditingDocForm({})
                                  } else {
                                    setEditingDocId(doc.id)
                                    setEditingDocForm({
                                      title:         doc.title ?? '',
                                      document_date: doc.document_date ?? '',
                                      notes:         doc.notes ?? '',
                                    })
                                  }
                                }}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  isEditingDoc
                                    ? 'text-blue-600 bg-blue-50'
                                    : `${hasMeta ? 'text-slate-500' : 'text-slate-400'} hover:text-blue-600 hover:bg-blue-50`
                                }`}
                                title={isEditingDoc ? 'Cancelar edição' : (hasMeta ? 'Editar detalhes' : 'Adicionar detalhes')}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteDoc(doc)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Remover documento"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {isEditingDoc && (
                            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/40 p-2.5 space-y-2">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <label className="block">
                                  <span className="text-[10px] font-semibold text-slate-600">Título</span>
                                  <input
                                    type="text"
                                    value={editingDocForm.title ?? ''}
                                    onChange={e => setEditingDocForm({ ...editingDocForm, title: e.target.value })}
                                    disabled={savingDocEdit}
                                    className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none disabled:bg-slate-50"
                                  />
                                </label>
                                <label className="block">
                                  <span className="text-[10px] font-semibold text-slate-600">Data do documento</span>
                                  <input
                                    type="date"
                                    value={editingDocForm.document_date ?? ''}
                                    onChange={e => setEditingDocForm({ ...editingDocForm, document_date: e.target.value })}
                                    disabled={savingDocEdit}
                                    className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none disabled:bg-slate-50"
                                  />
                                </label>
                              </div>
                              <label className="block">
                                <span className="text-[10px] font-semibold text-slate-600">Observação</span>
                                <textarea
                                  value={editingDocForm.notes ?? ''}
                                  onChange={e => setEditingDocForm({ ...editingDocForm, notes: e.target.value })}
                                  rows={2}
                                  disabled={savingDocEdit}
                                  className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none disabled:bg-slate-50 resize-none"
                                />
                              </label>
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => { setEditingDocId(null); setEditingDocForm({}) }}
                                  disabled={savingDocEdit}
                                  className="rounded-md px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => saveDocMetadata(doc.id)}
                                  disabled={savingDocEdit}
                                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {savingDocEdit
                                    ? <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Salvando</>
                                    : <><Save className="h-2.5 w-2.5" /> Salvar</>
                                  }
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ─── Aba: Sinais Vitais (Internação Completa) ─── */}
            {activeRightTab === 'vitals' && internacaoCompleta && (
              <VitalsTab key={`vitals-${unifiedRefreshKey}`} hospitalizationId={card.id} admissionWeight={admissionWeight} />
            )}

            {/* ─── Aba: Fluidoterapia + Balanço Hídrico (Internação Completa) ─── */}
            {activeRightTab === 'fluids' && internacaoCompleta && (
              <FluidTherapyTab key={`fluids-${unifiedRefreshKey}`} hospitalizationId={card.id} admissionWeight={admissionWeight} />
            )}

            {/* ─── Aba: Conta + Máquina de Alta (Internação Completa, Regra 4) ─── */}
            {activeRightTab === 'conta' && internacaoCompleta && (
              <ContaTab
                hospitalizationId={card.id}
                consultationId={card.consultation_id}
                status={card.status}
                onStatusChanged={(s) => { onStatusChanged?.(s); onClose() }}
              />
            )}

            {/* ─── Aba: Dados Clínicos (ficha enriquecida + isolamento) ─── */}
            {activeRightTab === 'dados' && internacaoCompleta && (
              <DadosClinicosTab hospitalizationId={card.id} onSaved={(patch) => onCardUpdated?.(patch)} />
            )}

            {/* ─── Aba: Tarefas (exame/procedimento/alimentação → Mapa) ─── */}
            {activeRightTab === 'tarefas' && internacaoCompleta && (
              <TarefasTab key={`tarefas-${unifiedRefreshKey}`} hospitalizationId={card.id} onChanged={() => onSaved?.()} />
            )}
          </div>
        </div>
      </div>

      {/* ─── Receituário Modal ───────────────────────────────────────────── */}
      {prescriptionData && (
        <PrescriptionModal
          data={prescriptionData}
          card={card}
          onClose={() => setPrescriptionData(null)}
        />
      )}

      {/* ─── Medicações / Aprazamento (popula o Mapa de Execução) ─────────── */}
      {showMedModal && (
        <MedicationApplicationModal
          hospitalizationId={card.id}
          patientName={card.patient.name}
          prescriptions={prescriptions}
          onClose={() => setShowMedModal(false)}
          onUpdate={reloadPrescriptions}
        />
      )}
    </div>

    {/* WhatsApp — renderizado APÓS o modal principal para garantir sobreposição correta pelo DOM */}
    {whatsappPending && card.tutor?.phone && (
      <WhatsAppNotificationModal
        isOpen={!!whatsappPending}
        autoSend={voiceConfirmedWA}
        onClose={() => { setWhatsappPending(null); setVoiceConfirmedWA(false); lastSavedWaCtxRef.current = null; resetForm(); onSaved?.() }}
        trigger={whatsappPending.trigger}
        context={{
          petName:         card.patient.name,
          tutorName:       card.tutor.name,
          tutorPhone:      card.tutor.phone,
          species:         card.patient.species,
          breed:           card.patient.breed ?? undefined,
          evolutionStatus: whatsappPending.statusSaved,
          evolutionNotes:  whatsappPending.notes,
          medications:     whatsappPending.medNames,
          documentTitles:  whatsappPending.attachedDocNames,
        }}
        hospitalizationId={card.id}
        patientId={card.patient.id}
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
            <p className="text-[10px] text-slate-400 mb-2">Se a lista estiver vazia, o sistema usa os padrões integrados. Itens removidos são desativados permanentemente.</p>
            <div className="flex gap-2 mb-2">
              <input type="text" value={newStartInput} onChange={e => setNewStartInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && newStartInput.trim()) { e.preventDefault(); setStartTriggers(prev => [...new Set([...prev, newStartInput.trim().toLowerCase()])]); setNewStartInput('') } }}
                placeholder='Ex: "iniciar plantão"'
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
                placeholder='Ex: "gravar evolução"'
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