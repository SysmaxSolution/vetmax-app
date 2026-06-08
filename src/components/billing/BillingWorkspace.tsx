'use client'

/**
 * Módulo Faturamento — workspace (Fase 1).
 * Barra de filtros (data inicial/final, tutor-pet, profissional, nº doc,
 * espécie) + "+ Novo Documento" + tabela. Linha clicável → drawer de detalhe.
 * Mobile-first (cards em vez de tabela no celular).
 */

import { useState, useCallback } from 'react'
import {
  FileText, Plus, RefreshCw, Search, Filter, FileBarChart2, CheckCircle2, Clock,
} from 'lucide-react'
import {
  listBillingDocuments, getBillingSummary,
  type BillingDocumentRow, type BillingFilters,
} from '@/lib/actions/billing-documents'
import NewQuotationModal from './NewQuotationModal'
import BillingDocumentDetail from './BillingDocumentDetail'

interface Props {
  clinicId:         string
  clinicName:       string
  currentUserId:    string
  initialDocuments: BillingDocumentRow[]
  initialSummary:   { count: number; total: number; billed_count: number; billed_total: number; open_count: number } | null
  professionals:    Array<{ id: string; name: string; role: string }>
}

function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft:      { label: 'Rascunho',   cls: 'bg-slate-100 text-slate-600' },
  sent:       { label: 'Enviado',    cls: 'bg-blue-100 text-blue-700' },
  billed:     { label: 'Faturado',   cls: 'bg-emerald-100 text-emerald-700' },
  cancelled:  { label: 'Cancelado',  cls: 'bg-rose-100 text-rose-500 line-through' },
  processing: { label: 'Processando',cls: 'bg-amber-100 text-amber-700' },
  authorized: { label: 'Autorizada', cls: 'bg-emerald-100 text-emerald-700' },
  rejected:   { label: 'Rejeitada',  cls: 'bg-rose-100 text-rose-700' },
}

export default function BillingWorkspace({
  clinicId, clinicName, currentUserId, initialDocuments, initialSummary, professionals,
}: Props) {
  const [docs,     setDocs]     = useState<BillingDocumentRow[]>(initialDocuments)
  const [summary,  setSummary]  = useState(initialSummary)
  const [loading,  setLoading]  = useState(false)
  const [showNew,  setShowNew]  = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [toast,    setToast]    = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`
  const today        = new Date().toISOString().slice(0, 10)

  const [filters, setFilters] = useState<BillingFilters>({
    dateFrom: firstOfMonth, dateTo: today, docType: 'all',
  })

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 4000)
  }

  const reload = useCallback(async (f: BillingFilters) => {
    setLoading(true)
    const [d, s] = await Promise.all([listBillingDocuments(f), getBillingSummary(f)])
    setLoading(false)
    if (Array.isArray(d)) setDocs(d)
    if (!('error' in s)) setSummary(s)
  }, [])

  function applyFilters() { void reload(filters) }

  function patch(p: Partial<BillingFilters>) { setFilters(prev => ({ ...prev, ...p })) }

  return (
    <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto">
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100">
            <FileText className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Faturamento</h1>
            <p className="text-xs text-slate-500">Orçamentos de serviços e notas — {clinicName}</p>
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          data-mentor-step="billing-new-doc-btn"
          className="flex items-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" /> Novo Documento
        </button>
      </div>

      {/* KPIs */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <Kpi icon={<FileBarChart2 className="h-4 w-4" />} label="Documentos" value={String(summary.count)} sub={fmt(summary.total)} color="text-slate-700 bg-slate-100" />
          <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="Faturados" value={String(summary.billed_count)} sub={fmt(summary.billed_total)} color="text-emerald-700 bg-emerald-50" />
          <Kpi icon={<Clock className="h-4 w-4" />} label="Orçam. em aberto" value={String(summary.open_count)} sub="aguardando" color="text-blue-700 bg-blue-50" />
          <Kpi icon={<FileText className="h-4 w-4" />} label="Valor total" value={fmt(summary.total)} sub="no período" color="text-green-700 bg-green-50" />
        </div>
      )}

      {/* Filtros */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          <Filter className="h-3.5 w-3.5" /> Filtros
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Lbl text="De"><input type="date" value={filters.dateFrom} onChange={e => patch({ dateFrom: e.target.value })} className={inputCls} /></Lbl>
            <Lbl text="Até"><input type="date" value={filters.dateTo} onChange={e => patch({ dateTo: e.target.value })} className={inputCls} /></Lbl>
          </div>
          <Lbl text="Tutor ou Pet">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input value={filters.tutorOrPet ?? ''} onChange={e => patch({ tutorOrPet: e.target.value })} onKeyDown={e => e.key === 'Enter' && applyFilters()} placeholder="Nome..." className={`${inputCls} pl-8`} />
            </div>
          </Lbl>
          <Lbl text="Profissional">
            <select value={filters.professionalId ?? ''} onChange={e => patch({ professionalId: e.target.value || undefined })} className={inputCls}>
              <option value="">Todos</option>
              {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Lbl>
          <Lbl text="Nº documento"><input value={filters.docNumber ?? ''} onChange={e => patch({ docNumber: e.target.value })} onKeyDown={e => e.key === 'Enter' && applyFilters()} placeholder="ORC-2026-..." className={inputCls} /></Lbl>
          <Lbl text="Espécie (tipo)">
            <select value={filters.docType ?? 'all'} onChange={e => patch({ docType: e.target.value as any })} className={inputCls}>
              <option value="all">Todos</option>
              <option value="orcamento">Orçamento</option>
              <option value="nfse">NFS-e</option>
            </select>
          </Lbl>
          <div className="flex items-end">
            <button onClick={applyFilters} disabled={loading} className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Aplicar
            </button>
          </div>
        </div>
      </div>

      {/* Tabela (desktop) / cards (mobile) */}
      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-slate-300 bg-white">
          <FileText className="h-10 w-10 text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500">Nenhum documento no período</p>
          <p className="text-xs text-slate-400 mt-1">Use "Novo Documento" para criar um orçamento.</p>
        </div>
      ) : (
        <>
          {/* desktop */}
          <div className="hidden sm:block rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-semibold">Número</th>
                    <th className="text-left px-4 py-3 font-semibold">Espécie</th>
                    <th className="text-left px-4 py-3 font-semibold">Emissão</th>
                    <th className="text-left px-4 py-3 font-semibold">Faturamento</th>
                    <th className="text-left px-4 py-3 font-semibold">Doc. anterior</th>
                    <th className="text-left px-4 py-3 font-semibold">Tutor / Pet</th>
                    <th className="text-right px-4 py-3 font-semibold">Valor</th>
                    <th className="text-center px-4 py-3 font-semibold">Faturado?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {docs.map(d => (
                    <tr key={d.id} onClick={() => setActiveId(d.id)} className="hover:bg-green-50/40 cursor-pointer transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800">{d.doc_number}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${d.doc_type === 'nfse' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'}`}>
                          {d.doc_type === 'nfse' ? 'NFS-e' : 'Orçamento'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(d.issue_date)}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(d.billed_date)}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{d.related_doc_number ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <p className="font-medium truncate max-w-[180px]">{d.patient_name ?? '—'}</p>
                        <p className="text-xs text-slate-400 truncate max-w-[180px]">{d.tutor_name ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{fmt(d.total_amount)}</td>
                      <td className="px-4 py-3 text-center">
                        {d.is_billed
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Sim</span>
                          : <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_LABEL[d.status]?.cls ?? 'bg-slate-100 text-slate-500'}`}>{STATUS_LABEL[d.status]?.label ?? 'Não'}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* mobile cards */}
          <div className="sm:hidden space-y-2">
            {docs.map(d => (
              <button key={d.id} onClick={() => setActiveId(d.id)} className="w-full text-left rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-800">{d.doc_number}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.doc_type === 'nfse' ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'}`}>{d.doc_type === 'nfse' ? 'NFS-e' : 'Orçamento'}</span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-800 truncate">{d.patient_name ?? d.tutor_name ?? '—'}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-slate-400">{fmtDate(d.issue_date)}</span>
                  <span className="text-sm font-bold text-slate-900">{fmt(d.total_amount)}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {showNew && (
        <NewQuotationModal
          clinicId={clinicId}
          currentUserId={currentUserId}
          professionals={professionals}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); void reload(filters); showToast('Orçamento criado!') }}
        />
      )}

      {activeId && (
        <BillingDocumentDetail
          documentId={activeId}
          onClose={() => setActiveId(null)}
          onChanged={() => void reload(filters)}
          onToast={showToast}
        />
      )}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500'

function Lbl({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">{text}</span>
      {children}
    </label>
  )
}

function Kpi({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${color} mb-2`}>{icon}</div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-lg font-bold text-slate-900 tabular-nums">{value}</p>
      <p className="text-[10px] text-slate-400">{sub}</p>
    </div>
  )
}
