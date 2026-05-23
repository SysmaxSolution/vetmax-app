'use client'

/**
 * CanvasDocumentDraftModal — modal de geração de documento Canvas Visual
 * dentro do consultório.
 *
 * Substitui o redirect para /dashboard/laudos/novo. Mantém o vet no fluxo
 * da consulta: form lateral (fillable_fields preenchidos pela IA / faltantes)
 * + preview ao vivo do canvas_state com dados reais + 3 botões finais
 * (Salvar / Visualizar / Salvar e Imprimir).
 *
 * Documentos salvos ficam anexados à consultation_id — aparecem na lista
 * "Documentos e Prescrições" do DocumentsSection e podem ser enviados
 * via WhatsApp ao finalizar o atendimento.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  AlertCircle, Download, Eye, Loader2, Pencil, Printer, Save, Sparkles, X,
} from 'lucide-react'
import {
  createCanvaPatientDocument, updateCanvaPatientDocument,
} from '@/lib/actions/canva-templates'
import type { CanvasDraftResult } from '@/lib/actions/canva-templates'
import CanvasStage from '@/components/canva/editor/CanvasStage'
import { getAllPages } from '@/lib/canva/canvas-state'
import type {
  CanvaContentJson, CanvaDynamicField,
} from '@/lib/canva/types'
import CanvasStructuredDataAccordion from '@/components/vet/CanvasStructuredDataAccordion'
import type { ResolveContext } from '@/lib/canva/dynamic-tags'

interface Props {
  draft: CanvasDraftResult
  consultationId: string
  patientId: string
  /** Quando presente, modal opera em MODO EDIÇÃO: persist chama
   *  updateCanvaPatientDocument no documento existente em vez de criar
   *  um novo. Usado ao reabrir docs já salvos pela lista do consultório. */
  documentId?: string
  /** Nome original do doc (modo edição). Preenche o input "Nome do
   *  documento" pra preservar o nome anterior por padrão. */
  initialDocumentName?: string
  onClose: () => void
  /** Recebe o id do patient_document (novo ou atualizado) pra atualizar
   *  a lista. Em modo edição o id é o mesmo do documentId recebido. */
  onSaved: (docId: string, documentName: string) => void
}

export default function CanvasDocumentDraftModal({
  draft, consultationId, patientId, documentId, initialDocumentName, onClose, onSaved,
}: Props) {
  const isEdit = !!documentId
  const [docName, setDocName] = useState(
    initialDocumentName ?? `${draft.template_name} — ${draft.patient_header.patient_name ?? 'Pet'}`,
  )
  const [fillableValues, setFillableValues] = useState<Record<string, string>>(
    () => ({ ...draft.fillable_values }),
  )
  const [aiFilled, setAiFilled] = useState<Set<string>>(() => new Set(draft.filled_keys))
  // ── Bloco 3 / 2.5 — overrides do side panel (Dados Estruturados) ────────
  // Path no ResolveContext → valor digitado pelo vet. Sobrescreve sem mutar
  // o resolveContext original (preserva sincronia com server-side).
  const [structuredOverrides, setStructuredOverrides] = useState<Record<string, string>>({})
  const [observacoes, setObservacoes] = useState('')
  const [dynamicFields, setDynamicFields] = useState<CanvaDynamicField[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()

  const fillableElements = draft.fillable_definitions

  const content: CanvaContentJson = useMemo(() => ({
    static_fields: {
      observacoes: observacoes.trim(),
    },
    dynamic_fields: dynamicFields,
    fillable_fields: fillableValues,
  }), [observacoes, dynamicFields, fillableValues])

  function getMissingRequired() {
    return fillableElements.filter(f => {
      if (!f.required) return false
      const v = fillableValues[f.fieldKey]
      return !v || v.trim() === ''
    })
  }

  /** Persiste o documento. Retorna o id criado ou null se houver erro. */
  async function persist(): Promise<string | null> {
    setError(null)
    const missing = getMissingRequired()
    if (missing.length > 0) {
      setError(
        `Campos obrigatórios não preenchidos: ${missing
          .map(f => f.label.replace(/:\s*$/, '').trim())
          .join(', ')}.`,
      )
      return null
    }
    try {
      if (isEdit) {
        const { id } = await updateCanvaPatientDocument({
          document_id: documentId!,
          document_name: docName.trim() || draft.template_name,
          content_json: content,
        })
        return id
      }
      const { id } = await createCanvaPatientDocument({
        template_id: draft.template_id,
        patient_id: patientId,
        consultation_id: consultationId,
        document_name: docName.trim() || draft.template_name,
        content_json: content,
      })
      return id
    } catch (e: any) {
      setError(e?.message ?? 'falha ao salvar')
      return null
    }
  }

  function doSave() {
    startSave(async () => {
      const id = await persist()
      if (!id) return
      onSaved(id, docName.trim() || draft.template_name)
      onClose()
    })
  }

  function doView() {
    startSave(async () => {
      const id = await persist()
      if (!id) return
      window.open(`/dashboard/laudos/${id}/print`, '_blank', 'noopener,noreferrer')
      onSaved(id, docName.trim() || draft.template_name)
      // Não fecha — vet pode continuar editando o próximo doc ou conferir
    })
  }

  function doSaveAndPrint() {
    startSave(async () => {
      const id = await persist()
      if (!id) return
      window.open(`/dashboard/laudos/${id}/print?auto=1`, '_blank', 'noopener,noreferrer')
      onSaved(id, docName.trim() || draft.template_name)
      onClose()
    })
  }

  /**
   * Atualiza um override do painel de Dados Estruturados. Edição granular —
   * só a chave específica muda no Map; o useMemo do enrichedContext só
   * re-resolve elementos do canvas que referenciam aquele path.
   */
  function setStructuredOverride(path: string, value: string) {
    setStructuredOverrides(prev => {
      const next = { ...prev }
      if (value === '') delete next[path]
      else next[path] = value
      return next
    })
  }

  /**
   * Deep-merge dos overrides no resolveContext sem mutar o original.
   * Os paths usam dot-notation (ex.: 'consultation.weight').
   */
  const enrichedContext = useMemo<ResolveContext>(() => {
    const base = draft.resolve_context ?? {}
    const keys = Object.keys(structuredOverrides)
    if (keys.length === 0) return base
    // Clone seletivo apenas dos branches tocados pelos overrides.
    const next: Record<string, Record<string, unknown>> = {
      tutor:        { ...(base.tutor ?? {}) },
      patient:      { ...(base.patient ?? {}) },
      consultation: { ...(base.consultation ?? {}) },
      clinic:       { ...(base.clinic ?? {}) },
      vet:          { ...(base.vet ?? {}) },
    }
    for (const path of keys) {
      const [root, leaf] = path.split('.')
      if (!root || !leaf) continue
      if (!(root in next)) continue
      next[root][leaf] = structuredOverrides[path]
    }
    return next as ResolveContext
  }, [draft.resolve_context, structuredOverrides])

  function setFillable(key: string, value: string) {
    setFillableValues(prev => ({ ...prev, [key]: value }))
    if (aiFilled.has(key)) {
      setAiFilled(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  // ESC fecha
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-slate-900/40 backdrop-blur-sm">
      <div className="m-auto flex h-[96vh] w-[min(1480px,98vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {isEdit
              ? <Pencil className="w-5 h-5 text-blue-600 flex-shrink-0" />
              : <Sparkles className="w-5 h-5 text-violet-600 flex-shrink-0" />}
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 truncate">
                {isEdit ? `Editando ${draft.template_type}` : `Novo ${draft.template_type}`}
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {draft.template_name} · {draft.patient_header.patient_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={doSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isEdit ? 'Atualizar' : 'Salvar'}
            </button>
            <button
              onClick={doView}
              disabled={saving}
              title="Salva e abre o PDF em nova aba (não fecha o modal)"
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              Visualizar
            </button>
            <button
              onClick={doSaveAndPrint}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              {isEdit ? 'Atualizar e Imprimir' : 'Salvar e Imprimir'}
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-red-50 px-5 py-2 text-sm text-red-700 flex items-start gap-2 flex-shrink-0">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Body — form esquerda + preview direita */}
        <div className="grid grid-cols-1 lg:grid-cols-[480px_1fr] gap-6 overflow-y-auto px-6 py-5 flex-1">
          {/* LEFT — form */}
          <section className="space-y-4">
            <Card title="Identificação">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Nome do documento</span>
                <input
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
                  value={docName}
                  onChange={e => setDocName(e.target.value)}
                />
              </label>
            </Card>

            {/* Dados Estruturados — sincroniza bidirecional com o preview. */}
            <CanvasStructuredDataAccordion
              ctx={enrichedContext}
              overrides={structuredOverrides}
              setOverride={setStructuredOverride}
            />

            {fillableElements.length > 0 && (
              <Card title="Campos da consulta">
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] text-violet-700 mb-3 flex items-start gap-2">
                  <span className="text-base flex-shrink-0">✨</span>
                  <div>
                    <strong>IA preencheu {draft.filled_keys.length} de {fillableElements.length} campos</strong>
                    {draft.unfilled_keys.length > 0 && (
                      <> · {draft.unfilled_keys.length} {draft.unfilled_keys.length === 1 ? 'campo precisa' : 'campos precisam'} ser completado{draft.unfilled_keys.length === 1 ? '' : 's'}.</>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mb-2">
                  Verde = preenchido pela IA · Amarelo = vazio · Vermelho = obrigatório vazio.
                </p>
                <div className="space-y-3">
                  {fillableElements.map(f => (
                    <FillableInput
                      key={f.id}
                      field={f}
                      value={fillableValues[f.fieldKey] ?? ''}
                      filledByAI={aiFilled.has(f.fieldKey)}
                      onChange={v => setFillable(f.fieldKey, v)}
                    />
                  ))}
                </div>
              </Card>
            )}

            <Card title="Observações adicionais">
              <textarea
                className="mt-1 w-full resize-y rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
                rows={3}
                placeholder="Notas livres do veterinário (opcional)"
                value={observacoes}
                onChange={e => setObservacoes(e.target.value)}
              />
            </Card>
          </section>

          {/* RIGHT — preview */}
          <section className="lg:sticky lg:top-0 lg:self-start">
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">Preview ao vivo</span>
              <span>Atualiza enquanto você preenche.</span>
            </div>
            <div style={{ width: '21cm', maxWidth: '100%' }} className="mx-auto space-y-4">
              {getAllPages(draft.canvas_state).map((p, idx) => (
                <div key={idx} className="relative">
                  {getAllPages(draft.canvas_state).length > 1 && (
                    <div className="absolute -top-3 left-1 z-10 inline-flex items-center rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                      Página {idx + 1}
                    </div>
                  )}
                  <CanvasStage
                    state={{ version: 1, page: p.page, elements: p.elements }}
                    mode="print"
                    resolveContext={enrichedContext}
                    fillableValues={fillableValues}
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-slate-800">{title}</h2>
      {children}
    </div>
  )
}

function FillableInput({
  field, value, filledByAI, onChange,
}: {
  field: import('@/lib/canva/elements').FillableFieldElement
  value: string
  filledByAI: boolean
  onChange: (v: string) => void
}) {
  const isEmpty = !value || value.trim() === ''
  const borderClass = isEmpty
    ? (field.required
        ? 'border-red-300 bg-red-50 focus:ring-red-400'
        : 'border-amber-300 bg-amber-50 focus:ring-amber-400')
    : filledByAI
      ? 'border-emerald-400 bg-emerald-50 focus:ring-emerald-400'
      : 'border-slate-300 focus:ring-violet-400'

  const common = {
    value,
    placeholder: field.placeholder ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    className: `mt-1 w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:border-transparent outline-none transition-colors ${borderClass}`,
  }

  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700 flex items-center gap-1">
        {field.label.replace(/:\s*$/, '')}
        {field.required && <span className="text-red-500">*</span>}
        {!isEmpty && filledByAI && (
          <span className="ml-1 inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
            IA
          </span>
        )}
        {isEmpty && (
          <span className={`ml-1 text-[10px] font-normal ${field.required ? 'text-red-600' : 'text-amber-600'}`}>
            preencha
          </span>
        )}
      </span>
      {field.inputType === 'textarea' ? (
        <textarea {...common} rows={2} />
      ) : field.inputType === 'date' ? (
        <input type="date" {...common} />
      ) : field.inputType === 'number' ? (
        <input type="number" step="any" {...common} />
      ) : (
        <input type="text" {...common} />
      )}
    </label>
  )
}
