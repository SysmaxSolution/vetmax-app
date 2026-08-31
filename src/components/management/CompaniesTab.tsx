'use client'

// Cadastro de Empresas Faturantes (multi-CNPJ) — Sprint Animais, Fase 0.
// CRUD das entidades de faturamento (Emp 001/002/003) dentro de uma clínica.

import { useState, useEffect } from 'react'
import { Loader2, Plus, Pencil, Building2, Check, X, Star } from 'lucide-react'
import {
  listCompanies, upsertCompany, setCompanyActive, type Company,
} from '@/lib/actions/companies'
import { Toast } from '@/components/ui/toast'

interface Props { userRole?: string }

interface Draft {
  id?: string
  code: string
  name: string
  legal_name: string
  cnpj: string
  municipal_registration: string
  is_default: boolean
  is_active: boolean
}

function formatCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export default function CompaniesTab({ userRole = 'admin' }: Props) {
  const canManage = ['admin', 'owner', 'manager'].includes(userRole)

  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading]     = useState(true)
  const [busy, setBusy]           = useState(false)
  const [draft, setDraft]         = useState<Draft | null>(null)
  const [toast, setToast]         = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  async function reload() {
    try {
      const res = await listCompanies()
      if (!('error' in res)) setCompanies(res)
      else setToast({ type: 'error', message: res.error })
    } catch {
      setToast({ type: 'error', message: 'Erro ao carregar empresas.' })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void reload() }, [])

  function newDraft() {
    const nextCode = String(companies.length + 1).padStart(3, '0')
    setDraft({ code: nextCode, name: `Emp ${nextCode}`, legal_name: '', cnpj: '', municipal_registration: '', is_default: companies.length === 0, is_active: true })
  }
  function editDraft(c: Company) {
    setDraft({
      id: c.id, code: c.code, name: c.name, legal_name: c.legal_name ?? '', cnpj: c.cnpj ?? '',
      municipal_registration: c.municipal_registration ?? '', is_default: c.is_default, is_active: c.is_active,
    })
  }

  async function saveDraft() {
    if (!draft) return
    setBusy(true)
    const res = await upsertCompany({
      id: draft.id,
      code: draft.code,
      name: draft.name,
      legal_name: draft.legal_name || null,
      cnpj: draft.cnpj.replace(/\D/g, '') || null,
      municipal_registration: draft.municipal_registration || null,
      is_default: draft.is_default,
      is_active: draft.is_active,
    })
    setBusy(false)
    if ('error' in res) { setToast({ type: 'error', message: res.error }); return }
    setToast({ type: 'success', message: 'Empresa salva!' })
    setDraft(null)
    void reload()
  }

  async function toggleActive(c: Company) {
    setBusy(true)
    const res = await setCompanyActive(c.id, !c.is_active)
    setBusy(false)
    if ('error' in res) { setToast({ type: 'error', message: res.error }); return }
    void reload()
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  return (
    <>
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Empresas que emitem o faturamento (CNPJs) dentro desta clínica. A OS aponta a empresa faturante no recebimento.
        </p>
        {canManage && !draft && (
          <button type="button" onClick={newDraft}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors shadow-sm flex-shrink-0">
            <Plus className="h-4 w-4" />
            Nova empresa
          </button>
        )}
      </div>

      {draft && (
        <div className="mb-4 rounded-xl border-2 border-teal-300 bg-teal-50/40 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Código</label>
              <input type="text" value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })}
                placeholder="001" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Nome curto</label>
              <input type="text" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder="Emp 001" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">Razão social</label>
              <input type="text" value={draft.legal_name} onChange={e => setDraft({ ...draft, legal_name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">CNPJ</label>
                <input type="text" value={formatCnpj(draft.cnpj)} onChange={e => setDraft({ ...draft, cnpj: e.target.value.replace(/\D/g, '') })}
                  placeholder="00.000.000/0000-00" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Inscr. municipal</label>
                <input type="text" value={draft.municipal_registration} onChange={e => setDraft({ ...draft, municipal_registration: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20" />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input type="checkbox" checked={draft.is_default} onChange={e => setDraft({ ...draft, is_default: e.target.checked })}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                Empresa padrão do grupo
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                <input type="checkbox" checked={draft.is_active} onChange={e => setDraft({ ...draft, is_active: e.target.checked })}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
                Ativa
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setDraft(null)} className="rounded-lg p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X className="h-4 w-4" /></button>
              <button type="button" onClick={saveDraft} disabled={busy}
                className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {companies.length === 0 && !draft ? (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl border border-dashed border-slate-300 bg-white">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100"><Building2 className="h-7 w-7 text-slate-400" /></div>
          <p className="text-sm font-medium text-slate-500">Nenhuma empresa faturante cadastrada</p>
          <p className="mt-1 text-xs text-slate-400">Cadastre as empresas/CNPJs do grupo (Emp 001, 002, 003…)</p>
        </div>
      ) : (
        <div className="space-y-2">
          {companies.map(c => (
            <div key={c.id} className={`flex items-center gap-4 rounded-xl border bg-white px-4 sm:px-5 py-3 transition-all ${
              c.is_active ? 'border-slate-200 hover:border-slate-300' : 'border-slate-200 bg-slate-50/50 opacity-70'
            }`}>
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-sm font-bold">{c.code}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-900 truncate">{c.name}</p>
                  {c.is_default && <span className="inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 bg-amber-100 text-amber-700"><Star className="h-3 w-3" /> Padrão</span>}
                  {!c.is_active && <span className="text-xs rounded-full bg-slate-200 text-slate-600 px-2 py-0.5 font-medium">Inativa</span>}
                </div>
                <p className="mt-0.5 text-xs text-slate-500 truncate">
                  {c.cnpj ? formatCnpj(c.cnpj) : 'sem CNPJ'}{c.legal_name ? ` · ${c.legal_name}` : ''}
                </p>
              </div>
              {canManage && (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => toggleActive(c)} disabled={busy}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors disabled:opacity-50">
                    {c.is_active ? 'Desativar' : 'Reativar'}
                  </button>
                  <button type="button" onClick={() => editDraft(c)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors">
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
