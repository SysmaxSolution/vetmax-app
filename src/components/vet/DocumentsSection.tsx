'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  FileText, Plus, Loader2, Sparkles, Printer, CheckCircle2,
  X, FileCheck, AlertCircle, Wand2, Save, Search, ShieldAlert,
} from 'lucide-react'
import { DatePicker } from '@/components/ui/DatePicker'
import {
  generateDocumentDraft, savePatientDocument, updatePatientDocument,
  type PatientDocument,
} from '@/lib/actions/documents'
import { uploadDocumentPdf } from '@/lib/actions/attachments'
import type { Attachment } from '@/lib/actions/attachments'
import { generateDocumentPdfBlob, blobToBase64 } from '@/lib/pdf-generator'
import { SYSTEM_TEMPLATES, isSystemTemplate } from '@/lib/system-templates'
import type { VetConsultationDetail } from '@/lib/actions/vet'
import type { DocumentTemplate, ExtractedField } from '@/types'
// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  laudo: 'Laudo', receita: 'Receita', encaminhamento: 'Encaminhamento',
  termo: 'Termo', exame: 'Exame', outro: 'Outro',
}

const TYPE_BADGE: Record<string, string> = {
  laudo:          'bg-blue-100 text-blue-700',
  receita:        'bg-green-100 text-green-700',
  encaminhamento: 'bg-purple-100 text-purple-700',
  termo:          'bg-amber-100 text-amber-700',
  exame:          'bg-indigo-100 text-indigo-700',
  outro:          'bg-slate-100 text-slate-600',
}

const SUGGESTION_TYPE_MAP: Record<string, string> = {
  receita:        'receita',
  encaminhamento: 'encaminhamento',
  exame:          'exame',
  laudo:          'laudo',
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type PrintState = {
  name: string
  type: string
  fields: Record<string, any>
  extracted_fields: ExtractedField[]
  hasControlledMeds?: boolean
  template_html?: string | null
}

interface Props {
  consultation: VetConsultationDetail
  clinicName?: string
  templates: DocumentTemplate[]
  initialDocuments: PatientDocument[]
  pendingSuggestions?: Array<{ tipo: string; motivo: string; title: string; summary: string; is_controlled?: boolean }>
  onSuggestionDismiss?: (index: number) => void
  onDocSaved?: (title: string) => void
  onPrint: (data: PrintState) => void
  /** Notifica o pai sobre mudanças no estado de upload do PDF (para bloquear alta). */
  onPdfUploadingChange?: (uploading: boolean) => void
  /** Notifica o pai quando o PDF foi salvo com sucesso no Storage (para atualizar lista de Anexos). */
  onAttachmentAdded?: (attachment: Attachment) => void
  /** Propaga erros de geração/upload de PDF para o pai exibir toast. */
  onError?: (msg: string) => void
  /** Auto-trigger generation of a specific suggestion (from discharge modal). Clear after handling. */
  autoTriggerSuggestion?: { suggestion: { tipo: string; motivo: string; title: string }; index: number } | null
  onAutoTriggerHandled?: () => void
  /** Indica se há medicamentos controlados na consulta (Receituário Azul). */
  hasControlledMeds?: boolean
}

type DraftState = {
  template_id: string | null
  template_name: string
  template_type: string
  extracted_fields: ExtractedField[]
  ai_fields: Record<string, any>
  edited_fields: Record<string, any>
  is_system_template: boolean
  template_html?: string | null
  // Re-open mode
  doc_id?: string
  is_saved?: boolean
  /** Nome original do documento (preenchido ao reabrir um doc salvo).
   *  Usado para nomear o PDF de forma consistente com o registro no banco. */
  document_name?: string
}

// ─── Field Renderer ───────────────────────────────────────────────────────────

function FieldInput({
  field, value, wasAiFilled, onChange,
}: {
  field: ExtractedField
  value: any
  wasAiFilled: boolean
  onChange: (val: any) => void
}) {
  const isEmpty = value === null || value === undefined || value === ''
  const borderClass = isEmpty
    ? 'border-amber-300 bg-amber-50 focus:ring-amber-400'
    : wasAiFilled
    ? 'border-green-400 bg-green-50 focus:ring-green-400'
    : 'border-slate-300 focus:ring-blue-500'

  const base = `w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:border-transparent outline-none transition-colors`

  return (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1.5">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
        {!isEmpty && wasAiFilled && <CheckCircle2 className="inline w-3 h-3 text-green-600 ml-1.5" />}
        {isEmpty && (
          <span className="ml-1.5 text-xs font-normal text-amber-600">
            <AlertCircle className="inline w-3 h-3 mr-0.5" />preencha
          </span>
        )}
      </label>

      {field.type === 'textarea' ? (
        <textarea
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          className={`${base} ${borderClass} h-20 resize-none`}
        />
      ) : field.type === 'number' ? (
        <input type="number" step="any" value={value ?? ''}
          onChange={e => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
          className={`${base} ${borderClass}`} />
      ) : field.type === 'boolean' ? (
        <select value={value === null || value === undefined ? '' : String(value)}
          onChange={e => onChange(e.target.value === '' ? null : e.target.value === 'true')}
          className={`${base} ${borderClass}`}>
          <option value="">Selecione...</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </select>
      ) : field.type === 'date' ? (
        <DatePicker value={value ?? ''} onChange={v => onChange(v)} />
      ) : (
        <input type="text" value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          className={`${base} ${borderClass}`} />
      )}

      <p className="text-xs text-slate-400 mt-1 leading-snug">{field.description}</p>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DocumentsSection({
  consultation, clinicName = 'VetMax', templates, initialDocuments,
  pendingSuggestions = [], onSuggestionDismiss, onDocSaved, onPrint,
  onPdfUploadingChange, onAttachmentAdded, onError,
  autoTriggerSuggestion, onAutoTriggerHandled,
  hasControlledMeds = false,
}: Props) {
  const [documents, setDocuments] = useState<PatientDocument[]>(initialDocuments)
  const activeSuggestionIndexRef  = useRef<number>(-1)
  const activeSuggestionTitleRef  = useRef<string>('')

  // Modal state
  const [showModal,          setShowModal]          = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [isGenerating,       setIsGenerating]       = useState(false)
  const [modalError,         setModalError]         = useState<string | null>(null)
  const [activeHint,         setActiveHint]         = useState<string | undefined>(undefined)
  const [templateSearch,     setTemplateSearch]     = useState('')

  // Review form state
  const [draft,          setDraft]          = useState<DraftState | null>(null)
  const [isSaving,       setIsSaving]       = useState(false)
  const [isUploadingPdf, setIsUploadingPdf] = useState(false)
  const [isUpdating,     setIsUpdating]     = useState(false)
  const [draftError,     setDraftError]     = useState<string | null>(null)
  const [saveSuccess,    setSaveSuccess]    = useState(false)

  // ── All available templates: clinic first, then Sysmax fallbacks ────────────
  const clinicTypeSet = new Set(templates.map(t => t.type))
  const sysmaxFallbacks = SYSTEM_TEMPLATES.filter(st => !clinicTypeSet.has(st.type))
  const allTemplates = [...templates, ...sysmaxFallbacks]

  // ── Template search filter ────────────────────────────────────────────────
  const searchLower = templateSearch.toLowerCase().trim()
  const filteredClinic = searchLower
    ? templates.filter(t => t.name.toLowerCase().includes(searchLower))
    : templates
  const filteredSysmax = searchLower
    ? sysmaxFallbacks.filter(t => t.name.toLowerCase().includes(searchLower))
    : sysmaxFallbacks
  const hasFilteredResults = filteredClinic.length > 0 || filteredSysmax.length > 0

  // ── Find best template for a suggested tipo ────────────────────────────────
  const findTemplateForTipo = (tipo: string): DocumentTemplate | undefined => {
    const mappedType = SUGGESTION_TYPE_MAP[tipo] ?? tipo
    return (
      templates.find(t => t.type === mappedType) ??
      SYSTEM_TEMPLATES.find(t => t.type === mappedType)
    )
  }

  // ── Auto-trigger from parent (e.g., discharge modal "Gerar" button) ──────────
  useEffect(() => {
    if (!autoTriggerSuggestion) return
    handleSuggestionGenerate(autoTriggerSuggestion.suggestion, autoTriggerSuggestion.index)
    onAutoTriggerHandled?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTriggerSuggestion])

  // ── Open modal for a suggestion ────────────────────────────────────────────
  const handleSuggestionGenerate = (suggestion: { tipo: string; motivo: string; title?: string }, index: number) => {
    activeSuggestionIndexRef.current = index
    activeSuggestionTitleRef.current = suggestion.title ?? ''
    const t = findTemplateForTipo(suggestion.tipo)
    setSelectedTemplateId(t?.id ?? '')
    setActiveHint(suggestion.motivo)
    setModalError(null)
    setShowModal(true)
  }

  // ── Re-open a saved document without AI call ───────────────────────────────
  const handleOpenSavedDoc = (doc: PatientDocument) => {
    const extractedFields = doc.template_extracted_fields
    if (!extractedFields || extractedFields.length === 0) return

    setDraft({
      template_id:        doc.template_id,
      template_name:      doc.template_name ?? doc.template?.name ?? 'Documento',
      template_type:      doc.template_type ?? doc.template?.type ?? 'outro',
      extracted_fields:   extractedFields,
      ai_fields:          {},
      edited_fields:      { ...doc.content_data },
      is_system_template: doc.template_id ? isSystemTemplate(doc.template_id) : true,
      template_html:      doc.template_html ?? null,
      doc_id:             doc.id,
      is_saved:           true,
      document_name:      doc.document_name,
    })
    setDraftError(null)
    setSaveSuccess(false)
  }

  // ── Generate draft via AI ──────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!selectedTemplateId) return
    setIsGenerating(true)
    setModalError(null)
    try {
      const result = await generateDocumentDraft(selectedTemplateId, consultation.id, activeHint)
      if ('error' in result) { setModalError(result.error); return }
      // Resolve template_html from the selected template
      const selectedTpl = allTemplates.find(t => t.id === selectedTemplateId)
      setDraft({
        template_id:        selectedTemplateId,
        template_name:      result.template_name,
        template_type:      result.template_type,
        extracted_fields:   result.extracted_fields,
        ai_fields:          result.fields,
        edited_fields:      { ...result.fields },
        is_system_template: result.is_system_template,
        template_html:      selectedTpl?.template_html ?? null,
        is_saved:           false,
      })
      setShowModal(false)
      setSelectedTemplateId('')
      setActiveHint(undefined)
    } catch (e: any) {
      setModalError(e.message ?? 'Erro ao gerar documento.')
    } finally {
      setIsGenerating(false)
    }
  }

  // ── Update individual field ────────────────────────────────────────────────
  const updateField = useCallback((fieldName: string, value: any) => {
    setDraft(prev =>
      prev ? { ...prev, edited_fields: { ...prev.edited_fields, [fieldName]: value } } : null
    )
  }, [])

  // ── Build print data from current draft ───────────────────────────────────
  const buildPrintData = (d: DraftState): PrintState => ({
    // Prioridade: nome original do doc (modo edição) > sugestão ativa > template+pet
    name: d.document_name
      ?? (activeSuggestionTitleRef.current
          ? `${activeSuggestionTitleRef.current} — ${consultation.patient.name}`
          : `${d.template_name} — ${consultation.patient.name}`),
    type:              d.template_type,
    fields:            d.edited_fields,
    extracted_fields:  d.extracted_fields,
    hasControlledMeds,
    template_html:     d.template_html ?? null,
  })

  // ── Save new document + upload PDF + trigger print ────────────────────────
  const handleSaveAndPrint = async () => {
    if (!draft) return
    setDraftError(null)

    const pd = buildPrintData(draft)

    // Fase 1 — salvar no banco
    console.log('[DocumentsSection] Fase 1: salvando documento no banco...')
    setIsSaving(true)
    let savedId: string
    try {
      const result = await savePatientDocument({
        consultation_id:           consultation.id,
        patient_id:                consultation.patient.id,
        template_id:               draft.is_system_template ? null : draft.template_id,
        template_name:             draft.template_name,
        template_type:             draft.template_type,
        template_extracted_fields: draft.extracted_fields,
        template_html:             draft.template_html ?? null,
        document_name:             pd.name,
        content_data:              draft.edited_fields,
      })
      if ('error' in result) { setDraftError(result.error); return }
      savedId = result.id
      console.log('[DocumentsSection] Fase 1: documento salvo, id:', savedId)
    } finally {
      setIsSaving(false)
    }

    // Fase 2 — gerar PDF e fazer upload (bloqueia a alta enquanto ocorre)
    console.log('[DocumentsSection] Fase 2: iniciando geração/upload de PDF...')
    setIsUploadingPdf(true)
    onPdfUploadingChange?.(true)
    try {
      console.log('[DocumentsSection] Fase 2: chamando generateDocumentPdfBlob...')
      const blob      = await generateDocumentPdfBlob(pd, clinicName, consultation.patient, consultation.tutor)
      console.log('[DocumentsSection] Fase 2: blob recebido, convertendo para base64...')
      const pdfBase64 = await blobToBase64(blob)
      console.log('[DocumentsSection] Fase 2: base64 pronto, fazendo upload...')
      const uploadResult = await uploadDocumentPdf({
        pdfBase64,
        fileName:       pd.name,
        patientId:      consultation.patient.id,
        consultationId: consultation.id,
      })
      if ('error' in uploadResult) throw new Error(uploadResult.error)
      console.log('[DocumentsSection] Fase 2: PDF salvo no storage com sucesso.')
      onAttachmentAdded?.(uploadResult)
    } catch (err: any) {
      const msg = err?.message ?? 'Erro desconhecido ao gerar PDF.'
      console.error('[DocumentsSection] Fase 2 FALHOU:', err)
      setDraftError(msg)
      onError?.(msg)
    } finally {
      // CRÍTICO: sempre reseta os estados de carregamento, mesmo em caso de erro ou timeout
      console.log('[DocumentsSection] Fase 2: finally — resetando isUploadingPdf e notificando pai.')
      setIsUploadingPdf(false)
      onPdfUploadingChange?.(false)
    }

    // Fase 3 — atualizar UI e disparar impressão
    setDocuments(prev => [{
      id:                          savedId,
      template_id:                 draft.is_system_template ? null : draft.template_id,
      template_name:               draft.template_name,
      template_type:               draft.template_type,
      template_extracted_fields:   draft.extracted_fields,
      template_html:               draft.template_html ?? null,
      document_name:               pd.name,
      content_data:                draft.edited_fields,
      created_at:                  new Date().toISOString(),
      template:                    { name: draft.template_name, type: draft.template_type },
    }, ...prev])

    if (activeSuggestionIndexRef.current >= 0) {
      onSuggestionDismiss?.(activeSuggestionIndexRef.current)
      activeSuggestionIndexRef.current = -1
    }
    onDocSaved?.(pd.name)
    setDraft(null)
    onPrint(pd)
  }

  // ── Update saved document + gerar/upload PDF físico ──────────────────────
  const handleUpdate = async () => {
    if (!draft?.doc_id) return
    setDraftError(null)
    setSaveSuccess(false)

    const pd = buildPrintData(draft)

    // Fase 1 — atualizar campos no banco
    console.log('[DocumentsSection] handleUpdate Fase 1: atualizando documento no banco...')
    setIsUpdating(true)
    try {
      const result = await updatePatientDocument(draft.doc_id, draft.edited_fields, consultation.id)
      if ('error' in result) { setDraftError(result.error); return }

      setDocuments(prev => prev.map(d =>
        d.id === draft.doc_id ? { ...d, content_data: draft.edited_fields } : d
      ))
      setSaveSuccess(true)
      console.log('[DocumentsSection] handleUpdate Fase 1: banco atualizado.')
    } finally {
      setIsUpdating(false)
    }

    // Fase 2 — gerar PDF e fazer upload físico em patient_attachments
    console.log('[DocumentsSection] handleUpdate Fase 2: gerando PDF e fazendo upload...')
    setIsUploadingPdf(true)
    onPdfUploadingChange?.(true)
    try {
      const blob      = await generateDocumentPdfBlob(pd, clinicName, consultation.patient, consultation.tutor)
      const pdfBase64 = await blobToBase64(blob)
      const uploadResult = await uploadDocumentPdf({
        pdfBase64,
        fileName:       pd.name,
        patientId:      consultation.patient.id,
        consultationId: consultation.id,
      })
      if ('error' in uploadResult) throw new Error(uploadResult.error)
      console.log('[DocumentsSection] handleUpdate Fase 2: PDF salvo no storage com sucesso.')
      onAttachmentAdded?.(uploadResult)
    } catch (err: any) {
      const msg = err?.message ?? 'Erro desconhecido ao gerar PDF.'
      console.error('[DocumentsSection] handleUpdate Fase 2 FALHOU:', err)
      setDraftError(msg)
      onError?.(msg)
    } finally {
      setIsUploadingPdf(false)
      onPdfUploadingChange?.(false)
    }
  }

  // ── Print saved document (via parent) ─────────────────────────────────────
  const handlePrintDraft = () => {
    if (!draft) return
    onPrint(buildPrintData(draft))
  }

  // ── AI field count ─────────────────────────────────────────────────────────
  const aiFilledCount = draft
    ? Object.values(draft.ai_fields).filter(v => v !== null && v !== undefined && v !== '').length : 0
  const emptyCount = draft
    ? draft.extracted_fields.filter(f => {
        const v = draft.edited_fields[f.field_name]
        return v === null || v === undefined || v === ''
      }).length : 0

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>

      {/* ── Template Selection Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
          onClick={() => { setShowModal(false); setModalError(null); setActiveHint(undefined); setTemplateSearch('') }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Gerar Documento com IA</h2>
                  {activeHint && (
                    <p className="text-xs text-blue-600 mt-0.5 truncate max-w-[280px]">Contexto: &quot;{activeHint.slice(0, 60)}{activeHint.length > 60 ? '…' : ''}&quot;</p>
                  )}
                </div>
              </div>
              <button onClick={() => { setShowModal(false); setModalError(null); setActiveHint(undefined); setTemplateSearch('') }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Busca de templates */}
            <div className="px-5 pt-4 pb-2 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={templateSearch}
                  onChange={e => setTemplateSearch(e.target.value)}
                  placeholder="Buscar modelo..."
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>
            </div>

            <div className="p-5 pt-2 space-y-4 overflow-y-auto flex-1">
              {modalError && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{modalError}
                </div>
              )}

              {allTemplates.length === 0 ? (
                <div className="text-center py-6">
                  <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 font-medium">Nenhum template disponível</p>
                </div>
              ) : !hasFilteredResults ? (
                <div className="text-center py-6">
                  <p className="text-sm text-slate-500">Nenhum modelo encontrado para &quot;{templateSearch}&quot;</p>
                  <button onClick={() => setTemplateSearch('')} className="mt-2 text-xs text-blue-600 hover:underline">
                    Limpar busca
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredClinic.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Templates da Clínica</p>
                      {filteredClinic.map(t => (
                        <TemplateButton key={t.id} template={t} selected={selectedTemplateId === t.id}
                          onSelect={() => setSelectedTemplateId(t.id)} />
                      ))}
                    </>
                  )}
                  {filteredSysmax.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mt-3">
                        Templates Padrão Sysmax
                      </p>
                      {filteredSysmax.map(t => (
                        <TemplateButton key={t.id} template={t} selected={selectedTemplateId === t.id}
                          onSelect={() => setSelectedTemplateId(t.id)} isSysmax />
                      ))}
                    </>
                  )}
                </div>
              )}

              <button onClick={handleGenerate} disabled={!selectedTemplateId || isGenerating}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {isGenerating
                  ? <><Loader2 className="w-4 h-4 animate-spin" />IA preenchendo campos...</>
                  : <><Sparkles className="w-4 h-4" />Gerar com IA</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Review / Edit Form ── */}
      {draft ? (
        <div className="bg-white rounded-xl shadow-sm border border-blue-200">
          <div className="border-b border-blue-100 px-6 py-4 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                <FileText className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-900">{draft.template_name}</h2>
                  {draft.is_saved && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      Salvo
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {draft.is_saved
                    ? 'Edite os campos e atualize ou imprima o documento'
                    : 'Revise os campos preenchidos pela IA antes de salvar'}
                </p>
              </div>
            </div>
            <button onClick={() => { setDraft(null); setDraftError(null); setSaveSuccess(false) }}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg flex-shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6">
            {!draft.is_saved && (
              <div className="flex flex-wrap items-center gap-4 mb-5 p-3 bg-slate-50 rounded-lg">
                <span className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="w-3 h-3 rounded border-2 border-green-400 bg-green-50 inline-block flex-shrink-0" />
                  <strong>{aiFilledCount}</strong> campo(s) preenchido(s) pela IA
                </span>
                {emptyCount > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-700">
                    <span className="w-3 h-3 rounded border-2 border-amber-300 bg-amber-50 inline-block flex-shrink-0" />
                    <strong>{emptyCount}</strong> campo(s) aguardando preenchimento
                  </span>
                )}
              </div>
            )}

            {draftError && (
              <div className="mb-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{draftError}
              </div>
            )}

            {saveSuccess && (
              <div className="mb-4 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />Documento atualizado com sucesso.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {draft.extracted_fields.map(field => (
                <FieldInput key={field.field_name} field={field}
                  value={draft.edited_fields[field.field_name] ?? null}
                  wasAiFilled={!draft.is_saved && (field.field_name in draft.ai_fields)}
                  onChange={val => updateField(field.field_name, val)} />
              ))}
            </div>

            <div className="mt-6 pt-5 border-t border-slate-200 flex items-center gap-3">
              <button onClick={() => { setDraft(null); setDraftError(null); setSaveSuccess(false); activeSuggestionTitleRef.current = '' }}
                className="px-4 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                {draft.is_saved ? 'Fechar' : 'Cancelar'}
              </button>

              {draft.is_saved ? (
                <>
                  <button onClick={handleUpdate} disabled={isUpdating || isUploadingPdf}
                    className="flex items-center gap-2 px-5 py-2.5 border border-blue-600 text-blue-700 text-sm font-semibold rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {isUpdating
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Atualizando...</>
                      : isUploadingPdf
                      ? <><Loader2 className="w-4 h-4 animate-spin" />Gerando PDF...</>
                      : <><Save className="w-4 h-4" />Atualizar Documento</>}
                  </button>
                  <button onClick={handlePrintDraft} disabled={isUploadingPdf}
                    className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    <Printer className="w-4 h-4" />Imprimir
                  </button>
                </>
              ) : (
                <button onClick={handleSaveAndPrint} disabled={isSaving || isUploadingPdf}
                  className="ml-auto flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSaving
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</>
                    : isUploadingPdf
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Gerando PDF...</>
                    : <><Printer className="w-4 h-4" />Salvar e Imprimir</>}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ── Document List + Suggestions ── */
        <div className="space-y-3">

          {/* Alerta Receituário Azul */}
          {hasControlledMeds && (
            <div className="flex items-start gap-3 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
              <p className="text-sm text-blue-800">
                <span className="font-semibold">Medicamentos controlados identificados.</span>{' '}
                Lembre-se de imprimir a via de Retenção da Farmácia.
              </p>
            </div>
          )}

          {/* Sugestões da IA */}
          {pendingSuggestions.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Wand2 className="w-4 h-4 text-amber-600" />
                <p className="text-sm font-semibold text-amber-800">
                  {pendingSuggestions.length} documento(s) sugerido(s) pela IA
                </p>
              </div>
              <div className="space-y-2">
                {pendingSuggestions.map((s, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                      s.is_controlled
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-white border-amber-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_BADGE[s.tipo] ?? TYPE_BADGE.outro}`}>
                          {TYPE_LABELS[s.tipo] ?? s.tipo}
                        </span>
                        {s.is_controlled && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-600 text-white">
                            ⚠ Receita de Controle Especial
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-800 mt-1 truncate">
                        {s.title || s.motivo}
                      </p>
                      {s.summary && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{s.summary}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleSuggestionGenerate(s, i)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-white ${
                          s.is_controlled ? 'bg-blue-700 hover:bg-blue-800' : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        <Sparkles className="w-3 h-3" />Gerar
                      </button>
                      <button
                        onClick={() => onSuggestionDismiss?.(i)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Document List */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                  <FileText className="h-4 w-4 text-slate-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Documentos e Prescrições</h2>
                  <p className="text-xs text-slate-500">Laudos, receitas e encaminhamentos gerados</p>
                </div>
              </div>
              <button
                onClick={() => { setShowModal(true); setSelectedTemplateId(''); setModalError(null); setActiveHint(undefined); setTemplateSearch('') }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />Gerar Novo Documento
              </button>
            </div>

            {documents.length === 0 ? (
              <div className="p-10 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <FileText className="w-5 h-5 text-slate-300" />
                </div>
                <p className="text-sm font-medium text-slate-500">Nenhum documento gerado</p>
                <p className="text-xs text-slate-400 mt-1">
                  Use o microfone para ditado inteligente ou clique em "Gerar Novo Documento".
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {documents.map(doc => {
                  const canReopen = !!(doc.template_extracted_fields?.length)
                  const typeStr = doc.template_type ?? doc.template?.type
                  return (
                    <div key={doc.id}
                      className={`px-6 py-4 flex items-center justify-between gap-3 ${canReopen ? 'cursor-pointer hover:bg-slate-50 transition-colors group' : ''}`}
                      onClick={() => canReopen && handleOpenSavedDoc(doc)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileCheck className={`w-4 h-4 flex-shrink-0 ${canReopen ? 'text-blue-400 group-hover:text-blue-600' : 'text-slate-400'}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{doc.document_name}</p>
                          <p className="text-xs text-slate-400">
                            {new Date(doc.created_at).toLocaleString('pt-BR', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                            {canReopen && <span className="ml-2 text-blue-400 group-hover:text-blue-600">· Clique para editar/imprimir</span>}
                          </p>
                        </div>
                      </div>
                      {typeStr && (
                        <span className={`ml-2 flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${TYPE_BADGE[typeStr] ?? TYPE_BADGE.outro}`}>
                          {TYPE_LABELS[typeStr] ?? typeStr}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ─── Template Button ──────────────────────────────────────────────────────────

function TemplateButton({
  template, selected, onSelect, isSysmax = false,
}: {
  template: DocumentTemplate
  selected: boolean
  onSelect: () => void
  isSysmax?: boolean
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center justify-between p-3.5 rounded-xl border-2 transition-all text-left ${
        selected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{template.name}</p>
          <p className="text-xs text-slate-400">
            {template.extracted_fields.length} campos
            {isSysmax && <span className="ml-1.5 text-slate-300">· Template padrão</span>}
          </p>
        </div>
      </div>
      <span className={`ml-3 flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${TYPE_BADGE[template.type] ?? TYPE_BADGE.outro}`}>
        {TYPE_LABELS[template.type] ?? template.type}
      </span>
    </button>
  )
}
