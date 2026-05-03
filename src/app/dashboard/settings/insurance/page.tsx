'use client'

import { useState, useEffect, useTransition } from 'react'
import { Plus, Pencil, Trash2, Shield, FileText, ChevronRight, X, Loader2, Check, AlertTriangle, Ban, Info } from 'lucide-react'
import {
  getInsuranceProviders,
  createInsuranceProvider,
  updateInsuranceProvider,
  deleteInsuranceProvider,
  type InsuranceProvider,
} from '@/lib/actions/insurance-providers'
import {
  getInsuranceRules,
  createInsuranceRule,
  updateInsuranceRule,
  deleteInsuranceRule,
  type InsuranceRule,
  type RuleType,
  type RuleSeverity,
} from '@/lib/actions/insurance-rules'

// ─── Constants ────────────────────────────────────────────────────────────────

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  requires_justification: 'Exige Justificativa',
  requires_prior_auth:    'Exige Autorização Prévia',
  limited_frequency:      'Frequência Limitada',
  not_covered:            'Não Coberto',
  informational:          'Informativo',
}

const SEVERITY_CONFIG: Record<RuleSeverity, { label: string; color: string; Icon: typeof AlertTriangle }> = {
  blocking: { label: 'Bloqueante', color: 'bg-red-100 text-red-700',    Icon: Ban },
  warning:  { label: 'Aviso',      color: 'bg-amber-100 text-amber-700', Icon: AlertTriangle },
  info:     { label: 'Info',       color: 'bg-blue-100 text-blue-700',   Icon: Info },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 ml-1 tracking-wider">{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, placeholder, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { onChange: (v: string) => void }) {
  return (
    <input
      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:border-teal-500 outline-none transition-all"
      value={value as string}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      {...rest}
    />
  )
}

function Sel({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:border-teal-500 outline-none cursor-pointer"
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// ─── Provider Form Modal ──────────────────────────────────────────────────────

type ProviderFormData = { name: string; plan_types_raw: string; portal_url: string; contact_name: string; contact_phone: string; contact_email: string }
const EMPTY_PROV: ProviderFormData = { name: '', plan_types_raw: '', portal_url: '', contact_name: '', contact_phone: '', contact_email: '' }

function ProviderFormModal({
  initial, onSave, onClose, saving
}: {
  initial?: InsuranceProvider
  onSave: (d: ProviderFormData) => void
  onClose: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<ProviderFormData>(() => initial ? {
    name:          initial.name,
    plan_types_raw: initial.plan_types.join(', '),
    portal_url:    initial.portal_url ?? '',
    contact_name:  initial.contact_info?.contact_name ?? '',
    contact_phone: initial.contact_info?.phone ?? '',
    contact_email: initial.contact_info?.email ?? '',
  } : EMPTY_PROV)

  const set = (k: keyof ProviderFormData) => (v: string) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-teal-600" />
            <h3 className="font-bold text-slate-800 text-sm">{initial ? 'Editar Convênio' : 'Novo Convênio'}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Nome do Convênio *">
            <Input value={form.name} onChange={set('name')} placeholder="Ex: Pet Love" />
          </Field>
          <Field label="Planos (separados por vírgula) *">
            <Input value={form.plan_types_raw} onChange={set('plan_types_raw')} placeholder="Ex: Básico, Standard, Premium" />
          </Field>
          <Field label="URL do Portal">
            <Input value={form.portal_url} onChange={set('portal_url')} placeholder="https://portal.convenio.com.br" />
          </Field>
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Contato do Convênio</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Responsável"><Input value={form.contact_name} onChange={set('contact_name')} placeholder="Nome" /></Field>
              <Field label="Telefone"><Input value={form.contact_phone} onChange={set('contact_phone')} placeholder="(11) 99999-9999" /></Field>
            </div>
            <Field label="E-mail"><Input value={form.contact_email} onChange={set('contact_email')} placeholder="contato@convenio.com.br" /></Field>
          </div>
        </div>
        <div className="px-6 pb-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-600">Cancelar</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.name.trim()}
            className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-sm font-black flex items-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Rule Form Modal ──────────────────────────────────────────────────────────

type RuleFormData = { procedure_name: string; rule_type: RuleType; rule_description: string; justification_template: string; severity: RuleSeverity }
const EMPTY_RULE: RuleFormData = { procedure_name: '', rule_type: 'requires_justification', rule_description: '', justification_template: '', severity: 'warning' }

function RuleFormModal({
  initial, onSave, onClose, saving
}: {
  initial?: InsuranceRule
  onSave: (d: RuleFormData) => void
  onClose: () => void
  saving: boolean
}) {
  const [form, setForm] = useState<RuleFormData>(() => initial ? {
    procedure_name:         initial.procedure_name,
    rule_type:              initial.rule_type,
    rule_description:       initial.rule_description,
    justification_template: initial.justification_template ?? '',
    severity:               initial.severity,
  } : EMPTY_RULE)

  const set = (k: keyof RuleFormData) => (v: string) => setForm(f => ({ ...f, [k]: v as any }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-amber-500" />
            <h3 className="font-bold text-slate-800 text-sm">{initial ? 'Editar Regra' : 'Nova Regra Anti-Glosa'}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg"><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <Field label="Procedimento *">
            <Input value={form.procedure_name} onChange={set('procedure_name')} placeholder="Ex: Ecocardiograma" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo de Regra *">
              <Sel value={form.rule_type} onChange={set('rule_type')} options={
                Object.entries(RULE_TYPE_LABELS).map(([value, label]) => ({ value, label }))
              } />
            </Field>
            <Field label="Severidade *">
              <Sel value={form.severity} onChange={set('severity')} options={[
                { value: 'blocking', label: 'Bloqueante' },
                { value: 'warning',  label: 'Aviso' },
                { value: 'info',     label: 'Informativo' },
              ]} />
            </Field>
          </div>
          <Field label="Descrição da Regra *">
            <textarea
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:border-teal-500 outline-none transition-all resize-none"
              rows={2}
              value={form.rule_description}
              onChange={e => set('rule_description')(e.target.value)}
              placeholder="Ex: Este exame exige justificativa clínica detalhada no prontuário."
            />
          </Field>
          <Field label="Template de Justificativa (opcional)">
            <textarea
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:border-teal-500 outline-none transition-all resize-none"
              rows={3}
              value={form.justification_template}
              onChange={e => set('justification_template')(e.target.value)}
              placeholder="Ex: Paciente [nome] apresenta [sintoma] — ecocardiograma indicado para avaliação de [motivo]."
            />
          </Field>
        </div>
        <div className="px-6 pb-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-600">Cancelar</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.procedure_name.trim() || !form.rule_description.trim()}
            className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-sm font-black flex items-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InsurancePage() {
  const [providers,       setProviders]       = useState<InsuranceProvider[]>([])
  const [rules,           setRules]           = useState<InsuranceRule[]>([])
  const [selectedId,      setSelectedId]      = useState<string | null>(null)
  const [loadingProv,     setLoadingProv]     = useState(true)
  const [loadingRules,    setLoadingRules]    = useState(false)
  const [showProvForm,    setShowProvForm]    = useState(false)
  const [editingProv,     setEditingProv]     = useState<InsuranceProvider | null>(null)
  const [showRuleForm,    setShowRuleForm]    = useState(false)
  const [editingRule,     setEditingRule]     = useState<InsuranceRule | null>(null)
  const [toast,           setToast]           = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [isPending,       startTransition]    = useTransition()

  const flash = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  // Load providers
  useEffect(() => {
    getInsuranceProviders().then(res => {
      if (!('error' in res)) setProviders(res)
      setLoadingProv(false)
    })
  }, [])

  // Load rules when provider selected
  useEffect(() => {
    if (!selectedId) { setRules([]); return }
    setLoadingRules(true)
    getInsuranceRules(selectedId).then(res => {
      if (!('error' in res)) setRules(res)
      setLoadingRules(false)
    })
  }, [selectedId])

  const selectedProv = providers.find(p => p.id === selectedId)

  // Provider CRUD
  const handleSaveProvider = (form: ProviderFormData) => {
    const planTypes = form.plan_types_raw.split(',').map(s => s.trim()).filter(Boolean)
    const contactInfo = {
      contact_name: form.contact_name || undefined,
      phone:        form.contact_phone || undefined,
      email:        form.contact_email || undefined,
    }
    startTransition(async () => {
      if (editingProv) {
        const res = await updateInsuranceProvider(editingProv.id, {
          name: form.name, plan_types: planTypes,
          portal_url: form.portal_url || null, contact_info: contactInfo,
        })
        if ('error' in res) { flash('err', res.error); return }
        setProviders(prev => prev.map(p => p.id === editingProv.id
          ? { ...p, name: form.name, plan_types: planTypes, portal_url: form.portal_url || null, contact_info: contactInfo }
          : p))
        flash('ok', 'Convênio atualizado.')
      } else {
        const res = await createInsuranceProvider({ name: form.name, plan_types: planTypes, portal_url: form.portal_url, contact_info: contactInfo })
        if ('error' in res) { flash('err', res.error); return }
        const list = await getInsuranceProviders()
        if (!('error' in list)) setProviders(list)
        flash('ok', 'Convênio criado.')
      }
      setShowProvForm(false); setEditingProv(null)
    })
  }

  const handleDeleteProvider = (id: string) => {
    if (!confirm('Excluir convênio? Isso removerá todas as suas regras.')) return
    startTransition(async () => {
      const res = await deleteInsuranceProvider(id)
      if ('error' in res) { flash('err', res.error); return }
      setProviders(prev => prev.filter(p => p.id !== id))
      if (selectedId === id) { setSelectedId(null); setRules([]) }
      flash('ok', 'Convênio removido.')
    })
  }

  // Rule CRUD
  const handleSaveRule = (form: RuleFormData) => {
    if (!selectedId) return
    startTransition(async () => {
      if (editingRule) {
        const res = await updateInsuranceRule(editingRule.id, {
          procedure_name:         form.procedure_name,
          rule_type:              form.rule_type,
          rule_description:       form.rule_description,
          justification_template: form.justification_template || null,
          severity:               form.severity,
        })
        if ('error' in res) { flash('err', res.error); return }
        setRules(prev => prev.map(r => r.id === editingRule.id ? { ...r, ...form, justification_template: form.justification_template || null } : r))
        flash('ok', 'Regra atualizada.')
      } else {
        const res = await createInsuranceRule({
          provider_id:            selectedId,
          procedure_name:         form.procedure_name,
          rule_type:              form.rule_type,
          rule_description:       form.rule_description,
          justification_template: form.justification_template || undefined,
          severity:               form.severity,
        })
        if ('error' in res) { flash('err', res.error); return }
        const list = await getInsuranceRules(selectedId)
        if (!('error' in list)) setRules(list)
        flash('ok', 'Regra adicionada.')
      }
      setShowRuleForm(false); setEditingRule(null)
    })
  }

  const handleDeleteRule = (id: string) => {
    if (!confirm('Excluir esta regra?')) return
    startTransition(async () => {
      const res = await deleteInsuranceRule(id)
      if ('error' in res) { flash('err', res.error); return }
      setRules(prev => prev.filter(r => r.id !== id))
      flash('ok', 'Regra removida.')
    })
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Shield className="h-5 w-5 text-teal-600" />
          <h1 className="text-xl font-black text-slate-800">Convênios & Anti-Glosa</h1>
        </div>
        <p className="text-xs text-slate-500">Cadastre convênios e configure as regras de glosa por procedimento.</p>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl text-sm font-bold shadow-lg flex items-center gap-2 ${
          toast.type === 'ok' ? 'bg-teal-600 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.type === 'ok' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      <div className="grid grid-cols-5 gap-6">
        {/* Left: Providers list */}
        <div className="col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Convênios</span>
              <button
                onClick={() => { setEditingProv(null); setShowProvForm(true) }}
                className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-xs font-black"
              >
                <Plus className="h-3.5 w-3.5" /> Novo
              </button>
            </div>

            {loadingProv ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
            ) : providers.length === 0 ? (
              <div className="text-center py-12">
                <Shield className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                <p className="text-xs text-slate-400">Nenhum convênio cadastrado</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-50">
                {providers.map(p => (
                  <li
                    key={p.id}
                    onClick={() => setSelectedId(prev => prev === p.id ? null : p.id)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      selectedId === p.id ? 'bg-teal-50 border-l-2 border-teal-500' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{p.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{p.plan_types.length} plano(s)</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); setEditingProv(p); setShowProvForm(true) }}
                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteProvider(p.id) }}
                        className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <ChevronRight className={`h-4 w-4 transition-transform ${selectedId === p.id ? 'rotate-90 text-teal-500' : 'text-slate-300'}`} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: Rules panel */}
        <div className="col-span-3">
          {!selectedProv ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center py-20 text-center">
              <FileText className="h-10 w-10 text-slate-200 mb-3" />
              <p className="text-sm font-bold text-slate-400">Selecione um convênio</p>
              <p className="text-xs text-slate-300 mt-1">As regras anti-glosa aparecerão aqui</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-teal-50/50">
                <div>
                  <p className="text-sm font-black text-slate-800">{selectedProv.name}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Planos: {selectedProv.plan_types.join(' · ') || '—'}
                    {selectedProv.portal_url && (
                      <> · <a href={selectedProv.portal_url} target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:underline">Portal</a></>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => { setEditingRule(null); setShowRuleForm(true) }}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-black"
                >
                  <Plus className="h-3.5 w-3.5" /> Nova Regra
                </button>
              </div>

              {loadingRules ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
              ) : rules.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">Nenhuma regra cadastrada</p>
                  <p className="text-[10px] text-slate-300 mt-0.5">Clique em "Nova Regra" para adicionar</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {rules.map(rule => {
                    const sev = SEVERITY_CONFIG[rule.severity]
                    const SevIcon = sev.Icon
                    return (
                      <li key={rule.id} className={`px-5 py-4 ${!rule.is_active ? 'opacity-50' : ''}`}>
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${sev.color}`}>
                            <SevIcon className="h-3 w-3" />
                            {sev.label}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-sm font-bold text-slate-800">{rule.procedure_name}</p>
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">
                                {RULE_TYPE_LABELS[rule.rule_type]}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600">{rule.rule_description}</p>
                            {rule.justification_template && (
                              <p className="mt-1.5 text-[10px] text-slate-400 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 italic">
                                Template: {rule.justification_template}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => { setEditingRule(rule); setShowRuleForm(true) }}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteRule(rule.id)}
                              className="p-1.5 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Provider Form Modal */}
      {showProvForm && (
        <ProviderFormModal
          initial={editingProv ?? undefined}
          onSave={handleSaveProvider}
          onClose={() => { setShowProvForm(false); setEditingProv(null) }}
          saving={isPending}
        />
      )}

      {/* Rule Form Modal */}
      {showRuleForm && (
        <RuleFormModal
          initial={editingRule ?? undefined}
          onSave={handleSaveRule}
          onClose={() => { setShowRuleForm(false); setEditingRule(null) }}
          saving={isPending}
        />
      )}
    </div>
  )
}
