'use client'

import { useState, useEffect, useRef } from 'react'
import { Handshake, Loader2, Plus, Trash2, Search, Percent, DollarSign } from 'lucide-react'
import {
  listPartnerCommissions, addPartnerCommission, deletePartnerCommission,
  type PartnerCommission, type PartnerCommScope, type PartnerCommType,
} from '@/lib/actions/partner-clinics'
import { searchItemsForCommission, type CommissionableItem } from '@/lib/actions/commissions'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const SCOPE_LABEL: Record<PartnerCommScope, string> = { all: 'Todos os itens', product: 'Produto', service: 'Serviço', package: 'Pacote' }
const fmtRule = (r: PartnerCommission) => r.commission_type === 'percent' ? `${r.value}%` : fmt(r.value)

// Comissão que a clínica parceira / laboratório ganha por serviço/produto/pacote,
// em % OU valor fixo (o "valor a pagar ao laboratório por exame" é este, no item).
export default function PartnerCommissionsSection({ partnerClinicId }: { partnerClinicId: string }) {
  const [rules, setRules]   = useState<PartnerCommission[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg]       = useState<string | null>(null)

  // form
  const [scope, setScope]   = useState<PartnerCommScope>('service')
  const [query, setQuery]   = useState('')
  const [results, setResults] = useState<CommissionableItem[]>([])
  const [picked, setPicked] = useState<CommissionableItem | null>(null)
  const [ctype, setCtype]   = useState<PartnerCommType>('percent')
  const [value, setValue]   = useState('')
  const [saving, setSaving] = useState(false)
  const searchRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => { load() }, [partnerClinicId])
  async function load() {
    setLoading(true)
    const r = await listPartnerCommissions(partnerClinicId)
    setLoading(false)
    if (Array.isArray(r)) setRules(r)
  }

  // busca de itens (produto/serviço/pacote)
  useEffect(() => {
    if (scope === 'all') { setResults([]); return }
    clearTimeout(searchRef.current)
    if (query.trim().length < 2) { setResults([]); return }
    searchRef.current = setTimeout(async () => {
      const r = await searchItemsForCommission(query, scope as 'product' | 'service' | 'package')
      if (Array.isArray(r)) setResults(r)
    }, 350)
  }, [query, scope])

  async function add() {
    const v = parseFloat(value.replace(',', '.'))
    if (!Number.isFinite(v) || v < 0) { setMsg('Informe um valor válido.'); return }
    if (scope !== 'all' && !picked) { setMsg('Selecione o serviço/produto.'); return }
    setSaving(true); setMsg(null)
    const res = await addPartnerCommission({
      partner_clinic_id: partnerClinicId, item_type: scope,
      item_id: scope === 'all' ? null : picked!.id, item_name: scope === 'all' ? null : picked!.name,
      commission_type: ctype, value: v,
    })
    setSaving(false)
    if ('error' in res) { setMsg(res.error); return }
    setQuery(''); setPicked(null); setResults([]); setValue('')
    await load()
  }
  async function remove(id: string) { await deletePartnerCommission(id); await load() }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <Handshake className="h-4 w-4 text-teal-600" />
        <span className="text-sm font-medium text-slate-700">Comissão por serviço/produto</span>
      </div>
      <p className="text-xs text-slate-500 mb-2">Escolha os serviços/produtos que esta clínica/laboratório recebe e o <strong>% ou valor</strong> de cada um.</p>

      {msg && <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-700 mb-2">{msg}</p>}

      {/* regras existentes */}
      {loading ? (
        <div className="py-2 flex items-center gap-2 text-slate-400 text-xs"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
      ) : (
        <div className="space-y-1.5 mb-3">
          {rules.length === 0 && <p className="text-xs text-slate-400">Nenhuma regra ainda.</p>}
          {rules.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.commission_type === 'percent' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {r.commission_type === 'percent' ? <Percent className="h-3 w-3" /> : <DollarSign className="h-3 w-3" />} {fmtRule(r)}
                </span>
                <span className="text-sm text-slate-700 truncate">{r.item_name ?? SCOPE_LABEL[r.item_type]}</span>
              </div>
              <button onClick={() => remove(r.id)} className="text-rose-500 hover:text-rose-700 shrink-0"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}

      {/* nova regra */}
      <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select value={scope} onChange={e => { setScope(e.target.value as PartnerCommScope); setPicked(null); setQuery('') }} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            <option value="service">Serviço</option>
            <option value="product">Produto</option>
            <option value="package">Pacote</option>
            <option value="all">Todos (padrão)</option>
          </select>
          <select value={ctype} onChange={e => setCtype(e.target.value as PartnerCommType)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            <option value="percent">Percentual (%)</option>
            <option value="fixed">Valor fixo (R$)</option>
          </select>
          <input value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" placeholder={ctype === 'percent' ? '10' : '30,00'} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm tabular-nums" />
          <button onClick={add} disabled={saving} className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
          </button>
        </div>
        {scope !== 'all' && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input value={picked ? picked.name : query} onChange={e => { setQuery(e.target.value); setPicked(null) }}
              placeholder={`Buscar ${SCOPE_LABEL[scope].toLowerCase()}…`} className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-sm" />
            {!picked && results.length > 0 && (
              <div className="absolute z-10 left-0 right-0 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto">
                {results.map(it => (
                  <button key={it.id} onClick={() => { setPicked(it); setResults([]) }} className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 flex items-center justify-between gap-2">
                    <span className="truncate">{it.name}</span><span className="text-xs text-slate-400 tabular-nums shrink-0">{fmt(it.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
