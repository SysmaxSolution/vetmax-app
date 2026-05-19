'use client'

/**
 * Fluxo do veterinário no consultório (cliente-side):
 *   1. Inputs padrão (Medicamentos / Posologia / Observações)
 *   2. Campos customizados dinâmicos (DynamicFieldsEditor)
 *   3. Campos preenchíveis definidos no template (FillableFieldElement)
 *      — required são validados antes do save (modal de erro)
 *   4. Preview A4 reativo lateral
 *   5. Botão "Salvar e imprimir" → cria patient_document e redireciona p/ /print
 */

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { AlertCircle, Loader2, Printer, Save, SquarePen } from 'lucide-react'
import { createCanvaPatientDocument } from '@/lib/actions/canva-templates'
import CanvaA4Preview from '@/components/canva/CanvaA4Preview'
import DynamicFieldsEditor from '@/components/canva/DynamicFieldsEditor'
import type {
  CanvaContentJson, CanvaDynamicField, CanvaTemplateConfig,
} from '@/lib/canva/types'
import type { CanvasState } from '@/lib/canva/canvas-state'
import type { FillableFieldElement } from '@/lib/canva/elements'

interface PatientHeader {
  patient_name?: string
  tutor_name?: string
  species?: string
  breed?: string
  age?: string
  sex?: string
  weight?: string
  date?: string
  vet_name?: string
  crmv?: string
}

interface Props {
  templateId: string
  templateName: string
  templateType: string
  consultationId: string
  patientId: string
  patient: PatientHeader
  config: CanvaTemplateConfig
  canvasState?: CanvasState | null
}

interface IADraft {
  fillable_values: Record<string, string>
  filled_keys: string[]
  unfilled_keys: string[]
  hint?: string
  timestamp: number
}

export default function NewCanvaLaudoForm({
  templateId, templateName, templateType,
  consultationId, patientId, patient, config, canvasState,
}: Props) {
  const router = useRouter()
  const [medicamentos, setMedicamentos] = useState('')
  const [posologia, setPosologia]       = useState('')
  const [observacoes, setObservacoes]   = useState('')
  const [dynamicFields, setDynamicFields] = useState<CanvaDynamicField[]>([])
  const [docName, setDocName] = useState(`${templateName} — ${patient.patient_name ?? 'Pet'}`)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()

  // Extrai os FillableFieldElement do canvas_state
  const fillableElements = useMemo<FillableFieldElement[]>(() => {
    if (!canvasState) return []
    return canvasState.elements.filter(
      (e): e is FillableFieldElement => e.kind === 'fillable_field',
    )
  }, [canvasState])

  // Rascunho da IA salvo no sessionStorage pelo DocumentsSection.handleGenerate
  // — só consumido na primeira render, depois disso o estado vivo manda.
  const [iaDraft, setIaDraft] = useState<IADraft | null>(null)
  const [aiFilled, setAiFilled] = useState<Set<string>>(new Set())
  const draftLoadedRef = useState({ loaded: false })[0]

  // Estado dos valores preenchidos: { fieldKey: value }
  const [fillableValues, setFillableValues] = useState<Record<string, string>>(() => {
    // Tenta carregar rascunho IA do sessionStorage (foi salvo antes do redirect)
    if (typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(`canva-draft-${templateId}`)
        if (raw) {
          const parsed: IADraft = JSON.parse(raw)
          // Aceita só rascunho recente (últimos 10 min)
          if (Date.now() - parsed.timestamp < 10 * 60 * 1000) {
            setIaDraft(parsed)
            setAiFilled(new Set(parsed.filled_keys))
            sessionStorage.removeItem(`canva-draft-${templateId}`)
            return { ...parsed.fillable_values }
          }
        }
      } catch { /* ignore */ }
    }
    // Sem rascunho IA — usa defaultValue do template
    const init: Record<string, string> = {}
    for (const f of fillableElements) {
      if (f.defaultValue) init[f.fieldKey] = f.defaultValue
    }
    return init
  })

  const content: CanvaContentJson = {
    static_fields: {
      medicamentos: medicamentos.trim(),
      posologia: posologia.trim(),
      observacoes: observacoes.trim(),
    },
    dynamic_fields: dynamicFields,
    fillable_fields: fillableValues,
  }

  /** Lista campos required não preenchidos. Bloqueia save se houver. */
  function getMissingRequired(): FillableFieldElement[] {
    return fillableElements.filter(f => {
      if (!f.required) return false
      const v = fillableValues[f.fieldKey]
      return !v || v.trim() === ''
    })
  }

  function save(printAfter: boolean) {
    setError(null)

    const missing = getMissingRequired()
    if (missing.length > 0) {
      setError(
        `Campos obrigatórios não preenchidos: ${missing.map(f => f.label.trim().replace(/:$/, '')).join(', ')}.`,
      )
      return
    }

    startSave(async () => {
      try {
        const { id } = await createCanvaPatientDocument({
          template_id: templateId,
          patient_id: patientId,
          consultation_id: consultationId,
          document_name: docName.trim() || templateName,
          content_json: content,
        })
        if (printAfter) {
          router.push(`/dashboard/laudos/${id}/print?auto=1`)
        } else {
          router.push(`/dashboard/laudos/${id}/print`)
        }
      } catch (e: any) {
        setError(e?.message ?? 'falha ao salvar')
      }
    })
  }

  function setFillable(key: string, value: string) {
    setFillableValues(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-slate-900">Novo {templateType}</h1>
            <p className="text-xs text-slate-500">{templateName} · {patient.patient_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => save(false)}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </button>
            <button
              onClick={() => save(true)}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              Salvar e imprimir
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-auto mt-3 max-w-[1400px] rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[520px_1fr]">
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

          {fillableElements.length > 0 && (
            <Card title="Campos da consulta" iconClass="text-violet-600">
              {iaDraft && (
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] text-violet-700 mb-2 flex items-start gap-2">
                  <span className="text-base flex-shrink-0">✨</span>
                  <div>
                    <strong>IA preencheu {iaDraft.filled_keys.length} de {fillableElements.length} campos</strong>
                    {iaDraft.unfilled_keys.length > 0 && (
                      <> · {iaDraft.unfilled_keys.length} {iaDraft.unfilled_keys.length === 1 ? 'campo precisa ser completado' : 'campos precisam ser completados'} manualmente ou gravando novo áudio.</>
                    )}
                  </div>
                </div>
              )}
              <p className="text-[11px] text-slate-500 mb-2">
                Campos marcados com <span className="text-red-500">*</span> são obrigatórios.
                {iaDraft && <> Verde = preenchido pela IA · Amarelo = vazio · Vermelho = obrigatório vazio.</>}
              </p>
              {fillableElements.map(f => (
                <FillableInput
                  key={f.id}
                  field={f}
                  value={fillableValues[f.fieldKey] ?? ''}
                  filledByAI={aiFilled.has(f.fieldKey)}
                  onChange={v => {
                    setFillable(f.fieldKey, v)
                    // Se o vet edita um campo preenchido pela IA, ele "assume"
                    // a edição — perde o highlight verde de IA.
                    if (aiFilled.has(f.fieldKey)) {
                      setAiFilled(prev => {
                        const next = new Set(prev)
                        next.delete(f.fieldKey)
                        return next
                      })
                    }
                  }}
                />
              ))}
            </Card>
          )}

          <Card title="Conteúdo padrão">
            <Textarea label="Medicamentos" value={medicamentos} onChange={setMedicamentos} rows={3} />
            <Textarea label="Posologia"    value={posologia}    onChange={setPosologia}    rows={3} />
            <Textarea label="Observações"  value={observacoes}  onChange={setObservacoes}  rows={2} />
          </Card>

          <Card title="Campos customizados">
            <DynamicFieldsEditor value={dynamicFields} onChange={setDynamicFields} />
          </Card>
        </section>

        {/* RIGHT — preview */}
        <section className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">Preview ao vivo</span>
            <span>O laudo será impresso exatamente assim.</span>
          </div>
          <CanvaA4Preview
            backgroundUrl={config.background_image_url}
            margins={config.margins}
            blockStyle={config.block_style}
            patient={patient}
            content={content}
            documentTitle={docName}
          />
        </section>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function Card({
  title, children, iconClass,
}: { title: string; children: React.ReactNode; iconClass?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className={`mb-3 text-sm font-semibold ${iconClass ? 'flex items-center gap-2 text-slate-800' : 'text-slate-800'}`}>
        {iconClass && <SquarePen className={`w-4 h-4 ${iconClass}`} />}
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Textarea({
  label, value, onChange, rows = 3,
}: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <textarea
        className="mt-1 w-full resize-y rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-900 focus:outline-none"
        rows={rows}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </label>
  )
}

/** Input específico para FillableFieldElement — tipo varia conforme inputType.
 *  Aplica destaque visual: verde para preenchido pela IA, amarelo para vazio
 *  não-obrigatório, vermelho para obrigatório vazio (à la generateDocumentDraft
 *  legado). */
function FillableInput({
  field, value, filledByAI, onChange,
}: {
  field: FillableFieldElement
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
