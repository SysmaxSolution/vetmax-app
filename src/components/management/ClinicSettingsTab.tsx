'use client'

import { useState } from 'react'
import {
  X, ToggleLeft, ToggleRight, Cpu,
  Save, Loader2, CheckCircle2, ClipboardList, Plus,
} from 'lucide-react'
import {
  updateClinicConfig,
  type FlowConfig, type ClinicConfig, type ClinicSettingsConfig,
} from '@/lib/actions/clinic-settings'

const MERGEABLE = [
  { key: 'triage' as const, label: 'Triagem', desc: 'Coleta de sinais vitais dentro do Consultório' },
  { key: 'exams'  as const, label: 'Exames',  desc: 'Ditado de laudos dentro do Consultório' },
]

// ─── Props ────────────────────────────────────────────────────────────────────

const CHECKIN_FIELD_OPTIONS = [
  { key: 'address',           label: 'Endereço completo' },
  { key: 'emergency_contact', label: 'Contato de emergência' },
]

const TRIAGE_FIELD_OPTIONS = [
  { key: 'weight',            label: 'Peso (kg)' },
  { key: 'temperature',       label: 'Temperatura retal' },
  { key: 'chief_complaint',   label: 'Queixa principal' },
  { key: 'heart_rate',        label: 'Frequência cardíaca' },
  { key: 'respiratory_rate',  label: 'Frequência respiratória' },
  { key: 'mucous_color',      label: 'Cor das mucosas' },
  { key: 'crt',               label: 'TPC (CRT)' },
]

interface Props {
  initialConfig:          ClinicConfig | null
  initialChecklist?:      string[]
  initialSettingsConfig?: ClinicSettingsConfig | null
  onToast: (type: 'success' | 'error', msg: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClinicSettingsTab({ initialConfig, initialChecklist = [], initialSettingsConfig, onToast }: Props) {
  const [continuousFlow,  setContinuousFlow]  = useState(initialConfig?.continuous_flow ?? false)
  const [mergedModules,   setMergedModules]   = useState<Array<'triage'|'exams'>>(
    initialConfig?.flow_config?.vet_merged_modules ?? []
  )

  const [checklist,       setChecklist]       = useState<string[]>(initialChecklist)
  const [newCheckItem,    setNewCheckItem]    = useState('')
  const [savingChecklist, setSavingChecklist] = useState(false)
  const [savingFlow,      setSavingFlow]      = useState(false)

  // ── Continuous flow ─────────────────────────────────────────────────────────

  function toggleMerged(key: 'triage' | 'exams') {
    setMergedModules(prev =>
      prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]
    )
  }

  async function saveFlow() {
    setSavingFlow(true)
    const res = await updateClinicConfig({
      continuous_flow: continuousFlow,
      flow_config: { vet_merged_modules: continuousFlow ? mergedModules : [] },
    })
    setSavingFlow(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Fluxo contínuo configurado!')
  }

  // ── Checklist de Check-in ───────────────────────────────────────────────────

  function addCheckItem() {
    const item = newCheckItem.trim()
    if (!item || checklist.includes(item)) return
    setChecklist(prev => [...prev, item])
    setNewCheckItem('')
  }

  function removeCheckItem(idx: number) {
    setChecklist(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveChecklist() {
    setSavingChecklist(true)
    const res = await updateClinicConfig({ reception_checklist: checklist })
    setSavingChecklist(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Checklist de check-in salvo!')
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Sessão 1: Protocolo de Check-in ──────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
            <ClipboardList className="h-4 w-4 text-teal-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Protocolo de Check-in</h3>
            <p className="text-xs text-slate-500">Itens obrigatórios que a recepção deve confirmar no check-in</p>
          </div>
        </div>

        <div className="px-6 py-4 space-y-3">
          {/* Itens existentes */}
          {checklist.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Nenhum item no checklist. Adicione abaixo.</p>
          ) : (
            <div className="space-y-2">
              {checklist.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2.5 hover:border-slate-200 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-teal-500 flex-shrink-0" />
                    <span className="text-sm text-slate-700">{item}</span>
                  </div>
                  <button
                    onClick={() => removeCheckItem(idx)}
                    className="text-slate-300 hover:text-red-500 transition-colors"
                    title="Remover item"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Adicionar novo item */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newCheckItem}
              onChange={e => setNewCheckItem(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCheckItem() } }}
              placeholder="Ex: Documento de identidade do tutor verificado"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
            <button
              onClick={addCheckItem}
              disabled={!newCheckItem.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-teal-50 border border-teal-200 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-100 transition-colors disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          </div>

          <button
            onClick={saveChecklist}
            disabled={savingChecklist}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
          >
            {savingChecklist
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
              : <><Save className="h-4 w-4" /> Salvar Checklist</>}
          </button>
        </div>
      </div>

      {/* ── Sessão 3: Fluxo Contínuo ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
              <Cpu className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Fluxo Contínuo</h3>
              <p className="text-xs text-slate-500">Incorpore módulos diretamente no Consultório</p>
            </div>
          </div>
          <button
            onClick={() => setContinuousFlow(v => !v)}
            className={`transition-colors ${continuousFlow ? 'text-amber-500' : 'text-slate-300'}`}
          >
            {continuousFlow
              ? <ToggleRight className="h-7 w-7" />
              : <ToggleLeft  className="h-7 w-7" />}
          </button>
        </div>

        <div className="px-6 py-5">
          {!continuousFlow ? (
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              <Cpu className="h-4 w-4 flex-shrink-0" />
              Ative o Fluxo Contínuo para escolher quais etapas o MV realiza na mesma tela
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Etapas incorporadas no Consultório do MV
              </p>
              {MERGEABLE.map(mod => {
                const merged = mergedModules.includes(mod.key)
                return (
                  <div key={mod.key} className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors ${merged ? 'border-amber-200 bg-amber-50' : 'border-slate-100'}`}>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{mod.label}</p>
                      <p className="text-xs text-slate-500">{mod.desc}</p>
                    </div>
                    <button
                      onClick={() => toggleMerged(mod.key)}
                      className={`transition-colors ${merged ? 'text-amber-500' : 'text-slate-300'}`}
                    >
                      {merged
                        ? <ToggleRight className="h-7 w-7" />
                        : <ToggleLeft  className="h-7 w-7" />}
                    </button>
                  </div>
                )
              })}

              {mergedModules.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
                  <span className="font-semibold">IA Unificada ativada:</span> o veterinário grava um único áudio e o sistema preenche todos os módulos mesclados automaticamente.
                </div>
              )}
            </div>
          )}

          <button
            onClick={saveFlow}
            disabled={savingFlow}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            {savingFlow
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
              : <><Save className="h-4 w-4" /> Salvar Configuração de Fluxo</>}
          </button>
        </div>
      </div>

      {/* ── Required Fields Config ── */}
      <RequiredFieldsConfig initialSettingsConfig={initialSettingsConfig ?? null} onToast={onToast} />
    </div>
  )
}

// ─── Required Fields Sub-Component ──────────────────────────────────────────

function RequiredFieldsConfig({ initialSettingsConfig, onToast }: { initialSettingsConfig: ClinicSettingsConfig | null; onToast: (type: 'success' | 'error', msg: string) => void }) {
  const [checkinFields, setCheckinFields] = useState<string[]>(initialSettingsConfig?.checkin_required_fields ?? ['address', 'emergency_contact'])
  const [triageFields, setTriageFields] = useState<string[]>(initialSettingsConfig?.triage_required_fields ?? ['weight', 'temperature', 'chief_complaint'])
  const [saving, setSaving] = useState(false)

  function toggleField(list: string[], setList: (v: string[]) => void, key: string) {
    setList(list.includes(key) ? list.filter(k => k !== key) : [...list, key])
  }

  async function saveRequiredFields() {
    setSaving(true)
    const res = await updateClinicConfig({
      // These fields are stored in the clinics table as JSONB columns (via migrations 0072/0073)
      // We pass them through updateClinicConfig which does a generic .update() on clinics table
    } as any)
    // Since clinic_settings is a separate table, we need to update it directly
    // For now we use the existing pattern — update via Supabase directly
    try {
      const response = await fetch('/api/update-required-fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkin_required_fields: checkinFields, triage_required_fields: triageFields }),
      })
      if (!response.ok) throw new Error('Falha ao salvar')
      onToast('success', 'Campos obrigatórios atualizados!')
    } catch {
      onToast('error', 'Erro ao salvar campos obrigatórios.')
    }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 mt-5">
      <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
          <ClipboardList className="h-4 w-4 text-teal-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Campos Obrigatórios</h2>
          <p className="text-xs text-slate-500">Configure quais campos são obrigatórios no check-in e na triagem</p>
        </div>
      </div>

      <div className="px-6 py-4 space-y-5">
        {/* Check-in fields */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Check-in (Recepção)</h3>
          <div className="space-y-2">
            {CHECKIN_FIELD_OPTIONS.map(f => (
              <label key={f.key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checkinFields.includes(f.key)}
                  onChange={() => toggleField(checkinFields, setCheckinFields, f.key)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-slate-700">{f.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Triage fields */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Triagem (Sinais Vitais)</h3>
          <div className="space-y-2">
            {TRIAGE_FIELD_OPTIONS.map(f => (
              <label key={f.key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={triageFields.includes(f.key)}
                  onChange={() => toggleField(triageFields, setTriageFields, f.key)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm text-slate-700">{f.label}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={saveRequiredFields}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Salvando...' : 'Salvar Campos Obrigatórios'}
        </button>
      </div>
    </div>
  )
}
