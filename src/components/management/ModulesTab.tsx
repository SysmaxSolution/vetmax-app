'use client'

import { useState, useRef } from 'react'
import {
  ToggleLeft, ToggleRight, Loader2, Save, Shield, AlertTriangle, Eye, EyeOff,
  Hotel, Syringe, FlaskConical, Scissors, ShoppingBag, Stethoscope, ClipboardList, MessageCircle, Sparkles, Bot, ShoppingCart, Truck,
  PawPrint, Banknote, FolderKanban, DollarSign, FileBarChart2,
} from 'lucide-react'
import { updateClinicConfig, type ClinicConfig } from '@/lib/actions/clinic-settings'
import WhatsappIntelligentSetup from './Settings/WhatsappIntelligentSetup'

// ─── Module definitions ───────────────────────────────────────────────────────

interface ModuleDef {
  key:   string
  label: string
  desc:  string
  icon:  React.ReactNode
  color: string
}

const MODULES: ModuleDef[] = [
  { key: 'reception',            label: 'Recepção',                   desc: 'Check-in, fila e agenda',                                                   icon: <ClipboardList  className="h-5 w-5" />, color: 'text-blue-600 bg-blue-50'      },
  { key: 'patients',             label: 'Pacientes',                  desc: 'Cadastro de tutores e pets',                                                icon: <PawPrint       className="h-5 w-5" />, color: 'text-cyan-600 bg-cyan-50'      },
  { key: 'cashier',              label: 'Caixa',                      desc: 'Abertura, fechamento e lançamentos de caixa',                               icon: <Banknote       className="h-5 w-5" />, color: 'text-green-600 bg-green-50'    },
  { key: 'triage',               label: 'Triagem',                    desc: 'Sinais vitais e avaliação inicial',                                         icon: <Stethoscope    className="h-5 w-5" />, color: 'text-amber-600 bg-amber-50'    },
  { key: 'consultation',         label: 'Consultório',                desc: 'Prontuário e conduta médica',                                               icon: <Syringe        className="h-5 w-5" />, color: 'text-indigo-600 bg-indigo-50'  },
  { key: 'exams',                label: 'Exames',                     desc: 'Laudos e resultados laboratoriais',                                         icon: <FlaskConical   className="h-5 w-5" />, color: 'text-violet-600 bg-violet-50'  },
  { key: 'hospitalization',      label: 'Internação',                 desc: 'Gestão de internados e alta hospitalar',                                   icon: <Hotel          className="h-5 w-5" />, color: 'text-pink-600 bg-pink-50'      },
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
  { key: 'mentor',               label: 'Mentor IA',                  desc: 'Assistente flutuante com tours guiados e respostas visuais',                icon: <Sparkles       className="h-5 w-5" />, color: 'text-blue-600 bg-blue-50'      },
]

// Master key is stored in env and compared client-side only for UX purposes.
// Real enforcement happens server-side via RLS + module guard.
const MASTER_KEY_ENV = process.env.NEXT_PUBLIC_MODULE_MASTER_KEY ?? 'vetmax-MASTER-2024'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  initialConfig: ClinicConfig | null
  onToast:       (type: 'success' | 'error', msg: string) => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ModulesTab({ initialConfig, onToast }: Props) {
  const [activeModules, setActiveModules] = useState<string[]>(
    initialConfig?.active_modules ?? ['reception', 'triage', 'consultation', 'exams']
  )
  const [saving, setSaving]                         = useState(false)
  const [pendingToggle, setPendingToggle]           = useState<{ key: string; willEnable: boolean } | null>(null)
  const [masterKeyInput, setMasterKeyInput]         = useState('')
  const [masterKeyError, setMasterKeyError]         = useState<string | null>(null)
  const [showMasterKey, setShowMasterKey]           = useState(false)
  const masterKeyInputRef = useRef<HTMLInputElement>(null)

  // Qualquer toggle (ativar ou desativar) exige MASTER_KEY
  function requestToggle(mod: ModuleDef) {
    const willEnable = !activeModules.includes(mod.key)
    setPendingToggle({ key: mod.key, willEnable })
    setMasterKeyInput('')
    setMasterKeyError(null)
    setTimeout(() => masterKeyInputRef.current?.focus(), 50)
  }

  function confirmMasterKey() {
    if (masterKeyInput !== MASTER_KEY_ENV) {
      setMasterKeyError('Master Key inválida.')
      return
    }
    if (pendingToggle) {
      const { key, willEnable } = pendingToggle
      setActiveModules(prev =>
        willEnable ? [...prev, key] : prev.filter(k => k !== key)
      )
    }
    setPendingToggle(null)
    setMasterKeyInput('')
    setMasterKeyError(null)
  }

  async function handleSave() {
    setSaving(true)
    const res = await updateClinicConfig({ active_modules: activeModules })
    setSaving(false)
    if ('error' in res) { onToast('error', res.error); return }
    onToast('success', 'Módulos salvos!')
  }

  const pendingMod = MODULES.find(m => m.key === pendingToggle?.key)
  const whatsappIntelligentActive = activeModules.includes('whatsapp_intelligent')

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
          <p className="text-xs text-slate-500">Qualquer alteração requer a Master Key da Sysmax Solutions</p>
        </div>

        <div
          id="modules-list"
          data-testid="modules-list"
          className="divide-y divide-slate-50"
        >
          {MODULES.map(mod => {
            const active = activeModules.includes(mod.key)
            return (
              <div
                key={mod.key}
                data-testid={`module-card-${mod.key}`}
                className={`flex items-center gap-4 px-6 py-4 transition-colors ${active ? 'bg-white' : 'bg-slate-50/50'}`}
              >
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${mod.color}`}>
                  {mod.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${active ? 'text-slate-900' : 'text-slate-400'}`}>
                    {mod.label}
                  </p>
                  <p className="text-xs text-slate-500">{mod.desc}</p>
                </div>

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
              </div>
            )
          })}
        </div>

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
      </div>

      {/* Setup WhatsApp — visível somente quando WhatsApp Inteligente está ativo */}
      {whatsappIntelligentActive && (
        <WhatsappIntelligentSetup onToast={onToast} />
      )}
    </div>
  )
}
