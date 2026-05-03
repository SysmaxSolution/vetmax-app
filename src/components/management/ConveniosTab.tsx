'use client'

import { useState, useEffect } from 'react'
import { Shield, Plus, Trash2, ChevronRight, AlertTriangle, Info, XCircle, Loader2, X } from 'lucide-react'
import {
  getInsuranceProviders, createInsuranceProvider, deleteInsuranceProvider,
  type InsuranceProvider,
} from '@/lib/actions/insurance-providers'
import {
  getInsuranceRules, createInsuranceRule, deleteInsuranceRule,
  type InsuranceRule, type RuleType, type RuleSeverity,
} from '@/lib/actions/insurance-rules'

interface Props {
  onToast: (type: 'success' | 'error', message: string) => void
}

const SEVERITY_BADGE: Record<RuleSeverity, string> = {
  blocking: 'bg-red-100 text-red-700',
  warning:  'bg-amber-100 text-amber-700',
  info:     'bg-blue-100 text-blue-700',
}

const SEVERITY_ICON: Record<RuleSeverity, React.ReactNode> = {
  blocking: <XCircle className="w-3.5 h-3.5" />,
  warning:  <AlertTriangle className="w-3.5 h-3.5" />,
  info:     <Info className="w-3.5 h-3.5" />,
}

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  requires_justification: 'Exige justificativa',
  requires_prior_auth:    'Autorização prévia',
  limited_frequency:      'Freq. limitada',
  not_covered:            'Não coberto',
  informational:          'Informativo',
}

export default function ConveniosTab({ onToast }: Props) {
  const [providers, setProviders]           = useState<InsuranceProvider[]>([])
  const [loading, setLoading]               = useState(true)
  const [selectedId, setSelectedId]         = useState<string | null>(null)
  const [rules, setRules]                   = useState<InsuranceRule[]>([])
  const [loadingRules, setLoadingRules]     = useState(false)

  // Provider form
  const [showProviderForm, setShowProviderForm] = useState(false)
  const [pName, setPName]           = useState('')
  const [pPlans, setPPlans]         = useState('')
  const [pPortal, setPPortal]       = useState('')
  const [pPhone, setPPhone]         = useState('')
  const [pEmail, setPEmail]         = useState('')
  const [savingProvider, setSavingProvider] = useState(false)

  // Rule form
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [rProcedure, setRProcedure] = useState('')
  const [rType, setRType]           = useState<RuleType>('informational')
  const [rDesc, setRDesc]           = useState('')
  const [rSeverity, setRSeverity]   = useState<RuleSeverity>('info')
  const [rTemplate, setRTemplate]   = useState('')
  const [savingRule, setSavingRule]  = useState(false)

  useEffect(() => {
    getInsuranceProviders().then(res => {
      if (!('error' in res)) setProviders(res)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!selectedId) { setRules([]); return }
    setLoadingRules(true)
    getInsuranceRules(selectedId).then(res => {
      if (!('error' in res)) setRules(res)
      setLoadingRules(false)
    })
  }, [selectedId])

  const handleAddProvider = async () => {
    if (!pName.trim()) return onToast('error', 'Nome do convênio é obrigatório.')
    const plans = pPlans.split(',').map(s => s.trim()).filter(Boolean)
    if (plans.length === 0) return onToast('error', 'Informe ao menos um tipo de plano.')
    setSavingProvider(true)
    const res = await createInsuranceProvider({
      name: pName, plan_types: plans,
      portal_url: pPortal || undefined,
      contact_info: { phone: pPhone || undefined, email: pEmail || undefined },
    })
    setSavingProvider(false)
    if ('error' in res) return onToast('error', res.error)
    const fresh = await getInsuranceProviders()
    if (!('error' in fresh)) setProviders(fresh)
    onToast('success', `Convênio "${pName}" cadastrado.`)
    setPName(''); setPPlans(''); setPPortal(''); setPPhone(''); setPEmail('')
    setShowProviderForm(false)
  }

  const handleDeleteProvider = async (id: string, name: string) => {
    const res = await deleteInsuranceProvider(id)
    if ('error' in res) return onToast('error', res.error)
    setProviders(prev => prev.filter(p => p.id !== id))
    if (selectedId === id) setSelectedId(null)
    onToast('success', `Convênio "${name}" removido.`)
  }

  const handleAddRule = async () => {
    if (!selectedId) return
    if (!rProcedure.trim() || !rDesc.trim()) return onToast('error', 'Preencha procedimento e descrição.')
    setSavingRule(true)
    const res = await createInsuranceRule({
      provider_id: selectedId, procedure_name: rProcedure,
      rule_type: rType, rule_description: rDesc, severity: rSeverity,
      justification_template: rTemplate || undefined,
    })
    setSavingRule(false)
    if ('error' in res) return onToast('error', res.error)
    const fresh = await getInsuranceRules(selectedId)
    if (!('error' in fresh)) setRules(fresh)
    onToast('success', 'Regra adicionada.')
    setRProcedure(''); setRDesc(''); setRTemplate(''); setRType('informational'); setRSeverity('info')
    setShowRuleForm(false)
  }

  const handleDeleteRule = async (id: string) => {
    const res = await deleteInsuranceRule(id)
    if ('error' in res) return onToast('error', res.error)
    setRules(prev => prev.filter(r => r.id !== id))
    onToast('success', 'Regra removida.')
  }

  const selectedProvider = providers.find(p => p.id === selectedId)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

      {/* ── Left: Providers list ── */}
      <div className="lg:col-span-2 space-y-3">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-50">
                <Shield className="h-4 w-4 text-teal-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Convênios</h2>
                <p className="text-xs text-slate-500">{providers.length} cadastrado{providers.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <button
              onClick={() => setShowProviderForm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />Novo
            </button>
          </div>

          {/* Add provider form */}
          {showProviderForm && (
            <div className="p-4 border-b border-slate-100 bg-slate-50 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">Novo Convênio</p>
                <button onClick={() => setShowProviderForm(false)}><X className="w-3.5 h-3.5 text-slate-400" /></button>
              </div>
              <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Nome do convênio *" value={pName} onChange={e => setPName(e.target.value)} />
              <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="Tipos de plano (separados por vírgula) *" value={pPlans} onChange={e => setPPlans(e.target.value)} />
              <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500"
                placeholder="URL do portal (opcional)" value={pPortal} onChange={e => setPPortal(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input className="px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Telefone" value={pPhone} onChange={e => setPPhone(e.target.value)} />
                <input className="px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="E-mail" value={pEmail} onChange={e => setPEmail(e.target.value)} />
              </div>
              <button onClick={handleAddProvider} disabled={savingProvider}
                className="w-full py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {savingProvider ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {savingProvider ? 'Salvando...' : 'Cadastrar'}
              </button>
            </div>
          )}

          {/* Provider list */}
          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {providers.length === 0 ? (
              <div className="p-8 text-center">
                <Shield className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">Nenhum convênio cadastrado</p>
              </div>
            ) : (
              providers.map(p => (
                <div key={p.id}
                  onClick={() => setSelectedId(prev => prev === p.id ? null : p.id)}
                  className={`flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors group ${
                    selectedId === p.id ? 'bg-teal-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400 truncate">{p.plan_types.join(', ')}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteProvider(p.id, p.name) }}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight className={`w-4 h-4 transition-colors ${selectedId === p.id ? 'text-teal-600' : 'text-slate-300'}`} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Right: Rules panel ── */}
      <div className="lg:col-span-3">
        {!selectedId ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] bg-white rounded-xl border border-dashed border-slate-200 text-center p-8">
            <Shield className="w-10 h-10 text-slate-200 mb-3" />
            <p className="text-sm font-medium text-slate-400">Selecione um convênio para ver e configurar as regras de anti-glosa</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Regras — {selectedProvider?.name}</h2>
                <p className="text-xs text-slate-500">Anti-glosa: alertas e bloqueios na consulta</p>
              </div>
              <button
                onClick={() => setShowRuleForm(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />Nova Regra
              </button>
            </div>

            {/* Add rule form */}
            {showRuleForm && (
              <div className="p-4 border-b border-slate-100 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-700">Nova Regra</p>
                  <button onClick={() => setShowRuleForm(false)}><X className="w-3.5 h-3.5 text-slate-400" /></button>
                </div>
                <input className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-500"
                  placeholder="Procedimento / exame *" value={rProcedure} onChange={e => setRProcedure(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <select className="px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-500 bg-white"
                    value={rType} onChange={e => setRType(e.target.value as RuleType)}>
                    {(Object.entries(RULE_TYPE_LABELS) as [RuleType, string][]).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <select className="px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-500 bg-white"
                    value={rSeverity} onChange={e => setRSeverity(e.target.value as RuleSeverity)}>
                    <option value="info">Info</option>
                    <option value="warning">Aviso</option>
                    <option value="blocking">Bloqueio</option>
                  </select>
                </div>
                <textarea className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-500 resize-none"
                  rows={2} placeholder="Descrição da regra *" value={rDesc} onChange={e => setRDesc(e.target.value)} />
                <textarea className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-slate-500 resize-none"
                  rows={2} placeholder="Template de justificativa (opcional)" value={rTemplate} onChange={e => setRTemplate(e.target.value)} />
                <button onClick={handleAddRule} disabled={savingRule}
                  className="w-full py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2">
                  {savingRule ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {savingRule ? 'Salvando...' : 'Adicionar Regra'}
                </button>
              </div>
            )}

            {/* Rules list */}
            {loadingRules ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : rules.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-slate-400">Nenhuma regra configurada para este convênio</p>
                <p className="text-xs text-slate-300 mt-1">Adicione regras para ativar alertas durante a consulta</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[50vh] overflow-y-auto">
                {rules.map(r => (
                  <div key={r.id} className="px-5 py-3.5 flex items-start gap-3 group hover:bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <p className="text-sm font-semibold text-slate-900">{r.procedure_name}</p>
                        <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${SEVERITY_BADGE[r.severity]}`}>
                          {SEVERITY_ICON[r.severity]}{r.severity === 'blocking' ? 'Bloqueio' : r.severity === 'warning' ? 'Aviso' : 'Info'}
                        </span>
                        <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                          {RULE_TYPE_LABELS[r.rule_type]}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2">{r.rule_description}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteRule(r.id)}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
