'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import {
  Mic, MicOff, Loader2, Trash2, Check, AlertTriangle, HeartPulse, Droplets,
  BedDouble, ListChecks, Pill, ClipboardCheck, X, Sparkles,
} from 'lucide-react'
import { persistUnifiedVoiceDraft, type PersistVoiceResult } from '@/lib/actions/voice-persist'
import type { UnifiedVoiceExtraction, VoiceContext } from '@/lib/voice/unified-extraction'

/**
 * Painel de revisão pós-gravação da voz unificada. Mostra o que a IA capturou
 * por aba, permite editar/remover antes de persistir e confirma 1 vez (limpa o
 * draft em seguida — idempotência contra duplo-clique).
 */

interface Props {
  context:            VoiceContext
  draft:              UnifiedVoiceExtraction
  setDraft:           Dispatch<SetStateAction<UnifiedVoiceExtraction>>
  hospitalizationId?: string
  surgeryId?:         string
  isRecording:        boolean
  isProcessing:       boolean
  transcript:         string
  hasDraft:           boolean
  lastSummary:        { label: string; count: number }[] | null
  error:              string | null
  onToggleMic:        () => void
  clearDraft:         () => void
  /** Chamado após persistir com sucesso — pai recarrega abas/board. */
  onPersisted:        (result: PersistVoiceResult) => void
  /** Quando false, esconde a barra de microfone (controle de voz vive fora). */
  showMic?:           boolean
}

const VITAL_LABELS: Record<string, string> = {
  temperature: 'Temp °C', heart_rate: 'FC', resp_rate: 'FR', weight: 'Peso kg',
  blood_pressure: 'PA', glucose: 'Glic', spo2: 'SpO₂ %', mucosa: 'Mucosa',
  tpc_seconds: 'TPC s', hydration_pct: 'Hidr %', pain_score: 'Dor 0-10',
}
const FLUID_KIND_LABEL: Record<string, string> = { fluid: 'Fluido', urine: 'Urina', emesis: 'Êmese', bleeding: 'Sangramento', other: 'Outro' }
const TASK_KIND_LABEL: Record<string, string> = { exam: 'Exame', procedure: 'Procedimento', feeding: 'Alimentação', other: 'Outro' }

export default function VoiceReviewPanel(props: Props) {
  const { context, draft, setDraft, hospitalizationId, surgeryId, isRecording, isProcessing, transcript, hasDraft, lastSummary, error, onToggleMic, clearDraft, onPersisted, showMic = true } = props
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  function patchVital(key: string, value: string) {
    setDraft(d => d.vitals ? { ...d, vitals: { ...d.vitals, [key]: key === 'blood_pressure' || key === 'mucosa' ? (value || null) : (value === '' ? null : Number(value.replace(',', '.'))) } } : d)
  }
  function patchClinical(key: string, value: string) {
    setDraft(d => d.clinical_data ? { ...d, clinical_data: { ...d.clinical_data, [key]: value || null } } : d)
  }
  function toggleClinicalBool(key: 'fasting' | 'isolation_required') {
    setDraft(d => d.clinical_data ? { ...d, clinical_data: { ...d.clinical_data, [key]: !d.clinical_data[key] } } : d)
  }
  function patchTask(idx: number, patch: Partial<UnifiedVoiceExtraction['tasks'][number]>) {
    setDraft(d => ({ ...d, tasks: d.tasks.map((t, i) => i === idx ? { ...t, ...patch } : t) }))
  }
  function removeTask(idx: number) { setDraft(d => ({ ...d, tasks: d.tasks.filter((_, i) => i !== idx) })) }
  function patchMed(idx: number, patch: Partial<UnifiedVoiceExtraction['medications'][number]>) {
    setDraft(d => ({ ...d, medications: d.medications.map((m, i) => i === idx ? { ...m, ...patch, needs_review: (patch.dose ?? m.dose) && (patch.route ?? m.route) && (patch.frequency_hours ?? m.frequency_hours) !== null ? false : m.needs_review } : m) }))
  }
  function removeMed(idx: number) { setDraft(d => ({ ...d, medications: d.medications.filter((_, i) => i !== idx) })) }
  function patchFluid(idx: number, patch: Partial<UnifiedVoiceExtraction['fluids'][number]>) {
    setDraft(d => ({ ...d, fluids: d.fluids.map((f, i) => i === idx ? { ...f, ...patch } : f) }))
  }
  function removeFluid(idx: number) { setDraft(d => ({ ...d, fluids: d.fluids.filter((_, i) => i !== idx) })) }
  function toggleChecklist(key: 'fasting_confirmed' | 'preop_exams_ok' | 'consent_signed') {
    setDraft(d => d.checklist ? { ...d, checklist: { ...d.checklist, [key]: !d.checklist[key] } } : d)
  }

  async function handleConfirm() {
    setSaving(true); setSaveErr(null)
    const res = await persistUnifiedVoiceDraft({ context, hospitalizationId, surgeryId, draft })
    setSaving(false)
    if ('error' in res) { setSaveErr(res.error); return }
    if (res.errors.length > 0) { setSaveErr(res.errors.join(' · ')); return }
    onPersisted(res)
    clearDraft()
  }

  const vitalEntries = draft.vitals ? Object.entries(draft.vitals).filter(([, v]) => v !== null && v !== undefined) : []

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/50 overflow-hidden" data-testid="voice-review-panel">
      {/* Barra de gravação */}
      {showMic && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-violet-100 flex-wrap">
          <button type="button" onClick={onToggleMic} data-testid="unified-voice-btn"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${isRecording ? 'bg-rose-100 text-rose-700 animate-pulse' : 'bg-violet-600 text-white hover:bg-violet-700'}`}>
            {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isRecording ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
            {isProcessing ? 'Estruturando…' : isRecording ? 'Ouvindo… (diga "finalizar")' : 'Gravar por voz'}
          </button>
          <span className="text-[11px] text-slate-500 flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-violet-500" /> Pode gravar várias vezes — soma sem apagar.
          </span>
          {isRecording && transcript && <span className="text-[11px] text-violet-600 italic truncate w-full">"{transcript}"</span>}
        </div>
      )}

      {error && <p className="mx-4 mt-2 text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5">{error}</p>}

      {!hasDraft ? (
        <p className="px-4 py-3 text-[11px] text-slate-400">Nada capturado ainda. Grave o plantão e revise aqui antes de salvar.</p>
      ) : (
        <div className="px-4 py-3 space-y-3">
          {lastSummary && lastSummary.length > 0 && (
            <p className="text-[11px] font-semibold text-violet-700">Identifiquei: {lastSummary.map(s => `${s.count} ${s.label}`).join(', ')} — revise abaixo.</p>
          )}

          {/* Sinais Vitais */}
          {vitalEntries.length > 0 && (
            <Section icon={<HeartPulse className="h-3.5 w-3.5 text-rose-500" />} title="Sinais Vitais" onClear={() => setDraft(d => ({ ...d, vitals: null }))}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {vitalEntries.map(([k, v]) => (
                  <label key={k} className="block">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">{VITAL_LABELS[k] ?? k}</span>
                    <input value={String(v)} onChange={e => patchVital(k, e.target.value)}
                      className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-violet-500 focus:outline-none" />
                  </label>
                ))}
              </div>
            </Section>
          )}

          {/* Fluidoterapia */}
          {draft.fluids.length > 0 && (
            <Section icon={<Droplets className="h-3.5 w-3.5 text-cyan-500" />} title="Fluidoterapia / Balanço">
              <div className="space-y-1.5">
                {draft.fluids.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5" data-testid={`voice-fluid-${i}`}>
                    <select value={f.direction} onChange={e => patchFluid(i, { direction: e.target.value as 'in' | 'out' })}
                      className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs">
                      <option value="in">Entrada</option><option value="out">Saída</option>
                    </select>
                    <select value={f.kind} onChange={e => patchFluid(i, { kind: e.target.value as typeof f.kind })}
                      className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs">
                      {Object.entries(FLUID_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <input type="number" value={f.volume_ml} onChange={e => patchFluid(i, { volume_ml: Number(e.target.value) || 0 })}
                      className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs" /> <span className="text-[10px] text-slate-400">mL</span>
                    <button onClick={() => removeFluid(i)} className="ml-auto text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Dados Clínicos */}
          {draft.clinical_data && (
            <Section icon={<BedDouble className="h-3.5 w-3.5 text-violet-500" />} title="Dados Clínicos" onClear={() => setDraft(d => ({ ...d, clinical_data: null }))}>
              <div className="space-y-1.5">
                {draft.clinical_data.diet_notes !== null && (
                  <label className="block"><span className="text-[9px] font-bold text-slate-400 uppercase">Dieta</span>
                    <input value={draft.clinical_data.diet_notes ?? ''} onChange={e => patchClinical('diet_notes', e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs" /></label>
                )}
                {draft.clinical_data.estimated_discharge !== null && (
                  <label className="block"><span className="text-[9px] font-bold text-slate-400 uppercase">Previsão de alta</span>
                    <input value={draft.clinical_data.estimated_discharge ?? ''} onChange={e => patchClinical('estimated_discharge', e.target.value)} className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs" /></label>
                )}
                <div className="flex gap-3">
                  {draft.clinical_data.fasting !== null && <Toggle label="Jejum" on={!!draft.clinical_data.fasting} onClick={() => toggleClinicalBool('fasting')} />}
                  {draft.clinical_data.isolation_required !== null && <Toggle label="Isolamento" on={!!draft.clinical_data.isolation_required} onClick={() => toggleClinicalBool('isolation_required')} />}
                </div>
              </div>
            </Section>
          )}

          {/* Tarefas */}
          {draft.tasks.length > 0 && (
            <Section icon={<ListChecks className="h-3.5 w-3.5 text-violet-500" />} title="Tarefas">
              <div className="space-y-1.5">
                {draft.tasks.map((t, i) => (
                  <div key={i} className="flex items-center gap-1.5" data-testid={`voice-task-${i}`}>
                    <select value={t.kind} onChange={e => patchTask(i, { kind: e.target.value as typeof t.kind })} className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs">
                      {Object.entries(TASK_KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <input value={t.description} onChange={e => patchTask(i, { description: e.target.value })} className="flex-1 min-w-0 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                    <select value={t.frequency_hours === null ? 'null' : String(t.frequency_hours)} onChange={e => patchTask(i, { frequency_hours: e.target.value === 'null' ? null : Number(e.target.value) })} className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs">
                      {[4, 6, 8, 12, 24].map(h => <option key={h} value={h}>{h}/{h}h</option>)}<option value="null">Única</option>
                    </select>
                    <button onClick={() => removeTask(i)} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Medicações */}
          {draft.medications.length > 0 && (
            <Section icon={<Pill className="h-3.5 w-3.5 text-violet-500" />} title="Medicações (prescrição)">
              <div className="space-y-1.5">
                {draft.medications.map((m, i) => (
                  <div key={i} className={`rounded-lg border px-2 py-1.5 ${m.is_duplicate_suggestion ? 'border-amber-400 bg-amber-100/60' : m.needs_review ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`} data-testid={`voice-med-${i}`}>
                    {m.is_duplicate_suggestion && <p className="mb-1 text-[10px] font-bold text-amber-800 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Possível duplicata — mesma medicação/dose já no draft.</p>}
                    <div className="flex items-center gap-1.5">
                      <input value={m.name} onChange={e => patchMed(i, { name: e.target.value })} placeholder="Medicamento" className="flex-1 min-w-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold" />
                      <button onClick={() => removeMed(i)} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-1.5">
                      <input value={m.dose ?? ''} onChange={e => patchMed(i, { dose: e.target.value || null })} placeholder="Dose" className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
                      <input value={m.route ?? ''} onChange={e => patchMed(i, { route: e.target.value || null })} placeholder="Via" className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
                      <select value={m.frequency_hours === null ? 'null' : String(m.frequency_hours)} onChange={e => patchMed(i, { frequency_hours: e.target.value === 'null' ? null : Number(e.target.value) })} className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs">
                        {[4, 6, 8, 12, 24].map(h => <option key={h} value={h}>{h}/{h}h</option>)}<option value="null">SOS</option>
                      </select>
                    </div>
                    {m.needs_review && <p className="mt-1 text-[10px] text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Faltou dose/via/frequência — revise antes de salvar.</p>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Checklist (cirurgia) */}
          {draft.checklist && (
            <Section icon={<ClipboardCheck className="h-3.5 w-3.5 text-amber-500" />} title="Checklist Pré-Op">
              <div className="flex flex-wrap gap-3">
                {draft.checklist.fasting_confirmed !== null && <Toggle label="Jejum confirmado" on={!!draft.checklist.fasting_confirmed} onClick={() => toggleChecklist('fasting_confirmed')} />}
                {draft.checklist.preop_exams_ok !== null && <Toggle label="Exames OK" on={!!draft.checklist.preop_exams_ok} onClick={() => toggleChecklist('preop_exams_ok')} />}
                {draft.checklist.consent_signed !== null && <Toggle label="Consentimento" on={!!draft.checklist.consent_signed} onClick={() => toggleChecklist('consent_signed')} />}
              </div>
            </Section>
          )}

          {/* Relatório/Notas (cirurgia) */}
          {context === 'surgery' && draft.notes.trim() && (
            <Section icon={<ClipboardCheck className="h-3.5 w-3.5 text-violet-500" />} title="Relatório Cirúrgico">
              <textarea value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} rows={4} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
            </Section>
          )}

          {saveErr && <p className="text-[11px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5">{saveErr}</p>}

          <div className="flex items-center gap-2 pt-1">
            <button onClick={handleConfirm} disabled={saving} data-testid="voice-confirm-btn"
              className="flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Confirmar e salvar
            </button>
            <button onClick={clearDraft} disabled={saving} data-testid="voice-discard-btn"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">
              <X className="h-3.5 w-3.5" /> Descartar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ icon, title, onClear, children }: { icon: React.ReactNode; title: string; onClear?: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon} <span className="text-[11px] font-bold text-slate-700">{title}</span>
        {onClear && <button onClick={onClear} className="ml-auto text-slate-300 hover:text-rose-600" title="Remover seção"><Trash2 className="h-3 w-3" /></button>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${on ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>
      <span className={`h-3 w-3 rounded border flex items-center justify-center ${on ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}>{on && <Check className="h-2 w-2 text-white" />}</span>
      {label}
    </button>
  )
}
