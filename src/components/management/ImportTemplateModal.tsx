'use client'

import { useState, useRef, useCallback } from 'react'
import {
  X, Upload, Plus, Trash2, Loader, Eye, Code, GripVertical,
  Droplets, ChevronLeft, ChevronRight, Move, Type, FileText,
} from 'lucide-react'
import { saveTemplate } from '@/lib/actions/templates'
import type { DocumentTemplate, ExtractedField, FieldType, TemplateType } from '@/types'

interface ImportTemplateModalProps {
  onClose: () => void
  onSuccess: (template: DocumentTemplate) => void
}

type Step = 'upload' | 'review' | 'adding_field' | 'editor'

interface FormState {
  name: string
  type: TemplateType
  extractedFields: ExtractedField[]
  templateHtml: string | null
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

// ── HTML Preview with field placeholders highlighted ─────────────────────────

function HtmlPreview({
  html,
  fields,
  watermark,
  watermarkOpacity,
}: {
  html: string
  fields: ExtractedField[]
  watermark: string
  watermarkOpacity: number
}) {
  // Replace {{field_name}} placeholders with highlighted spans
  let processedHtml = html
  for (const field of fields) {
    const placeholder = `{{${field.field_name}}}`
    const replacement = `<span style="background:#dbeafe;border:1px dashed #3b82f6;padding:2px 6px;border-radius:4px;font-size:0.85em;color:#1d4ed8;cursor:pointer;" title="${field.label} (${field.type})">${field.label}</span>`
    processedHtml = processedHtml.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replacement)
  }

  return (
    <div className="relative bg-white border border-slate-200 rounded-lg overflow-hidden">
      <WatermarkOverlay text={watermark} opacity={watermarkOpacity} />
      <div
        className="p-6 prose prose-sm max-w-none"
        style={{ minHeight: '400px', maxHeight: '600px', overflow: 'auto' }}
        dangerouslySetInnerHTML={{ __html: processedHtml }}
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
}: ImportTemplateModalProps) {
  const [step, setStep] = useState<Step>('upload')
  const [form, setForm] = useState<FormState>({
    name: '',
    type: 'laudo',
    extractedFields: [],
    templateHtml: null,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<{ name: string; size: number } | null>(null)

  // Editor state
  const [viewMode, setViewMode] = useState<'visual' | 'fields'>('visual')
  const [watermark, setWatermark] = useState('')
  const [watermarkOpacity, setWatermarkOpacity] = useState(15)
  const [editingHtml, setEditingHtml] = useState(false)
  const [htmlSource, setHtmlSource] = useState('')

  const [newField, setNewField] = useState<ExtractedField>({
    field_name: '',
    label: '',
    type: 'text',
    description: '',
    required: false,
  })

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── File handlers ─────────────────────────────────────────────────────

  const handleFileSelect = (file: File) => {
    setSelectedFile(file)
    setFilePreview({ name: file.name, size: file.size })
    setError(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  // ── Process template ──────────────────────────────────────────────────

  const handleProcessTemplate = async () => {
    setError(null)
    if (!form.name.trim()) { setError('Preencha o nome do documento'); return }

    setLoading(true)
    try {
      let response

      if (selectedFile) {
        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('name', form.name)
        formData.append('type', form.type)

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

      setForm(prev => ({
        ...prev,
        extractedFields: data.fields,
        templateHtml: data.template_html || null,
      }))

      // If we have HTML layout, go straight to editor; otherwise review fields
      if (data.template_html) {
        setHtmlSource(data.template_html)
        setStep('editor')
      } else {
        setStep('review')
      }
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

    setForm(prev => ({
      ...prev,
      extractedFields: [...prev.extractedFields, { ...newField, field_name: fieldName }],
    }))
    setNewField({ field_name: '', label: '', type: 'text', description: '', required: false })
    setStep(form.templateHtml ? 'editor' : 'review')
    setError(null)
  }

  // ── HTML source editing ───────────────────────────────────────────────

  const handleSaveHtmlSource = () => {
    setForm(prev => ({ ...prev, templateHtml: htmlSource }))
    setEditingHtml(false)
  }

  // ── Save template ─────────────────────────────────────────────────────

  const handleSaveTemplate = async () => {
    setError(null)
    if (form.extractedFields.length === 0) {
      setError('Adicione pelo menos um campo'); return
    }

    // If watermark was set, inject into HTML
    let finalHtml = form.templateHtml
    if (finalHtml && watermark) {
      const watermarkDiv = `<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:4rem;color:rgba(0,0,0,${watermarkOpacity / 100});font-weight:bold;letter-spacing:0.15em;pointer-events:none;z-index:9999;white-space:nowrap;">${watermark}</div>`
      finalHtml = finalHtml.replace(/<\/div>\s*$/, `${watermarkDiv}</div>`)
    }

    setLoading(true)
    try {
      const result = await saveTemplate({
        name: form.name,
        type: form.type,
        extracted_fields: form.extractedFields,
        template_html: finalHtml,
      })

      if ('error' in result) { setError(result.error); return }

      onSuccess({
        id: result.id,
        clinic_id: '',
        name: form.name,
        type: form.type,
        file_url: null,
        extracted_fields: form.extractedFields,
        template_html: finalHtml,
        created_at: new Date().toISOString(),
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

          {/* ── Step: Visual Editor ── */}
          {step === 'editor' && (
            <div className="flex flex-col h-full">
              {/* Editor toolbar */}
              <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 flex-shrink-0">
                <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5">
                  <button
                    onClick={() => { setViewMode('visual'); setEditingHtml(false) }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      viewMode === 'visual' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />Visual
                  </button>
                  <button
                    onClick={() => setViewMode('fields')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      viewMode === 'fields' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Type className="w-3.5 h-3.5" />Campos
                  </button>
                </div>

                <div className="h-5 w-px bg-slate-300 mx-1" />

                {/* Watermark controls */}
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
                    <input
                      type="range"
                      min="5"
                      max="50"
                      value={watermarkOpacity}
                      onChange={e => setWatermarkOpacity(Number(e.target.value))}
                      className="w-16 h-1"
                      title={`Opacidade: ${watermarkOpacity}%`}
                    />
                  )}
                </div>

                <div className="flex-1" />

                {/* Edit HTML source */}
                {viewMode === 'visual' && (
                  <button
                    onClick={() => {
                      if (editingHtml) {
                        handleSaveHtmlSource()
                      } else {
                        setHtmlSource(form.templateHtml || '')
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

              {/* Editor content */}
              <div className="flex-1 overflow-auto px-4 py-4">
                {viewMode === 'visual' && !editingHtml && form.templateHtml && (
                  <HtmlPreview
                    html={form.templateHtml}
                    fields={form.extractedFields}
                    watermark={watermark}
                    watermarkOpacity={watermarkOpacity}
                  />
                )}

                {viewMode === 'visual' && editingHtml && (
                  <textarea
                    value={htmlSource}
                    onChange={e => setHtmlSource(e.target.value)}
                    className="w-full h-[500px] px-4 py-3 font-mono text-xs bg-slate-900 text-green-400 rounded-lg border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    spellCheck={false}
                  />
                )}

                {viewMode === 'visual' && !editingHtml && !form.templateHtml && (
                  <div className="text-center py-16">
                    <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">Nenhum layout HTML disponivel</p>
                    <p className="text-xs text-slate-400 mt-1">O documento sera gerado no formato padrao</p>
                  </div>
                )}

                {viewMode === 'fields' && (
                  <div className="space-y-2">
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
            <>
              {form.templateHtml && (
                <button
                  onClick={() => setStep('editor')}
                  className="px-4 py-2 rounded-lg border border-blue-600 text-blue-700 text-sm font-medium hover:bg-blue-50 flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />Editor Visual
                </button>
              )}
              <button
                onClick={handleSaveTemplate}
                disabled={loading || form.extractedFields.length === 0}
                className="flex-1 px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading && <Loader className="w-4 h-4 animate-spin" />}
                Confirmar e Salvar
              </button>
            </>
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
    </div>
  )
}
