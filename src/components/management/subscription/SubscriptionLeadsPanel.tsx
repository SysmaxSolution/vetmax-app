'use client'

// Funil comercial do Especializado (R5/D4) — EXCLUSIVO do usuário SysMax.
// Lista os leads capturados no app, permite avançar o status e definir o preço
// sob medida da clínica (com trilha de auditoria no servidor).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Inbox, Loader2, RefreshCw, Tag } from 'lucide-react'
import {
  listSubscriptionLeads,
  updateLeadStatus,
  setSpecializedPrice,
} from '@/lib/actions/subscription'
import type { SubscriptionLead } from '@/lib/subscription/types'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const STATUS: Record<SubscriptionLead['status'], { label: string; cls: string }> = {
  new:       { label: 'Novo',       cls: 'bg-sky-100 text-sky-700' },
  contacted: { label: 'Em contato', cls: 'bg-amber-100 text-amber-700' },
  won:       { label: 'Fechado',    cls: 'bg-emerald-100 text-emerald-700' },
  lost:      { label: 'Perdido',    cls: 'bg-slate-200 text-slate-600' },
}
const NEXT: Record<SubscriptionLead['status'], SubscriptionLead['status'][]> = {
  new:       ['contacted', 'lost'],
  contacted: ['won', 'lost'],
  won:       [],
  lost:      ['contacted'],
}

interface Props {
  onToast: (type: 'success' | 'error', message: string) => void
}

export default function SubscriptionLeadsPanel({ onToast }: Props) {
  const router = useRouter()
  const [leads, setLeads] = useState<SubscriptionLead[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [priceFor, setPriceFor] = useState<string | null>(null)
  const [priceVal, setPriceVal] = useState('')

  async function load() {
    setLoading(true)
    const result = await listSubscriptionLeads()
    setLoading(false)
    if ('error' in result) {
      onToast('error', result.error)
      return
    }
    setLeads(result.leads)
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function advance(lead: SubscriptionLead, status: SubscriptionLead['status']) {
    setBusyId(lead.id)
    const result = await updateLeadStatus({ leadId: lead.id, status })
    setBusyId(null)
    if ('error' in result) { onToast('error', result.error); return }
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status } : l))
  }

  async function savePrice(lead: SubscriptionLead) {
    const price = parseFloat(priceVal.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(price) || price <= 0) { onToast('error', 'Informe um valor mensal válido.'); return }
    setBusyId(lead.id)
    const result = await setSpecializedPrice({ clinicId: lead.clinic_id, monthlyPrice: price })
    setBusyId(null)
    if ('error' in result) { onToast('error', result.error); return }
    setPriceFor(null)
    setPriceVal('')
    onToast('success', `Preço sob medida de ${lead.clinic_name ?? 'clínica'} definido em ${fmt(price)}/mês.`)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Inbox className="h-4 w-4 text-violet-600" />
        <h3 className="text-sm font-bold text-slate-900">Leads do Especializado (funil comercial)</h3>
        <span className="text-[10px] font-semibold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
          Operação SysMax
        </span>
        <button
          onClick={load}
          className="ml-auto flex items-center gap-1 rounded-lg border border-violet-200 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {loading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando leads…
        </p>
      ) : leads.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Nenhum lead por enquanto.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {leads.map(lead => {
            const badge = STATUS[lead.status]
            return (
              <li key={lead.id} className="rounded-xl border border-violet-100 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{lead.clinic_name ?? 'Clínica'}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
                  <span className="text-[11px] text-slate-400">
                    {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                  </span>
                  {lead.estimate_monthly != null && (
                    <span className="ml-auto text-xs font-medium text-violet-700 tabular-nums">
                      est. {fmt(lead.estimate_monthly)}/mês
                    </span>
                  )}
                </div>

                <div className="mt-1 text-xs text-slate-600">
                  {[lead.contact_name, lead.contact_email, lead.contact_phone].filter(Boolean).join(' · ') || 'Sem contato informado'}
                </div>
                {lead.message && <p className="mt-1 text-xs italic text-slate-500">“{lead.message}”</p>}
                {lead.desired_module_keys.length > 0 && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    {lead.desired_module_keys.length} módulo(s): {lead.desired_module_keys.join(', ')}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {NEXT[lead.status].map(s => (
                    <button
                      key={s}
                      onClick={() => advance(lead, s)}
                      disabled={busyId === lead.id}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      → {STATUS[s].label}
                    </button>
                  ))}

                  {priceFor === lead.id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-slate-500">R$</span>
                      <input
                        value={priceVal}
                        onChange={e => setPriceVal(e.target.value)}
                        inputMode="decimal"
                        placeholder="0,00"
                        autoFocus
                        className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-xs tabular-nums outline-none focus:border-violet-400"
                      />
                      <button
                        onClick={() => savePrice(lead)}
                        disabled={busyId === lead.id}
                        className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
                      >
                        {busyId === lead.id ? '…' : 'Salvar'}
                      </button>
                      <button onClick={() => { setPriceFor(null); setPriceVal('') }} className="text-xs text-slate-400 hover:text-slate-600">
                        cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setPriceFor(lead.id); setPriceVal('') }}
                      className="ml-auto flex items-center gap-1 rounded-lg border border-violet-200 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
                    >
                      <Tag className="h-3 w-3" /> Definir preço
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
