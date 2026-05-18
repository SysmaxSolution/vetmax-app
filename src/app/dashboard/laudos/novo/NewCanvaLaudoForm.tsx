'use client'

/**
 * Fluxo do veterinário no consultório (cliente-side):
 *   1. Inputs padrão (Medicamentos / Posologia / Observações)
 *   2. Campos customizados dinâmicos (DynamicFieldsEditor)
 *   3. Preview A4 reativo lateral
 *   4. Botão "Salvar e imprimir" → cria patient_document e redireciona p/ /print
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Printer, Save } from 'lucide-react'
import { createCanvaPatientDocument } from '@/lib/actions/canva-templates'
import CanvaA4Preview from '@/components/canva/CanvaA4Preview'
import DynamicFieldsEditor from '@/components/canva/DynamicFieldsEditor'
import type {
  CanvaContentJson, CanvaDynamicField, CanvaTemplateConfig,
} from '@/lib/canva/types'

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
}

export default function NewCanvaLaudoForm({
  templateId, templateName, templateType,
  consultationId, patientId, patient, config,
}: Props) {
  const router = useRouter()
  const [medicamentos, setMedicamentos] = useState('')
  const [posologia, setPosologia]       = useState('')
  const [observacoes, setObservacoes]   = useState('')
  const [dynamicFields, setDynamicFields] = useState<CanvaDynamicField[]>([])
  const [docName, setDocName] = useState(`${templateName} — ${patient.patient_name ?? 'Pet'}`)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()

  const content: CanvaContentJson = {
    static_fields: {
      medicamentos: medicamentos.trim(),
      posologia: posologia.trim(),
      observacoes: observacoes.trim(),
    },
    dynamic_fields: dynamicFields,
  }

  function save(printAfter: boolean) {
    setError(null)
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
        <div className="mx-auto mt-3 max-w-[1400px] rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-800">{title}</h2>
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
