'use client'

import { useState, useEffect, useTransition } from 'react'
import { X, Plus, Trash2, MessageSquare, ChevronDown } from 'lucide-react'
import {
  getQuickReplies,
  createQuickReply,
  deleteQuickReply,
  type QuickReply,
} from '@/lib/actions/whatsapp-quick-replies'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  clinicId: string
  isOpen: boolean
  onSelect: (body: string) => void
  onClose: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByCategory(replies: QuickReply[]): Map<string, QuickReply[]> {
  const map = new Map<string, QuickReply[]>()
  for (const r of replies) {
    const key = r.category ?? 'Geral'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  return map
}

function truncate(str: string, len = 60): string {
  return str.length > len ? str.slice(0, len) + '…' : str
}

// ─── New Reply Form ───────────────────────────────────────────────────────────

interface NewReplyFormProps {
  onCreated: (r: QuickReply) => void
  onCancel: () => void
}

function NewReplyForm({ onCreated, onCancel }: NewReplyFormProps) {
  const [category, setCategory] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) {
      setError('Título e corpo são obrigatórios.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await createQuickReply({
        category: category.trim() || undefined,
        title: title.trim(),
        body: body.trim(),
      })
      if ('error' in res) {
        setError(res.error)
        return
      }
      onCreated({
        id: res.id,
        clinic_id: '',
        category: category.trim() || null,
        title: title.trim(),
        body: body.trim(),
        sort_order: 0,
        created_at: new Date().toISOString(),
      })
    })
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-slate-100 mt-1 pt-3 px-3 pb-3 space-y-2">
      <p className="text-xs font-semibold text-slate-600">Nova Resposta Rápida</p>
      <input
        type="text"
        placeholder="Categoria (ex: Agendamento)"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
      />
      <input
        type="text"
        placeholder="Título *"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
        required
      />
      <textarea
        placeholder="Corpo da mensagem *"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-400 resize-none"
        required
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 text-xs bg-teal-600 text-white rounded-lg py-1.5 hover:bg-teal-700 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 text-xs border border-slate-200 rounded-lg py-1.5 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function QuickRepliesPanel({ clinicId, isOpen, onSelect, onClose }: Props) {
  const [replies, setReplies] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    getQuickReplies().then((res) => {
      setLoading(false)
      if (!Array.isArray(res)) return
      setReplies(res)
      // open all categories by default
      const cats = new Set(res.map((r) => r.category ?? 'Geral'))
      setOpenCategories(cats)
    })
  }, [isOpen])

  if (!isOpen) return null

  const grouped = groupByCategory(replies)

  function toggleCategory(cat: string) {
    setOpenCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  function handleSelect(body: string) {
    onSelect(body)
    onClose()
  }

  function handleDelete(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      const res = await deleteQuickReply(id)
      setDeletingId(null)
      if (!('error' in res)) {
        setReplies((prev) => prev.filter((r) => r.id !== id))
      }
    })
  }

  function handleCreated(r: QuickReply) {
    setReplies((prev) => [...prev, r])
    setShowNewForm(false)
    const cat = r.category ?? 'Geral'
    setOpenCategories((prev) => new Set([...prev, cat]))
  }

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-30 bg-white border border-slate-200 rounded-t-xl shadow-lg flex flex-col"
      style={{ maxHeight: 320 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-1.5">
          <MessageSquare size={14} className="text-teal-600" />
          <span className="text-sm font-semibold text-slate-700">Respostas Rápidas</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowNewForm((v) => !v)}
            className="text-teal-600 hover:text-teal-800 transition-colors p-1 rounded hover:bg-teal-50"
            aria-label="Nova resposta rápida"
            title="Nova resposta rápida"
          >
            <Plus size={15} />
          </button>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded hover:bg-slate-50"
            aria-label="Fechar"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Scrollable list */}
      <div className="overflow-y-auto flex-1 pb-1">
        {loading ? (
          <div className="flex flex-col gap-2 p-3 animate-pulse">
            <div className="h-3 bg-slate-100 rounded w-1/3" />
            <div className="h-8 bg-slate-50 rounded" />
            <div className="h-8 bg-slate-50 rounded" />
          </div>
        ) : replies.length === 0 && !showNewForm ? (
          <div className="flex flex-col items-center gap-2 py-6 px-4 text-center">
            <MessageSquare size={24} className="text-slate-300" />
            <p className="text-xs text-slate-400">
              Nenhuma resposta rápida. Clique em <strong>+</strong> para criar.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {Array.from(grouped.entries()).map(([cat, items]) => (
              <div key={cat}>
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide hover:bg-slate-50 transition-colors"
                >
                  {cat}
                  <ChevronDown
                    size={12}
                    className={`transition-transform ${openCategories.has(cat) ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Items */}
                {openCategories.has(cat) && (
                  <ul>
                    {items.map((r) => (
                      <li
                        key={r.id}
                        className="group flex items-start gap-2 px-3 py-2 hover:bg-slate-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700 truncate">{r.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                            {truncate(r.body)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 mt-0.5">
                          <button
                            onClick={() => handleDelete(r.id)}
                            disabled={deletingId === r.id}
                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all disabled:opacity-30"
                            aria-label={`Deletar "${r.title}"`}
                            title="Deletar"
                          >
                            <Trash2 size={13} />
                          </button>
                          <button
                            onClick={() => handleSelect(r.body)}
                            className="text-xs bg-teal-50 text-teal-700 hover:bg-teal-100 font-medium px-2 py-0.5 rounded transition-colors whitespace-nowrap"
                          >
                            Usar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {/* New form */}
        {showNewForm && (
          <NewReplyForm
            onCreated={handleCreated}
            onCancel={() => setShowNewForm(false)}
          />
        )}
      </div>
    </div>
  )
}
