'use client'

import { useState } from 'react'
import {
  X, ToggleLeft, ToggleRight, Cpu,
  Save, Loader2, CheckCircle2, ClipboardList, Plus, Sparkles, FileText,
  Lock, ArrowUpRight,
} from 'lucide-react'
import {
  updateClinicConfig,
  updateRequiredFields,
  type FlowConfig, type ClinicConfig, type ClinicSettingsConfig, type AiTranscriptionMode,
} from '@/lib/actions/clinic-settings'
import { useUpgradeModal } from '@/components/upgrade/UpgradeProvider'

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
  /** SysMax mantém UX completa (sem paywall). Free vê paywall no Fluxo Contínuo. */
  isSysmax?:              boolean
  onToast: (type: 'success' | 'error', msg: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClinicSettingsTab({
  initialConfig, initialChecklist = [], initialSettingsConfig,
  isSysmax = false,
  onToast,
}: Props) {
  const { open: openUpgrade } = useUpgradeModal()
  const [continuousFlow,      setContinuousFlow]      = useState(initialConfig?.continuous_flow ?? false)
  const [mergedModules,       setMergedModules]       = useState<Array<'triage'|'exams'>>(
    initialConfig?.flow_config?.vet_merged_modules ?? []
  )
  // Épico B (04/06, decisão Q4): PDV unificado ao Caixa
  const [pdvUnified,          setPdvUnified]          = useState(
    initialConfig?.flow_config?.pdv_unified_with_cashier ?? false
  )
  const [aiMode,              setAiMode]              = useState<AiTranscriptionMode>(
    initialConfig?.ai_transcription_mode ?? 'ai_assisted'
  )
  const [savingAiMode,        setSavingAiMode]        = useState(false)

  const [checklist,           setChecklist]           = useState<string[]>(initialChecklist)
  const [newCheckItem,        setNewCheckItem]        = useState('')
  const [savingChecklist,     setSavingChecklist]     = useState(false)
  const [savingFlow,          setSavingFlow]          = useState(false)

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
      // Merge com a config existente — antes este save sobrescrevia o JSONB
      // inteiro e apagava flags como internacao_completa/centro_cirurgico.
      flow_config: {
        ...(initialConfig?.flow_config ?? {}),
        vet_merged_modules:       continuousFlow ? mergedModules : [],
        pdv_unified_with_cashier: pdvUnified,
      },
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

  // ── AI Transcription Mode ───────────────────────────────────────────────────

  async function saveAiMode() {
    setSavingAiMode(true)
    const res = await updateClinicConfig({ ai_transcription_mode: aiMode })
    setSavingAiMode(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Comportamento da IA atualizado!')
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

      {/* ── Sessão 2: Comportamento da IA ────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
            <Sparkles className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Comportamento da IA nas Gravações</h3>
            <p className="text-xs text-slate-500">
              Define como o sistema processa o áudio ditado em todas as telas (Triagem, Consultório, Exames, Internação)
            </p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-3">
          {/* Opção 1 — Apenas Transcrição */}
          <button
            type="button"
            onClick={() => setAiMode('transcribe_only')}
            className={`w-full flex items-start gap-4 rounded-xl border-2 px-4 py-4 text-left transition-all ${
              aiMode === 'transcribe_only'
                ? 'border-violet-400 bg-violet-50'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
              aiMode === 'transcribe_only' ? 'border-violet-500' : 'border-slate-300'
            }`}>
              {aiMode === 'transcribe_only' && <div className="h-2 w-2 rounded-full bg-violet-500" />}
            </div>
            <div className="flex items-start gap-3 min-w-0">
              <FileText className={`h-4 w-4 flex-shrink-0 mt-0.5 ${aiMode === 'transcribe_only' ? 'text-violet-600' : 'text-slate-400'}`} />
              <div>
                <p className={`text-sm font-semibold ${aiMode === 'transcribe_only' ? 'text-violet-900' : 'text-slate-700'}`}>
                  Apenas Transcrição
                </p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  O texto registrado no prontuário fica exatamente como o vet falou — sem reformulação.
                  Ideal para quem quer controle total sobre o que aparece nas notas clínicas.
                </p>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  A IA continua extraindo medicações aplicadas, documentos sugeridos, retornos, vacinas e roteamento (alta / internação / exames) a partir da fala.
                </p>
              </div>
            </div>
          </button>

          {/* Opção 2 — IA Assistida */}
          <button
            type="button"
            onClick={() => setAiMode('ai_assisted')}
            className={`w-full flex items-start gap-4 rounded-xl border-2 px-4 py-4 text-left transition-all ${
              aiMode === 'ai_assisted'
                ? 'border-violet-400 bg-violet-50'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
              aiMode === 'ai_assisted' ? 'border-violet-500' : 'border-slate-300'
            }`}>
              {aiMode === 'ai_assisted' && <div className="h-2 w-2 rounded-full bg-violet-500" />}
            </div>
            <div className="flex items-start gap-3 min-w-0">
              <Sparkles className={`h-4 w-4 flex-shrink-0 mt-0.5 ${aiMode === 'ai_assisted' ? 'text-violet-600' : 'text-slate-400'}`} />
              <div>
                <p className={`text-sm font-semibold ${aiMode === 'ai_assisted' ? 'text-violet-900' : 'text-slate-700'}`}>
                  Transcrição Reescrita pela IA
                </p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  A IA reescreve o texto do prontuário em formato SOAP (Subjetivo, Objetivo, Avaliação, Plano)
                  com linguagem técnica formal conforme CFMV.
                </p>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  Demais sugestões (medicações, documentos, retornos, internação) acontecem em ambos os modos.
                </p>
                {aiMode === 'ai_assisted' && (
                  <span className="inline-flex items-center gap-1 mt-2 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                    <Sparkles className="h-2.5 w-2.5" /> Recomendado
                  </span>
                )}
              </div>
            </div>
          </button>

          <button
            onClick={saveAiMode}
            disabled={savingAiMode}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
          >
            {savingAiMode
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
              : <><Save className="h-4 w-4" /> Salvar Comportamento da IA</>}
          </button>
        </div>
      </div>

      {/* ── Sessão 3: Fluxo Contínuo ──────────────────────────────────────────── */}
      {!isSysmax ? (
        <div className="rounded-2xl border-2 border-dashed border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-violet-600 shadow-md shadow-violet-200">
              <Lock className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Cpu className="h-4 w-4 text-violet-700" />
                <h3 className="text-base font-bold text-slate-900">Fluxo Contínuo</h3>
                <span className="text-[10px] font-bold uppercase tracking-wide text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
                  Pro
                </span>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed mb-4">
                Una Triagem, Consultório e Exames numa única tela. O MV grava um único áudio e a IA preenche todos os módulos automaticamente.
              </p>
              <button
                type="button"
                onClick={() => openUpgrade('continuous_flow')}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-bold text-white shadow-md shadow-violet-200 transition-colors"
              >
                Habilitar Fluxo Contínuo
                <ArrowUpRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
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

          {/* Épico B (04/06, Q4): PDV unificado ao Caixa — independente do
              toggle de fluxo do consultório */}
          <div className={`mt-4 flex items-center justify-between rounded-xl border px-4 py-3 transition-colors ${pdvUnified ? 'border-teal-200 bg-teal-50' : 'border-slate-100'}`}>
            <div>
              <p className="text-sm font-medium text-slate-800">PDV unificado ao Caixa</p>
              <p className="text-xs text-slate-500">
                O módulo PDV some do menu e a venda avulsa passa a ser lançada no topo de Caixa → Recebimentos.
              </p>
            </div>
            <button
              onClick={() => setPdvUnified(v => !v)}
              className={`transition-colors ${pdvUnified ? 'text-teal-500' : 'text-slate-300'}`}
            >
              {pdvUnified
                ? <ToggleRight className="h-7 w-7" />
                : <ToggleLeft  className="h-7 w-7" />}
            </button>
          </div>

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
      )}

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
    const res = await updateRequiredFields(checkinFields, triageFields)
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Campos obrigatórios atualizados!')
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
