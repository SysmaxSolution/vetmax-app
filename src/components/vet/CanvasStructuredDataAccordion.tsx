'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, Activity, Pill, Stethoscope } from 'lucide-react'
import type { ResolveContext } from '@/lib/canva/dynamic-tags'

/**
 * Side Panel — Dados Estruturados da Consulta.
 *
 * Acordeão colapsável (3 seções: Sinais Vitais, Diagnóstico/Plano, Medicações)
 * que reflete e edita os mesmos dados que o CanvasStage exibe no preview.
 *
 * Bidirecional via overrides:
 *  - O modal pai mantém um `Record<string, string>` de overrides por path
 *    (ex.: 'consultation.weight').
 *  - Edição aqui chama setOverride(path, value).
 *  - O modal pai faz deep-merge dos overrides no resolveContext via useMemo
 *    e passa o resultado ao CanvasStage. Reatividade granular: só os
 *    elementos do canvas que referenciam aquele path re-resolvem (não há
 *    re-mount do template inteiro).
 *
 * Voz: quando o useClinicalVoiceAssistant ditar "temperatura 38.5", o vet
 * pode propagar o valor para fillableValues OU diretamente para os
 * overrides — o painel reflete imediatamente (mesma fonte de verdade).
 */

interface StructuredField {
  /** Path no resolveContext (ex.: 'consultation.weight'). */
  path:        string
  label:       string
  placeholder?: string
  /** Sufixo de unidade exibido cinza ao lado do input. */
  unit?:       string
  type?:       'text' | 'number' | 'textarea'
}

interface Section {
  id:       string
  title:    string
  icon:     React.ReactNode
  fields:   StructuredField[]
}

const SECTIONS: Section[] = [
  {
    id:    'vitals',
    title: 'Sinais Vitais',
    icon:  <Activity className="h-3.5 w-3.5" />,
    fields: [
      { path: 'consultation.weight',      label: 'Peso na consulta',  unit: 'kg', type: 'number', placeholder: '0,0' },
      { path: 'consultation.temperature', label: 'Temperatura',       unit: '°C', type: 'number', placeholder: '38,5' },
      { path: 'patient.weight',           label: 'Peso do cadastro',  unit: 'kg', type: 'number', placeholder: '0,0' },
    ],
  },
  {
    id:    'clinical',
    title: 'Diagnóstico e Plano',
    icon:  <Stethoscope className="h-3.5 w-3.5" />,
    fields: [
      { path: 'consultation.complaint',  label: 'Queixa principal',   type: 'textarea', placeholder: 'Tosse seca há 3 dias...' },
      { path: 'consultation.diagnosis',  label: 'Diagnóstico',        type: 'textarea', placeholder: 'Suspeita de cardiopatia...' },
    ],
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

function readStringField(ctx: ResolveContext, overrides: Record<string, string>, path: string): string {
  if (path in overrides) return overrides[path] ?? ''
  const raw = getPath(ctx, path)
  if (raw === null || raw === undefined) return ''
  return String(raw)
}

interface MedicationListItem {
  medication?: string
  dose?:       string
  frequency?:  string
  duration_days?: string | number
  route_of_administration?: string
}

function readPrescriptions(ctx: ResolveContext): MedicationListItem[] {
  const c = ctx.consultation as Record<string, unknown> | undefined
  const raw = c?.prescriptions
  return Array.isArray(raw) ? raw as MedicationListItem[] : []
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  ctx:         ResolveContext
  overrides:   Record<string, string>
  setOverride: (path: string, value: string) => void
}

export default function CanvasStructuredDataAccordion({ ctx, overrides, setOverride }: Props) {
  // Padrão: tudo fechado para não poluir o espaço vertical (conforme diretriz).
  const [openSections, setOpenSections] = useState<Set<string>>(new Set())

  const prescriptions = useMemo(() => readPrescriptions(ctx), [ctx])

  function toggle(id: string) {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-violet-500" />
          Dados Estruturados
        </h2>
        <p className="text-[10px] text-slate-500 mt-0.5">
          Espelha os dados da consulta. Alterações aqui aparecem no preview ao lado em tempo real.
        </p>
      </div>

      {SECTIONS.map(section => {
        const isOpen = openSections.has(section.id)
        return (
          <div key={section.id} className="border-b border-slate-100 last:border-0">
            <button
              type="button"
              onClick={() => toggle(section.id)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <span className="text-violet-500">{section.icon}</span>
                {section.title}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isOpen && (
              <div className="px-4 pb-3 pt-1 space-y-2.5">
                {section.fields.map(f => {
                  const value         = readStringField(ctx, overrides, f.path)
                  const isOverridden  = f.path in overrides
                  const inputClass    = `w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none ${
                    isOverridden
                      ? 'border-violet-400 bg-violet-50/40 focus:border-violet-500'
                      : 'border-slate-200 focus:border-violet-400'
                  }`
                  return (
                    <div key={f.path}>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1.5 mb-0.5">
                        {f.label}
                        {isOverridden && (
                          <span className="text-[9px] font-bold text-violet-600 bg-violet-100 rounded-full px-1.5">editado</span>
                        )}
                      </label>
                      <div className="flex items-center gap-1.5">
                        {f.type === 'textarea' ? (
                          <textarea
                            value={value}
                            rows={2}
                            placeholder={f.placeholder}
                            onChange={e => setOverride(f.path, e.target.value)}
                            className={`${inputClass} resize-none`}
                          />
                        ) : (
                          <>
                            <input
                              type={f.type ?? 'text'}
                              value={value}
                              placeholder={f.placeholder}
                              onChange={e => setOverride(f.path, e.target.value)}
                              className={inputClass}
                            />
                            {f.unit && (
                              <span className="text-[10px] font-semibold text-slate-400 shrink-0 w-8 text-left">
                                {f.unit}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Medicações — sempre read-only nesta iteração (edição é no modal de Doses). */}
      <MedicationsAccordion prescriptions={prescriptions} />
    </div>
  )
}

// ─── Sub-component: medicações (read-only) ───────────────────────────────────

function MedicationsAccordion({ prescriptions }: { prescriptions: MedicationListItem[] }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border-t border-slate-100">
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Pill className="h-3.5 w-3.5 text-violet-500" />
          Medicações
          {prescriptions.length > 0 && (
            <span className="text-[10px] font-normal text-slate-400">({prescriptions.length})</span>
          )}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="px-4 pb-3 pt-1">
          {prescriptions.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic py-2">Nenhuma medicação prescrita.</p>
          ) : (
            <ul className="space-y-1.5">
              {prescriptions.map((p, idx) => (
                <li key={idx} className="text-[11px] text-slate-700 leading-snug">
                  <p className="font-semibold">{p.medication ?? '—'}</p>
                  <p className="text-slate-500">
                    {p.dose && <span>{p.dose}</span>}
                    {p.route_of_administration && <span className="mx-1 text-slate-300">·</span>}
                    {p.route_of_administration && <span>{p.route_of_administration}</span>}
                    {p.frequency && <span className="mx-1 text-slate-300">·</span>}
                    {p.frequency && <span>{p.frequency}</span>}
                    {p.duration_days && <span className="mx-1 text-slate-300">·</span>}
                    {p.duration_days && <span>{p.duration_days} dias</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-slate-400 mt-2 italic">
            Edição de medicação acontece nas Notas Clínicas — o painel é re-hidratado automaticamente.
          </p>
        </div>
      )}
    </div>
  )
}
