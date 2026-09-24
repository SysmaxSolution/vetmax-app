'use client'

import { useState, useEffect } from 'react'
import { Loader2, Trash2, KeyRound, Copy, Check, RefreshCw, UserPlus, Building2, Eye, EyeOff, XCircle } from 'lucide-react'
import {
  listPartnerProfessionals, savePartnerProfessional, deletePartnerProfessional,
  generatePartnerProfessionalCode, generatePartnerClinicAdminCode, getPartnerClinicCodeStatus,
  getPartnerCode, clearPartnerAccess,
} from '@/lib/actions/partner-portal'
import type { PartnerProfessional } from '@/lib/portal/partner-types'

export default function PartnerProfessionalsPanel({ partnerClinicId }: { partnerClinicId: string }) {
  const [pros, setPros] = useState<PartnerProfessional[]>([])
  const [loading, setLoading] = useState(true)
  const [adminCodeSet, setAdminCodeSet] = useState(false)
  const [masked, setMasked] = useState<Record<string, string | null>>({})  // key 'admin' | pro.id → mascarado
  const [full, setFull] = useState<Record<string, string | null>>({})        // key → revelado
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', crmv: '', email: '' })
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    const [list, status] = await Promise.all([listPartnerProfessionals(partnerClinicId), getPartnerClinicCodeStatus(partnerClinicId)])
    const proList = Array.isArray(list) ? list : []
    setPros(proList)
    const hasAdmin = !('error' in status) && status.adminCodeSet
    setAdminCodeSet(hasAdmin)
    // busca máscaras dos códigos existentes
    const entries = await Promise.all([
      hasAdmin ? getPartnerCode('admin', partnerClinicId).then(r => ['admin', !('error' in r) && r.hasCode ? r.code : null] as const) : Promise.resolve(['admin', null] as const),
      ...proList.filter(p => p.hasCode).map(p => getPartnerCode('professional', p.id).then(r => [p.id, !('error' in r) && r.hasCode ? r.code : null] as const)),
    ])
    const m: Record<string, string | null> = {}
    for (const [k, v] of entries) m[k] = v
    setMasked(m); setFull({})
  }
  useEffect(() => { (async () => { await reload(); setLoading(false) })() /* eslint-disable-next-line */ }, [partnerClinicId])

  function copy(text: string, id: string) {
    navigator.clipboard?.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied(null), 2000) }).catch(() => {})
  }

  async function reveal(kind: 'admin' | 'professional', id: string, key: string) {
    if (full[key]) { setFull(f => ({ ...f, [key]: null })); return }
    setBusy('reveal:' + key)
    const r = await getPartnerCode(kind, id, true)
    setBusy(null)
    if (!('error' in r)) setFull(f => ({ ...f, [key]: r.code }))
  }
  async function genAdmin() {
    setBusy('admin'); setError(null)
    const r = await generatePartnerClinicAdminCode(partnerClinicId)
    setBusy(null)
    if ('error' in r) { setError(r.error); return }
    setAdminCodeSet(true); setFull(f => ({ ...f, admin: r.code })); setMasked(m => ({ ...m, admin: r.code }))
  }
  async function genPro(id: string) {
    setBusy(id); setError(null)
    const r = await generatePartnerProfessionalCode(id)
    setBusy(null)
    if ('error' in r) { setError(r.error); return }
    setFull(f => ({ ...f, [id]: r.code })); setMasked(m => ({ ...m, [id]: r.code }))
    setPros(ps => ps.map(p => p.id === id ? { ...p, hasCode: true } : p))
  }
  async function clearAccess(kind: 'admin' | 'professional', id: string, key: string) {
    if (!confirm('Excluir este acesso? O código deixa de funcionar e as sessões abertas são encerradas.')) return
    setBusy('clear:' + key)
    const r = await clearPartnerAccess(kind, id)
    setBusy(null)
    if ('error' in r) { setError(r.error); return }
    setFull(f => ({ ...f, [key]: null })); setMasked(m => ({ ...m, [key]: null }))
    if (kind === 'admin') setAdminCodeSet(false)
    else setPros(ps => ps.map(p => p.id === id ? { ...p, hasCode: false } : p))
  }
  async function addPro() {
    if (!form.name.trim()) return
    setBusy('add'); setError(null)
    const r = await savePartnerProfessional({ partnerClinicId, name: form.name, crmv: form.crmv, email: form.email })
    setBusy(null)
    if ('error' in r) { setError(r.error); return }
    setForm({ name: '', crmv: '', email: '' }); reload()
  }
  async function delPro(id: string) {
    if (!confirm('Remover este profissional? (Também remove o acesso dele.)')) return
    setBusy(id)
    await deletePartnerProfessional(id); setBusy(null); reload()
  }

  // Bloco de exibição do código (mascarado + olhinho + copiar)
  function CodeView({ kind, id, cKey }: { kind: 'admin' | 'professional'; id: string; cKey: string }) {
    const shown = full[cKey] ?? masked[cKey]
    if (!shown) return null
    return (
      <div className="mt-1.5 flex items-center gap-2">
        <p className="text-base font-bold tracking-widest text-slate-800 font-mono">{shown}</p>
        <button type="button" onClick={() => reveal(kind, id, cKey)} disabled={busy === 'reveal:' + cKey} title={full[cKey] ? 'Ocultar' : 'Visualizar'} className="text-teal-700 border border-teal-200 rounded px-1.5 py-1 hover:bg-teal-50">
          {busy === 'reveal:' + cKey ? <Loader2 className="h-3 w-3 animate-spin" /> : full[cKey] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </button>
        {full[cKey] && <button type="button" onClick={() => copy(full[cKey]!, cKey)} className="text-teal-700 border border-teal-200 rounded px-1.5 py-1 hover:bg-teal-50">{copied === cKey ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}</button>}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-teal-600" />
        <h3 className="text-sm font-semibold text-slate-800">Profissionais &amp; Acesso ao Portal</h3>
      </div>
      <p className="text-[11px] text-slate-500 -mt-2">O portal do veterinário deixa a clínica parceira ver os pets que encaminhou. Sem profissionais cadastrados, só o <strong>acesso geral</strong> (vê todos). Cada profissional tem um código que filtra só os que <strong>ele</strong> encaminhou.</p>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {/* Acesso geral (admin) */}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-slate-400" />Acesso geral da clínica (todos os encaminhados)</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={genAdmin} disabled={busy === 'admin'} className="text-[11px] text-teal-700 flex items-center gap-1 hover:underline disabled:opacity-50">
              {busy === 'admin' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}{adminCodeSet ? 'Gerar novo' : 'Gerar código'}
            </button>
            {adminCodeSet && <button type="button" onClick={() => clearAccess('admin', partnerClinicId, 'admin')} disabled={busy === 'clear:admin'} className="text-[11px] text-rose-600 flex items-center gap-1 hover:underline disabled:opacity-50">
              {busy === 'clear:admin' ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}Excluir
            </button>}
          </div>
        </div>
        <CodeView kind="admin" id={partnerClinicId} cKey="admin" />
        {adminCodeSet && !masked['admin'] && !full['admin'] && <p className="text-[10px] text-slate-400 mt-1">Código definido (indisponível para leitura). "Gerar novo" para trocar.</p>}
      </div>

      {/* Profissionais */}
      {loading ? (
        <div className="py-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
      ) : (
        <div className="space-y-2">
          {pros.map(p => (
            <div key={p.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{p.name}{p.crmv ? <span className="text-slate-400 font-normal"> · CRMV {p.crmv}</span> : ''}</p>
                  {p.email && <p className="text-[11px] text-slate-400 truncate">{p.email}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" onClick={() => genPro(p.id)} disabled={busy === p.id} className="text-[11px] text-teal-700 flex items-center gap-1 hover:underline disabled:opacity-50">
                    {busy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}{p.hasCode ? 'Novo código' : 'Gerar código'}
                  </button>
                  {p.hasCode && <button type="button" onClick={() => clearAccess('professional', p.id, p.id)} disabled={busy === 'clear:' + p.id} title="Excluir acesso" className="text-rose-500 hover:text-rose-700">{busy === 'clear:' + p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}</button>}
                  <button type="button" onClick={() => delPro(p.id)} title="Remover profissional" className="text-slate-300 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <CodeView kind="professional" id={p.id} cKey={p.id} />
            </div>
          ))}

          {/* Adicionar */}
          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome do MV"
                   className="rounded border border-slate-200 px-2 py-1.5 text-sm" />
            <input value={form.crmv} onChange={e => setForm(f => ({ ...f, crmv: e.target.value }))} placeholder="CRMV"
                   className="rounded border border-slate-200 px-2 py-1.5 text-sm" />
            <div className="flex gap-2">
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="E-mail (opcional)"
                     className="flex-1 rounded border border-slate-200 px-2 py-1.5 text-sm" />
              <button type="button" onClick={addPro} disabled={busy === 'add' || !form.name.trim()}
                      className="rounded bg-teal-600 text-white px-2.5 text-sm hover:bg-teal-700 disabled:opacity-50 flex items-center gap-1">
                {busy === 'add' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
