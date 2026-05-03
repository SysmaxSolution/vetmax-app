'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Paperclip, Upload, Trash2, FileText, Image, ExternalLink, Loader2, X } from 'lucide-react'
import { uploadAttachment, deleteAttachment } from '@/lib/actions/attachments'
import type { Attachment } from '@/lib/actions/attachments'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileIcon(fileType: string) {
  if (fileType.startsWith('image/')) return <Image className="h-4 w-4 text-blue-500" />
  return <FileText className="h-4 w-4 text-rose-500" />
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
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
  const fileInputRef  = useRef<HTMLInputElement>(null)

  // ─── Upload ────────────────────────────────────────────────────────────────

  const handleFiles = useCallback(async (files: FileList | null) => {
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

    const formData = new FormData()
    formData.append('file', file)

    setUploading(true)
    const result = await uploadAttachment(formData, patientId, consultationId)
    setUploading(false)

    if ('error' in result) {
      setError(result.error)
      return
    }

    setAttachments(prev => [result, ...prev])
  }, [patientId, consultationId])

  // ─── Drag & Drop ───────────────────────────────────────────────────────────

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  // ─── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    const result = await deleteAttachment(id)
    setDeletingId(null)

    if ('error' in result) {
      setError(result.error)
      return
    }

    setAttachments(prev => prev.filter(a => a.id !== id))
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

        {/* Drop zone */}
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
            onChange={e => handleFiles(e.target.files)}
          />

          {uploading ? (
            <>
              <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
              <p className="text-sm text-slate-500">Enviando arquivo...</p>
            </>
          ) : (
            <>
              <Upload className={`h-6 w-6 ${isDragging ? 'text-blue-500' : 'text-slate-400'}`} />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">
                  {isDragging ? 'Solte para enviar' : 'Arraste ou clique para anexar'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">JPEG, PNG, GIF, WebP, PDF · máx. 50 MB</p>
              </div>
            </>
          )}
        </div>

        {/* Files list */}
        {attachments.length > 0 && (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
            {attachments.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex-shrink-0">
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
                  <p className="text-sm font-medium text-slate-800 truncate">{a.file_name}</p>
                  <p className="text-xs text-slate-400">{formatDate(a.created_at)}</p>
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
            ))}
          </div>
        )}

        {attachments.length === 0 && !uploading && (
          <p className="text-center text-xs text-slate-400">Nenhum arquivo anexado a esta consulta</p>
        )}
      </div>
    </div>
  )
}
