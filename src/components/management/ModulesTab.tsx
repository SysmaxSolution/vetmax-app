'use client'

import { useState, useRef } from 'react'
import {
  ToggleLeft, ToggleRight, Loader2, Save, Shield, AlertTriangle, Eye, EyeOff,
  Lock, CheckCircle2,
  Hotel, Syringe, FlaskConical, Scissors, ShoppingBag, Stethoscope, ClipboardList, MessageCircle, MessageSquare, Sparkles, Bot, ShoppingCart, Truck,
  PawPrint, Banknote, FolderKanban, DollarSign, FileBarChart2,
} from 'lucide-react'
import { updateClinicConfig, type ClinicConfig, type FlowConfig } from '@/lib/actions/clinic-settings'
import { useUpgradeModal } from '@/components/upgrade/UpgradeProvider'
import { isModuleFree } from '@/config/access-matrix'
import type { UpgradeFeatureKey } from '@/components/upgrade/UpgradeModal'

// Mapa de módulos com gatilho de upgrade específico no catálogo
// (UpgradeModal.UPGRADE_FEATURES). Para os demais módulos PRO, o
// componente cai no genérico 'pro_module' com override de title/pitch
// vindos do MODULES[i].label/desc.
const MODULE_TO_FEATURE: Record<string, UpgradeFeatureKey> = {
  hospitalization:        'hospitalization',
  internacao_completa:    'hospitalization',
  centro_cirurgico:       'surgery',
  whatsapp_intelligent:   'whatsapp_intelligent',
  reports:                'reports_export',
  internal_chat:          'internal_chat',
  triage:                 'triage',
  exams:                  'exams',
  financial:              'financial',
  pharmacy:               'pharmacy',
  purchases:              'purchases',
  sales:                  'sales',
}

// ─── Module definitions ───────────────────────────────────────────────────────

interface ModuleDef {
  key:   string
  label: string
  desc:  string
  icon:  React.ReactNode
  color: string
  /** Quando true, a ativação é persistida em clinics.flow_config (não em
   *  active_modules). Mesmo fluxo de UI (toggle + Master Key + Salvar Módulos),
   *  mas grava a flag de feature dos recursos hospitalares avançados. */
  flow?: boolean
}

const MODULES: ModuleDef[] = [
  { key: 'reception',            label: 'Recepção',                   desc: 'Check-in, fila e agenda',                                                   icon: <ClipboardList  className="h-5 w-5" />, color: 'text-blue-600 bg-blue-50'      },
  { key: 'patients',             label: 'Pacientes',                  desc: 'Cadastro de tutores e pets',                                                icon: <PawPrint       className="h-5 w-5" />, color: 'text-cyan-600 bg-cyan-50'      },
  { key: 'cashier',              label: 'Caixa',                      desc: 'Abertura, fechamento e lançamentos de caixa',                               icon: <Banknote       className="h-5 w-5" />, color: 'text-green-600 bg-green-50'    },
  { key: 'triage',               label: 'Triagem',                    desc: 'Sinais vitais e avaliação inicial',                                         icon: <Stethoscope    className="h-5 w-5" />, color: 'text-amber-600 bg-amber-50'    },
  { key: 'consultation',         label: 'Consultório',                desc: 'Prontuário e conduta médica',                                               icon: <Syringe        className="h-5 w-5" />, color: 'text-indigo-600 bg-indigo-50'  },
  { key: 'exams',                label: 'Exames',                     desc: 'Laudos e resultados laboratoriais',                                         icon: <FlaskConical   className="h-5 w-5" />, color: 'text-violet-600 bg-violet-50'  },
  { key: 'hospitalization',      label: 'Internação',                 desc: 'Gestão de internados e alta hospitalar',                                   icon: <Hotel          className="h-5 w-5" />, color: 'text-pink-600 bg-pink-50'      },
  { key: 'internacao_completa',  label: 'Internação Completa',        desc: 'Versão avançada da Internação: alertas de medicação, sinais vitais, mapa de execução, fluidoterapia e conta', icon: <Hotel className="h-5 w-5" />, color: 'text-pink-600 bg-pink-50', flow: true },
  { key: 'centro_cirurgico',     label: 'Centro Cirúrgico',           desc: 'Bloco cirúrgico no menu lateral: Kanban Preparo→Sala→RPA, ficha cirúrgica e kits',                          icon: <Syringe className="h-5 w-5" />, color: 'text-red-600 bg-red-50', flow: true },
  { key: 'grooming',             label: 'Banho e Tosa',               desc: 'Fila de grooming com registros por voz',                                   icon: <Scissors       className="h-5 w-5" />, color: 'text-rose-600 bg-rose-50'      },
  { key: 'registry',             label: 'Cadastros',                  desc: 'Espécies, raças, convênios e tabela de preços',                            icon: <FolderKanban   className="h-5 w-5" />, color: 'text-slate-600 bg-slate-100'   },
  { key: 'purchases',            label: 'Compras',                    desc: 'Importação de NF-e XML, fornecedores e atualização de estoque',             icon: <Truck          className="h-5 w-5" />, color: 'text-purple-600 bg-purple-50'  },
  { key: 'pharmacy',             label: 'Estoque',                    desc: 'Estoque de medicamentos e insumos',                                         icon: <ShoppingBag    className="h-5 w-5" />, color: 'text-orange-600 bg-orange-50'  },
  { key: 'sales',                label: 'Vendas (PDV)',               desc: 'Ponto de venda, carrinho e recibos',                                       icon: <ShoppingCart   className="h-5 w-5" />, color: 'text-emerald-600 bg-emerald-50' },
  { key: 'financial',            label: 'Financeiro',                 desc: 'Contas a pagar e receber, extrato e conciliação bancária',                  icon: <DollarSign     className="h-5 w-5" />, color: 'text-teal-600 bg-teal-50'      },
  { key: 'petlove_reconciliation', label: 'Conciliação Petlove',      desc: 'Importação de remessas Petlove, conciliação ativa e bulk register de pets', icon: <PawPrint       className="h-5 w-5" />, color: 'text-purple-600 bg-purple-50'  },
  { key: 'reports',              label: 'Relatórios',                 desc: 'DRE, Curva ABC, produtividade e relatórios operacionais',                   icon: <FileBarChart2  className="h-5 w-5" />, color: 'text-violet-600 bg-violet-50'  },
  { key: 'whatsapp',             label: 'WhatsApp',                   desc: 'Notificações e mensagens via WhatsApp',                                     icon: <MessageCircle  className="h-5 w-5" />, color: 'text-green-600 bg-green-50'    },
  { key: 'whatsapp_intelligent', label: 'WhatsApp Inteligente (Bot)', desc: 'Bot IA responde, agenda consultas e faz campanhas de reativação',          icon: <Bot            className="h-5 w-5" />, color: 'text-emerald-600 bg-emerald-50' },
  { key: 'internal_chat',        label: 'Chat Interno',               desc: 'Mensagens em tempo real entre a equipe, com salas por consulta/internação/cirurgia e anexos',                                icon: <MessageSquare className="h-5 w-5" />, color: 'text-violet-600 bg-violet-50'  },
  { key: 'mentor',               label: 'Mentor IA',                  desc: 'Assistente flutuante com tours guiados e respostas visuais',                icon: <Sparkles       className="h-5 w-5" />, color: 'text-blue-600 bg-blue-50'      },
]

// Master key is stored in env and compared client-side only for UX purposes.
// Real enforcement happens server-side via RLS + module guard.
const MASTER_KEY_ENV = process.env.NEXT_PUBLIC_MODULE_MASTER_KEY ?? 'vetmax-MASTER-2024'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialConfig: ClinicConfig | null
  /** Quando true, mantém a UX antiga com Master Key. Quando false (admin Free / Pro), aplica o paywall granular por módulo. */
  isSysmax?:     boolean
  /** Necessário para decidir quais módulos são Free no segmento da clínica. */
  businessType?: 'vet_clinic' | 'pet_aesthetics'
  onToast:       (type: 'success' | 'error', msg: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ModulesTab({
  initialConfig,
  isSysmax = false,
  businessType = 'vet_clinic',
  onToast,
}: Props) {
  const [activeModules, setActiveModules] = useState<string[]>(
    initialConfig?.active_modules ?? ['reception', 'triage', 'consultation', 'exams']
  )
  // Flags de recursos hospitalares avançados — mesmas linhas da lista, mas
  // persistidas em flow_config (não em active_modules).
  const [flowFlags, setFlowFlags] = useState<Record<string, boolean>>(() => {
    const flow = (initialConfig?.flow_config ?? {}) as { internacao_completa?: boolean; centro_cirurgico?: boolean }
    return {
      internacao_completa: flow.internacao_completa === true,
      centro_cirurgico:    flow.centro_cirurgico    === true,
    }
  })
  const [saving, setSaving]                         = useState(false)
  const [pendingToggle, setPendingToggle]           = useState<{ key: string; willEnable: boolean } | null>(null)
  const [masterKeyInput, setMasterKeyInput]         = useState('')
  const [masterKeyError, setMasterKeyError]         = useState<string | null>(null)
  const [showMasterKey, setShowMasterKey]           = useState(false)
  const masterKeyInputRef = useRef<HTMLInputElement>(null)
  const { open: openUpgrade } = useUpgradeModal()

  // Click no toggle — dois caminhos:
  //  - SysMax (operação interna): dialog de Master Key (UX antiga, intocada).
  //  - Admin Free / Pro: módulos Free do segmento são read-only; módulos
  //    PRO disparam UpgradeModal (genérico ou específico, conforme catálogo).
  function requestToggle(mod: ModuleDef) {
    if (isSysmax) {
      const willEnable = mod.flow
        ? !flowFlags[mod.key]
        : !activeModules.includes(mod.key)
      setPendingToggle({ key: mod.key, willEnable })
      setMasterKeyInput('')
      setMasterKeyError(null)
      setTimeout(() => masterKeyInputRef.current?.focus(), 50)
      return
    }

    // Não-SysMax
    if (isModuleFree(mod.key, businessType)) {
      onToast('success', `${mod.label} já está incluído no seu plano.`)
      return
    }

    // Módulo PRO → UpgradeModal
    const featureKey = MODULE_TO_FEATURE[mod.key] ?? 'pro_module'
    if (featureKey === 'pro_module') {
      openUpgrade({
        feature: 'pro_module',
        override: { title: mod.label, pitch: mod.desc },
      })
    } else {
      openUpgrade(featureKey)
    }
  }

  function confirmMasterKey() {
    if (masterKeyInput !== MASTER_KEY_ENV) {
      setMasterKeyError('Master Key inválida.')
      return
    }
    if (pendingToggle) {
      const { key, willEnable } = pendingToggle
      const mod = MODULES.find(m => m.key === key)
      if (mod?.flow) {
        setFlowFlags(prev => ({ ...prev, [key]: willEnable }))
      } else {
        setActiveModules(prev =>
          willEnable ? [...prev, key] : prev.filter(k => k !== key)
        )
      }
    }
    setPendingToggle(null)
    setMasterKeyInput('')
    setMasterKeyError(null)
  }

  async function handleSave() {
    setSaving(true)
    // Persiste em uma chamada: active_modules (módulos padrão) + flow_config
    // (recursos hospitalares avançados — Internação Completa / Centro Cirúrgico).
    const base: FlowConfig = initialConfig?.flow_config ?? { vet_merged_modules: [] }
    const res = await updateClinicConfig({
      active_modules: activeModules,
      flow_config: {
        ...base,
        internacao_completa: flowFlags.internacao_completa,
        centro_cirurgico:    flowFlags.centro_cirurgico,
      } as FlowConfig,
    })
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Módulos salvos!')
  }

  const pendingMod = MODULES.find(m => m.key === pendingToggle?.key)

  return (
    <div className="space-y-4">
      {/* Master Key Modal */}
      {pendingToggle && pendingMod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div
            id="master-key-dialog"
            data-testid="master-key-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Alteração com Master Key"
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
                <Shield className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {pendingToggle.willEnable ? 'Ativação Restrita' : 'Desativação Restrita'}
                </h3>
                <p className="text-xs text-slate-500">Módulo: <span className="font-semibold">{pendingMod.label}</span></p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-4">
              Qualquer alteração de módulo requer a <strong>Master Key</strong> da Sysmax Solutions.
            </p>

            <div className="relative mb-3">
              <input
                ref={masterKeyInputRef}
                id="input-master-key"
                data-testid="input-master-key"
                type={showMasterKey ? 'text' : 'password'}
                value={masterKeyInput}
                onChange={e => { setMasterKeyInput(e.target.value); setMasterKeyError(null) }}
                onKeyDown={e => { if (e.key === 'Enter') confirmMasterKey() }}
                placeholder="Digite a Master Key"
                className={`w-full px-3 py-2.5 pr-10 border rounded-xl text-sm outline-none focus:ring-2 transition-colors ${masterKeyError ? 'border-red-400 focus:ring-red-400/20' : 'border-slate-300 focus:ring-blue-500/20'}`}
              />
              <button
                onClick={() => setShowMasterKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                type="button"
              >
                {showMasterKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {masterKeyError && (
              <div
                id="master-key-error"
                data-testid="master-key-error"
                className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3"
              >
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                {masterKeyError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                id="btn-confirm-master-key"
                data-testid="btn-confirm-master-key"
                onClick={confirmMasterKey}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
              >
                Confirmar
              </button>
              <button
                onClick={() => { setPendingToggle(null); setMasterKeyInput(''); setMasterKeyError(null) }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modules grid */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Módulos do Sistema</h2>
          <p className="text-xs text-slate-500">
            {isSysmax
              ? 'Qualquer alteração requer a Master Key da Sysmax Solutions'
              : 'Módulos inclusos no seu plano e quais estão disponíveis para upgrade'}
          </p>
        </div>

        <div
          id="modules-list"
          data-testid="modules-list"
          className="divide-y divide-slate-50"
        >
          {MODULES.map(mod => {
            const active = mod.flow ? !!flowFlags[mod.key] : activeModules.includes(mod.key)
            const isFree = !isSysmax && !mod.flow && isModuleFree(mod.key, businessType)
            const isPro  = !isSysmax && !isFree

            return (
              <div
                key={mod.key}
                data-testid={`module-card-${mod.key}`}
                className={`flex items-center gap-4 px-6 py-4 transition-colors ${active || isFree ? 'bg-white' : 'bg-slate-50/50'}`}
              >
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${mod.color}`}>
                  {mod.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-semibold ${active || isFree ? 'text-slate-900' : 'text-slate-500'}`}>
                      {mod.label}
                    </p>
                    {isFree && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="h-3 w-3" /> Incluso
                      </span>
                    )}
                    {isPro && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
                        <Lock className="h-3 w-3" /> Pro
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">{mod.desc}</p>
                </div>

                {isSysmax ? (
                  <button
                    id={`module-toggle-${mod.key}`}
                    data-testid={`module-toggle-${mod.key}`}
                    onClick={() => requestToggle(mod)}
                    className={`flex-shrink-0 transition-colors ${active ? 'text-teal-600' : 'text-slate-300'}`}
                    title={active ? 'Desativar módulo' : 'Ativar módulo'}
                  >
                    {active
                      ? <ToggleRight className="h-7 w-7" />
                      : <ToggleLeft  className="h-7 w-7" />}
                  </button>
                ) : isFree ? (
                  // Módulo Free: read-only com check verde (já está ativo via trigger 0189)
                  <div
                    className="flex-shrink-0 text-emerald-500"
                    title="Já incluído no seu plano"
                  >
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                ) : (
                  // Módulo PRO: botão que abre UpgradeModal
                  <button
                    id={`module-toggle-${mod.key}`}
                    data-testid={`module-toggle-${mod.key}`}
                    onClick={() => requestToggle(mod)}
                    className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-1.5 text-xs font-bold text-white transition-colors shadow-sm"
                    title="Disponível no Plano Pro — clique para falar com a Sysmax Solutions"
                  >
                    <Lock className="h-3 w-3" /> Ativar
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {isSysmax && (
          <div className="px-6 pb-5 pt-3">
            <button
              id="btn-save-modules"
              data-testid="btn-save-modules"
              onClick={handleSave}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {saving
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
                : <><Save className="h-4 w-4" /> Salvar Módulos</>}
            </button>
          </div>
        )}
      </div>

    </div>
  )
}

