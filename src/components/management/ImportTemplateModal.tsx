'use client'

import { useState, useRef } from 'react'
import { X, Upload, Plus, Trash2, Loader } from 'lucide-react'
import { saveTemplate } from '@/lib/actions/templates'
import type { DocumentTemplate, ExtractedField, FieldType, TemplateType } from '@/types'

interface ImportTemplateModalProps {
  onClose: () => void
  onSuccess: (template: DocumentTemplate) => void
}

type Step = 'upload' | 'review' | 'adding_field'

interface FormState {
  name: string
  type: TemplateType
  extractedFields: ExtractedField[]
}

const FIELD_TYPES: FieldType[] = ['text', 'number', 'date', 'select', 'boolean', 'textarea']

const TEMPLATE_TYPES: { value: TemplateType; label: string }[] = [
  { value: 'laudo', label: 'Laudo (Resultado de Exame)' },
  { value: 'receita', label: 'Receita (Prescrição Medicamentosa)' },
  { value: 'encaminhamento', label: 'Encaminhamento' },
  { value: 'termo', label: 'Termo Legal' },
  { value: 'exame', label: 'Solicitação de Exame' },
  { value: 'outro', label: 'Outro' },
]

export default function ImportTemplateModal({
  onClose,
  onSuccess,
}: ImportTemplateModalProps) {
  const [step, setStep] = useState<Step>('upload')
  const [form, setForm] = useState<FormState>({
    name: '',
    type: 'laudo',
    extractedFields: [],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<{ name: string; size: number } | null>(null)

  const [newField, setNewField] = useState<ExtractedField>({
    field_name: '',
    label: '',
    type: 'text',
    description: '',
    required: false,
  })

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Step 1: Upload e processamento
  const handleProcessTemplate = async () => {
    setError(null)
    if (!form.name.trim()) {
      setError('Preencha o nome do documento')
      return
    }

    setLoading(true)
    try {
      let response

      // Se tiver arquivo, usar endpoint com análise de documento
      if (selectedFile) {
        console.log('📄 Processando com arquivo real...')
        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('name', form.name)
        formData.append('type', form.type)

        response = await fetch('/api/process-template-with-file', {
          method: 'POST',
          body: formData,
        })
      } else {
        // Sem arquivo, usar geração baseada em nome/tipo
        console.log('🏷️ Processando com nome/tipo apenas...')
        response = await fetch('/api/process-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            type: form.type,
          }),
        })
      }

      if (!response.ok) {
        const data = await response.json()
        const errorMessage = data.error || `Erro HTTP ${response.status}: ao processar template`
        console.error('Erro da API:', { status: response.status, error: errorMessage })
        throw new Error(errorMessage)
      }

      const data = await response.json()
      if (!data.fields) {
        throw new Error('Resposta da API inválida: nenhum campo retornado')
      }
      setForm((prev) => ({
        ...prev,
        extractedFields: data.fields,
      }))
      setStep('review')
      // Limpar arquivo após processamento bem-sucedido
      setSelectedFile(null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido ao processar template'
      console.error('Erro completo:', err)
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Editar campos
  const handleToggleRequired = (index: number) => {
    const newFields = [...form.extractedFields]
    newFields[index].required = !newFields[index].required
    setForm((prev) => ({ ...prev, extractedFields: newFields }))
  }

  const handleDeleteField = (index: number) => {
    const newFields = form.extractedFields.filter((_, i) => i !== index)
    setForm((prev) => ({ ...prev, extractedFields: newFields }))
  }

  const handleAddField = () => {
    if (!newField.field_name || !newField.label || !newField.description) {
      setError('Preencha todos os campos do novo field')
      return
    }

    // Gerar field_name automático se vazio
    const fieldName = newField.field_name
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')

    setForm((prev) => ({
      ...prev,
      extractedFields: [
        ...prev.extractedFields,
        {
          ...newField,
          field_name: fieldName,
        },
      ],
    }))

    setNewField({
      field_name: '',
      label: '',
      type: 'text',
      description: '',
      required: false,
    })
    setStep('review')
    setError(null)
  }

  const handleSaveTemplate = async () => {
    setError(null)

    if (form.extractedFields.length === 0) {
      setError('Adicione pelo menos um campo ao template')
      return
    }

    // Limpar arquivo após salvar
    setSelectedFile(null)
    setFilePreview(null)

    setLoading(true)
    try {
      const result = await saveTemplate({
        name: form.name,
        type: form.type,
        extracted_fields: form.extractedFields,
      })

      if ('error' in result) {
        setError(result.error)
        return
      }

      // Mock template retornado para onSuccess
      // (Na prática, poderíamos fazer um fetch adicional para pegar o template completo)
      const newTemplate: DocumentTemplate = {
        id: result.id,
        clinic_id: '', // Será preenchido no servidor
        name: form.name,
        type: form.type,
        file_url: null,
        extracted_fields: form.extractedFields,
        created_at: new Date().toISOString(),
      }

      onSuccess(newTemplate)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar template')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 flex-shrink-0 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {step === 'upload'
              ? 'Importar Novo Modelo'
              : step === 'review'
              ? 'Revisar Campos'
              : 'Adicionar Campo'}
          </h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-lg p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Nome do Documento
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Laudo de Ultrassom"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-900 mb-2">
                  Tipo de Documento
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as TemplateType }))}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TEMPLATE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dropzone */}
              <div
                onDragEnter={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  setDragging(false)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  // Arquivo arrastado - neste sprint, apenas confirmamos o processamento
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                  dragging
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50'
                }`}
              >
                <Upload className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-900">
                  Clique para selecionar ou arraste um arquivo
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  PDF, DOCX, PNG, JPG
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setSelectedFile(file)
                      setFilePreview({
                        name: file.name,
                        size: file.size,
                      })
                      setError(null)
                    }
                  }}
                />
              </div>

              {/* Arquivo Importado com Sucesso */}
              {filePreview && (
                <div className="p-4 rounded-lg bg-green-50 border border-green-200 flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-200 flex-shrink-0">
                    <svg
                      className="w-5 h-5 text-green-700"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-green-900">Arquivo Importado com Sucesso</h4>
                    <p className="text-sm text-green-700 mt-1">
                      <span className="font-mono">{filePreview.name}</span>
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      {(filePreview.size / 1024).toFixed(2)} KB • Tipo: <span className="font-medium">{form.type}</span>
                    </p>
                    <p className="text-xs text-green-700 font-medium mt-2">
                      👇 Clique "Processar com IA" para continuar
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Review */}
          {step === 'review' && (
            <div className="space-y-5">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-sm text-blue-900">
                  <span className="font-semibold">{form.extractedFields.length} campos</span> detectados pela IA.
                  {selectedFile && (
                    <>
                      <br />
                      <span className="text-xs text-blue-700">📄 Arquivo: {selectedFile.name}</span>
                    </>
                  )}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Campos Detectados</h3>
                {form.extractedFields.length > 0 ? (
                  <div className="space-y-2">
                    {form.extractedFields.map((field, idx) => (
                      <div
                        key={`${field.field_name}-${idx}`}
                        className="p-3 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-slate-900">{field.label}</span>
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                {field.type}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleRequired(idx)}
                                className={`text-xs px-2 py-0.5 rounded cursor-pointer transition-colors ${
                                  field.required
                                    ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                    : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                                }`}
                              >
                                {field.required ? 'Obrigatório' : 'Opcional'}
                              </button>
                            </div>
                            <p className="text-sm text-slate-600">{field.description}</p>
                            <p className="text-xs text-slate-500 mt-1">
                              Field: <code className="font-mono">{field.field_name}</code>
                            </p>
                          </div>

                          <button
                            onClick={() => handleDeleteField(idx)}
                            className="flex-shrink-0 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">Nenhum campo detectado ainda</p>
                )}
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <button
                onClick={() => setStep('adding_field')}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-slate-300 text-slate-600 hover:border-blue-500 hover:text-blue-600 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Adicionar Campo Manual
              </button>
            </div>
          )}

          {/* Step 3: Adding Field */}
          {step === 'adding_field' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-900">Novo Campo</h3>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Label (Exibido para usuário)
                </label>
                <input
                  type="text"
                  value={newField.label}
                  onChange={(e) => setNewField((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="Ex: Diagnóstico Presuntivo"
                  className="w-full px-3 py-2 rounded border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Field Name (Auto-gerado de Label)
                </label>
                <input
                  type="text"
                  value={newField.field_name}
                  onChange={(e) => setNewField((prev) => ({ ...prev, field_name: e.target.value }))}
                  placeholder="diagnostico_presuntivo"
                  className="w-full px-3 py-2 rounded border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Tipo de Campo
                </label>
                <select
                  value={newField.type}
                  onChange={(e) => setNewField((prev) => ({ ...prev, type: e.target.value as FieldType }))}
                  className="w-full px-3 py-2 rounded border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Descrição (Para IA extrair)
                </label>
                <textarea
                  value={newField.description}
                  onChange={(e) => setNewField((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Ex: Resumo da suspeita clínica"
                  className="w-full px-3 py-2 rounded border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={2}
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newField.required}
                  onChange={(e) => setNewField((prev) => ({ ...prev, required: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm text-slate-700">Obrigatório</span>
              </label>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
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
            className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
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
              {loading ? (selectedFile ? '🔍 Analisando documento...' : '⏳ Gerando campos...') : 'Processar com IA'}
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
                onClick={() => setStep('review')}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
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
        </div>
      </div>
    </div>
  )
}
