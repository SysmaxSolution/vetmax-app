'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  X, Upload, Plus, Trash2, Loader, Eye, Code, GripVertical,
  Droplets, ChevronLeft, ChevronRight, Move, Type, FileText,
  CheckSquare, Square, Pencil, Tag, Sparkles, PlusCircle, ScanEye, LayoutGrid, List,
} from 'lucide-react'
import { saveTemplate, updateTemplate } from '@/lib/actions/templates'
import TemplateLayoutEditor, {
  layoutToHtml, htmlToLayout,
  layoutElementsToOverlays, overlaysToLayoutElements,
  type LayoutElement,
} from './TemplateLayoutEditor'
import TemplatePreviewPane from './TemplatePreviewPane'
import { pdfToImages } from '@/lib/pdf-to-images'
import type {
  DocumentTemplate, ExtractedField, FieldType, TemplateType,
  LayoutOverlay, PageDimensionsRecord,
} from '@/types'
import { uploadTemplatePdf } from '@/lib/actions/template-storage'
import { previewFilledPdfBase64 } from '@/lib/actions/document-generation'
import { buildMockFieldValues } from '@/lib/pdf/mock-field-values'
import { FileCheck2 } from 'lucide-react'

interface ImportTemplateModalProps {
  onClose: () => void
  onSuccess: (template: DocumentTemplate) => void
  clinicLogoUrl?: string | null
  editTemplate?: DocumentTemplate | null
}

type Step = 'upload' | 'review' | 'adding_field' | 'editor'

interface FormState {
  name: string
  type: TemplateType
  extractedFields: ExtractedField[]
  templateHtml: string | null
  pageImages: string[] | null  // base64 data URLs das paginas do documento original
  // Pixel Perfect (migration 0138) — preenchidos no upload do PDF
  originalPdfPath: string | null
  originalPdfSizeBytes: number | null
  pageCount: number | null
  pageDimensions: PageDimensionsRecord[] | null
  layoutOverlays: LayoutOverlay[] | null
}

const FIELD_TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'boolean', 'textarea']

const TEMPLATE_TYPES: { value: TemplateType; label: string }[] = [
  { value: 'laudo', label: 'Laudo (Resultado de Exame)' },
  { value: 'receita', label: 'Receita (Prescricao Medicamentosa)' },
  { value: 'encaminhamento', label: 'Encaminhamento' },
  { value: 'termo', label: 'Termo Legal' },
  { value: 'exame', label: 'Solicitacao de Exame' },
  { value: 'outro', label: 'Outro' },
]

// ── Watermark overlay component ─────────────────────────────────────────────

function WatermarkOverlay({ text, opacity }: { text: string; opacity: number }) {
  if (!text) return null
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-10"
      style={{ opacity: opacity / 100 }}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-300 font-bold whitespace-nowrap select-none"
        style={{
          fontSize: '4rem',
          transform: 'translate(-50%, -50%) rotate(-35deg)',
          letterSpacing: '0.15em',
        }}
      >
        {text}
      </div>
    </div>
  )
}

// ── Text Selection Context Menu ─────────────────────────────────────────────

function TextSelectionMenu({
  x,
  y,
  selectedText,
  onNameField,
  onReadWithAI,
  onCreateField,
  onClose,
  isLoadingAI,
}: {
  x: number
  y: number
  selectedText: string
  onNameField: () => void
  onReadWithAI: () => void
  onCreateField: () => void
  onClose: () => void
  isLoadingAI: boolean
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on Escape only — mousedown is handled by parent to avoid race conditions
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div
      ref={menuRef}
      data-selection-menu
      className="fixed z-[60] bg-white rounded-xl shadow-2xl border border-slate-200 py-1.5 min-w-[220px] animate-in fade-in zoom-in-95 duration-150"
      style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - 180) }}
    >
      <div className="px-3 py-1.5 border-b border-slate-100">
        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Texto selecionado</p>
        <p className="text-xs text-slate-700 font-medium truncate mt-0.5">
          &quot;{selectedText.length > 50 ? selectedText.slice(0, 50) + '...' : selectedText}&quot;
        </p>
      </div>
      <button
        onClick={onNameField}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left"
      >
        <Tag className="w-4 h-4 flex-shrink-0" />
        <div>
          <span className="font-medium">Nomear Campo</span>
          <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Usar como label de um campo existente</p>
        </div>
      </button>
      <button
        onClick={onReadWithAI}
        disabled={isLoadingAI}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-purple-50 hover:text-purple-700 transition-colors text-left disabled:opacity-50"
      >
        {isLoadingAI
          ? <Loader className="w-4 h-4 flex-shrink-0 animate-spin" />
          : <Sparkles className="w-4 h-4 flex-shrink-0" />}
        <div>
          <span className="font-medium">{isLoadingAI ? 'Analisando...' : 'Ler com IA'}</span>
          <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Identificar campo faltante com IA</p>
        </div>
      </button>
      <button
        onClick={onCreateField}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-green-50 hover:text-green-700 transition-colors text-left"
      >
        <PlusCircle className="w-4 h-4 flex-shrink-0" />
        <div>
          <span className="font-medium">Criar Campo</span>
          <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">Novo campo a partir do texto</p>
        </div>
      </button>
    </div>
  )
}

// ── Name Field Picker (select which existing field to rename) ───────────────

function NameFieldPicker({
  fields,
  selectedText,
  onPick,
  onClose,
}: {
  fields: ExtractedField[]
  selectedText: string
  onPick: (index: number) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full max-h-[60vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Nomear Campo</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Selecione qual campo renomear para &quot;{selectedText.slice(0, 40)}{selectedText.length > 40 ? '...' : ''}&quot;
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {fields.map((f, i) => (
            <button
              key={`${f.field_name}-${i}`}
              onClick={() => onPick(i)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg hover:bg-blue-50 transition-colors"
            >
              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 flex-shrink-0">{f.type}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{f.label}</p>
                <p className="text-xs text-slate-400 truncate">{f.field_name}</p>
              </div>
            </button>
          ))}
        </div>
        <div className="px-4 py-3 border-t border-slate-200">
          <button onClick={onClose} className="w-full px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AI Field Suggestion Result ──────────────────────────────────────────────

function AISuggestionPanel({
  suggestion,
  onAccept,
  onDiscard,
}: {
  suggestion: ExtractedField
  onAccept: () => void
  onDiscard: () => void
}) {
  return (
    <div className="mx-4 mb-3 p-3 rounded-lg bg-purple-50 border border-purple-200">
      <div className="flex items-start gap-2">
        <Sparkles className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-purple-900">Campo identificado pela IA</p>
          <div className="mt-1.5 space-y-0.5">
            <p className="text-xs text-purple-800"><strong>Label:</strong> {suggestion.label}</p>
            <p className="text-xs text-purple-800"><strong>Campo:</strong> <code className="font-mono bg-purple-100 px-1 rounded">{suggestion.field_name}</code></p>
            <p className="text-xs text-purple-800"><strong>Tipo:</strong> {suggestion.type}</p>
            <p className="text-xs text-purple-700">{suggestion.description}</p>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={onAccept}
              className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <PlusCircle className="w-3 h-3" />Adicionar Campo
            </button>
            <button
              onClick={onDiscard}
              className="px-3 py-1 text-xs font-medium text-purple-600 border border-purple-300 rounded-lg hover:bg-purple-100 transition-colors"
            >
              Descartar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── HTML Preview with field placeholders highlighted + text selection ────────

function HtmlPreview({
  html,
  fields,
  watermark,
  watermarkOpacity,
  onTextSelected,
}: {
  html: string
  fields: ExtractedField[]
  watermark: string
  watermarkOpacity: number
  onTextSelected: (text: string, x: number, y: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Replace {{field_name}} placeholders with highlighted spans
  let processedHtml = html
  for (const field of fields) {
    const placeholder = `{{${field.field_name}}}`
    const replacement = `<span style="background:#dbeafe;border:1px dashed #3b82f6;padding:2px 6px;border-radius:4px;font-size:0.85em;color:#1d4ed8;cursor:pointer;" title="${field.label} (${field.type})">${field.label}</span>`
    processedHtml = processedHtml.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement)
  }

  const handleMouseUp = useCallback(() => {
    // Small delay so the browser finishes updating the selection
    setTimeout(() => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) return
      const text = sel.toString().trim()
      if (!text || text.length < 2) return

      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      onTextSelected(text, rect.left + rect.width / 2, rect.bottom + 8)
    }, 50)
  }, [onTextSelected])

  return (
    <div className="relative bg-white border border-slate-200 rounded-lg overflow-hidden">
      <WatermarkOverlay text={watermark} opacity={watermarkOpacity} />
      <div className="absolute top-2 right-2 z-10">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-medium">
          Selecione texto para opcoes
        </span>
      </div>
      <div
        ref={containerRef}
        className="p-6 prose prose-sm max-w-none select-text cursor-text"
        style={{ minHeight: '400px', maxHeight: '600px', overflow: 'auto' }}
        dangerouslySetInnerHTML={{ __html: processedHtml }}
        onMouseUp={handleMouseUp}
      />
    </div>
  )
}

// ── Draggable field list item ───────────────────────────────────────────────

function DraggableField({
  field,
  index,
  onToggleRequired,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  field: ExtractedField
  index: number
  onToggleRequired: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}) {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition-colors group">
      <div className="flex flex-col gap-0.5 flex-shrink-0">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Mover para cima"
        >
          <ChevronLeft className="w-3 h-3 rotate-90" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Mover para baixo"
        >
          <ChevronRight className="w-3 h-3 rotate-90" />
        </button>
      </div>

      <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-slate-900 truncate">{field.label}</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 flex-shrink-0">
            {field.type}
          </span>
          <button
            type="button"
            onClick={onToggleRequired}
            className={`text-xs px-1.5 py-0.5 rounded cursor-pointer transition-colors flex-shrink-0 ${
              field.required
                ? 'bg-red-50 text-red-700 hover:bg-red-100'
                : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
            }`}
          >
            {field.required ? 'Obrigatorio' : 'Opcional'}
          </button>
        </div>
        <p className="text-xs text-slate-400 truncate">{field.description}</p>
      </div>

      <button
        onClick={onDelete}
        className="flex-shrink-0 p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
        title="Remover campo"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ── Main Modal ──────────────────────────────────────────────────────────────

export default function ImportTemplateModal({
  onClose,
  onSuccess,
  clinicLogoUrl,
  editTemplate,
}: ImportTemplateModalProps) {
  const isEditMode = !!editTemplate
  const [step, setStep] = useState<Step>(isEditMode ? 'editor' : 'upload')
  const [form, setForm] = useState<FormState>({
    name: editTemplate?.name ?? '',
    type: editTemplate?.type ?? 'laudo',
    extractedFields: editTemplate?.extracted_fields ?? [],
    templateHtml: editTemplate?.template_html ?? null,
    pageImages: editTemplate?.page_images ?? null,
    originalPdfPath: editTemplate?.original_pdf_path ?? null,
    originalPdfSizeBytes: editTemplate?.original_pdf_size_bytes ?? null,
    pageCount: editTemplate?.page_count ?? null,
    pageDimensions: editTemplate?.page_dimensions ?? null,
    layoutOverlays: editTemplate?.layout_overlays ?? null,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<{ name: string; size: number } | null>(null)

  // Editor state
  const [viewMode, setViewMode] = useState<'preview' | 'layout' | 'fields'>('preview')
  const [watermark, setWatermark] = useState('')
  const [watermarkOpacity, setWatermarkOpacity] = useState(15)
  const [editingHtml, setEditingHtml] = useState(false)
  const [htmlSource, setHtmlSource] = useState('')

  // Text selection state
  const [selectionMenu, setSelectionMenu] = useState<{ text: string; x: number; y: number } | null>(null)
  const [showNamePicker, setShowNamePicker] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<ExtractedField | null>(null)
  const [isLoadingAI, setIsLoadingAI] = useState(false)
  const [duplicateConfirm, setDuplicateConfirm] = useState<{
    fieldName: string
    selectedText: string
    count: number
  } | null>(null)

  // Layout editor state — prioriza layout_overlays (Pixel Perfect),
  // depois template_html (legado), por ultimo coordenadas % das fields (IA).
  const [layoutElements, setLayoutElements] = useState<LayoutElement[]>(() => {
    if (editTemplate?.layout_overlays && editTemplate.layout_overlays.length > 0) {
      return overlaysToLayoutElements(editTemplate.layout_overlays)
    }
    if (editTemplate?.template_html) {
      return htmlToLayout(editTemplate.template_html, editTemplate.extracted_fields)
    }
    // Modo Pixel Perfect novo (sem editTemplate ainda salvo): cria overlays
    // a partir das coordenadas % retornadas pela Vision API.
    if (editTemplate?.page_images && editTemplate.page_images.length > 0) {
      return editTemplate.extracted_fields.map(f => ({
        id: `el_${Math.random().toString(36).slice(2)}`,
        type: 'field' as const,
        field_name: f.field_name,
        label: f.label,
        page: f.page ?? 0,
        unit: 'pct' as const,
        x: f.x_percent ?? 30,
        y: f.y_percent ?? 10,
        width: f.width_percent ?? 25,
        height: f.height_percent ?? 3,
        fontSize: 11,
        fontWeight: 'normal' as const,
        textAlign: 'left' as const,
      }))
    }
    return []
  })

  const [newField, setNewField] = useState<ExtractedField>({
    field_name: '',
    label: '',
    type: 'text',
    description: '',
    required: false,
  })

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── File handlers ─────────────────────────────────────────────────────

  /**
   * Validacao preventiva: se o arquivo tem extensao .pdf, confirma o header %PDF.
   * Evita gastar tokens da Vision API com arquivos corrompidos/renomeados.
   */
  const validateFileBeforeUse = async (file: File): Promise<string | null> => {
    const isPdfExt = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdfExt) return null

    // Le os primeiros 8 bytes e checa o magic number "%PDF-1."
    try {
      const head = await file.slice(0, 8).arrayBuffer()
      const sig = new TextDecoder().decode(new Uint8Array(head, 0, 4))
      if (sig !== '%PDF') {
        return 'O arquivo tem extensao .pdf mas nao e um PDF valido (header %PDF ausente). Verifique se ele nao foi renomeado de outro formato (TXT, DOCX, imagem) ou se o download nao foi corrompido.'
      }
    } catch {
      return 'Nao foi possivel ler o conteudo do arquivo selecionado.'
    }
    return null
  }

  const handleFileSelect = async (file: File) => {
    const validationError = await validateFileBeforeUse(file)
    if (validationError) {
      setSelectedFile(null)
      setFilePreview(null)
      setError(validationError)
      return
    }
    setSelectedFile(file)
    setFilePreview({ name: file.name, size: file.size })
    setError(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFileSelect(file)
  }

  // ── Process template ──────────────────────────────────────────────────

  const handleProcessTemplate = async () => {
    setError(null)
    if (!form.name.trim()) { setError('Preencha o nome do documento'); return }

    setLoading(true)
    // Pixel Perfect: capturado durante conversao do PDF (escopo do handler)
    let pdfDimensions: PageDimensionsRecord[] | null = null
    let pdfPageCount: number | null = null
    let pdfTextItems: import('@/lib/pdf-to-images').PdfTextItem[] = []
    try {
      let response

      if (selectedFile) {
        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('name', form.name)
        formData.append('type', form.type)

        // For PDF files, convert to images in the browser first (pdfjs-dist)
        const isPdf = selectedFile.type === 'application/pdf' || selectedFile.name.endsWith('.pdf')
        if (isPdf) {
          try {
            console.log('[ImportTemplate] Convertendo PDF para imagens...')
            const { images, dimensions, textItems } = await pdfToImages(selectedFile, 2)
            console.log(`[ImportTemplate] ${images.length} pagina(s) convertidas, ${textItems.length} text items nativos`)
            pdfDimensions = dimensions
            pdfPageCount = images.length
            pdfTextItems = textItems
            for (const img of images) {
              formData.append('page_images', img)
            }
          } catch (pdfErr) {
            const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr)
            console.error('[ImportTemplate] Falha ao converter PDF para imagens:', msg)
            // Aborta: sem page_images o modo Pixel Perfect nao funciona.
            // O usuario precisa saber para nao acreditar que o modo PP esta ativo.
            setError(
              'Falha ao converter o PDF em imagens no navegador. O modo Pixel Perfect requer essa etapa. ' +
              'Detalhe tecnico: ' + msg +
              '. Tente recarregar a pagina (Ctrl+Shift+R) — se persistir, verifique se /pdf.worker.min.mjs esta acessivel.'
            )
            setLoading(false)
            return
          }
        }

        // For image files, add as page_images too
        const isImage = selectedFile.type.startsWith('image/')
        if (isImage) {
          const reader = new FileReader()
          const dataUrl = await new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string)
            reader.readAsDataURL(selectedFile!)
          })
          formData.append('page_images', dataUrl)
        }

        response = await fetch('/api/process-template-with-file', {
          method: 'POST',
          body: formData,
        })
      } else {
        response = await fetch('/api/process-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, type: form.type }),
        })
      }

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || `Erro HTTP ${response.status}`)
      }

      const data = await response.json()
      if (!data.fields) throw new Error('Nenhum campo retornado')

      const pageImages = data.page_images || null

      // Pixel Perfect — Refinamento de coordenadas:
      // A Vision API retorna coordenadas APROXIMADAS (erro tipico 3-5%).
      // Usamos o textContent NATIVO do PDF (pdfjs) para refinar as coords
      // com precisao sub-pixel quando a label e encontrada no PDF.
      let refinedFields: ExtractedField[] = data.fields
      if (pdfTextItems.length > 0 && data.fields.length > 0) {
        try {
          const { refineFieldsWithPdfText } = await import('@/lib/pdf/refine-field-coords')
          const result = refineFieldsWithPdfText(data.fields, pdfTextItems)
          refinedFields = result.refined
          console.log(
            `[ImportTemplate] Refinamento: ${result.stats.refined_count}/${result.stats.total} ` +
            `campos com coords exatas do PDF nativo (fallback Vision: ${result.stats.fallback_count})`,
          )
        } catch (refErr) {
          console.warn('[ImportTemplate] Refinamento falhou, usando Vision puro:', refErr)
        }
      }

      // Pixel Perfect: upload do PDF original para Storage (apos extracao da IA)
      let originalPdfPath: string | null = null
      const isPdf = selectedFile && (selectedFile.type === 'application/pdf' || selectedFile.name.endsWith('.pdf'))
      if (selectedFile && isPdf) {
        try {
          const uploadFd = new FormData()
          uploadFd.append('file', selectedFile)
          const r = await uploadTemplatePdf(uploadFd)
          if ('path' in r) {
            originalPdfPath = r.path
            console.log('[ImportTemplate] PDF original em Storage:', r.path)
          } else {
            console.warn('[ImportTemplate] Upload do PDF falhou:', r.error)
          }
        } catch (upErr) {
          console.warn('[ImportTemplate] Erro upload PDF original:', upErr)
        }
      }

      setForm(prev => ({
        ...prev,
        extractedFields: refinedFields,
        templateHtml: data.template_html || null,
        pageImages,
        originalPdfPath,
        originalPdfSizeBytes: selectedFile?.size ?? null,
        pageCount: pdfPageCount,
        pageDimensions: pdfDimensions,
      }))

      // Modo Pixel Perfect: hidrata o editor com as coordenadas extraidas pela
      // Vision API + refinadas pelo textContent nativo do PDF. Cada campo vira
      // um overlay posicionado onde a IA + pdfjs identificaram.
      // Modo legado (sem pageImages): editor faz buildDefaultElements (vertical).
      if (pageImages && pageImages.length > 0) {
        const ppElements: LayoutElement[] = refinedFields.map((f: ExtractedField) => ({
          id: `el_${Math.random().toString(36).slice(2)}`,
          type: 'field' as const,
          field_name: f.field_name,
          label: f.label,
          page: f.page ?? 0,
          unit: 'pct' as const,
          x: f.x_percent ?? 30,
          y: f.y_percent ?? 10,
          width: f.width_percent ?? 25,
          height: f.height_percent ?? 3,
          fontSize: 11,
          fontWeight: 'normal' as const,
          textAlign: 'left' as const,
        }))
        setLayoutElements(ppElements)
      } else {
        setLayoutElements([])
      }
      setStep('editor')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  // ── Field management ──────────────────────────────────────────────────

  const handleToggleRequired = (index: number) => {
    const fields = [...form.extractedFields]
    fields[index].required = !fields[index].required
    setForm(prev => ({ ...prev, extractedFields: fields }))
  }

  const handleDeleteField = (index: number) => {
    setForm(prev => ({
      ...prev,
      extractedFields: prev.extractedFields.filter((_, i) => i !== index),
    }))
  }

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    const fields = [...form.extractedFields]
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= fields.length) return
    ;[fields[index], fields[target]] = [fields[target], fields[index]]
    setForm(prev => ({ ...prev, extractedFields: fields }))
  }

  const handleAddField = () => {
    if (!newField.field_name || !newField.label || !newField.description) {
      setError('Preencha todos os campos'); return
    }

    const fieldName = newField.field_name
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')

    const sourceText = (newField as any)._sourceText as string | undefined
    const clean = { ...newField, field_name: fieldName }
    delete (clean as any)._sourceText

    setForm(prev => ({
      ...prev,
      extractedFields: [...prev.extractedFields, clean],
    }))

    // Replace text in HTML with placeholder if created from selection
    if (sourceText && form.templateHtml) {
      replaceTextInHtml(sourceText, fieldName, false)
      const occurrences = countOccurrences(sourceText, form.templateHtml)
      if (occurrences > 1) {
        setDuplicateConfirm({ fieldName, selectedText: sourceText, count: occurrences - 1 })
      }
    }

    setNewField({ field_name: '', label: '', type: 'text', description: '', required: false })
    setStep(form.templateHtml ? 'editor' : 'review')
    setError(null)
  }

  // ── HTML source editing ───────────────────────────────────────────────

  const handleSaveHtmlSource = () => {
    setForm(prev => ({ ...prev, templateHtml: htmlSource }))
    setLayoutElements(htmlToLayout(htmlSource, form.extractedFields))
    setEditingHtml(false)
  }

  // ── Text selection helpers ─────────────────────────────────────────────

  /** Count occurrences of text in HTML (ignoring tags) */
  const countOccurrences = (text: string, html: string): number => {
    if (!html || !text) return 0
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const matches = html.match(new RegExp(escaped, 'g'))
    return matches ? matches.length : 0
  }

  /** Replace selected text with {{field_name}} placeholder in HTML */
  const replaceTextInHtml = (text: string, fieldName: string, replaceAll: boolean) => {
    if (!form.templateHtml) return
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const placeholder = `{{${fieldName}}}`
    const updated = replaceAll
      ? form.templateHtml.replace(new RegExp(escaped, 'g'), placeholder)
      : form.templateHtml.replace(new RegExp(escaped), placeholder)
    setForm(prev => ({ ...prev, templateHtml: updated }))
    setHtmlSource(updated)
  }

  const toSnakeName = (text: string) =>
    text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .slice(0, 40) || 'campo_novo'

  // ── Text selection handlers ───────────────────────────────────────────

  const handleTextSelected = useCallback((text: string, x: number, y: number) => {
    // Always reset to a fresh menu for each new selection
    setSelectionMenu({ text, x, y })
    setShowNamePicker(false)
    setAiSuggestion(null)
    setDuplicateConfirm(null)
  }, [])

  // Close menu when clicking outside (not on the menu itself)
  useEffect(() => {
    if (!selectionMenu) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Don't close if clicking inside the menu or its children
      if (target.closest('[data-selection-menu]')) return
      setSelectionMenu(null)
    }
    // Use capture phase with a delay so mouseup fires first
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [selectionMenu])

  const handleNameField = () => {
    setShowNamePicker(true)
  }

  const handleNameFieldPick = (index: number) => {
    if (!selectionMenu) return
    const selectedText = selectionMenu.text
    const fields = [...form.extractedFields]
    const fieldName = fields[index].field_name
    fields[index] = { ...fields[index], label: selectedText }
    setForm(prev => ({ ...prev, extractedFields: fields }))

    // Replace first occurrence in HTML
    replaceTextInHtml(selectedText, fieldName, false)

    // Check for duplicates
    const occurrences = countOccurrences(selectedText, form.templateHtml || '')
    if (occurrences > 1) {
      setDuplicateConfirm({ fieldName, selectedText, count: occurrences - 1 })
    }

    setShowNamePicker(false)
    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
  }

  const handleReadWithAI = async () => {
    if (!selectionMenu) return
    const savedText = selectionMenu.text
    setIsLoadingAI(true)
    try {
      const response = await fetch('/api/process-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Analise de campo: ${savedText}`,
          type: form.type,
          hint_text: savedText,
        }),
      })

      let suggestion: ExtractedField | null = null

      if (response.ok) {
        const data = await response.json()
        if (data.fields && data.fields.length > 0) {
          suggestion = data.fields[0] as ExtractedField
        }
      }

      if (!suggestion) {
        suggestion = {
          field_name: toSnakeName(savedText),
          label: savedText,
          type: 'text',
          description: `Campo identificado a partir do texto "${savedText}"`,
          required: false,
        }
      }

      // Attach the original selected text so we can replace it later
      setAiSuggestion({ ...suggestion, _sourceText: savedText } as any)
      setSelectionMenu(null)
      window.getSelection()?.removeAllRanges()
    } catch (err) {
      console.error('Erro ao analisar com IA:', err)
      setError('Erro ao analisar texto com IA')
      setSelectionMenu(null)
    } finally {
      setIsLoadingAI(false)
    }
  }

  const handleCreateFieldFromSelection = () => {
    if (!selectionMenu) return
    const selectedText = selectionMenu.text
    const snakeName = toSnakeName(selectedText)

    setNewField({
      field_name: snakeName,
      label: selectedText,
      type: 'text',
      description: '',
      required: false,
      _sourceText: selectedText,
    } as any)
    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
    setStep('adding_field')
  }

  const handleAcceptAISuggestion = () => {
    if (!aiSuggestion) return
    const sourceText = (aiSuggestion as any)._sourceText as string | undefined
    const clean = { ...aiSuggestion }
    delete (clean as any)._sourceText

    setForm(prev => ({
      ...prev,
      extractedFields: [...prev.extractedFields, clean],
    }))

    // Replace text in HTML with placeholder
    if (sourceText && form.templateHtml) {
      replaceTextInHtml(sourceText, clean.field_name, false)
      const occurrences = countOccurrences(sourceText, form.templateHtml)
      if (occurrences > 1) {
        setDuplicateConfirm({ fieldName: clean.field_name, selectedText: sourceText, count: occurrences - 1 })
      }
    }

    setAiSuggestion(null)
  }

  const handleConfirmDuplicateReplace = () => {
    if (!duplicateConfirm) return
    replaceTextInHtml(duplicateConfirm.selectedText, duplicateConfirm.fieldName, true)
    setDuplicateConfirm(null)
  }

  // ── Gerar PDF de Teste (Botao Magico) ─────────────────────────────────

  const [isGeneratingTestPdf, setIsGeneratingTestPdf] = useState(false)

  const handleGenerateTestPdf = async () => {
    setError(null)
    if (!editTemplate?.id) {
      setError('Salve o template antes de gerar o PDF de teste.')
      return
    }
    if (!form.originalPdfPath && !editTemplate.original_pdf_path) {
      setError('Template sem PDF original. Reimporte um arquivo PDF para gerar o teste pixel-perfect.')
      return
    }
    if (form.extractedFields.length === 0) {
      setError('Mapeie ao menos um campo antes de gerar o teste.')
      return
    }

    setIsGeneratingTestPdf(true)
    try {
      const mockValues = buildMockFieldValues(form.extractedFields)
      console.log('[TestPDF] Mock values:', mockValues)

      const result = await previewFilledPdfBase64(editTemplate.id, mockValues)
      if ('error' in result) {
        setError(result.error)
        return
      }

      // base64 → Uint8Array → Blob → Object URL → window.open
      const binary = atob(result.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)

      const opened = window.open(url, '_blank', 'noopener,noreferrer')
      if (!opened) {
        setError('Bloqueio de pop-up impediu abrir o PDF. Permita pop-ups neste site e tente novamente.')
      }

      // Libera o Object URL apos 60s — tempo suficiente para o browser carregar
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar PDF de teste')
    } finally {
      setIsGeneratingTestPdf(false)
    }
  }

  // ── Save template ─────────────────────────────────────────────────────

  const handleSaveTemplate = async () => {
    setError(null)
    if (form.extractedFields.length === 0) {
      setError('Adicione pelo menos um campo'); return
    }

    // Convert layout elements to HTML if we have them
    let finalHtml = layoutElements.length > 0
      ? layoutToHtml(layoutElements)
      : form.templateHtml

    // If watermark was set, inject into HTML
    if (finalHtml && watermark) {
      const watermarkDiv = `<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:4rem;color:rgba(0,0,0,${watermarkOpacity / 100});font-weight:bold;letter-spacing:0.15em;pointer-events:none;z-index:9999;white-space:nowrap;">${watermark}</div>`
      finalHtml = finalHtml.replace(/<\/div>\s*$/, `${watermarkDiv}</div>`)
    }

    setLoading(true)
    // Pixel Perfect: serializa overlays % do editor para salvar canonicamente.
    const overlaysToSave = layoutElementsToOverlays(layoutElements)

    try {
      const payload = {
        name: form.name,
        type: form.type,
        extracted_fields: form.extractedFields,
        template_html: finalHtml,
        page_images: form.pageImages,
        // Pixel Perfect (migration 0138)
        original_pdf_path: form.originalPdfPath,
        original_pdf_size_bytes: form.originalPdfSizeBytes,
        page_count: form.pageCount,
        page_dimensions: form.pageDimensions,
        layout_overlays: overlaysToSave.length > 0 ? overlaysToSave : form.layoutOverlays,
      }

      const result = isEditMode
        ? await updateTemplate(editTemplate!.id, payload)
        : await saveTemplate(payload)

      if ('error' in result) { setError(result.error); return }

      onSuccess({
        id: result.id,
        clinic_id: editTemplate?.clinic_id ?? '',
        name: form.name,
        type: form.type,
        file_url: null,
        extracted_fields: form.extractedFields,
        template_html: finalHtml,
        page_images: form.pageImages,
        original_pdf_path: form.originalPdfPath,
        original_pdf_size_bytes: form.originalPdfSizeBytes,
        page_count: form.pageCount,
        page_dimensions: form.pageDimensions,
        layout_overlays: form.layoutOverlays,
        created_at: editTemplate?.created_at ?? new Date().toISOString(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  // ── Render step title ─────────────────────────────────────────────────

  const stepTitle = {
    upload: 'Importar Novo Modelo',
    review: 'Revisar Campos',
    adding_field: 'Adicionar Campo',
    editor: 'Editor de Template',
  }[step]

  const stepSubtitle = {
    upload: 'Envie um documento de exemplo (PDF, DOCX, imagem) ou crie do zero',
    review: `${form.extractedFields.length} campos detectados pela IA`,
    adding_field: 'Defina o novo campo manualmente',
    editor: 'Visualize e edite o layout do documento',
  }[step]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className={`rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col ${
        step === 'editor' ? 'w-full max-w-5xl max-h-[95vh]' : 'w-full max-w-2xl max-h-[90vh]'
      }`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex-shrink-0 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">{stepTitle}</h2>
            <p className="text-xs text-blue-200 mt-0.5">{stepSubtitle}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white rounded-lg p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Step: Upload ── */}
          {step === 'upload' && (
            <div className="px-6 py-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">Nome do Documento</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Laudo de Ultrassom Abdominal"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">Tipo de Documento</label>
                <select
                  value={form.type}
                  onChange={e => setForm(prev => ({ ...prev, type: e.target.value as TemplateType }))}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TEMPLATE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* Dropzone */}
              <div
                onDragEnter={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={e => { e.preventDefault(); setDragging(false) }}
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  dragging
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50'
                }`}
              >
                <Upload className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-900">Clique para selecionar ou arraste um arquivo</p>
                <p className="text-xs text-slate-500 mt-1">PDF, DOCX, PNG, JPG — O sistema replicara o layout visual</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                  onChange={e => { const file = e.target.files?.[0]; if (file) handleFileSelect(file) }}
                />
              </div>

              {filePreview && (
                <div className="p-4 rounded-lg bg-green-50 border border-green-200 flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-200 flex-shrink-0">
                    <FileText className="w-4 h-4 text-green-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-green-900">Arquivo importado</h4>
                    <p className="text-sm text-green-700 mt-0.5 font-mono truncate">{filePreview.name}</p>
                    <p className="text-xs text-green-600 mt-0.5">
                      {(filePreview.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setSelectedFile(null); setFilePreview(null) }}
                    className="p-1 text-green-600 hover:text-red-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Step: Review Fields ── */}
          {step === 'review' && (
            <div className="px-6 py-6 space-y-4">
              {/* Toolbar: toggle all required + edit layout */}
              {form.extractedFields.length > 0 && (
                <div className="flex items-center justify-between gap-2">
                  {(() => {
                    const allRequired = form.extractedFields.every(f => f.required)
                    return (
                      <button
                        onClick={() => {
                          const newVal = !allRequired
                          setForm(prev => ({
                            ...prev,
                            extractedFields: prev.extractedFields.map(f => ({ ...f, required: newVal })),
                          }))
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        {allRequired
                          ? <><Square className="w-3.5 h-3.5" />Desmarcar todos obrigatorios</>
                          : <><CheckSquare className="w-3.5 h-3.5" />Marcar todos obrigatorios</>}
                      </button>
                    )
                  })()}
                  <button
                    onClick={() => {
                      if (form.templateHtml) {
                        setHtmlSource(form.templateHtml)
                        setLayoutElements(htmlToLayout(form.templateHtml, form.extractedFields))
                      } else {
                        setHtmlSource('')
                        // Initialize with empty — editor will build defaults from fields
                        setLayoutElements([])
                      }
                      setStep('editor')
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />Editar Layout
                  </button>
                </div>
              )}

              <div className="space-y-1.5">
                {form.extractedFields.map((field, idx) => (
                  <DraggableField
                    key={`${field.field_name}-${idx}`}
                    field={field}
                    index={idx}
                    onToggleRequired={() => handleToggleRequired(idx)}
                    onDelete={() => handleDeleteField(idx)}
                    onMoveUp={() => handleMoveField(idx, 'up')}
                    onMoveDown={() => handleMoveField(idx, 'down')}
                    isFirst={idx === 0}
                    isLast={idx === form.extractedFields.length - 1}
                  />
                ))}
              </div>

              <button
                onClick={() => setStep('adding_field')}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-slate-300 text-slate-600 hover:border-blue-500 hover:text-blue-600 transition-colors"
              >
                <Plus className="w-4 h-4" />Adicionar Campo Manual
              </button>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Step: Adding Field ── */}
          {step === 'adding_field' && (
            <div className="px-6 py-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Label (Exibido para usuario)</label>
                <input
                  type="text"
                  value={newField.label}
                  onChange={e => setNewField(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="Ex: Diagnostico Presuntivo"
                  className="w-full px-3 py-2 rounded border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Field Name (snake_case)</label>
                <input
                  type="text"
                  value={newField.field_name}
                  onChange={e => setNewField(prev => ({ ...prev, field_name: e.target.value }))}
                  placeholder="diagnostico_presuntivo"
                  className="w-full px-3 py-2 rounded border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de Campo</label>
                <select
                  value={newField.type}
                  onChange={e => setNewField(prev => ({ ...prev, type: e.target.value as FieldType }))}
                  className="w-full px-3 py-2 rounded border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Descricao</label>
                <textarea
                  value={newField.description}
                  onChange={e => setNewField(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Resumo da suspeita clinica"
                  className="w-full px-3 py-2 rounded border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={2}
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newField.required}
                  onChange={e => setNewField(prev => ({ ...prev, required: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-slate-700">Obrigatorio</span>
              </label>
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Step: Visual Editor (3 tabs) ── */}
          {step === 'editor' && (
            <div className="flex flex-col h-full">
              {/* ── Tab Bar ── */}
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 flex-shrink-0">
                <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5">
                  <button
                    onClick={() => { setViewMode('preview'); setEditingHtml(false) }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      viewMode === 'preview' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <ScanEye className="w-3.5 h-3.5" />Pre-visualizar
                  </button>
                  <button
                    onClick={() => { setViewMode('layout'); setEditingHtml(false) }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      viewMode === 'layout' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />Layout
                  </button>
                  <button
                    onClick={() => { setViewMode('fields'); setEditingHtml(false) }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      viewMode === 'fields' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />Campos
                  </button>
                </div>

                {/* Watermark (visible on preview + layout) */}
                {(viewMode === 'preview' || viewMode === 'layout') && (
                  <>
                    <div className="h-5 w-px bg-slate-300 mx-1" />
                    <div className="flex items-center gap-2">
                      <Droplets className="w-3.5 h-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={watermark}
                        onChange={e => setWatermark(e.target.value)}
                        placeholder="Marca d'agua..."
                        className="w-28 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      {watermark && (
                        <input type="range" min="5" max="50" value={watermarkOpacity}
                          onChange={e => setWatermarkOpacity(Number(e.target.value))}
                          className="w-16 h-1" title={`Opacidade: ${watermarkOpacity}%`} />
                      )}
                    </div>
                  </>
                )}

                <div className="flex-1" />

                {/* Edit HTML source (layout tab only) */}
                {viewMode === 'layout' && (
                  <button
                    onClick={() => {
                      if (editingHtml) {
                        handleSaveHtmlSource()
                      } else {
                        const currentHtml = layoutElements.length > 0
                          ? layoutToHtml(layoutElements)
                          : (form.templateHtml || '')
                        setHtmlSource(currentHtml)
                        setEditingHtml(true)
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <Code className="w-3.5 h-3.5" />
                    {editingHtml ? 'Salvar HTML' : 'Editar HTML'}
                  </button>
                )}
              </div>

              {/* AI Suggestion panel */}
              {aiSuggestion && (
                <AISuggestionPanel
                  suggestion={aiSuggestion}
                  onAccept={handleAcceptAISuggestion}
                  onDiscard={() => setAiSuggestion(null)}
                />
              )}

              {/* ── Tab Content ── */}
              <div className="flex-1 overflow-auto px-4 py-4" style={{ minHeight: '500px' }}>

                {/* Tab 1: Pre-visualizar — Pixel Perfect (PDF background + overlays) */}
                {viewMode === 'preview' && form.pageImages && form.pageImages.length > 0 && (
                  <TemplatePreviewPane
                    pageImages={form.pageImages}
                    pageDimensions={form.pageDimensions}
                    layoutElements={layoutElements}
                    extractedFields={form.extractedFields}
                    watermark={watermark}
                    watermarkOpacity={watermarkOpacity}
                    clinicLogoUrl={clinicLogoUrl}
                  />
                )}
                {viewMode === 'preview' && (!form.pageImages || form.pageImages.length === 0) && form.templateHtml && (
                  <HtmlPreview
                    html={form.templateHtml}
                    fields={form.extractedFields}
                    watermark={watermark}
                    watermarkOpacity={watermarkOpacity}
                    onTextSelected={handleTextSelected}
                  />
                )}
                {viewMode === 'preview' && (!form.pageImages || form.pageImages.length === 0) && !form.templateHtml && (
                  <div className="text-center py-16 bg-white border border-slate-200 rounded-lg">
                    <ScanEye className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-500">Nenhuma pre-visualizacao disponivel</p>
                    <p className="text-xs text-slate-400 mt-1">Importe um arquivo (PDF, DOCX, imagem) para ver o documento original</p>
                    <button
                      onClick={() => { setStep('upload') }}
                      className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />Importar Arquivo
                    </button>
                  </div>
                )}

                {/* Tab 2: Layout — drag-and-drop canvas */}
                {viewMode === 'layout' && !editingHtml && (
                  <TemplateLayoutEditor
                    elements={layoutElements}
                    onChange={setLayoutElements}
                    fields={form.extractedFields}
                    watermark={watermark}
                    watermarkOpacity={watermarkOpacity}
                    clinicLogoUrl={clinicLogoUrl}
                    pageImages={form.pageImages}
                    pageDimensions={form.pageDimensions}
                    onAddField={(newField) => {
                      // Persiste o novo campo desenhado em form.extractedFields
                      // (o editor ja adicionou o overlay correspondente em layoutElements).
                      setForm(prev => ({
                        ...prev,
                        extractedFields: [...prev.extractedFields, newField],
                      }))
                    }}
                  />
                )}
                {viewMode === 'layout' && editingHtml && (
                  <textarea
                    value={htmlSource}
                    onChange={e => setHtmlSource(e.target.value)}
                    className="w-full h-[500px] px-4 py-3 font-mono text-xs bg-slate-900 text-green-400 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    spellCheck={false}
                  />
                )}

                {/* Tab 3: Campos — field management list */}
                {viewMode === 'fields' && (
                  <div className="space-y-2">
                    {form.extractedFields.length > 0 && (() => {
                      const allRequired = form.extractedFields.every(f => f.required)
                      return (
                        <button
                          onClick={() => {
                            const newVal = !allRequired
                            setForm(prev => ({
                              ...prev,
                              extractedFields: prev.extractedFields.map(f => ({ ...f, required: newVal })),
                            }))
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors mb-1"
                        >
                          {allRequired
                            ? <><Square className="w-3.5 h-3.5" />Desmarcar todos obrigatorios</>
                            : <><CheckSquare className="w-3.5 h-3.5" />Marcar todos obrigatorios</>}
                        </button>
                      )
                    })()}
                    {form.extractedFields.map((field, idx) => (
                      <DraggableField
                        key={`${field.field_name}-${idx}`}
                        field={field}
                        index={idx}
                        onToggleRequired={() => handleToggleRequired(idx)}
                        onDelete={() => handleDeleteField(idx)}
                        onMoveUp={() => handleMoveField(idx, 'up')}
                        onMoveDown={() => handleMoveField(idx, 'down')}
                        isFirst={idx === 0}
                        isLast={idx === form.extractedFields.length - 1}
                      />
                    ))}
                    <button
                      onClick={() => setStep('adding_field')}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-slate-300 text-slate-600 hover:border-blue-500 hover:text-blue-600 transition-colors"
                    >
                      <Plus className="w-4 h-4" />Adicionar Campo
                    </button>
                  </div>
                )}
              </div>

              {error && (
                <div className="mx-4 mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-white px-6 py-4 flex-shrink-0 flex gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>

          {step === 'upload' && (
            <button
              onClick={handleProcessTemplate}
              disabled={loading || !form.name.trim()}
              className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader className="w-4 h-4 animate-spin" />}
              {loading
                ? (selectedFile ? 'Analisando documento...' : 'Gerando campos...')
                : 'Processar com IA'}
            </button>
          )}

          {step === 'review' && (
            <button
              onClick={handleSaveTemplate}
              disabled={loading || form.extractedFields.length === 0}
              className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader className="w-4 h-4 animate-spin" />}
              Confirmar e Salvar
            </button>
          )}

          {step === 'adding_field' && (
            <>
              <button
                onClick={() => setStep(form.templateHtml ? 'editor' : 'review')}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                Voltar
              </button>
              <button
                onClick={handleAddField}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
              >
                Adicionar e Voltar
              </button>
            </>
          )}

          {step === 'editor' && (
            <>
              <button
                onClick={() => setStep('review')}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />Campos
              </button>

              {/* Botao Magico: gera PDF preenchido com mock e abre em nova aba */}
              <button
                type="button"
                onClick={handleGenerateTestPdf}
                disabled={
                  isGeneratingTestPdf
                  || loading
                  || !editTemplate?.id
                  || form.extractedFields.length === 0
                }
                title={
                  !editTemplate?.id
                    ? 'Salve o template primeiro para habilitar o teste'
                    : 'Gerar um PDF preenchido com valores ficticios para validar o layout pixel-perfect'
                }
                className="px-4 py-2 rounded-lg border border-blue-300 text-blue-700 bg-blue-50 text-sm font-medium hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
              >
                {isGeneratingTestPdf
                  ? <><Loader className="w-4 h-4 animate-spin" />Gerando PDF...</>
                  : <><FileCheck2 className="w-4 h-4" />Gerar PDF de Teste</>}
              </button>

              <button
                onClick={handleSaveTemplate}
                disabled={loading || form.extractedFields.length === 0}
                className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader className="w-4 h-4 animate-spin" />}
                Salvar Template
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Text Selection Context Menu ── */}
      {selectionMenu && (
        <TextSelectionMenu
          x={selectionMenu.x}
          y={selectionMenu.y}
          selectedText={selectionMenu.text}
          onNameField={handleNameField}
          onReadWithAI={handleReadWithAI}
          onCreateField={handleCreateFieldFromSelection}
          onClose={() => { setSelectionMenu(null); window.getSelection()?.removeAllRanges() }}
          isLoadingAI={isLoadingAI}
        />
      )}

      {/* ── Name Field Picker Modal ── */}
      {showNamePicker && selectionMenu && (
        <NameFieldPicker
          fields={form.extractedFields}
          selectedText={selectionMenu.text}
          onPick={handleNameFieldPick}
          onClose={() => setShowNamePicker(false)}
        />
      )}

      {/* ── Duplicate Replacement Confirmation ── */}
      {duplicateConfirm && (
        <div className="fixed inset-0 z-[70] bg-black/30 flex items-center justify-center p-4" onClick={() => setDuplicateConfirm(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900">Campo encontrado em mais locais</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-slate-700">
                O texto <strong>&quot;{duplicateConfirm.selectedText.slice(0, 40)}{duplicateConfirm.selectedText.length > 40 ? '...' : ''}&quot;</strong> foi
                encontrado em mais <strong>{duplicateConfirm.count}</strong> {duplicateConfirm.count === 1 ? 'local' : 'locais'} no documento.
              </p>
              <p className="text-sm text-slate-600 mt-2">
                Deseja substituir todas as ocorrencias pelo campo <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-xs">{`{{${duplicateConfirm.fieldName}}}`}</code>?
              </p>
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex gap-2 justify-end">
              <button
                onClick={() => setDuplicateConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Apenas este
              </button>
              <button
                onClick={handleConfirmDuplicateReplace}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Substituir todos ({duplicateConfirm.count + 1})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
