'use client'

import { useState } from 'react'
import {
  X, ToggleLeft, ToggleRight, Cpu,
  Save, Loader2, CheckCircle2, ClipboardList, Plus,
} from 'lucide-react'
import {
  updateClinicConfig,
  type FlowConfig, type ClinicConfig,
} from '@/lib/actions/clinic-settings'

const MERGEABLE = [
  { key: 'triage' as const, label: 'Triagem', desc: 'Coleta de sinais vitais dentro do Consultório' },
  { key: 'exams'  as const, label: 'Exames',  desc: 'Ditado de laudos dentro do Consultório' },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialConfig:          ClinicConfig | null
  initialChecklist?:      string[]
  onToast: (type: 'success' | 'error', msg: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClinicSettingsTab({ initialConfig, initialChecklist = [], onToast }: Props) {
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
    </div>
  )
}
