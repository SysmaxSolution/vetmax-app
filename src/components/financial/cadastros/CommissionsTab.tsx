'use client'

import { useState, useEffect } from 'react'
import { Percent, DollarSign, Trash2, Plus, Loader2, UserRound, Save } from 'lucide-react'
import { getClinicProfessionals, type ClinicProfessional } from '@/lib/actions/professionals'
import {
  listProfessionalCommissions, upsertProfessionalCommission, deleteProfessionalCommission,
  type CommissionRule, type CommissionScope, type CommissionType,
} from '@/lib/actions/professional-commissions'

const ROLE_LABEL: Record<string, string> = { vet: 'Médico(a) Veterinário(a)', assistant: 'Auxiliar', groomer: 'Groomer', admin: 'Admin' }
const SCOPE_LABEL: Record<CommissionScope, string> = { default: 'Padrão (todos)', service: 'Serviço', product: 'Produto', category: 'Categoria' }
const fmtVal = (r: CommissionRule) => r.commission_type === 'percent' ? `${r.value}%` : r.value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function CommissionsTab() {
  const [pros, setPros]     = useState<ClinicProfessional[]>([])
  const [sel, setSel]       = useState<string | null>(null)
  const [rules, setRules]   = useState<CommissionRule[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg]       = useState<string | null>(null)

  // form nova regra
  const [scope, setScope]   = useState<CommissionScope>('default')
  const [category, setCategory] = useState('')
  const [ctype, setCtype]   = useState<CommissionType>('percent')
  const [value, setValue]   = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { getClinicProfessionals().then(r => { if (Array.isArray(r)) { setPros(r); if (r[0]) setSel(r[0].id) } }) }, [])
  useEffect(() => { if (sel) loadRules(sel) }, [sel])

  async function loadRules(pid: string) {
    setLoading(true)
    const r = await listProfessionalCommissions(pid)
    setLoading(false)
    if (Array.isArray(r)) setRules(r)
  }

  async function addRule() {
    if (!sel) return
    const v = parseFloat(value.replace(',', '.'))
    if (!Number.isFinite(v) || v < 0) { setMsg('Informe um valor válido.'); return }
    if (scope === 'category' && !category.trim()) { setMsg('Informe a categoria.'); return }
    setSaving(true); setMsg(null)
    const res = await upsertProfessionalCommission({
      professional_id: sel, applies_to: scope, category: scope === 'category' ? category.trim() : null,
      commission_type: ctype, value: v,
    })
    setSaving(false)
    if ('error' in res) { setMsg(res.error); return }
    setValue(''); setCategory('')
    await loadRules(sel)
  }

  async function remove(id: string) {
    await deleteProfessionalCommission(id)
    if (sel) await loadRules(sel)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* profissionais */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 text-sm font-bold text-slate-700">Profissionais</div>
        <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
          {pros.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">Nenhum profissional.</p>}
          {pros.map(p => (
            <button key={p.id} onClick={() => setSel(p.id)}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-2 ${sel === p.id ? 'bg-teal-50 border-l-4 border-teal-500' : 'hover:bg-slate-50'}`}>
              <UserRound className="h-4 w-4 text-slate-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{p.full_name}</p>
                <p className="text-[11px] text-slate-400">{ROLE_LABEL[p.role] ?? p.role}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* regras do profissional */}
      <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 text-sm font-bold text-slate-700">
          Regras de comissão {sel && pros.find(p => p.id === sel) ? `· ${pros.find(p => p.id === sel)!.full_name}` : ''}
        </div>
        <div className="p-4 space-y-4">
          {msg && <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">{msg}</p>}

          {loading ? <div className="py-6 flex justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
            <div className="space-y-1.5">
              {rules.length === 0 && <p className="text-sm text-slate-400">Nenhuma regra. Sem regra, o profissional não recebe comissão.</p>}
              {rules.map(r => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.commission_type === 'percent' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {r.commission_type === 'percent' ? <Percent className="h-3 w-3" /> : <DollarSign className="h-3 w-3" />} {fmtVal(r)}
                    </span>
                    <span className="text-sm text-slate-700 truncate">{SCOPE_LABEL[r.applies_to]}{r.category ? `: ${r.category}` : ''}</span>
                  </div>
                  <button onClick={() => remove(r.id)} className="text-rose-500 hover:text-rose-700 shrink-0"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          )}

          {/* nova regra */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase">Nova regra</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <select value={scope} onChange={e => setScope(e.target.value as CommissionScope)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                <option value="default">Padrão (todos)</option>
                <option value="category">Por categoria</option>
              </select>
              {scope === 'category' && (
                <input value={category} onChange={e => setCategory(e.target.value)} placeholder="Ex.: Exames" className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              )}
              <select value={ctype} onChange={e => setCtype(e.target.value as CommissionType)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                <option value="percent">Percentual (%)</option>
                <option value="fixed">Valor fixo (R$)</option>
              </select>
              <input value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" placeholder={ctype === 'percent' ? '30' : '30,00'} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm tabular-nums" />
              <button onClick={addRule} disabled={saving || !sel}
                className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
              </button>
            </div>
            <p className="text-[11px] text-slate-400">A regra mais específica vence (serviço &gt; produto &gt; categoria &gt; padrão). Regras por serviço/produto específico entram na fase de geração automática.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
