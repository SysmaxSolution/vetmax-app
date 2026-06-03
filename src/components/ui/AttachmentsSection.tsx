'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Paperclip, Upload, Trash2, FileText, Image, ExternalLink,
  Loader2, X, Pencil, Save, Calendar, StickyNote, Tag,
} from 'lucide-react'
import {
  uploadAttachment, deleteAttachment, updateAttachmentMetadata,
} from '@/lib/actions/attachments'
import type { Attachment, AttachmentMetadata } from '@/lib/actions/attachments'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function formatManualDate(yyyyMmDd: string): string {
  // DATE do Postgres vira "YYYY-MM-DD" — montar Date local evita off-by-one por timezone
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  if (!y || !m || !d) return yyyyMmDd
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

const ALLOWED_TYPES = [
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
]

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  patientId:           string
  consultationId?:     string
  initialAttachments?: Attachment[]
  /** Quando um PDF é gerado por DocumentsSection, o pai passa o novo anexo aqui para atualizar a lista sem re-fetch. */
  newAttachment?:      Attachment | null
}

type StagedFile = {
  file:          File
  title:         string
  document_date: string
  notes:         string
}

export default function AttachmentsSection({ patientId, consultationId, initialAttachments = [], newAttachment }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments)

  // Prepend attachment gerado externamente (PDF de DocumentsSection) sem re-fetch
  useEffect(() => {
    if (!newAttachment) return
    setAttachments(prev =>
      prev.some(a => a.id === newAttachment.id) ? prev : [newAttachment, ...prev]
    )
  }, [newAttachment])

  const [isDragging,  setIsDragging]  = useState(false)
  const [uploading,   setUploading]   = useState(false)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [staged,      setStaged]      = useState<StagedFile | null>(null)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editForm,    setEditForm]    = useState<AttachmentMetadata>({})
  const [savingEdit,  setSavingEdit]  = useState(false)
  const fileInputRef  = useRef<HTMLInputElement>(null)

  // ─── Selecionar arquivo → área de staging ──────────────────────────────────

  const stageFile = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]

    setError(null)

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Tipo não permitido. Use imagens (JPEG, PNG, GIF, WebP) ou PDF.')
      return
    }
    if (file.size > 52_428_800) {
      setError('Arquivo deve ter menos de 50 MB.')
      return
    }

    setStaged({ file, title: '', document_date: '', notes: '' })
  }, [])

  // ─── Upload (com metadata opcional) ────────────────────────────────────────

  async function confirmUpload() {
    if (!staged) return

    const formData = new FormData()
    formData.append('file', staged.file)

    setUploading(true)
    const result = await uploadAttachment(formData, patientId, consultationId, {
      title:         staged.title,
      document_date: staged.document_date || null,
      notes:         staged.notes,
    })
    setUploading(false)

    if ('error' in result) {
      setError(result.error)
      return
    }

    setAttachments(prev => [result, ...prev])
    setStaged(null)
  }

  // ─── Drag & Drop ───────────────────────────────────────────────────────────

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    stageFile(e.dataTransfer.files)
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este anexo?')) return
    setDeletingId(id)
    const result = await deleteAttachment(id)
    setDeletingId(null)

    if ('error' in result) {
      setError(result.error)
      return
    }

    setAttachments(prev => prev.filter(a => a.id !== id))
  }

  // ─── Editar metadados ──────────────────────────────────────────────────────

  function startEdit(a: Attachment) {
    setEditingId(a.id)
    setEditForm({
      title:         a.title ?? '',
      document_date: a.document_date ?? '',
      notes:         a.notes ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm({})
  }

  async function saveEdit(id: string) {
    setSavingEdit(true)
    const result = await updateAttachmentMetadata(id, {
      title:         editForm.title,
      document_date: editForm.document_date || null,
      notes:         editForm.notes,
    })
    setSavingEdit(false)

    if ('error' in result) {
      setError(result.error)
      return
    }

    setAttachments(prev => prev.map(a => a.id === id ? {
      ...a,
      title:         (editForm.title?.trim() || null),
      document_date: (editForm.document_date || null),
      notes:         (editForm.notes?.trim() || null),
    } : a))
    setEditingId(null)
    setEditForm({})
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      {/* Header */}
      <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
          <Paperclip className="h-4 w-4 text-slate-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-slate-900">Anexos</h2>
          <p className="text-xs text-slate-500">Imagens, laudos externos e PDFs</p>
        </div>
        <span className="text-xs text-slate-400 font-medium">{attachments.length} arquivo{attachments.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="p-6 space-y-4">
        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="flex-shrink-0 text-red-400 hover:text-red-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Staging — arquivo selecionado, esperando metadata + confirmação */}
        {staged && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
            <div className="flex items-center gap-3">
              {staged.file.type.startsWith('image/') ? (
                <Image className="h-5 w-5 text-blue-500" />
              ) : (
                <FileText className="h-5 w-5 text-rose-500" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{staged.file.name}</p>
                <p className="text-xs text-slate-500">{(staged.file.size / 1024).toFixed(0)} KB · pronto para enviar</p>
              </div>
              <button
                type="button"
                onClick={() => setStaged(null)}
                disabled={uploading}
                className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                title="Cancelar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Detalhes (opcionais)</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                  <Tag className="h-3 w-3" /> Título
                </span>
                <input
                  type="text"
                  value={staged.title}
                  onChange={e => setStaged({ ...staged, title: e.target.value })}
                  placeholder="ex.: Receita Domperidona"
                  disabled={uploading}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none disabled:bg-slate-50"
                />
              </label>
              <label className="block">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                  <Calendar className="h-3 w-3" /> Data do documento
                </span>
                <input
                  type="date"
                  value={staged.document_date}
                  onChange={e => setStaged({ ...staged, document_date: e.target.value })}
                  disabled={uploading}
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none disabled:bg-slate-50"
                />
              </label>
            </div>

            <label className="block">
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                <StickyNote className="h-3 w-3" /> Observação
              </span>
              <textarea
                value={staged.notes}
                onChange={e => setStaged({ ...staged, notes: e.target.value })}
                rows={2}
                placeholder="Notas livres sobre o documento..."
                disabled={uploading}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none disabled:bg-slate-50 resize-none"
              />
            </label>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStaged(null)}
                disabled={uploading}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmUpload}
                disabled={uploading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...</>
                  : <><Upload className="h-3.5 w-3.5" /> Enviar anexo</>
                }
              </button>
            </div>
          </div>
        )}

        {/* Drop zone — só aparece quando NÃO há arquivo em staging */}
        {!staged && (
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 cursor-pointer transition-colors ${
              isDragging
                ? 'border-blue-400 bg-blue-50'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_TYPES.join(',')}
              className="sr-only"
              onChange={e => { stageFile(e.target.files); if (fileInputRef.current) fileInputRef.current.value = '' }}
            />
            <Upload className={`h-6 w-6 ${isDragging ? 'text-blue-500' : 'text-slate-400'}`} />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">
                {isDragging ? 'Solte para selecionar' : 'Arraste ou clique para anexar'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">JPEG, PNG, GIF, WebP, PDF · máx. 50 MB</p>
            </div>
          </div>
        )}

        {/* Files list */}
        {attachments.length > 0 && (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
            {attachments.map(a => {
              const isEditing = editingId === a.id
              const hasMeta = !!(a.title || a.document_date || a.notes)
              const headline = a.title?.trim() || a.file_name

              return (
                <div key={a.id} className="px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 pt-0.5">
                      {a.file_type.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.signed_url}
                          alt={a.file_name}
                          className="h-10 w-10 rounded-lg object-cover border border-slate-200"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center">
                          <FileText className="h-5 w-5 text-rose-500" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{headline}</p>
                      {a.title && a.title.trim() && (
                        <p className="text-xs text-slate-400 truncate">{a.file_name}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs">
                        {a.document_date && (
                          <span className="inline-flex items-center gap-1 text-slate-500">
                            <Calendar className="h-3 w-3" /> {formatManualDate(a.document_date)}
                          </span>
                        )}
                        <span className="text-slate-400">Enviado em {formatDate(a.created_at)}</span>
                      </div>
                      {a.notes && a.notes.trim() && (
                        <p className="text-xs text-slate-600 mt-1 italic">"{a.notes}"</p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <a
                        href={a.signed_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Abrir"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        onClick={() => isEditing ? cancelEdit() : startEdit(a)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isEditing
                            ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                            : `${hasMeta ? 'text-slate-500' : 'text-slate-400'} hover:text-blue-600 hover:bg-blue-50`
                        }`}
                        title={isEditing ? 'Cancelar edição' : (hasMeta ? 'Editar detalhes' : 'Adicionar detalhes')}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        disabled={deletingId === a.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        title="Excluir"
                      >
                        {deletingId === a.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />
                        }
                      </button>
                    </div>
                  </div>

                  {/* Formulário inline de edição */}
                  {isEditing && (
                    <div className="mt-3 ml-13 rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-[11px] font-medium text-slate-600">Título</span>
                          <input
                            type="text"
                            value={editForm.title ?? ''}
                            onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                            disabled={savingEdit}
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none disabled:bg-slate-50"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] font-medium text-slate-600">Data do documento</span>
                          <input
                            type="date"
                            value={editForm.document_date ?? ''}
                            onChange={e => setEditForm({ ...editForm, document_date: e.target.value })}
                            disabled={savingEdit}
                            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none disabled:bg-slate-50"
                          />
                        </label>
                      </div>
                      <label className="block">
                        <span className="text-[11px] font-medium text-slate-600">Observação</span>
                        <textarea
                          value={editForm.notes ?? ''}
                          onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                          rows={2}
                          disabled={savingEdit}
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none disabled:bg-slate-50 resize-none"
                        />
                      </label>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={savingEdit}
                          className="rounded-md px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEdit(a.id)}
                          disabled={savingEdit}
                          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {savingEdit
                            ? <><Loader2 className="h-3 w-3 animate-spin" /> Salvando</>
                            : <><Save className="h-3 w-3" /> Salvar</>
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

        {attachments.length === 0 && !staged && !uploading && (
          <p className="text-center text-xs text-slate-400">Nenhum arquivo anexado a esta consulta</p>
        )}
      </div>
    </div>
  )
}
