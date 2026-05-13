'use client'

import { useState } from 'react'
import {
  Building2, Shield, Sparkles, MessageCircle, BookOpen,
  BarChart3, Wrench, ChevronRight, Save, Loader2,
  ToggleLeft, ToggleRight, FileText, ExternalLink,
  Cpu, CheckCircle2, Plus, X,
} from 'lucide-react'

import ModulesTab from '@/components/management/ModulesTab'
import BusinessHoursTab from '@/components/management/BusinessHoursTab'
import CsvImporter from '@/components/management/CsvImporter'
import WhatsappSettings from '@/components/management/Settings/WhatsappSettings'
import WhatsappIntelligentSetup from '@/components/management/Settings/WhatsappIntelligentSetup'

import type { ClinicConfig, ClinicSettingsConfig, AiTranscriptionMode } from '@/lib/actions/clinic-settings'
import { updateClinicConfig, updateRequiredFields } from '@/lib/actions/clinic-settings'
import type { WhatsAppSettingsDisplay } from '@/lib/actions/whatsapp'

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingsCategory =
  | 'geral'
  | 'acesso'
  | 'ia'
  | 'whatsapp'
  | 'contabil'
  | 'relatorios'
  | 'utilitarios'

interface Props {
  initialClinicConfig:      ClinicConfig | null
  initialSettingsConfig?:   ClinicSettingsConfig | null
  initialWhatsAppSettings?: WhatsAppSettingsDisplay | null
  onToast:                  (type: 'success' | 'error', msg: string) => void
}

// ─── Category definitions ─────────────────────────────────────────────────────

const CATEGORIES: {
  key:   SettingsCategory
  label: string
  desc:  string
  icon:  React.ElementType
  color: string
}[] = [
  { key: 'geral',       label: 'Geral',       desc: 'Horário de funcionamento e checklist',    icon: Building2,     color: 'text-blue-600 bg-blue-50'   },
  { key: 'acesso',      label: 'Acesso',       desc: 'Módulos ativos e campos obrigatórios',   icon: Shield,        color: 'text-slate-600 bg-slate-100' },
  { key: 'ia',          label: 'IA',           desc: 'Transcrição de voz e fluxo contínuo',    icon: Sparkles,      color: 'text-violet-600 bg-violet-50'},
  { key: 'whatsapp',    label: 'WhatsApp',     desc: 'Evolution API, bot e campanhas',          icon: MessageCircle, color: 'text-green-600 bg-green-50'  },
  { key: 'contabil',    label: 'Contábil',     desc: 'Plano de contas e dados fiscais',         icon: BookOpen,      color: 'text-amber-600 bg-amber-50'  },
  { key: 'relatorios',  label: 'Relatórios',   desc: 'Disponibilidade de relatórios e DRE',    icon: BarChart3,     color: 'text-teal-600 bg-teal-50'   },
  { key: 'utilitarios', label: 'Utilitários',  desc: 'Importação CSV, logs e suporte',          icon: Wrench,        color: 'text-orange-600 bg-orange-50'},
]

// ─── Constants ────────────────────────────────────────────────────────────────

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

const MERGEABLE = [
  { key: 'triage' as const, label: 'Triagem', desc: 'Coleta de sinais vitais dentro do Consultório' },
  { key: 'exams'  as const, label: 'Exames',  desc: 'Ditado de laudos dentro do Consultório' },
]

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SettingsWorkspace({
  initialClinicConfig,
  initialSettingsConfig = null,
  initialWhatsAppSettings = null,
  onToast,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('geral')
  const activeDef = CATEGORIES.find(c => c.key === activeCategory)!

  return (
    <div className="flex flex-col lg:flex-row gap-4">

      {/* ── Sidebar ── */}
      <nav className="lg:w-56 flex-shrink-0">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {CATEGORIES.map((cat, idx) => {
            const Icon   = cat.icon
            const active = activeCategory === cat.key
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                  ${idx > 0 ? 'border-t border-slate-100' : ''}
                  ${active ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'}`}
              >
                <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg
                  ${active ? 'bg-white/20' : cat.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="flex-1 text-sm font-medium truncate">{cat.label}</span>
                {active && <ChevronRight className="h-4 w-4 opacity-60 flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      </nav>

      {/* ── Content ── */}
      <div className="flex-1 min-w-0">
        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs text-slate-400">Configurações</span>
          <ChevronRight className="h-3 w-3 text-slate-300" />
          <span className="text-xs font-semibold text-slate-700">{activeDef.label}</span>
        </div>

        {/* ── Geral: Horário + Checklist ── */}
        {activeCategory === 'geral' && (
          <div className="space-y-6">
            <BusinessHoursTab
              initialConfig={initialClinicConfig}
              onToast={onToast}
            />
            <ChecklistSection
              initialConfig={initialClinicConfig}
              onToast={onToast}
            />
          </div>
        )}

        {/* ── Acesso: Módulos + Campos Obrigatórios ── */}
        {activeCategory === 'acesso' && (
          <div className="space-y-6">
            <ModulesTab
              initialConfig={initialClinicConfig}
              onToast={onToast}
            />
            <RequiredFieldsSection
              initialSettingsConfig={initialSettingsConfig}
              onToast={onToast}
            />
          </div>
        )}

        {/* ── IA: Transcrição + Fluxo Contínuo ── */}
        {activeCategory === 'ia' && (
          <div className="space-y-6">
            <AiTranscriptionSection
              initialConfig={initialClinicConfig}
              onToast={onToast}
            />
            <ContinuousFlowSection
              initialConfig={initialClinicConfig}
              onToast={onToast}
            />
          </div>
        )}

        {/* ── WhatsApp ── */}
        {activeCategory === 'whatsapp' && (
          <div className="space-y-6">
            <WhatsappSettings
              initial={initialWhatsAppSettings}
              onToast={onToast}
            />
            <WhatsappIntelligentSetup onToast={onToast} />
          </div>
        )}

        {/* ── Contábil ── */}
        {activeCategory === 'contabil' && (
          <AccountingSection
            initialConfig={initialClinicConfig}
            onToast={onToast}
          />
        )}

        {/* ── Relatórios ── */}
        {activeCategory === 'relatorios' && <ReportsSection />}

        {/* ── Utilitários ── */}
        {activeCategory === 'utilitarios' && <UtilitiesSection />}
      </div>
    </div>
  )
}

// ─── Geral: Checklist de Check-in ────────────────────────────────────────────

function ChecklistSection({ initialConfig, onToast }: {
  initialConfig: ClinicConfig | null
  onToast:       (type: 'success' | 'error', msg: string) => void
}) {
  const [checklist, setChecklist] = useState<string[]>(
    (initialConfig as any)?.reception_checklist ?? []
  )
  const [newItem, setNewItem] = useState('')
  const [saving,  setSaving]  = useState(false)

  function addItem() {
    const item = newItem.trim()
    if (!item || checklist.includes(item)) return
    setChecklist(prev => [...prev, item])
    setNewItem('')
  }

  async function saveChecklist() {
    setSaving(true)
    const res = await updateClinicConfig({ reception_checklist: checklist })
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Checklist de check-in salvo!')
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
          <CheckCircle2 className="h-4 w-4 text-teal-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Checklist de Check-in</h3>
          <p className="text-xs text-slate-500">Itens obrigatórios que a recepção confirma no check-in</p>
        </div>
      </div>

      <div className="px-6 py-4 space-y-3">
        {checklist.length === 0 ? (
          <p className="text-sm text-slate-400 italic">Nenhum item configurado. Adicione abaixo.</p>
        ) : (
          <div className="space-y-2">
            {checklist.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2.5 hover:border-slate-200 transition-colors">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 text-teal-500 flex-shrink-0" />
                  <span className="text-sm text-slate-700">{item}</span>
                </div>
                <button
                  onClick={() => setChecklist(prev => prev.filter((_, i) => i !== idx))}
                  className="text-slate-300 hover:text-red-500 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
            placeholder="Ex: Documento de identidade do tutor verificado"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
          <button
            onClick={addItem}
            disabled={!newItem.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-teal-50 border border-teal-200 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-100 transition-colors disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>

        <button
          onClick={saveChecklist}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
        >
          {saving
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
            : <><Save className="h-4 w-4" /> Salvar Checklist</>}
        </button>
      </div>
    </div>
  )
}

// ─── Acesso: Campos Obrigatórios ─────────────────────────────────────────────

function RequiredFieldsSection({ initialSettingsConfig, onToast }: {
  initialSettingsConfig: ClinicSettingsConfig | null
  onToast:               (type: 'success' | 'error', msg: string) => void
}) {
  const [checkinFields, setCheckinFields] = useState<string[]>(
    initialSettingsConfig?.checkin_required_fields ?? ['address', 'emergency_contact']
  )
  const [triageFields, setTriageFields] = useState<string[]>(
    initialSettingsConfig?.triage_required_fields ?? ['weight', 'temperature', 'chief_complaint']
  )
  const [saving, setSaving] = useState(false)

  function toggleField(list: string[], setList: (v: string[]) => void, key: string) {
    setList(list.includes(key) ? list.filter(k => k !== key) : [...list, key])
  }

  async function handleSave() {
    setSaving(true)
    const res = await updateRequiredFields(checkinFields, triageFields)
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Campos obrigatórios atualizados!')
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
          <Shield className="h-4 w-4 text-teal-600" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Campos Obrigatórios</h2>
          <p className="text-xs text-slate-500">Defina quais campos são obrigatórios no check-in e na triagem</p>
        </div>
      </div>

      <div className="px-6 py-4 space-y-5">
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
          onClick={handleSave}
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

// ─── IA: Modo de Transcrição ──────────────────────────────────────────────────

function AiTranscriptionSection({ initialConfig, onToast }: {
  initialConfig: ClinicConfig | null
  onToast:       (type: 'success' | 'error', msg: string) => void
}) {
  const [aiMode, setAiMode] = useState<AiTranscriptionMode>(
    initialConfig?.ai_transcription_mode ?? 'ai_assisted'
  )
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const res = await updateClinicConfig({ ai_transcription_mode: aiMode })
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Comportamento da IA atualizado!')
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
          <Sparkles className="h-4 w-4 text-violet-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Comportamento da IA nas Gravações</h3>
          <p className="text-xs text-slate-500">
            Define como o sistema processa o áudio ditado em todas as telas
          </p>
        </div>
      </div>

      <div className="px-6 py-5 space-y-3">
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
                O texto é registrado exatamente como foi falado, sem alteração pela IA.
                Ideal para clínicas que preferem controle total sobre o conteúdo.
              </p>
            </div>
          </div>
        </button>

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
                Transcrição com Preenchimento Técnico
              </p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                A IA analisa o relato oral e preenche os campos clínicos com linguagem técnica formal (CFMV).
                Extrai sinais vitais, motivos de internação, laudos e mais.
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
          onClick={handleSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
        >
          {saving
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
            : <><Save className="h-4 w-4" /> Salvar Comportamento da IA</>}
        </button>
      </div>
    </div>
  )
}

// ─── IA: Fluxo Contínuo ───────────────────────────────────────────────────────

function ContinuousFlowSection({ initialConfig, onToast }: {
  initialConfig: ClinicConfig | null
  onToast:       (type: 'success' | 'error', msg: string) => void
}) {
  const [continuousFlow, setContinuousFlow] = useState(initialConfig?.continuous_flow ?? false)
  const [mergedModules,  setMergedModules]  = useState<Array<'triage'|'exams'>>(
    initialConfig?.flow_config?.vet_merged_modules ?? []
  )
  const [saving, setSaving] = useState(false)

  function toggleMerged(key: 'triage' | 'exams') {
    setMergedModules(prev =>
      prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]
    )
  }

  async function handleSave() {
    setSaving(true)
    const res = await updateClinicConfig({
      continuous_flow: continuousFlow,
      flow_config: { vet_merged_modules: continuousFlow ? mergedModules : [] },
    })
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Fluxo contínuo configurado!')
  }

  return (
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
                <span className="font-semibold">IA Unificada ativada:</span> o veterinário grava um único áudio
                e o sistema preenche todos os módulos mesclados automaticamente.
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          {saving
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
            : <><Save className="h-4 w-4" /> Salvar Configuração de Fluxo</>}
        </button>
      </div>
    </div>
  )
}

// ─── Contábil ─────────────────────────────────────────────────────────────────

function AccountingSection({ initialConfig, onToast }: {
  initialConfig: ClinicConfig | null
  onToast:       (type: 'success' | 'error', msg: string) => void
}) {
  const [useAccountingChart, setUseAccountingChart] = useState<boolean>(
    (initialConfig as any)?.use_accounting_chart ?? false
  )
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const res = await updateClinicConfig({ use_accounting_chart: useAccountingChart } as any)
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Configuração contábil salva!')
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
            <BookOpen className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Plano de Contas Contábil</h3>
            <p className="text-xs text-slate-500">Ativa categorias contábeis completas no módulo Financeiro</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <p className="text-sm font-semibold text-slate-800">Usar Plano de Contas Contábil</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {useAccountingChart
                  ? 'Ativado — versão completa com categorias contábeis CFMV'
                  : 'Desativado — versão simplificada veterinária'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setUseAccountingChart(v => !v)}
              className={`transition-colors ${useAccountingChart ? 'text-amber-500' : 'text-slate-300'}`}
            >
              {useAccountingChart
                ? <ToggleRight className="h-7 w-7" />
                : <ToggleLeft  className="h-7 w-7" />}
            </button>
          </div>

          {useAccountingChart && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
              <span className="font-semibold">Plano de contas ativo:</span> as entradas financeiras serão
              vinculadas a categorias contábeis padronizadas para facilitar a exportação ao contador.
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
          >
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
              : <><Save className="h-4 w-4" /> Salvar</>}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="text-sm font-semibold text-slate-900">Dados Fiscais</h3>
          <p className="text-xs text-slate-500 mt-0.5">Inscrição estadual, municipal e NFS-e — disponível em breve</p>
        </div>
        <div className="px-6 py-8 text-center">
          <BookOpen className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Configurações fiscais (NFS-e) serão adicionadas em breve.</p>
        </div>
      </div>
    </div>
  )
}

// ─── Relatórios ───────────────────────────────────────────────────────────────

function ReportsSection() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
          <BarChart3 className="h-4 w-4 text-teal-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Configurações de Relatórios</h3>
          <p className="text-xs text-slate-500">Disponibilidade de relatórios e parâmetros de DRE</p>
        </div>
      </div>
      <div className="px-6 py-8 text-center">
        <BarChart3 className="h-10 w-10 text-slate-200 mx-auto mb-3" />
        <p className="text-sm text-slate-400">
          Configurações de relatórios disponíveis no módulo G-13 (em desenvolvimento).
        </p>
      </div>
    </div>
  )
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function UtilitiesSection() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="text-sm font-semibold text-slate-900">Importação de Dados (CSV)</h3>
          <p className="text-xs text-slate-500">Importe tutores, pets e histórico de um sistema anterior</p>
        </div>
        <div className="p-6">
          <CsvImporter />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h3 className="text-sm font-semibold text-slate-900">Suporte</h3>
          <p className="text-xs text-slate-500">Canais de atendimento Sysmax Solutions</p>
        </div>
        <div className="px-6 py-5 space-y-3">
          <a
            href="https://wa.me/5511999999999"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-sm text-slate-700"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50">
              <MessageCircle className="h-4 w-4 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium">WhatsApp Suporte</p>
              <p className="text-xs text-slate-400">Atendimento seg–sex, 9h–18h</p>
            </div>
            <ExternalLink className="h-4 w-4 text-slate-300" />
          </a>
          <a
            href="mailto:suporte@sysmaxsolutions.com.br"
            className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-sm text-slate-700"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
              <ExternalLink className="h-4 w-4 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium">E-mail Suporte</p>
              <p className="text-xs text-slate-400">suporte@sysmaxsolutions.com.br</p>
            </div>
            <ExternalLink className="h-4 w-4 text-slate-300" />
          </a>
        </div>
      </div>
    </div>
  )
}
