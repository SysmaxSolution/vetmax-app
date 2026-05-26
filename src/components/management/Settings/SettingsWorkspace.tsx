'use client'

import { useState } from 'react'
import {
  Building2, Shield, Sparkles, MessageCircle, Calculator,
  BarChart3, Wrench, ToggleLeft, ToggleRight, Save, Loader2,
  FileText, Cpu, HelpCircle,
} from 'lucide-react'
import type { ClinicConfig, ClinicSettingsConfig, AiTranscriptionMode, FlowConfig } from '@/lib/actions/clinic-settings'
import { updateClinicConfig } from '@/lib/actions/clinic-settings'
import ModulesTab from '../ModulesTab'
import ClinicSettingsTab from '../ClinicSettingsTab'
import CsvImporter from '../CsvImporter'
import WhatsappIntelligentSetup from './WhatsappIntelligentSetup'
import { useUpgradeModal } from '@/components/upgrade/UpgradeProvider'
import type { UpgradeFeatureKey } from '@/components/upgrade/UpgradeModal'
import { Lock, ArrowUpRight } from 'lucide-react'

// ─── Category definitions ─────────────────────────────────────────────────────

type Category = 'geral' | 'acesso' | 'ia' | 'whatsapp' | 'contabil' | 'relatorios' | 'utilitarios'

interface CategoryDef {
  key: Category
  label: string
  icon: React.ReactNode
  description: string
}

const CATEGORIES: CategoryDef[] = [
  { key: 'geral',        label: 'Geral',       icon: <Building2    className="h-4 w-4" />, description: 'Horário e dados operacionais'        },
  { key: 'acesso',       label: 'Acesso',      icon: <Shield       className="h-4 w-4" />, description: 'Módulos e campos obrigatórios'        },
  { key: 'ia',           label: 'IA',          icon: <Sparkles     className="h-4 w-4" />, description: 'Transcrição e comportamento da IA'   },
  { key: 'whatsapp',     label: 'WhatsApp',    icon: <MessageCircle className="h-4 w-4" />, description: 'Evolution API e notificações'        },
  { key: 'contabil',     label: 'Contábil',    icon: <Calculator   className="h-4 w-4" />, description: 'Plano de contas e dados fiscais'     },
  { key: 'relatorios',   label: 'Relatórios',  icon: <BarChart3    className="h-4 w-4" />, description: 'Relatórios disponíveis'              },
  { key: 'utilitarios',  label: 'Utilitários', icon: <Wrench       className="h-4 w-4" />, description: 'Exportação e importação de dados'    },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialClinicConfig:      ClinicConfig | null
  initialSettingsConfig?:   ClinicSettingsConfig | null
  initialChecklist?:        string[]
  activeModules?:           string[]
  onToast: (type: 'success' | 'error', msg: string) => void
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsWorkspace({
  initialClinicConfig,
  initialSettingsConfig,
  initialChecklist = [],
  activeModules = [],
  onToast,
}: Props) {
  const [activeCategory, setActiveCategory] = useState<Category>('geral')
  const { open: openUpgrade } = useUpgradeModal()

  const whatsappUnlocked = activeModules.includes('whatsapp_intelligent')
  const reportsUnlocked  = activeModules.includes('reports')

  return (
    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 min-h-[600px]">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="w-full sm:w-52 sm:flex-shrink-0">
        <nav className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Categorias</p>
          </div>
          <div className="flex sm:flex-col overflow-x-auto pb-1 sm:pb-0 gap-1 py-1 sm:py-1 px-1 sm:px-0">
            {CATEGORIES.map(cat => {
              const isActive = activeCategory === cat.key
              return (
                <button
                  key={cat.key}
                  onClick={() => setActiveCategory(cat.key)}
                  className={`whitespace-nowrap sm:whitespace-normal w-auto sm:w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors rounded-lg sm:rounded-none flex-shrink-0 sm:flex-shrink ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`}>
                    {cat.icon}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium leading-tight ${isActive ? 'text-white' : 'text-slate-700'}`}>
                      {cat.label}
                    </p>
                    <p className={`text-[10px] leading-tight truncate hidden sm:block ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                      {cat.description}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </nav>
      </aside>

      {/* ── Content area ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">

        {activeCategory === 'geral' && (
          <div className="space-y-6">
            <SectionHeader icon={<Building2 className="h-5 w-5 text-slate-600" />} title="Configurações Gerais" description="Configurações operacionais da clínica" />
            <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-5 py-4 border border-slate-200">
              O horário de funcionamento está disponível em <strong>Gestão → Clínica</strong>.
            </p>
            <RegistrationSettings initialConfig={initialClinicConfig} onToast={onToast} />
            <MentorIdleSettings initialConfig={initialClinicConfig} onToast={onToast} />
          </div>
        )}

        {activeCategory === 'acesso' && (
          <div className="space-y-6">
            <SectionHeader icon={<Shield className="h-5 w-5 text-slate-600" />} title="Controle de Acesso" description="Módulos ativos e campos obrigatórios de check-in e triagem" />
            <ModulesTab initialConfig={initialClinicConfig} onToast={onToast} />
            <ClinicSettingsTab
              initialConfig={initialClinicConfig}
              initialChecklist={initialChecklist}
              initialSettingsConfig={initialSettingsConfig}
              onToast={onToast}
            />
          </div>
        )}

        {activeCategory === 'ia' && (
          <div className="space-y-6">
            <SectionHeader icon={<Sparkles className="h-5 w-5 text-slate-600" />} title="Inteligência Artificial" description="Comportamento da IA nas gravações de voz e transcrições" />
            <AiSettings initialConfig={initialClinicConfig} onToast={onToast} />
          </div>
        )}

        {activeCategory === 'whatsapp' && (
          <div className="space-y-6">
            <SectionHeader icon={<MessageCircle className="h-5 w-5 text-slate-600" />} title="WhatsApp" description="Leia o QR Code para conectar a instância da clínica — atende bot e disparos automáticos" />
            {whatsappUnlocked
              ? <WhatsappIntelligentSetup onToast={onToast} />
              : (
                <UpsellCard
                  feature="whatsapp_intelligent"
                  title="Habilitar WhatsApp Bot"
                  body="Conecte o WhatsApp da sua clínica e deixe a IA confirmar agendamentos, responder dúvidas e triar urgências 24/7. Disponível no Plano Pro."
                  onClick={() => openUpgrade('whatsapp_intelligent')}
                />
              )
            }
          </div>
        )}

        {activeCategory === 'contabil' && (
          <div className="space-y-6">
            <SectionHeader icon={<Calculator className="h-5 w-5 text-slate-600" />} title="Configurações Contábeis" description="Plano de contas e integração fiscal" />
            <AccountingSettings initialConfig={initialClinicConfig} onToast={onToast} />
          </div>
        )}

        {activeCategory === 'relatorios' && (
          <div className="space-y-6">
            <SectionHeader icon={<BarChart3 className="h-5 w-5 text-slate-600" />} title="Relatórios" description="Gerencie quais relatórios estão disponíveis para sua clínica" />
            {reportsUnlocked
              ? <ReportsSettings />
              : (
                <UpsellCard
                  feature="reports_export"
                  title="Habilitar Relatórios Avançados em PDF"
                  body="DRE, Curva ABC, Comissões e relatórios operacionais — tudo exportável em PDF com a logo da clínica. Disponível no Plano Pro."
                  onClick={() => openUpgrade('reports_export')}
                />
              )
            }
          </div>
        )}

        {activeCategory === 'utilitarios' && (
          <div className="space-y-6">
            <SectionHeader icon={<Wrench className="h-5 w-5 text-slate-600" />} title="Utilitários" description="Ferramentas de importação e exportação de dados" />
            <CsvImporter />
            <SupportCard />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── UpsellCard — exibido no lugar do conteúdo real quando o módulo
// não está liberado pelo plano (Freemium 2026-05-26). Click abre o
// UpgradeModal via useUpgradeModal().
// ─────────────────────────────────────────────────────────────────────────────

function UpsellCard({
  feature, title, body, onClick,
}: {
  feature:  UpgradeFeatureKey
  title:    string
  body:     string
  onClick:  () => void
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-violet-600 shadow-md shadow-violet-200">
          <Lock className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-bold text-slate-900">{title}</h3>
            <span className="text-[10px] font-bold uppercase tracking-wide text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
              Pro
            </span>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed mb-4">{body}</p>
          <button
            type="button"
            onClick={onClick}
            data-feature={feature}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-700 px-4 py-2 text-sm font-bold text-white shadow-md shadow-violet-200 transition-colors"
          >
            Quero habilitar
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, description }: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="flex items-center gap-3 pb-2 border-b border-slate-200">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
        {icon}
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </div>
  )
}

// ─── AiSettings ── (AI mode + Continuous flow) ────────────────────────────────

function AiSettings({ initialConfig, onToast }: {
  initialConfig: ClinicConfig | null
  onToast: (type: 'success' | 'error', msg: string) => void
}) {
  const [aiMode, setAiMode] = useState<AiTranscriptionMode>(
    initialConfig?.ai_transcription_mode ?? 'ai_assisted'
  )
  const [savingAiMode, setSavingAiMode] = useState(false)

  const [continuousFlow, setContinuousFlow] = useState(initialConfig?.continuous_flow ?? false)
  const [mergedModules, setMergedModules] = useState<Array<'triage' | 'exams'>>(
    initialConfig?.flow_config?.vet_merged_modules ?? []
  )
  const [savingFlow, setSavingFlow] = useState(false)

  const MERGEABLE = [
    { key: 'triage' as const, label: 'Triagem', desc: 'Coleta de sinais vitais dentro do Consultório' },
    { key: 'exams'  as const, label: 'Exames',  desc: 'Ditado de laudos dentro do Consultório' },
  ]

  function toggleMerged(key: 'triage' | 'exams') {
    setMergedModules(prev => prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key])
  }

  async function saveAiMode() {
    setSavingAiMode(true)
    const res = await updateClinicConfig({ ai_transcription_mode: aiMode })
    setSavingAiMode(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Comportamento da IA atualizado!')
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

  return (
    <div className="space-y-6">
      {/* ── Modo de Transcrição ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50">
            <Sparkles className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Comportamento da IA nas Gravações</h3>
            <p className="text-xs text-slate-500">Define como o sistema processa o áudio ditado em todas as telas</p>
          </div>
        </div>
        <div className="px-6 py-5 space-y-3">
          <button
            type="button"
            onClick={() => setAiMode('transcribe_only')}
            className={`w-full flex items-start gap-4 rounded-xl border-2 px-4 py-4 text-left transition-all ${
              aiMode === 'transcribe_only' ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${aiMode === 'transcribe_only' ? 'border-violet-500' : 'border-slate-300'}`}>
              {aiMode === 'transcribe_only' && <div className="h-2 w-2 rounded-full bg-violet-500" />}
            </div>
            <div className="flex items-start gap-3 min-w-0">
              <FileText className={`h-4 w-4 flex-shrink-0 mt-0.5 ${aiMode === 'transcribe_only' ? 'text-violet-600' : 'text-slate-400'}`} />
              <div>
                <p className={`text-sm font-semibold ${aiMode === 'transcribe_only' ? 'text-violet-900' : 'text-slate-700'}`}>Apenas Transcrição</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  O texto registrado no prontuário fica exatamente como o vet falou.
                </p>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  A IA continua sugerindo medicações aplicadas, documentos, retornos, vacinas e internação a partir da fala.
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setAiMode('ai_assisted')}
            className={`w-full flex items-start gap-4 rounded-xl border-2 px-4 py-4 text-left transition-all ${
              aiMode === 'ai_assisted' ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${aiMode === 'ai_assisted' ? 'border-violet-500' : 'border-slate-300'}`}>
              {aiMode === 'ai_assisted' && <div className="h-2 w-2 rounded-full bg-violet-500" />}
            </div>
            <div className="flex items-start gap-3 min-w-0">
              <Sparkles className={`h-4 w-4 flex-shrink-0 mt-0.5 ${aiMode === 'ai_assisted' ? 'text-violet-600' : 'text-slate-400'}`} />
              <div>
                <p className={`text-sm font-semibold ${aiMode === 'ai_assisted' ? 'text-violet-900' : 'text-slate-700'}`}>Transcrição Reescrita pela IA</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  A IA reescreve o texto do prontuário em formato SOAP com linguagem técnica formal (CFMV).
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

      {/* ── Fluxo Contínuo ────────────────────────────────────────────────────── */}
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
            {continuousFlow ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
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
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Etapas incorporadas no Consultório do MV</p>
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
                      {merged ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
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

// ─── AccountingSettings ───────────────────────────────────────────────────────

function AccountingSettings({ initialConfig, onToast }: {
  initialConfig: ClinicConfig | null
  onToast: (type: 'success' | 'error', msg: string) => void
}) {
  // Persist use_accounting_chart inside flow_config JSONB (no migration needed)
  const flowConfigRaw = initialConfig?.flow_config as (FlowConfig & { use_accounting_chart?: boolean }) | undefined
  const [useAccountingChart, setUseAccountingChart] = useState<boolean>(
    flowConfigRaw?.use_accounting_chart ?? false
  )
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const base: FlowConfig = initialConfig?.flow_config ?? { vet_merged_modules: [] }
    const res = await updateClinicConfig({
      flow_config: { ...base, use_accounting_chart: useAccountingChart } as FlowConfig & { use_accounting_chart: boolean },
    })
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Configurações contábeis salvas!')
  }

  return (
    <div className="space-y-4">
      {/* Plano de Contas */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
              <Calculator className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Plano de Contas Contábil</h3>
              <p className="text-xs text-slate-500">
                Habilita a vinculação de lançamentos financeiros ao plano de contas
              </p>
            </div>
          </div>
          <button
            onClick={() => setUseAccountingChart(v => !v)}
            className={`transition-colors ${useAccountingChart ? 'text-emerald-600' : 'text-slate-300'}`}
            title={useAccountingChart ? 'Desativar plano de contas' : 'Ativar plano de contas'}
          >
            {useAccountingChart
              ? <ToggleRight className="h-7 w-7" />
              : <ToggleLeft  className="h-7 w-7" />}
          </button>
        </div>
        <div className="px-6 py-4">
          {useAccountingChart ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-700">
              <span className="font-semibold">Plano de Contas ativo:</span> os lançamentos financeiros
              podem ser vinculados a contas contábeis no módulo Financeiro.
            </div>
          ) : (
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Quando ativado, aparece a coluna "Conta Contábil" nos lançamentos financeiros e
              relatórios contábeis são habilitados.
            </div>
          )}
        </div>
      </div>

      {/* Dados Fiscais — informativo */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
            <BarChart3 className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Dados Fiscais e NFS-e</h3>
            <p className="text-xs text-slate-500">Configuração de regime tributário e emissão de NFS-e</p>
          </div>
        </div>
        <div className="px-6 py-4">
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
            <span className="font-semibold">Em breve:</span> configurações de dados fiscais e emissão de NFS-e
            serão disponibilizadas aqui. O CNPJ da clínica está disponível na aba "Clínica".
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50"
      >
        {saving
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
          : <><Save className="h-4 w-4" /> Salvar Configurações Contábeis</>}
      </button>
    </div>
  )
}

// ─── ReportsSettings ──────────────────────────────────────────────────────────

const REPORT_TOGGLES = [
  { key: 'dre',          label: 'DRE — Demonstração de Resultado', desc: 'Relatório mensal de receitas e despesas'   },
  { key: 'abc_curve',    label: 'Curva ABC de Serviços',           desc: 'Ranking de serviços por faturamento'       },
  { key: 'productivity', label: 'Produtividade por Médico',        desc: 'Consultas e procedimentos por veterinário' },
  { key: 'grooming_kpi', label: 'KPIs de Banho e Tosa',           desc: 'Métricas do módulo de Grooming'            },
  { key: 'inventory',    label: 'Relatório de Estoque',            desc: 'Movimentação e saldo atual do estoque'     },
]

function ReportsSettings() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(REPORT_TOGGLES.map(r => [r.key, true]))
  )

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4">
        <h3 className="text-sm font-semibold text-slate-900">Relatórios Disponíveis</h3>
        <p className="text-xs text-slate-500 mt-0.5">Controle quais relatórios aparecem no módulo Relatórios</p>
      </div>
      <div className="divide-y divide-slate-50">
        {REPORT_TOGGLES.map(r => (
          <div key={r.key} className={`flex items-center gap-4 px-6 py-4 transition-colors ${enabled[r.key] ? 'bg-white' : 'bg-slate-50/50'}`}>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${enabled[r.key] ? 'text-slate-900' : 'text-slate-400'}`}>{r.label}</p>
              <p className="text-xs text-slate-500">{r.desc}</p>
            </div>
            <button
              onClick={() => setEnabled(prev => ({ ...prev, [r.key]: !prev[r.key] }))}
              className={`flex-shrink-0 transition-colors ${enabled[r.key] ? 'text-teal-600' : 'text-slate-300'}`}
            >
              {enabled[r.key]
                ? <ToggleRight className="h-7 w-7" />
                : <ToggleLeft  className="h-7 w-7" />}
            </button>
          </div>
        ))}
      </div>
      <div className="px-6 pb-5 pt-3">
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Nota:</span> a persistência granular por relatório
          será implementada em G-13. Por ora, os toggles refletem a preferência visual.
        </div>
      </div>
    </div>
  )
}

// ─── RegistrationSettings ─────────────────────────────────────────────────────

function RegistrationSettings({ initialConfig, onToast }: {
  initialConfig: ClinicConfig | null
  onToast: (type: 'success' | 'error', msg: string) => void
}) {
  const flow = initialConfig?.flow_config as any
  const [verifyCpf, setVerifyCpf] = useState<boolean>(flow?.verify_cpf_cnpj ?? false)
  const [verifyCep, setVerifyCep] = useState<boolean>(flow?.verify_cep       ?? false)
  const [saving, setSaving]       = useState(false)

  async function handleSave() {
    setSaving(true)
    const base = initialConfig?.flow_config ?? { vet_merged_modules: [] }
    const res = await updateClinicConfig({
      flow_config: { ...base, verify_cpf_cnpj: verifyCpf, verify_cep: verifyCep } as FlowConfig,
    })
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Configurações de cadastro salvas!')
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
          <Shield className="h-4 w-4 text-teal-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Validações no Cadastro de Pacientes</h3>
          <p className="text-xs text-slate-500">Controles automáticos no módulo Pacientes ao cadastrar tutores</p>
        </div>
      </div>
      <div className="px-6 py-5 space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800">Verificar CPF / CNPJ do tutor</p>
            <p className="text-xs text-slate-500 mt-0.5">Valida o dígito verificador e consulta dados públicos de CNPJ via Receita Federal</p>
          </div>
          <button onClick={() => setVerifyCpf(v => !v)} className={`transition-colors ${verifyCpf ? 'text-teal-600' : 'text-slate-300'}`}>
            {verifyCpf ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
          </button>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800">Verificar CEP</p>
            <p className="text-xs text-slate-500 mt-0.5">Preenche endereço automaticamente via ViaCEP ao digitar o CEP do tutor</p>
          </div>
          <button onClick={() => setVerifyCep(v => !v)} className={`transition-colors ${verifyCep ? 'text-teal-600' : 'text-slate-300'}`}>
            {verifyCep ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
          </button>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50"
        >
          {saving
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
            : <><Save className="h-4 w-4" /> Salvar Configurações de Cadastro</>}
        </button>
      </div>
    </div>
  )
}

// ─── MentorIdleSettings ───────────────────────────────────────────────────────

function MentorIdleSettings({ initialConfig, onToast }: {
  initialConfig: ClinicConfig | null
  onToast: (type: 'success' | 'error', msg: string) => void
}) {
  const flow = initialConfig?.flow_config as any
  const [enabled,  setEnabled]  = useState<boolean>(flow?.mentor_idle_enabled ?? true)
  const [seconds,  setSeconds]  = useState<number>(flow?.mentor_idle_seconds  ?? 30)
  const [saving,   setSaving]   = useState(false)

  async function handleSave() {
    setSaving(true)
    const base = initialConfig?.flow_config ?? { vet_merged_modules: [] }
    const res = await updateClinicConfig({
      flow_config: { ...base, mentor_idle_enabled: enabled, mentor_idle_seconds: seconds } as FlowConfig,
    })
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Configurações do Mentor salvas!')
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
          <HelpCircle className="h-4 w-4 text-blue-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Mentor de IA — Sugestão por Inatividade</h3>
          <p className="text-xs text-slate-500">Balão que aparece quando o usuário fica parado na tela</p>
        </div>
      </div>
      <div className="px-6 py-5 space-y-5">
        {/* Toggle */}
        <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800">Exibir sugestão de ajuda por inatividade</p>
            <p className="text-xs text-slate-500">Mostra "Precisa de ajuda?" quando o usuário fica parado</p>
          </div>
          <button
            onClick={() => setEnabled(v => !v)}
            className={`transition-colors ${enabled ? 'text-blue-500' : 'text-slate-300'}`}
          >
            {enabled ? <ToggleRight className="h-7 w-7" /> : <ToggleLeft className="h-7 w-7" />}
          </button>
        </div>

        {/* Tempo */}
        {enabled && (
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tempo de inatividade para exibição
              </label>
              <p className="text-xs text-slate-500 mb-2">
                Após quantos segundos parado o balão aparece (mín. 10 s, máx. 300 s)
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={10}
                  max={300}
                  step={5}
                  value={seconds}
                  onChange={e => setSeconds(Number(e.target.value))}
                  className="flex-1 accent-blue-600"
                />
                <span className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-center text-sm font-mono font-semibold text-slate-700">
                  {seconds}s
                </span>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
            : <><Save className="h-4 w-4" /> Salvar Configurações do Mentor</>}
        </button>
      </div>
    </div>
  )
}

// ─── SupportCard ──────────────────────────────────────────────────────────────

function SupportCard() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
          <Wrench className="h-4 w-4 text-teal-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Suporte Técnico</h3>
          <p className="text-xs text-slate-500">Entre em contato com a equipe Sysmax Solutions</p>
        </div>
      </div>
      <p className="text-sm text-slate-600 mb-4">
        Precisa de ajuda com a configuração do sistema ou encontrou um problema?
        Nossa equipe técnica está disponível para auxiliar.
      </p>
      <a
        href="mailto:suporte@sysmaxsolutions.com.br"
        className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors"
      >
        Contatar Suporte
      </a>
    </div>
  )
}
