'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, MessageCircle, Send, Loader2, CheckCircle2, AlertCircle, Edit3, Paperclip, RefreshCw, Mic } from 'lucide-react'
import {
  generateWhatsAppMessage,
  sendWhatsAppMessage,
  getAttachableItems,
  type WhatsAppTrigger,
  type WhatsAppContext,
  type AttachableItem,
} from '@/lib/actions/whatsapp'
import { useWhatsAppGate } from '@/components/providers/WhatsAppGateProvider'

const ATTACHMENT_PHRASE = 'Estou enviando em anexo os documentos que conversamos. Qualquer dúvida é só chamar!'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  isOpen:             boolean
  onClose:            () => void
  trigger:            WhatsAppTrigger
  context:            WhatsAppContext
  consultationId?:    string
  hospitalizationId?: string
  patientId?:         string
  /** Quando true e a mensagem já estiver gerada, dispara o envio automaticamente (confirmação por voz) */
  autoSend?:          boolean
}

// ─── Títulos por trigger ──────────────────────────────────────────────────────

const TRIGGER_TITLES: Record<WhatsAppTrigger, string> = {
  triage_called:                   'Avisar Tutor — Chamada para Triagem',
  triage_completed:                'Avisar Tutor — Triagem Concluída',
  documents_sent:                  'Enviar Documentos ao Tutor',
  exam_completed:                  'Avisar Tutor — Exame Realizado',
  hospitalization_update:          'Atualizar Tutor — Evolução Clínica',
  hospitalization_discharge:       'Avisar Tutor — Alta da Internação',
  hospitalization_evolution_saved: 'Boletim de Plantão — Nova Evolução Registrada',
  hospitalization_status_changed:  'Avisar Tutor — Transferência de Ala',
  sent_to_review:                  'Avisar Tutor — Revisão Clínica Pós-Internação',
  consultation_finished:           'Mensagem de Alta — Consulta Concluída',
  hospitalization_started:         'Avisar Tutor — Pet Admitido na Internação',
  grooming_ready_for_pickup:       'Avisar Tutor — Pet Pronto para Retirada',
  grooming_delivered:              'Mensagem de Agradecimento — Entrega Realizada',
  appointment_scheduled:           'Confirmação de Agendamento',
  sale_receipt:                    'Enviar Recibo de Venda ao Tutor',
}

const TRIGGER_SUBTITLES: Record<WhatsAppTrigger, string> = {
  triage_called:                   'Notificar que chegou a vez do pet',
  triage_completed:                'Compartilhar sinais vitais e aguardar veterinário',
  documents_sent:                  'Enviar documentos gerados na consulta',
  exam_completed:                  'Informar que o resultado foi encaminhado ao MV',
  hospitalization_update:          'Atualizar sobre o estado do pet internado',
  hospitalization_discharge:       'Informar que o pet recebeu alta e pode ir pra casa',
  hospitalization_evolution_saved: 'Boletim rápido e carinhoso com atualização do plantão',
  hospitalization_status_changed:  'Informar transferência entre alas (UTI, Enfermaria, Observação)',
  sent_to_review:                  'Informar que o pet voltou para consulta de revisão com o MV',
  consultation_finished:           'Resumo carinhoso com diagnóstico, exames e recomendações',
  hospitalization_started:         'Informar motivo, ala e que a equipe está cuidando com atenção',
  grooming_ready_for_pickup:       'Avisar que o serviço foi concluído e o pet está esperando',
  grooming_delivered:              'Agradecer a visita e convidar para a próxima sessão',
  appointment_scheduled:           'Confirmar data, horário e orientar sobre pontualidade',
  sale_receipt:                    'Comprovante de venda com itens e forma de pagamento',
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WhatsAppNotificationModal({
  isOpen,
  onClose,
  trigger,
  context,
  consultationId,
  hospitalizationId,
  patientId,
  autoSend,
}: Props) {
  const [message,       setMessage]       = useState('')
  const [isGenerating,  setIsGenerating]  = useState(false)
  const [isSending,     setIsSending]     = useState(false)
  const [sent,          setSent]          = useState(false)
  const [genError,          setGenError]          = useState<string | null>(null)
  const [sendError,         setSendError]         = useState<string | null>(null)
  const [failedAttachments, setFailedAttachments] = useState<string[]>([])

  // Anexos
  const [attachableItems,      setAttachableItems]      = useState<AttachableItem[]>([])
  const [selectedIds,          setSelectedIds]          = useState<Set<string>>(new Set())
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false)
  const phraseAddedRef = useRef(false)

  // Gerar mensagem ao abrir
  useEffect(() => {
    if (!isOpen) return
    setMessage(''); setSent(false); setGenError(null); setSendError(null); setFailedAttachments([])
    setAttachableItems([]); setSelectedIds(new Set()); phraseAddedRef.current = false
    setIsGenerating(true)

    generateWhatsAppMessage(trigger, context)
      .then((res) => {
        setIsGenerating(false)
        if ('error' in res) { setGenError(res.error); return }
        setMessage(res.message)
      })
      .catch((err) => {
        console.error('[WhatsApp] generateWhatsAppMessage falhou:', err)
        setIsGenerating(false)
        setGenError('Falha ao gerar texto automático. Digite a mensagem manualmente.')
      })
  }, [isOpen, trigger]) // eslint-disable-line react-hooks/exhaustive-deps

  // Buscar arquivos disponíveis para anexo
  const fetchAttachments = async () => {
    if (!consultationId && !patientId) return
    setIsLoadingAttachments(true)
    try {
      const res = await getAttachableItems({ consultationId, patientId })
      setIsLoadingAttachments(false)
      if (!('error' in res)) setAttachableItems(res)
    } catch (err) {
      console.error('[WhatsApp] getAttachableItems falhou:', err)
      setIsLoadingAttachments(false)
      // Modal continua funcional — lista de anexos fica vazia
    }
  }

  useEffect(() => {
    if (!isOpen) return
    fetchAttachments()
  }, [isOpen, consultationId, patientId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Adicionar/remover frase de anexo conforme seleção
  useEffect(() => {
    const hasSelected = selectedIds.size > 0
    if (hasSelected && !phraseAddedRef.current) {
      setMessage(prev => prev ? `${prev}\n\n${ATTACHMENT_PHRASE}` : ATTACHMENT_PHRASE)
      phraseAddedRef.current = true
    } else if (!hasSelected && phraseAddedRef.current) {
      setMessage(prev => prev.replace(`\n\n${ATTACHMENT_PHRASE}`, '').replace(ATTACHMENT_PHRASE, ''))
      phraseAddedRef.current = false
    }
  }, [selectedIds])

  // Auto-envio por voz: dispara handleSend quando autoSend=true e mensagem já estiver pronta
  const handleSendRef = useRef<() => Promise<void>>(async () => {})
  useEffect(() => {
    if (!autoSend || !message || isGenerating || isSending || sent) return
    handleSendRef.current()
  }, [autoSend, message, isGenerating, isSending, sent])

  // B-02 — Reconhecimento de voz para "sim"/"não" no modal
  const voiceRecogRef   = useRef<any>(null)
  const voiceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [listeningVoice, setListeningVoice] = useState(false)

  const startVoice = useCallback(() => {
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    if (!SR) return
    try { voiceRecogRef.current?.stop() } catch {}
    if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current)
    const rec = new SR()
    rec.lang = 'pt-BR'
    rec.continuous = false
    rec.interimResults = false
    rec.onstart  = () => setListeningVoice(true)
    rec.onend    = () => setListeningVoice(false)
    rec.onerror  = () => setListeningVoice(false)
    rec.onresult = (e: any) => {
      const transcript = e.results[0]?.[0]?.transcript?.toLowerCase().trim() ?? ''
      const yes = /^(sim|pode|manda|envia|confirma|ok|pode mandar|pode enviar|claro|vamos|manda sim)/.test(transcript)
      const no  = /^(não|nao|agora não|agora nao|não quero|cancel|não precisa|deixa)/.test(transcript)
      if (yes) handleSendRef.current()
      else if (no) onClose()
    }
    voiceRecogRef.current = rec
    rec.start()
    voiceTimeoutRef.current = setTimeout(() => { try { rec.stop() } catch {} }, 12000)
  }, [onClose])

  useEffect(() => {
    if (!isOpen || sent || isGenerating || autoSend) return
    startVoice()
    return () => {
      if (voiceTimeoutRef.current) clearTimeout(voiceTimeoutRef.current)
      try { voiceRecogRef.current?.stop() } catch {}
    }
  }, [isOpen, sent, isGenerating]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleItem(id: string) {
    // Itens legados não têm signedUrl e nunca devem ser selecionados
    const item = attachableItems.find(a => a.id === id)
    if (item?.isLegacy) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const whatsAppEnabled = useWhatsAppGate()
  if (!isOpen || !whatsAppEnabled) return null

  async function handleSend() {
    if (!message.trim() || !context.tutorPhone) return
    setIsSending(true); setSendError(null)

    // Todos os itens são arquivos físicos com signed URL (patient_attachments)
    const attachmentsToSend = attachableItems
      .filter(a => selectedIds.has(a.id) && a.signedUrl)
      .map(a => ({ name: a.name, signedUrl: a.signedUrl, mimeType: a.mimeType }))

    const res = await sendWhatsAppMessage({
      phone:            context.tutorPhone,
      message,
      trigger,
      tutorName:        context.tutorName,
      consultationId,
      hospitalizationId,
      attachments:      attachmentsToSend.length ? attachmentsToSend : undefined,
    })

    setIsSending(false)
    if ('error' in res) { setSendError(res.error); return }

    const allFailed = 'failedAttachments' in res ? (res.failedAttachments ?? []) : []
    if (allFailed.length > 0) setFailedAttachments(allFailed)

    setSent(true)
    if (allFailed.length === 0) setTimeout(onClose, 1800)
  }
  // Mantém o ref atualizado para o useEffect de autoSend poder invocar a versão mais recente
  handleSendRef.current = handleSend

  const phoneDisplay = context.tutorPhone
    ? context.tutorPhone.replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, '+$1 ($2) $3-$4')
    : '—'

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col ring-4 ring-green-400 ring-offset-2">

        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 leading-tight">
              {TRIGGER_TITLES[trigger]}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{TRIGGER_SUBTITLES[trigger]}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Destinatário */}
        <div className="px-5 pt-4 flex items-center gap-2">
          <span className="text-xs text-slate-500">Para:</span>
          <span className="text-xs font-medium text-slate-700">
            {context.tutorName} — {phoneDisplay}
          </span>
        </div>

        {/* Área da mensagem */}
        <div className="p-5 flex-1">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-green-500" />
              <span className="text-sm">Gerando mensagem personalizada...</span>
            </div>
          ) : sent ? (
            <div className="flex flex-col items-center justify-center gap-3 py-6">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
              <span className="text-sm font-medium text-green-700">Mensagem enviada com sucesso!</span>
              {failedAttachments.length > 0 && (
                <div className="w-full mt-1 rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-800 mb-1">
                        {failedAttachments.length === 1 ? '1 anexo não foi entregue:' : `${failedAttachments.length} anexos não foram entregues:`}
                      </p>
                      <ul className="space-y-0.5">
                        {failedAttachments.map(name => (
                          <li key={name} className="text-xs text-amber-700 truncate">• {name}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
              {failedAttachments.length > 0 && (
                <button
                  onClick={onClose}
                  className="mt-1 text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Fechar
                </button>
              )}
            </div>
          ) : (
            <>
              {genError && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 mb-3">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">{genError} Digite a mensagem abaixo.</p>
                </div>
              )}
              <div className="flex items-center gap-1.5 mb-2">
                <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs text-slate-500">Revise e edite antes de enviar</span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                className="w-full text-sm text-slate-800 border border-slate-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent bg-slate-50 leading-relaxed"
                placeholder="Mensagem para o tutor..."
              />

              {/* ─── Seção de Documentos e Anexos ───────────────────── */}
              <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                  <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs font-medium text-slate-700">Documentos e Anexos Disponíveis</span>
                  <span className="ml-auto text-xs text-slate-400">
                    {isLoadingAttachments
                      ? 'Buscando...'
                      : selectedIds.size > 0
                      ? `${selectedIds.size} selecionado(s)`
                      : 'nenhum'}
                  </span>
                  <button
                    type="button"
                    onClick={fetchAttachments}
                    disabled={isLoadingAttachments}
                    title="Atualizar lista"
                    className="ml-1 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3 h-3 ${isLoadingAttachments ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                {isLoadingAttachments && attachableItems.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-slate-400 text-center">Buscando arquivos...</div>
                ) : attachableItems.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-slate-400 text-center">
                    Nenhum arquivo disponível.{' '}
                    <button onClick={fetchAttachments} className="text-green-600 hover:underline">
                      Atualizar
                    </button>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 max-h-36 overflow-y-auto">
                    {attachableItems.map((item) => (
                      <li key={item.id}>
                        {item.isLegacy ? (
                          /* ── Documento legado: sem PDF físico — checkbox desabilitado ── */
                          <div
                            className="flex items-center gap-2.5 px-3 py-2 opacity-60 cursor-not-allowed"
                            title="Este documento é antigo. Feche o modal, clique em Editar no prontuário e Salve novamente para gerar o arquivo físico."
                          >
                            <input
                              type="checkbox"
                              disabled
                              className="w-3.5 h-3.5 flex-shrink-0 cursor-not-allowed"
                            />
                            <span className="text-xs text-slate-500 truncate flex-1">{item.name}</span>
                            <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
                              Requer Geração de PDF
                            </span>
                          </div>
                        ) : (
                          /* ── Arquivo físico: pode ser selecionado e enviado ── */
                          <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(item.id)}
                              onChange={() => toggleItem(item.id)}
                              className="w-3.5 h-3.5 accent-green-600 flex-shrink-0"
                            />
                            <span className="text-xs text-slate-700 truncate flex-1">{item.name}</span>
                            {item.signedUrl ? (
                              <span className="text-[10px] text-green-600 font-medium flex-shrink-0">Envio direto</span>
                            ) : (
                              <span className="text-[10px] text-slate-400 flex-shrink-0">URL indisponível</span>
                            )}
                          </label>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {sendError && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-100 mt-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{sendError}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!sent && !isGenerating && (
          <div className="px-5 pb-5 space-y-2">
            <div className="flex justify-center">
              <button
                type="button"
                onClick={startVoice}
                title={listeningVoice ? 'Ouvindo...' : 'Responder por voz'}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-all ${
                  listeningVoice
                    ? 'border-green-400 bg-green-50 text-green-600 animate-pulse'
                    : 'border-slate-200 bg-slate-50 text-slate-400 hover:text-slate-600 hover:border-slate-300'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                {listeningVoice ? 'Diga "Sim" para enviar ou "Não" para cancelar' : 'Responder por voz'}
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Agora não
              </button>
              <button
                onClick={handleSend}
                disabled={isSending || !message.trim()}
                className="flex-1 py-2.5 rounded-xl bg-green-600 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {isSending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                ) : (
                  <><Send className="w-4 h-4" /> Enviar WhatsApp</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
