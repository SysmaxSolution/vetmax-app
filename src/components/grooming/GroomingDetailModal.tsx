'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Scissors, History, Loader2, Save, Mic, MicOff,
  User, Clock, Plus, Trash2, CheckCircle, Paperclip,
  ImageIcon, FileText, Upload, Wifi, WifiOff, Settings,
  DollarSign, Tag, BadgeCheck, Ban, ExternalLink, ChevronRight, Pencil,
} from 'lucide-react'
import type { WhatsAppTrigger } from '@/lib/actions/whatsapp'
import { createClient } from '@/lib/supabase/client'
import {
  addGroomingRecord,
  updateGroomingRecord,
  extractGroomingVoice,
  updateGroomingStatus,
  updateGroomingPricing,
  getGroomingCatalog,
  getGroomingDocuments,
  saveGroomingDocument,
  deleteGroomingDocument,
  type GroomingCard,
  type GroomingRecord,
  type GroomingDocument,
  type GroomingCatalogItem,
  type GroomingServicePrice,
} from '@/lib/actions/grooming'
import { addStockItemV2 } from '@/lib/actions/stock'
import { parseGroomingIntent } from '@/lib/actions/grooming-intent'
import type { GroomingStatus } from '@/lib/actions/grooming'

const INTENT_TO_DB_STATUS: Record<string, GroomingStatus> = {
  RECEIVED:         'received',
  IN_BATH:          'bathing',
  IN_GROOMING:      'grooming',
  READY_FOR_PICKUP: 'waiting_pickup',
  DELIVERED:        'delivered',
}
import { getClinicVoiceTriggers, updateClinicVoiceTriggers } from '@/lib/actions/clinic-settings'

// ─── Fluxo de status (mobile: botões de progressão) ──────────────────────────

// B-04: ordem profissional padrão — Tosa primeiro, depois Banho
const STATUS_FLOW: GroomingStatus[] = ['received', 'grooming', 'bathing', 'waiting_pickup', 'delivered']
const STATUS_LABELS: Record<GroomingStatus, string> = {
  received:       'Recebido',
  grooming:       'Em Tosa',
  bathing:        'Em Banho',
  waiting_pickup: 'Aguardando Retirada',
  delivered:      'Entregue',
}
const STATUS_COLORS: Record<GroomingStatus, string> = {
  received:       'bg-slate-100 text-slate-700',
  grooming:       'bg-violet-100 text-violet-700',
  bathing:        'bg-blue-100 text-blue-700',
  waiting_pickup: 'bg-amber-100 text-amber-700',
  delivered:      'bg-emerald-100 text-emerald-700',
}
const STATUS_NEXT_BTN: Record<GroomingStatus, string> = {
  received:       'bg-violet-600 hover:bg-violet-700',
  grooming:       'bg-blue-600 hover:bg-blue-700',
  bathing:        'bg-amber-500 hover:bg-amber-600',
  waiting_pickup: 'bg-emerald-600 hover:bg-emerald-700',
  delivered:      '',
}
import { useGroomingVoiceAssistant } from '@/hooks/useGroomingVoiceAssistant'
import WhatsAppNotificationModal from '@/components/whatsapp/WhatsAppNotificationModal'

// ─── Serviços e comportamentos ────────────────────────────────────────────────

const SERVICES_LIST = [
  'Banho Simples', 'Banho Completo', 'Tosa Higiênica', 'Tosa Completa',
  'Tosa na Tesoura', 'Tosa Bebê', 'Hidratação', 'Escovação',
  'Limpeza de Ouvidos', 'Corte de Unhas', 'Secagem Completa', 'Perfume', 'Bandana / Laço',
]

const BEHAVIOR_OPTIONS = [
  { id: 'tranquilo',  label: 'Tranquilo',  color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { id: 'ansioso',    label: 'Ansioso',    color: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200'   },
  { id: 'agitado',    label: 'Agitado',    color: 'text-orange-600',  bg: 'bg-orange-50',  border: 'border-orange-200'  },
  { id: 'agressivo',  label: 'Agressivo',  color: 'text-rose-600',    bg: 'bg-rose-50',    border: 'border-rose-200'    },
]

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
const MAX_SIZE_MB = 20

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  card:             GroomingCard
  onClose:          () => void
  onSaved?:         () => void
  /** Callback para atualização otimista do Kanban sem fechar o modal */
  onStatusChange?:  (newStatus: GroomingStatus) => void
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function GroomingDetailModal({ card, onClose, onSaved, onStatusChange }: Props) {
  const [records, setRecords]           = useState<GroomingRecord[]>([])
  const [loadingRecords, setLoadingRecords] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saveToast, setSaveToast]       = useState<string | null>(null)
  const [errorToast, setErrorToast]     = useState<string | null>(null)
  const [activeTab, setActiveTab]       = useState<'timeline' | 'documents' | 'billing'>('timeline')

  // Billing
  const [catalog, setCatalog]           = useState<GroomingCatalogItem[]>([])
  const [servicePrices, setServicePrices] = useState<GroomingServicePrice[]>(
    Array.isArray(card.service_prices) ? card.service_prices : []
  )
  const [discountPct, setDiscountPct]   = useState(card.discount_percent ?? 0)
  const [paymentStatus, setPaymentStatus] = useState(card.payment_status ?? 'pending')
  const [isSavingBilling, setIsSavingBilling] = useState(false)
  const [billingToast, setBillingToast]   = useState<string | null>(null)

  // Formulário
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [productsInput, setProductsInput]       = useState('')
  const [products, setProducts]                 = useState<string[]>([])
  const [behavior, setBehavior]                 = useState<string>('')
  const [observations, setObservations]         = useState('')
  const [lastSavedTranscript, setLastSavedTranscript] = useState('')
  const [isParsingIntent, setIsParsingIntent] = useState(false)

  // (push-to-talk legado removido — voz gerenciada pelo useGroomingVoiceAssistant)

  // Documentos
  const [documents, setDocuments]               = useState<GroomingDocument[]>([])
  const [isUploadingDoc, setIsUploadingDoc]     = useState(false)
  const [isDraggingFile, setIsDraggingFile]     = useState(false)
  const fileInputRef                            = useRef<HTMLInputElement>(null)

  // WhatsApp
  const [whatsappPending,   setWhatsappPending]   = useState(false)
  const [voiceConfirmedWA,  setVoiceConfirmedWA]  = useState(false)
  const [waTrigger, setWaTrigger] = useState<WhatsAppTrigger>('grooming_ready_for_pickup')
  const [waAppliedServices, setWaAppliedServices] = useState<string[]>([])
  const [waObservations,    setWaObservations]    = useState('')

  // Status progressão mobile
  const [currentCardStatus, setCurrentCardStatus] = useState<GroomingStatus>(card.status)
  const [isAdvancingStatus, setIsAdvancingStatus] = useState(false)

  // Cadastro de produto não registrado
  const [pendingUnregisteredProducts, setPendingUnregisteredProducts] = useState<string[]>([])
  const [showRegisterProductModal, setShowRegisterProductModal] = useState(false)
  const [registerProductName, setRegisterProductName] = useState('')
  const [registerProductPrice, setRegisterProductPrice] = useState('')
  const [registerProductSaving, setRegisterProductSaving] = useState(false)

  // Edição inline de registros do feed
  const [editingRecordId, setEditingRecordId]         = useState<string | null>(null)
  const [editObs, setEditObs]                         = useState('')
  const [editServices, setEditServices]               = useState<string[]>([])
  const [editProducts, setEditProducts]               = useState<string[]>([])
  const [editBehavior, setEditBehavior]               = useState('')
  const [isSavingEdit, setIsSavingEdit]               = useState(false)

  // Novo item na aba Cobrança
  const [newBillingItemName, setNewBillingItemName] = useState('')
  const [newBillingItemPrice, setNewBillingItemPrice] = useState('')

  // Voice triggers (personalizáveis por clínica)
  const [startTriggers,  setStartTriggers]  = useState<string[]>([])
  const [stopTriggers,   setStopTriggers]   = useState<string[]>([])
  const [voiceConfigOpen, setVoiceConfigOpen] = useState(false)
  const [configSaving,   setConfigSaving]   = useState(false)
  const [newStartInput,  setNewStartInput]  = useState('')
  const [newStopInput,   setNewStopInput]   = useState('')

  // ─── Carregar histórico ────────────────────────────────────────────────────

  const loadRecords = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('grooming_records')
      .select('*')
      .eq('session_id', card.id)
      .order('created_at', { ascending: false })
    if (data) setRecords(data as GroomingRecord[])
    setLoadingRecords(false)
  }, [card.id])

  const loadDocuments = useCallback(async () => {
    const res = await getGroomingDocuments(card.id)
    if (!('error' in res)) setDocuments(res)
  }, [card.id])

  useEffect(() => { loadRecords(); loadDocuments() }, [loadRecords, loadDocuments])

  // Carrega catálogo de grooming para billing
  useEffect(() => {
    getGroomingCatalog().then(res => { if (!('error' in res)) setCatalog(res) })
  }, [])

  // Sincroniza servicePrices com os serviços solicitados ao abrir a aba billing
  useEffect(() => {
    if (activeTab !== 'billing') return
    if (servicePrices.length === 0 && card.services_requested.length > 0) {
      const prices = card.services_requested.map(svc => {
        const item = catalog.find(c => c.name.toLowerCase() === svc.toLowerCase())
        return { name: svc, price: item ? item.price : 0 }
      })
      setServicePrices(prices)
    }
  }, [activeTab, catalog, card.services_requested, servicePrices.length])

  // Carrega gatilhos de voz da clínica
  useEffect(() => {
    getClinicVoiceTriggers().then(res => {
      if (!('error' in res)) {
        setStartTriggers(res.startTriggers)
        setStopTriggers(res.stopTriggers)
      }
    })
  }, [])

  // Pre-fill serviços solicitados no primeiro registro
  useEffect(() => {
    if (records.length === 0 && card.services_requested.length > 0) {
      setSelectedServices(card.services_requested)
    }
  }, [records.length, card.services_requested])

  // ─── Voice Assistant (Hands-Free) ─────────────────────────────────────────

  const handleAutoSave = useCallback(async (transcript: string) => {
    if (!transcript) return
    setLastSavedTranscript(transcript)
    setIsParsingIntent(true)

    try {
      // 1. Parseia intenção + extrai dados estruturados em uma única chamada
      const intent = await parseGroomingIntent(transcript, card.status)

      const rawObs   = !('error' in intent) ? intent.observation_text           : ''
      // Fallback: se a IA devolveu observation_text vazio, usar o transcript original
      const obsText  = rawObs.trim() || transcript
      const newSvcs  = !('error' in intent) ? (intent.extracted_services ?? []) : []
      const newProds = !('error' in intent) ? (intent.extracted_products ?? []) : []

      // 2. Merge nos estados do formulário (UI atualiza no próximo render)
      const mergedSvcs  = [...new Set([...selectedServices, ...newSvcs])]
      const mergedProds = [...new Set([...products, ...newProds])]
      setSelectedServices(mergedSvcs)
      setProducts(mergedProds)
      setObservations(prev => prev.trim() ? `${prev}\n\n${obsText}` : obsText)

      // 3. Extrai comportamento (único campo não coberto pelo intent parser)
      const result = await extractGroomingVoice(obsText)
      const beh    = !('error' in result) ? result.behavior ?? behavior : behavior

      // 4. Salva no banco com os valores mesclados (não usa estado: React state é async)
      await addGroomingRecord({
        session_id:          card.id,
        voice_transcription: transcript,
        services_applied:    mergedSvcs,
        products_used:       mergedProds,
        behavior:            beh || undefined,
        observations:        obsText,
      })

      // 5. Move o card Kanban se a IA detectou mudança de status
      if (!('error' in intent) && intent.new_status && intent.action === 'MOVE_AND_SAVE') {
        const dbStatus = INTENT_TO_DB_STATUS[intent.new_status]
        if (dbStatus && dbStatus !== currentCardStatus) {
          await updateGroomingStatus(card.id, dbStatus)
          setCurrentCardStatus(dbStatus)
          onStatusChange?.(dbStatus)
        }
      }

      // 6. Merge todos os serviços e produtos detectados na aba Cobrança
      const allNewItems = [...mergedSvcs, ...mergedProds]
      if (allNewItems.length > 0) {
        setServicePrices(prev => {
          const result = [...prev]
          for (const name of allNewItems) {
            if (result.some(p => p.name.toLowerCase() === name.toLowerCase())) continue
            const catItem = catalog.find(c => c.name.toLowerCase() === name.toLowerCase())
            result.push({ name, price: catItem?.price ?? 0 })
          }
          return result
        })
      }

      // 7. Determina trigger de WhatsApp baseado no novo status detectado
      const detectedStatus = !('error' in intent) ? intent.new_status : null
      const resolvedTrigger: WhatsAppTrigger =
        detectedStatus === 'DELIVERED' ? 'grooming_delivered' : 'grooming_ready_for_pickup'
      setWaTrigger(resolvedTrigger)

      setIsParsingIntent(false)
      // Limpa o formulário para evitar duplo envio manual após gravação por voz
      setSelectedServices([])
      setProducts([])
      setBehavior('')
      setObservations('')

      // Atualiza timeline ANTES de abrir o modal do WhatsApp
      await loadRecords()
      setSaveToast('Evolução salva pelo assistente de voz!')
      setTimeout(() => setSaveToast(null), 3500)
      // WhatsApp é oferecido via voz pelo hook (CONFIRM_WA) — sem disparo duplicado aqui
    } catch (err) {
      console.error('[handleAutoSave] erro ao salvar evolução:', err)
      setIsParsingIntent(false)
      setErrorToast('Erro ao salvar evolução. Tente novamente.')
      setTimeout(() => setErrorToast(null), 4000)
      // Modal permanece aberto — nunca fechar no catch
    }
  }, [card.id, card.status, card.tutor?.phone, selectedServices, products, behavior, loadRecords])

  const handleVoiceWA = useCallback(() => {
    setVoiceConfirmedWA(true)
    if (card.tutor?.phone) setWhatsappPending(true)
  }, [card.tutor?.phone])

  const assistant = useGroomingVoiceAssistant({
    onAutoSave:    handleAutoSave,
    onSendWA:      handleVoiceWA,
    startTriggers,
    stopTriggers,
  })

  // Auto-ativa o assistente quando o modal abre; desativa ao fechar
  useEffect(() => {
    assistant.activate()
    return () => assistant.deactivate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Failsafe: barra de espaço alterna IDLE ↔ RECORDING quando o foco não está em campo de texto
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space') return
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase()
      if (['input', 'textarea', 'select', 'button'].includes(tag ?? '')) return
      e.preventDefault()
      assistant.manualToggle()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [assistant.manualToggle])

  // ─── Salvar configuração de voz ───────────────────────────────────────────

  async function saveVoiceConfig() {
    setConfigSaving(true)
    await updateClinicVoiceTriggers(startTriggers, stopTriggers)
    setConfigSaving(false)
    setVoiceConfigOpen(false)
  }

  // ─── Progressão de status mobile ──────────────────────────────────────────

  async function handleStatusAdvance(nextStatus: GroomingStatus) {
    setIsAdvancingStatus(true)
    const result = await updateGroomingStatus(card.id, nextStatus)
    if ('error' in result) {
      setErrorToast('Erro ao avançar etapa: ' + result.error)
      setTimeout(() => setErrorToast(null), 4000)
    } else {
      setCurrentCardStatus(nextStatus)
      onStatusChange?.(nextStatus)
      if (nextStatus === 'waiting_pickup' || nextStatus === 'delivered') {
        const trigger: WhatsAppTrigger = nextStatus === 'delivered' ? 'grooming_delivered' : 'grooming_ready_for_pickup'
        setWaTrigger(trigger)
        if (card.tutor?.phone) setWhatsappPending(true)
      }
    }
    setIsAdvancingStatus(false)
  }

  // ─── Push-to-talk legado removido — voz unificada no useGroomingVoiceAssistant ───

  // ─── Produtos ─────────────────────────────────────────────────────────────

  function addProduct() {
    const p = productsInput.trim()
    if (!p) return
    setProducts(prev => [...new Set([...prev, p])])
    setProductsInput('')
  }

  function removeProduct(p: string) {
    setProducts(prev => prev.filter(x => x !== p))
  }

  function toggleService(svc: string) {
    setSelectedServices(prev =>
      prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc]
    )
  }

  // ─── Submit manual ─────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedServices.length === 0 && !observations.trim()) return
    setIsSubmitting(true)

    const result = await addGroomingRecord({
      session_id:       card.id,
      services_applied: selectedServices,
      products_used:    products,
      behavior:         behavior || undefined,
      observations:     observations.trim() || undefined,
    })

    setIsSubmitting(false)

    if ('error' in result) { alert('Erro ao salvar: ' + result.error); return }

    // Merge itens aplicados na aba Cobrança antes de limpar o formulário
    const appliedServices = selectedServices
    const appliedProducts = products
    setServicePrices(prev => {
      const result = [...prev]
      for (const name of [...appliedServices, ...appliedProducts]) {
        if (result.some(p => p.name.toLowerCase() === name.toLowerCase())) continue
        const catItem = catalog.find(c => c.name.toLowerCase() === name.toLowerCase())
        result.push({ name, price: catItem?.price ?? 0 })
      }
      return result
    })

    // Reset form
    setSelectedServices([])
    setProducts([])
    setBehavior('')
    setObservations('')

    await loadRecords()

    setSaveToast('Registro salvo com sucesso!')
    setTimeout(() => setSaveToast(null), 3000)

    // Verifica produtos não cadastrados no catálogo e oferece cadastro
    if (products.length > 0 && catalog.length > 0) {
      const unregistered = products.filter(
        p => !catalog.some(c => c.name.toLowerCase() === p.toLowerCase())
      )
      if (unregistered.length > 0) {
        setPendingUnregisteredProducts(unregistered)
        setRegisterProductName(unregistered[0])
        setRegisterProductPrice('')
        setShowRegisterProductModal(true)
      }
    }

    // WhatsApp: dispara para toda evolução salva manualmente.
    if (card.tutor?.phone) {
      let trigger: WhatsAppTrigger = 'grooming_evolution_saved'
      if (currentCardStatus === 'delivered')      trigger = 'grooming_delivered'
      else if (currentCardStatus === 'waiting_pickup') trigger = 'grooming_ready_for_pickup'
      setWaTrigger(trigger)
      setWaAppliedServices(appliedServices)
      setWaObservations(observations.trim())
      setWhatsappPending(true)
    }
  }

  // ─── Upload de documentos ──────────────────────────────────────────────────

  async function handleFileUpload(file: File) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      alert('Tipo de arquivo não suportado. Use JPG, PNG, GIF, WebP ou PDF.')
      return
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`Arquivo muito grande. Limite: ${MAX_SIZE_MB} MB.`)
      return
    }

    setIsUploadingDoc(true)
    const supabase = createClient()

    const safeName   = file.name.replace(/\s+/g, '_')
    const path       = `${card.clinic_id}/${card.id}/${Date.now()}-${safeName}`
    const fileType   = file.type.startsWith('image/') ? 'image'
      : file.type === 'application/pdf' ? 'pdf' : 'other'

    const { error: uploadErr } = await supabase.storage
      .from('grooming-documents')
      .upload(path, file, { upsert: false })

    if (uploadErr) {
      alert('Erro no upload: ' + uploadErr.message)
      setIsUploadingDoc(false)
      return
    }

    const res = await saveGroomingDocument({
      session_id:   card.id,
      file_name:    file.name,
      file_type:    fileType,
      storage_path: path,
    })

    if ('error' in res) {
      alert('Erro ao registrar documento: ' + res.error)
    } else {
      await loadDocuments()
      setActiveTab('documents')
    }
    setIsUploadingDoc(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDraggingFile(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  async function handleDeleteDoc(doc: GroomingDocument) {
    if (!confirm(`Remover "${doc.file_name}"?`)) return
    await deleteGroomingDocument(doc.id, doc.storage_path)
    await loadDocuments()
  }

  async function getSignedUrl(path: string) {
    const supabase = createClient()
    const { data } = await supabase.storage
      .from('grooming-documents')
      .createSignedUrl(path, 3600)
    return data?.signedUrl ?? null
  }

  async function handleDownloadDoc(doc: GroomingDocument) {
    const url = await getSignedUrl(doc.storage_path)
    if (url) window.open(url, '_blank')
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  // (assistantLabel / assistantColor movidos para o botão "Gravar por Voz")

  return (
    <>
      {saveToast && (
        <div className="fixed top-5 right-5 z-[60] flex items-center gap-3 bg-teal-600 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {saveToast}
        </div>
      )}
      {errorToast && (
        <div className="fixed top-5 right-5 z-[60] flex items-center gap-3 bg-rose-600 text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-lg">
          <X className="h-4 w-4 flex-shrink-0" />
          {errorToast}
        </div>
      )}

      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-sm">
        <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">

          {/* Header */}
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 sm:h-12 sm:w-12 flex-shrink-0 rounded-xl sm:rounded-2xl bg-teal-600 flex items-center justify-center text-white shadow-lg shadow-teal-200">
                <Scissors className="h-4 w-4 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-xl font-bold text-slate-900 leading-tight truncate">
                  <span className="text-teal-600">{card.patient.name}</span>
                  <span className="text-slate-400 font-normal text-sm hidden sm:inline"> — Banho e Tosa</span>
                </h2>
                <p className="text-[10px] sm:text-xs text-slate-500 font-medium uppercase tracking-wider truncate">
                  {card.patient.species} • {card.patient.breed || 'SRD'} • {card.tutor.name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Configurações de Voz */}
              <button
                type="button"
                onClick={() => setVoiceConfigOpen(true)}
                title="Configurações de Voz"
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors"
              >
                <Settings className="h-4 w-4" />
              </button>

              <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Barra de Progressão de Status — Mobile First */}
          {currentCardStatus !== 'delivered' && (() => {
            const idx = STATUS_FLOW.indexOf(currentCardStatus)
            const nextStatus = idx >= 0 && idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null
            if (!nextStatus) return null
            return (
              <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/70 flex items-center gap-3 flex-wrap">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${STATUS_COLORS[currentCardStatus]}`}>
                  Etapa atual: {STATUS_LABELS[currentCardStatus]}
                </span>
                <ChevronRight className="h-3 w-3 text-slate-300 hidden sm:block" />
                <button
                  type="button"
                  onClick={() => handleStatusAdvance(nextStatus)}
                  disabled={isAdvancingStatus}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-[11px] font-bold transition-all disabled:opacity-50 shadow-sm ${STATUS_NEXT_BTN[currentCardStatus]}`}
                >
                  {isAdvancingStatus
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Avançando...</>
                    : <><ChevronRight className="h-3 w-3" /> Avançar para {STATUS_LABELS[nextStatus]}</>}
                </button>
              </div>
            )
          })()}

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">

            {/* ── Coluna Esquerda: Formulário ── */}
            <div className="space-y-5 order-2 lg:order-1">

              {/* Serviços solicitados */}
              {card.services_requested.length > 0 && (
                <div className="rounded-xl bg-teal-50 border border-teal-200 px-4 py-3">
                  <p className="text-[10px] font-bold text-teal-600 uppercase mb-1">Serviços Solicitados</p>
                  <p className="text-sm text-teal-800">{card.services_requested.join(', ')}</p>
                  {card.box_number && (
                    <p className="text-xs text-teal-600 mt-1">Box: {card.box_number}</p>
                  )}
                </div>
              )}

              {/* Banner de transcrição em tempo real — igual ao Consultório */}
              {assistant.state === 'RECORDING' && (
                <div className="rounded-xl bg-teal-50 border border-teal-200 px-4 py-3 min-h-[56px]">
                  <p className="text-[10px] font-bold text-teal-600 uppercase mb-1.5 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-500 animate-pulse" />
                    Assistente gravando…
                  </p>
                  <p className="text-sm text-teal-900 italic leading-snug">
                    {assistant.transcript || <span className="text-teal-400 not-italic">Ouvindo… fale normalmente.</span>}
                  </p>
                </div>
              )}

              {/* Processando IA após parar a gravação */}
              {isParsingIntent && (
                <div className="flex items-center gap-2 text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
                  <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                  Analisando intenção e movendo card…
                </div>
              )}

              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Scissors className="h-4 w-4 text-teal-600" /> Registrar Serviço
                  </h3>
                  <button
                    type="button"
                    data-mentor-step="grooming-voice-btn"
                    onClick={assistant.manualToggle}
                    title={
                      assistant.state === 'IDLE'
                        ? 'Clique ou pressione [Espaço] para iniciar gravação. Ou fale "Assistente".'
                        : assistant.state === 'RECORDING'
                        ? 'Clique ou pressione [Espaço] para salvar. Ou fale "finalizar".'
                        : 'Aguardando confirmação do WhatsApp…'
                    }
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      assistant.state === 'RECORDING'
                        ? 'bg-emerald-100 text-emerald-700 animate-pulse ring-2 ring-emerald-300'
                        : assistant.state === 'CONFIRM_WA'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {assistant.state === 'RECORDING'
                      ? <><Mic className="h-3 w-3" /> Gravando… fale &ldquo;finalizar&rdquo; ou [Espaço]</>
                      : assistant.state === 'CONFIRM_WA'
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Aguardando WA…</>
                      : <><MicOff className="h-3 w-3" /> Gravar por Voz — fale &ldquo;Assistente&rdquo;</>}
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">

                  {/* Comportamento */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-2 block">
                      Comportamento do Animal
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {BEHAVIOR_OPTIONS.map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setBehavior(behavior === opt.id ? '' : opt.id)}
                          className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all text-center ${
                            behavior === opt.id
                              ? `${opt.border} ${opt.bg} shadow-sm`
                              : 'border-transparent bg-slate-50 opacity-60 hover:opacity-100'
                          }`}
                        >
                          <span className="text-[10px] font-bold capitalize">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Serviços Realizados */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-2 block">
                      Serviços Realizados
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {SERVICES_LIST.map(svc => {
                        const sel = selectedServices.includes(svc)
                        return (
                          <button
                            key={svc}
                            type="button"
                            onClick={() => toggleService(svc)}
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
                              sel
                                ? 'bg-teal-600 border-teal-600 text-white'
                                : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300'
                            }`}
                          >
                            {svc}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Produtos */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-2 block">
                      Produtos Utilizados
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={productsInput}
                        onChange={e => setProductsInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addProduct() } }}
                        placeholder="Ex: Shampoo Neutro..."
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-teal-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={addProduct}
                        className="px-2.5 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {products.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {products.map(p => (
                          <span key={p} className="flex items-center gap-1 bg-slate-100 rounded-full px-2.5 py-0.5 text-xs text-slate-700">
                            {p}
                            <button type="button" onClick={() => removeProduct(p)} className="text-slate-400 hover:text-rose-500">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Observações */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-1 block">
                      Observações
                    </label>
                    <textarea
                      value={observations}
                      onChange={e => setObservations(e.target.value)}
                      placeholder="Ex: Animal ficou calmo durante a tosa, ouvido limpo..."
                      rows={3}
                      data-mentor-step="grooming-observations-textarea"
                      className="w-full rounded-xl border-slate-200 text-sm focus:ring-teal-500 focus:border-teal-500 resize-none"
                    />
                  </div>

                  {/* Upload rápido na coluna do form */}
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase ml-1 mb-1 block flex items-center gap-1">
                      <Paperclip className="h-3 w-3" /> Anexar Foto / Documento
                    </label>
                    <div
                      onDragOver={e => { e.preventDefault(); setIsDraggingFile(true) }}
                      onDragLeave={() => setIsDraggingFile(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-all py-3 ${
                        isDraggingFile
                          ? 'border-teal-400 bg-teal-50'
                          : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'
                      }`}
                    >
                      {isUploadingDoc
                        ? <><Loader2 className="h-4 w-4 animate-spin text-teal-600" /><span className="text-xs text-teal-600">Enviando…</span></>
                        : <><Upload className="h-4 w-4 text-slate-400" /><span className="text-xs text-slate-400">Arraste ou clique para enviar</span></>}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_TYPES.join(',')}
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = '' }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || (selectedServices.length === 0 && !observations.trim())}
                    data-mentor-step="grooming-save-record-btn"
                    className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-teal-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting
                      ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
                      : <><Save className="h-4 w-4" /> Salvar Registro</>}
                  </button>
                </form>
              </div>
            </div>

            {/* ── Coluna Direita: Timeline + Documentos ── */}
            <div className="bg-slate-50/50 rounded-2xl border border-slate-100 flex flex-col min-h-[420px] lg:min-h-0 lg:overflow-hidden order-1 lg:order-2">
              {/* Tabs */}
              <div className="border-b border-slate-200 bg-slate-100/80 flex">
                <button
                  onClick={() => setActiveTab('timeline')}
                  className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold transition-colors flex-1 justify-center ${
                    activeTab === 'timeline'
                      ? 'text-teal-700 border-b-2 border-teal-600 bg-white/60'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <History className="h-3.5 w-3.5" />
                  Linha do Tempo
                </button>
                <button
                  onClick={() => setActiveTab('documents')}
                  className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold transition-colors flex-1 justify-center ${
                    activeTab === 'documents'
                      ? 'text-teal-700 border-b-2 border-teal-600 bg-white/60'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  Fotos & Docs
                  {documents.length > 0 && (
                    <span className="ml-1 bg-teal-600 text-white rounded-full text-[9px] px-1.5 py-0.5 font-bold">
                      {documents.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('billing')}
                  className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold transition-colors flex-1 justify-center ${
                    activeTab === 'billing'
                      ? 'text-teal-700 border-b-2 border-teal-600 bg-white/60'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <DollarSign className="h-3.5 w-3.5" />
                  Cobrança
                  {paymentStatus === 'paid' && (
                    <span className="ml-1 bg-emerald-500 text-white rounded-full text-[9px] px-1.5 py-0.5 font-bold">✓</span>
                  )}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5">

                {/* ── Tab: Linha do Tempo ── */}
                {activeTab === 'timeline' && (
                  loadingRecords ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    </div>
                  ) : records.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-xs">
                      Nenhum registro ainda. Grave ou preencha o formulário ao lado.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {records.map(record => {
                        const bOpt    = BEHAVIOR_OPTIONS.find(b => b.id === record.behavior)
                        const isEditing = editingRecordId === record.id

                        function startEdit() {
                          setEditingRecordId(record.id)
                          setEditObs(record.observations ?? '')
                          setEditServices(record.services_applied ?? [])
                          setEditProducts(record.products_used ?? [])
                          setEditBehavior(record.behavior ?? '')
                          setProductsInput('')
                        }

                        async function saveEdit() {
                          setIsSavingEdit(true)
                          const res = await updateGroomingRecord(record.id, {
                            services_applied: editServices,
                            products_used:    editProducts,
                            behavior:         editBehavior || undefined,
                            observations:     editObs.trim() || undefined,
                          })
                          setIsSavingEdit(false)
                          if ('error' in res) {
                            setErrorToast('Erro ao editar: ' + res.error)
                            setTimeout(() => setErrorToast(null), 4000)
                            return
                          }
                          setEditingRecordId(null)
                          await loadRecords()
                        }

                        return (
                          <div key={record.id} className="relative pl-8 border-l-2 border-slate-200 pb-2">
                            <div className="absolute -left-[11px] top-1 h-5 w-5 rounded-full border-4 border-slate-50 bg-teal-500 flex items-center justify-center shadow-sm" />
                            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                              <div className="flex items-start justify-between mb-3 pb-3 border-b border-slate-100">
                                <div className="flex items-center gap-2">
                                  <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center">
                                    <User className="h-3 w-3 text-slate-500" />
                                  </div>
                                  <div>
                                    <span className="text-xs font-bold text-slate-800 block">{record.user_name}</span>
                                    {bOpt && !isEditing && (
                                      <span className={`text-[10px] font-bold capitalize ${bOpt.color}`}>{bOpt.label}</span>
                                    )}
                                    {record.voice_transcription && (
                                      <span className="text-[10px] text-violet-500 font-semibold block">via assistente de voz</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="text-right">
                                    <div className="flex items-center gap-1 text-slate-700 font-bold text-xs justify-end">
                                      <Clock className="h-3 w-3 text-teal-500" />
                                      {new Date(record.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    <span className="text-[10px] text-slate-400">
                                      {new Date(record.created_at).toLocaleDateString('pt-BR')}
                                    </span>
                                  </div>
                                  {!isEditing && (
                                    <button
                                      type="button"
                                      onClick={startEdit}
                                      title="Editar registro"
                                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-teal-600 transition-colors flex-shrink-0"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {isEditing ? (
                                <div className="space-y-3">
                                  {/* Comportamento */}
                                  <div className="grid grid-cols-4 gap-1.5">
                                    {BEHAVIOR_OPTIONS.map(opt => (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setEditBehavior(editBehavior === opt.id ? '' : opt.id)}
                                        className={`py-1 rounded-lg border-2 text-[10px] font-bold transition-all ${
                                          editBehavior === opt.id
                                            ? `${opt.border} ${opt.bg} shadow-sm`
                                            : 'border-transparent bg-slate-50 opacity-60'
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                  {/* Serviços */}
                                  <div className="flex flex-wrap gap-1">
                                    {SERVICES_LIST.map(svc => {
                                      const sel = editServices.includes(svc)
                                      return (
                                        <button key={svc} type="button"
                                          onClick={() => setEditServices(prev => sel ? prev.filter(s => s !== svc) : [...prev, svc])}
                                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${sel ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
                                        >{svc}</button>
                                      )
                                    })}
                                  </div>
                                  {/* Observações */}
                                  <textarea
                                    value={editObs}
                                    onChange={e => setEditObs(e.target.value)}
                                    rows={3}
                                    className="w-full rounded-xl border-slate-200 text-sm focus:ring-teal-500 focus:border-teal-500 resize-none"
                                    placeholder="Observações..."
                                  />
                                  <div className="flex gap-2">
                                    <button type="button" onClick={() => setEditingRecordId(null)}
                                      className="flex-1 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                    >Cancelar</button>
                                    <button type="button" onClick={saveEdit} disabled={isSavingEdit}
                                      className="flex-1 py-2 rounded-xl bg-teal-600 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-1"
                                    >
                                      {isSavingEdit ? <><Loader2 className="h-3 w-3 animate-spin" />Salvando…</> : <><Save className="h-3 w-3" />Salvar Edição</>}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {record.services_applied?.length > 0 && (
                                    <div className="mb-2">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase">Serviços:</span>
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {record.services_applied.map((s, i) => (
                                          <span key={i} className="bg-teal-50 border border-teal-200 text-teal-700 rounded-full px-2 py-0.5 text-[10px] font-semibold">
                                            {s}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {record.products_used?.length > 0 && (
                                    <div className="mb-2">
                                      <span className="text-[10px] font-bold text-slate-400 uppercase">Produtos:</span>
                                      <p className="text-xs text-slate-600 mt-0.5">{record.products_used.join(', ')}</p>
                                    </div>
                                  )}
                                  {record.observations && (
                                    <p className="text-sm text-slate-600 leading-relaxed mt-1 whitespace-pre-wrap">
                                      {record.observations}
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                )}

                {/* ── Tab: Cobrança ── */}
                {activeTab === 'billing' && (() => {
                  const subtotal    = servicePrices.reduce((s, p) => s + p.price, 0)
                  const total       = subtotal * (1 - discountPct / 100)
                  const hasAnyPrice = servicePrices.some(p => p.price > 0)

                  const saveBilling = async () => {
                    setIsSavingBilling(true)
                    const res = await updateGroomingPricing(card.id, servicePrices, discountPct)
                    setIsSavingBilling(false)
                    if ('error' in res) { setBillingToast('Erro ao salvar: ' + res.error); return }
                    setBillingToast('Preços salvos!')
                    setTimeout(() => setBillingToast(null), 2000)
                  }

                  return (
                    <div className="space-y-5">
                      {billingToast && (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-2 text-xs font-semibold text-center">
                          {billingToast}
                        </div>
                      )}

                      {/* Status de pagamento — somente leitura; checkout via Caixa Central */}
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Status do Pagamento</p>
                        <div className={`flex items-center justify-between rounded-xl border-2 px-4 py-2.5 ${
                          paymentStatus === 'paid'
                            ? 'border-emerald-300 bg-emerald-50'
                            : paymentStatus === 'waived'
                              ? 'border-slate-200 bg-slate-50'
                              : 'border-amber-200 bg-amber-50'
                        }`}>
                          <div className="flex items-center gap-2">
                            {paymentStatus === 'paid'
                              ? <BadgeCheck className="h-4 w-4 text-emerald-600" />
                              : paymentStatus === 'waived'
                                ? <Ban className="h-4 w-4 text-slate-500" />
                                : <DollarSign className="h-4 w-4 text-amber-600" />}
                            <span className={`text-xs font-bold ${
                              paymentStatus === 'paid' ? 'text-emerald-700' : paymentStatus === 'waived' ? 'text-slate-500' : 'text-amber-700'
                            }`}>
                              {paymentStatus === 'paid' ? 'Pago' : paymentStatus === 'waived' ? 'Isento' : 'Pendente'}
                            </span>
                          </div>
                          {paymentStatus !== 'paid' && (
                            <a
                              href="/dashboard/cashier"
                              id={`btn-goto-cashier-${card.id}`}
                              data-testid={`btn-goto-cashier-${card.id}`}
                              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                              title="Finalizar pagamento no Caixa Central"
                            >
                              <ExternalLink className="h-3 w-3" />
                              Ir para Caixa Central
                            </a>
                          )}
                        </div>
                        {paymentStatus !== 'paid' && (
                          <p className="text-[10px] text-slate-400 mt-1.5">
                            💡 O checkout é processado no <strong>Caixa Central</strong> para garantir o registro consolidado.
                          </p>
                        )}
                      </div>

                      {/* Itens e preços */}
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                          <Tag className="h-3 w-3" /> Serviços e Preços
                        </p>
                        <div className="space-y-2">
                          {servicePrices.length === 0 ? (
                            <p className="text-xs text-slate-400 italic py-1">
                              Os itens serão adicionados automaticamente ao salvar o registro.
                            </p>
                          ) : (
                            servicePrices.map((sp, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={sp.name}
                                  onChange={e => setServicePrices(prev => prev.map((p, j) => j === i ? { ...p, name: e.target.value } : p))}
                                  className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 focus:border-teal-500 focus:outline-none min-w-0"
                                />
                                <input
                                  type="number" min="0" step="0.01"
                                  value={sp.price || ''}
                                  placeholder="0.00"
                                  className="w-20 text-xs border border-slate-200 rounded-lg px-2 py-1 text-right focus:border-teal-500 focus:outline-none flex-shrink-0"
                                  onChange={e => {
                                    const price = parseFloat(e.target.value) || 0
                                    setServicePrices(prev => prev.map((p, j) => j === i ? { ...p, price } : p))
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setServicePrices(prev => prev.filter((_, j) => j !== i))}
                                  className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors flex-shrink-0"
                                  title="Remover item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Adicionar novo item */}
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
                          <Plus className="h-3 w-3" /> Adicionar Serviço / Produto
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newBillingItemName}
                            onChange={e => setNewBillingItemName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const name = newBillingItemName.trim()
                                const price = parseFloat(newBillingItemPrice.replace(',', '.')) || 0
                                if (!name) return
                                setServicePrices(prev => [...prev, { name, price }])
                                setNewBillingItemName('')
                                setNewBillingItemPrice('')
                              }
                            }}
                            placeholder="Nome do serviço ou produto"
                            className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:border-teal-500 focus:outline-none"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={newBillingItemPrice}
                            onChange={e => setNewBillingItemPrice(e.target.value)}
                            placeholder="R$"
                            className="w-20 text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-right focus:border-teal-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const name = newBillingItemName.trim()
                              const price = parseFloat(newBillingItemPrice.replace(',', '.')) || 0
                              if (!name) return
                              setServicePrices(prev => [...prev, { name, price }])
                              setNewBillingItemName('')
                              setNewBillingItemPrice('')
                            }}
                            disabled={!newBillingItemName.trim()}
                            className="px-2.5 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 transition-colors disabled:opacity-40"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Desconto */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
                          Desconto (%)
                        </label>
                        <input
                          type="number" min="0" max="100" step="1"
                          value={discountPct || ''}
                          placeholder="0"
                          className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:border-teal-500 focus:outline-none"
                          onChange={e => setDiscountPct(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                        />
                      </div>

                      {/* Resumo */}
                      {hasAnyPrice && (
                        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-1">
                          <div className="flex justify-between text-xs text-slate-600">
                            <span>Subtotal</span>
                            <span>R$ {subtotal.toFixed(2)}</span>
                          </div>
                          {discountPct > 0 && (
                            <div className="flex justify-between text-xs text-emerald-600">
                              <span>Desconto ({discountPct}%)</span>
                              <span>- R$ {(subtotal * discountPct / 100).toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm font-bold border-t border-teal-300 pt-1">
                            <span className="text-teal-800">Total</span>
                            <span className="text-teal-700">R$ {total.toFixed(2)}</span>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={saveBilling}
                        disabled={isSavingBilling}
                        className="w-full py-2.5 rounded-xl bg-teal-600 text-sm font-bold text-white hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isSavingBilling
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
                          : <><Save className="h-4 w-4" /> Salvar Preços</>}
                      </button>

                      {catalog.length === 0 && (
                        <p className="text-[10px] text-slate-400 text-center">
                          💡 Configure preços automáticos em Gestão → Catálogo (tipo: Grooming)
                        </p>
                      )}
                    </div>
                  )
                })()}

                {/* ── Tab: Fotos & Documentos ── */}
                {activeTab === 'documents' && (
                  <div className="space-y-4">
                    {/* Drop zone */}
                    <div
                      onDragOver={e => { e.preventDefault(); setIsDraggingFile(true) }}
                      onDragLeave={() => setIsDraggingFile(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-all py-8 ${
                        isDraggingFile
                          ? 'border-teal-400 bg-teal-50'
                          : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'
                      }`}
                    >
                      {isUploadingDoc ? (
                        <><Loader2 className="h-6 w-6 animate-spin text-teal-600" /><span className="text-xs text-teal-600">Enviando…</span></>
                      ) : (
                        <><Upload className="h-6 w-6 text-slate-300" /><span className="text-xs text-slate-400 font-medium">Arraste fotos ou PDFs aqui</span><span className="text-[10px] text-slate-300">JPG · PNG · PDF · até {MAX_SIZE_MB} MB</span></>
                      )}
                    </div>

                    {/* Lista de documentos */}
                    {documents.length === 0 ? (
                      <p className="text-center text-xs text-slate-400 py-4">
                        Nenhum anexo ainda.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {documents.map(doc => (
                          <div key={doc.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                            <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                              {doc.file_type === 'image'
                                ? <ImageIcon className="h-4 w-4 text-teal-600" />
                                : <FileText className="h-4 w-4 text-rose-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">{doc.file_name}</p>
                              <p className="text-[10px] text-slate-400">
                                {doc.user_name} · {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDownloadDoc(doc)}
                                title="Visualizar"
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
                              >
                                <ImageIcon className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteDoc(doc)}
                                title="Remover"
                                className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* WhatsApp Modal — exibido como overlay ao entrar em CONFIRM_WA ou ao salvar manualmente */}
      {whatsappPending && card.tutor?.phone && (
        <WhatsAppNotificationModal
          isOpen={whatsappPending}
          onClose={() => { setWhatsappPending(false); setVoiceConfirmedWA(false); setWaAppliedServices([]); setWaObservations('') }}
          trigger={waTrigger}
          autoSend={voiceConfirmedWA}
          context={{
            petName:          card.patient.name,
            tutorName:        card.tutor.name,
            tutorPhone:       card.tutor.phone,
            species:          card.patient.species,
            breed:            card.patient.breed ?? undefined,
            groomingServices: waAppliedServices.length > 0 ? waAppliedServices : card.services_requested,
            groomingBox:      card.box_number ?? undefined,
            evolutionNotes:   waObservations || undefined,
          }}
          patientId={card.patient.id}
        />
      )}

      {/* Modal de Cadastro de Produto Não Registrado */}
      {showRegisterProductModal && pendingUnregisteredProducts.length > 0 && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Tag className="h-4 w-4 text-teal-600" /> Produto Não Cadastrado
              </h3>
              <button
                onClick={() => { setShowRegisterProductModal(false); setPendingUnregisteredProducts([]) }}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm text-slate-600">
              O produto <strong className="text-slate-900">&ldquo;{registerProductName}&rdquo;</strong> não está no catálogo.
              Deseja cadastrá-lo agora?
            </p>

            {pendingUnregisteredProducts.length > 1 && (
              <p className="text-xs text-slate-400">
                {pendingUnregisteredProducts.length} produtos não cadastrados. Você pode cadastrar um por vez.
              </p>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Nome</label>
                <input
                  type="text"
                  value={registerProductName}
                  onChange={e => setRegisterProductName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Preço (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={registerProductPrice}
                  onChange={e => setRegisterProductPrice(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  const remaining = pendingUnregisteredProducts.slice(1)
                  if (remaining.length > 0) {
                    setPendingUnregisteredProducts(remaining)
                    setRegisterProductName(remaining[0])
                    setRegisterProductPrice('')
                  } else {
                    setShowRegisterProductModal(false)
                    setPendingUnregisteredProducts([])
                  }
                }}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Pular
              </button>
              <button
                onClick={async () => {
                  if (!registerProductName.trim()) return
                  setRegisterProductSaving(true)
                  const price = parseFloat(registerProductPrice.replace(',', '.')) || 0
                  const res = await addStockItemV2({
                    name:       registerProductName.trim(),
                    quantity:   0,
                    unit:       'un',
                    min_quantity: 0,
                    is_service: true,
                    category:   'service',
                    unit_price: price,
                  })
                  setRegisterProductSaving(false)
                  if ('error' in res) {
                    setErrorToast('Erro ao cadastrar: ' + res.error)
                    setTimeout(() => setErrorToast(null), 4000)
                  } else {
                    setCatalog(prev => [...prev, { id: res.id, name: res.name, price: res.unit_price ?? 0 }])
                    setSaveToast(`"${res.name}" cadastrado no catálogo!`)
                    setTimeout(() => setSaveToast(null), 3000)
                  }
                  const remaining = pendingUnregisteredProducts.slice(1)
                  if (remaining.length > 0) {
                    setPendingUnregisteredProducts(remaining)
                    setRegisterProductName(remaining[0])
                    setRegisterProductPrice('')
                  } else {
                    setShowRegisterProductModal(false)
                    setPendingUnregisteredProducts([])
                  }
                }}
                disabled={registerProductSaving || !registerProductName.trim()}
                className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {registerProductSaving
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
                  : <><Plus className="h-4 w-4" /> Cadastrar</>}
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

            {/* Gatilhos de ativação */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Frases para Iniciar Gravação</p>
              <p className="text-[10px] text-slate-400 mb-2">Se a lista estiver vazia, o sistema usa os padrões integrados. Itens removidos são desativados permanentemente.</p>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newStartInput}
                  onChange={e => setNewStartInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newStartInput.trim()) {
                      e.preventDefault()
                      setStartTriggers(prev => [...new Set([...prev, newStartInput.trim().toLowerCase()])])
                      setNewStartInput('')
                    }
                  }}
                  placeholder='Ex: "iniciar banho"'
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-teal-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newStartInput.trim()) return
                    setStartTriggers(prev => [...new Set([...prev, newStartInput.trim().toLowerCase()])])
                    setNewStartInput('')
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {startTriggers.map(t => (
                  <span key={t} className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-0.5 text-xs text-emerald-700">
                    {t}
                    <button type="button" onClick={() => setStartTriggers(prev => prev.filter(x => x !== t))} className="text-emerald-400 hover:text-rose-500">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Gatilhos de parada */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Frases para Salvar e Finalizar</p>
              <p className="text-[10px] text-slate-400 mb-2">Se a lista estiver vazia, o sistema usa os padrões integrados. Itens removidos são desativados permanentemente.</p>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newStopInput}
                  onChange={e => setNewStopInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newStopInput.trim()) {
                      e.preventDefault()
                      setStopTriggers(prev => [...new Set([...prev, newStopInput.trim().toLowerCase()])])
                      setNewStopInput('')
                    }
                  }}
                  placeholder='Ex: "gravar dados"'
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-teal-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newStopInput.trim()) return
                    setStopTriggers(prev => [...new Set([...prev, newStopInput.trim().toLowerCase()])])
                    setNewStopInput('')
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {stopTriggers.map(t => (
                  <span key={t} className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 text-xs text-amber-700">
                    {t}
                    <button type="button" onClick={() => setStopTriggers(prev => prev.filter(x => x !== t))} className="text-amber-400 hover:text-rose-500">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={saveVoiceConfig}
              disabled={configSaving}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {configSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando…</> : <><Save className="h-4 w-4" /> Salvar Configurações</>}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
