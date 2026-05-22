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
import CanvasStage from '@/components/canva/editor/CanvasStage'
import DynamicFieldsEditor from '@/components/canva/DynamicFieldsEditor'
import type {
  CanvaContentJson, CanvaDynamicField, CanvaTemplateConfig,
} from '@/lib/canva/types'
import type { CanvasState } from '@/lib/canva/canvas-state'
import { getAllPages } from '@/lib/canva/canvas-state'
import type { FillableFieldElement } from '@/lib/canva/elements'
import type { ResolveContext } from '@/lib/canva/dynamic-tags'
import type { FillableSource } from '@/lib/canva/fillable-prefill'
import { parseMedicamentosText } from '@/lib/canva/parse-medicamentos'

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
  /** Dados reais da clínica/vet/patient/tutor/consulta para Dynamic Tags
   *  resolverem no preview ao vivo. Vem do server (buildResolveContext). */
  resolveContext?: ResolveContext
  /** Valores pré-resolvidos para os FillableFieldElement do template,
   *  vindos da cadeia tag → cadastro → histórico → voz. */
  prefillValues?: Record<string, string>
  /** Origem de cada valor pré-preenchido — usado para mostrar badge. */
  prefillSources?: Record<string, FillableSource>
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
  consultationId, patientId, patient, config, canvasState, resolveContext,
  prefillValues, prefillSources,
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

  // Origem inicial de cada campo (banco / histórico / voz). Pode ser
  // sobrescrita quando o vet edita um campo (vira manual).
  const [fieldSources, setFieldSources] = useState<Record<string, FillableSource | 'manual'>>(
    () => ({ ...(prefillSources ?? {}) }),
  )

  // Estado dos valores preenchidos: { fieldKey: value }.
  // Prioridade:
  //   1. Rascunho IA do sessionStorage (legado — vet clicou "Gerar via IA")
  //   2. prefillValues vindos do server (tag → cadastro → histórico → voz)
  //   3. defaultValue do template
  const [fillableValues, setFillableValues] = useState<Record<string, string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem(`canva-draft-${templateId}`)
        if (raw) {
          const parsed: IADraft = JSON.parse(raw)
          if (Date.now() - parsed.timestamp < 10 * 60 * 1000) {
            setIaDraft(parsed)
            setAiFilled(new Set(parsed.filled_keys))
            sessionStorage.removeItem(`canva-draft-${templateId}`)
            return { ...parsed.fillable_values }
          }
        }
      } catch { /* ignore */ }
    }
    const init: Record<string, string> = { ...(prefillValues ?? {}) }
    for (const f of fillableElements) {
      if (init[f.fieldKey] === undefined && f.defaultValue) {
        init[f.fieldKey] = f.defaultValue
      }
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

  // Preview reactive: para que o Repeater de prescrições renderize o
  // que o vet acabou de digitar (sem precisar salvar e abrir /print),
  // mescla o resolveContext recebido do server com prescrições parseadas
  // do textarea "Medicamentos". Se a consulta já tinha prescrições reais
  // (tabela `prescriptions`), o textarea complementa apenas quando vazio.
  const liveResolveContext = useMemo<ResolveContext | undefined>(() => {
    if (!resolveContext) return resolveContext
    const consultation = (resolveContext.consultation as Record<string, unknown> | undefined) ?? {}
    const existing = Array.isArray(consultation.prescriptions) ? consultation.prescriptions : []
    const parsed = parseMedicamentosText(medicamentos)
    if (parsed.length === 0 && existing.length > 0) return resolveContext
    const mergedPrescriptions = parsed.length > 0
      ? parsed.map(p => ({
          ...p,
          frequency: p.frequency ?? (posologia.trim() || undefined),
          orientation: p.orientation ?? (observacoes.trim() || undefined),
        }))
      : existing
    return {
      ...resolveContext,
      consultation: { ...consultation, prescriptions: mergedPrescriptions },
    }
  }, [resolveContext, medicamentos, posologia, observacoes])

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
    // Quando o vet edita um campo auto-preenchido, ele "assume" o valor —
    // marca como manual para o badge sumir.
    setFieldSources(prev => (prev[key] && prev[key] !== 'manual'
      ? { ...prev, [key]: 'manual' }
      : prev
    ))
  }

  // Contagem para mostrar resumo de auto-preenchimento (banco/histórico/voz)
  const autofillStats = useMemo(() => {
    let tag = 0, patient = 0, history = 0, voice = 0
    for (const f of fillableElements) {
      const src = fieldSources[f.fieldKey]
      const hasValue = (fillableValues[f.fieldKey] ?? '').trim() !== ''
      if (!hasValue) continue
      if (src === 'tag')     tag++
      if (src === 'patient') patient++
      if (src === 'history') history++
      if (src === 'voice')   voice++
    }
    return { tag, patient, history, voice, total: tag + patient + history + voice }
  }, [fillableElements, fieldSources, fillableValues])

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
              {!iaDraft && autofillStats.total > 0 && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700 mb-2 flex items-start gap-2">
                  <span className="text-base flex-shrink-0">✨</span>
                  <div>
                    <strong>Preenchimento automático aplicado a {autofillStats.total} de {fillableElements.length} campos</strong>
                    <div className="mt-0.5 text-emerald-600">
                      {autofillStats.tag     > 0 && <>{autofillStats.tag} via cadastro do pet/tutor · </>}
                      {autofillStats.patient > 0 && <>{autofillStats.patient} via histórico clínico · </>}
                      {autofillStats.history > 0 && <>{autofillStats.history} via laudos anteriores · </>}
                      {autofillStats.voice   > 0 && <>{autofillStats.voice} extraído(s) da gravação de voz</>}
                    </div>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-slate-500 mb-2">
                Campos marcados com <span className="text-red-500">*</span> são obrigatórios.
                {(iaDraft || autofillStats.total > 0) && <> Verde = preenchido automaticamente · Amarelo = vazio · Vermelho = obrigatório vazio.</>}
              </p>
              {fillableElements.map(f => (
                <FillableInput
                  key={f.id}
                  field={f}
                  value={fillableValues[f.fieldKey] ?? ''}
                  filledByAI={aiFilled.has(f.fieldKey)}
                  source={fieldSources[f.fieldKey]}
                  onChange={v => {
                    setFillable(f.fieldKey, v)
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

        {/* RIGHT — preview ao vivo
            Quando o template tem canvas_state (motor Canvas Visual), renderiza
            via CanvasStage em modo print com fillableValues + resolveContext
            — vet vê EXATAMENTE o que vai imprimir (papel timbrado, logo,
            fillable fields preenchidos, repeater de medicações, etc.).
            Fallback pro CanvaA4Preview legado quando não há canvas_state. */}
        <section className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">Preview ao vivo</span>
            <span>O laudo será impresso exatamente assim.</span>
          </div>
          {canvasState ? (
            <div style={{ width: '21cm', maxWidth: '100%' }} className="mx-auto space-y-4">
              {getAllPages(canvasState).map((p, idx) => (
                <div key={idx} className="relative">
                  {getAllPages(canvasState).length > 1 && (
                    <div className="absolute -top-3 left-1 z-10 inline-flex items-center rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                      Página {idx + 1}
                    </div>
                  )}
                  <CanvasStage
                    state={{ version: 1, page: p.page, elements: p.elements }}
                    mode="print"
                    resolveContext={liveResolveContext}
                    fillableValues={fillableValues}
                  />
                </div>
              ))}
            </div>
          ) : (
            <CanvaA4Preview
              backgroundUrl={config.background_image_url}
              margins={config.margins}
              blockStyle={config.block_style}
              patient={patient}
              content={content}
              documentTitle={docName}
            />
          )}
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

/** Rótulos PT-BR para origem do auto-preenchimento (mostrados como chip). */
const SOURCE_LABEL: Record<string, { label: string; cls: string }> = {
  tag:     { label: 'Cadastro',  cls: 'bg-sky-100 text-sky-700' },
  patient: { label: 'Histórico', cls: 'bg-indigo-100 text-indigo-700' },
  history: { label: 'Laudo anterior', cls: 'bg-purple-100 text-purple-700' },
  voice:   { label: 'Voz',       cls: 'bg-emerald-100 text-emerald-700' },
  default: { label: 'Padrão',    cls: 'bg-slate-100 text-slate-600' },
}

/** Input específico para FillableFieldElement — tipo varia conforme inputType.
 *  Aplica destaque visual: verde para preenchido pela IA, amarelo para vazio
 *  não-obrigatório, vermelho para obrigatório vazio. Mostra chip com a
 *  origem do auto-preenchimento (Cadastro / Histórico / Laudo / Voz). */
function FillableInput({
  field, value, filledByAI, source, onChange,
}: {
  field: FillableFieldElement
  value: string
  filledByAI: boolean
  source?: FillableSource | 'manual'
  onChange: (v: string) => void
}) {
  const isEmpty = !value || value.trim() === ''
  const autofilled = !isEmpty && source && source !== 'manual'
  const borderClass = isEmpty
    ? (field.required
        ? 'border-red-300 bg-red-50 focus:ring-red-400'
        : 'border-amber-300 bg-amber-50 focus:ring-amber-400')
    : (filledByAI || autofilled)
      ? 'border-emerald-400 bg-emerald-50 focus:ring-emerald-400'
      : 'border-slate-300 focus:ring-violet-400'

  const common = {
    value,
    placeholder: field.placeholder ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    className: `mt-1 w-full rounded border px-2 py-1.5 text-sm focus:ring-2 focus:border-transparent outline-none transition-colors ${borderClass}`,
  }

  const sourceChip = autofilled && source && SOURCE_LABEL[source]
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
        {!isEmpty && !filledByAI && sourceChip && (
          <span className={`ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${sourceChip.cls}`}>
            {sourceChip.label}
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
