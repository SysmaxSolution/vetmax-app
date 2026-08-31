'use client'

// Numeração configurável de documentos (Sprint Animais, Fase 0, peça 0.9).
// Mantém a numeração atual da clínica (o usuário informa o próximo número) e
// permite prefixo + zero-fill por tipo de documento e por empresa faturante.

import { useState, useEffect } from 'react'
import { Loader2, Plus, Pencil, Hash, Check, X } from 'lucide-react'
import {
  listDocumentSequences, upsertDocumentSequence, listCompaniesLite,
  DOC_TYPES, type DocumentSequence, type CompanyLite,
} from '@/lib/actions/document-numbering'
import { Toast } from '@/components/ui/toast'

interface Props { userRole?: string }

interface Draft {
  id?: string
  company_id: string
  doc_type: string
  prefix: string
  next_number: string
  padding: string
  is_active: boolean
}

function preview(prefix: string, next: string, padding: string): string {
  const n = Math.trunc(Number(next))
  if (!Number.isFinite(n) || n < 1) return '—'
  const pad = Math.max(Math.trunc(Number(padding)) || 0, String(n).length)
  return `${prefix}${String(n).padStart(pad, '0')}`
}

function docLabel(key: string): string {
  return DOC_TYPES.find(d => d.key === key)?.label ?? key
}

export default function DocumentNumberingTab({ userRole = 'admin' }: Props) {
  const canManage = ['admin', 'owner', 'manager'].includes(userRole)

  const [sequences, setSequences] = useState<DocumentSequence[]>([])
  const [companies, setCompanies] = useState<CompanyLite[]>([])
  const [loading, setLoading]     = useState(true)
  const [busy, setBusy]           = useState(false)
  const [draft, setDraft]         = useState<Draft | null>(null)
  const [toast, setToast]         = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  async function reload() {
    const [s, c] = await Promise.all([listDocumentSequences(), listCompaniesLite()])
    if (!('error' in s)) setSequences(s)
    setCompanies(c)
    setLoading(false)
  }
  useEffect(() => { void reload() }, [])

  function newDraft() {
    setDraft({ company_id: '', doc_type: 'os', prefix: '', next_number: '1', padding: '0', is_active: true })
  }
  function editDraft(s: DocumentSequence) {
    setDraft({
      id: s.id, company_id: s.company_id ?? '', doc_type: s.doc_type,
      prefix: s.prefix, next_number: String(s.next_number), padding: String(s.padding), is_active: s.is_active,
    })
  }

  async function saveDraft() {
    if (!draft) return
    setBusy(true)
    const res = await upsertDocumentSequence({
      id: draft.id,
      company_id: draft.company_id || null,
      doc_type: draft.doc_type,
      prefix: draft.prefix,
      next_number: Number(draft.next_number),
      padding: Number(draft.padding),
      is_active: draft.is_active,
    })
    setBusy(false)
    if ('error' in res) { setToast({ type: 'error', message: res.error }); return }
    setToast({ type: 'success', message: 'Numeração salva!' })
    setDraft(null)
    void reload()
  }

  const companyLabel = (id: string | null) =>
    id ? (companies.find(c => c.id === id)?.name ?? 'Empresa') : 'Geral (grupo)'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <>
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Mantém a sua numeração atual — informe o próximo número a emitir. Prefixo e zero-fill são opcionais.
        </p>
        {canManage && !draft && (
          <button
            type="button"
            onClick={newDraft}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors shadow-sm flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
            Nova numeração
          </button>
        )}
      </div>

      {/* Draft (criar/editar) */}
      {draft && (
        <div className="mb-4 rounded-xl border-2 border-teal-300 bg-teal-50/40 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Empresa faturante</label>
              <select
                value={draft.company_id}
                onChange={e => setDraft({ ...draft, company_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="">Geral (grupo)</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Tipo de documento</label>
              <select
                value={draft.doc_type}
                onChange={e => setDraft({ ...draft, doc_type: e.target.value })}
                disabled={!!draft.id}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-100"
              >
                {DOC_TYPES.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Prefixo</label>
              <input
                type="text"
                value={draft.prefix}
                onChange={e => setDraft({ ...draft, prefix: e.target.value })}
                placeholder="ex.: OS-"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Próximo número</label>
              <input
                type="number"
                min="1"
                step="1"
                value={draft.next_number}
                onChange={e => setDraft({ ...draft, next_number: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Dígitos (zero-fill)</label>
              <input
                type="number"
                min="0"
                max="20"
                step="1"
                value={draft.padding}
                onChange={e => setDraft({ ...draft, padding: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={e => setDraft({ ...draft, is_active: e.target.checked })}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Ativa
            </label>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Próxima a emitir: <strong className="text-teal-700 font-mono">{preview(draft.prefix, draft.next_number, draft.padding)}</strong>
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setDraft(null)}
                className="rounded-lg p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <X className="h-4 w-4" />
              </button>
              <button type="button" onClick={saveDraft} disabled={busy}
                className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {sequences.length === 0 && !draft ? (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl border border-dashed border-slate-300 bg-white">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <Hash className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-500">Nenhuma numeração configurada</p>
          <p className="mt-1 text-xs text-slate-400">Configure o próximo número de OS, RPS, NFS-e…</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sequences.map(s => (
            <div
              key={s.id}
              className={`flex items-center gap-4 rounded-xl border bg-white px-4 sm:px-5 py-3 transition-all ${
                s.is_active ? 'border-slate-200 hover:border-slate-300' : 'border-slate-200 bg-slate-50/50 opacity-70'
              }`}
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                <Hash className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-900 truncate">{docLabel(s.doc_type)}</p>
                  <span className="text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 font-medium">{companyLabel(s.company_id)}</span>
                  {!s.is_active && <span className="text-xs rounded-full bg-slate-200 text-slate-600 px-2 py-0.5 font-medium">Inativa</span>}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Próxima: <span className="font-mono font-semibold text-slate-700">{preview(s.prefix, String(s.next_number), String(s.padding))}</span>
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => editDraft(s)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
