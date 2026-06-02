'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2, Pencil, Check, X, Loader2, Pin, PawPrint } from 'lucide-react'
import {
  upsertPatientCustomPrice,
  deletePatientCustomPrice,
  listClinicServicesForCustomPricing,
  type PatientCustomPrice,
  type CatalogService,
} from '@/lib/actions/patient-custom-prices'

interface Props {
  patientId:    string
  providerId:   string | null
  providerName: string | null
  prices:       PatientCustomPrice[]
  onChange:     () => void   // Pai recarrega prices via getCustomPricesForPatient
}

interface DraftPrice {
  stock_item_id: string
  copay:         string   // input PT-BR (vírgula)
  repass:        string
}

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function parseBR(s: string): number {
  const v = Number(String(s).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : NaN
}

function toInput(n: number | null | undefined): string {
  if (n === null || n === undefined) return ''
  return n.toFixed(2).replace('.', ',')
}

export default function CustomPricesEditor({ patientId, providerId, providerName, prices, onChange }: Props) {
  const [services, setServices] = useState<CatalogService[]>([])
  const [loadingServices, setLoadingServices] = useState(false)
  const [adding, setAdding] = useState<DraftPrice | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<DraftPrice | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    setLoadingServices(true)
    listClinicServicesForCustomPricing().then(res => {
      if (!('error' in res)) setServices(res)
      setLoadingServices(false)
    })
  }, [])

  const usedIds = useMemo(() => new Set(prices.map(p => p.stock_item_id)), [prices])

  const availableServices = useMemo(() => {
    return services.filter(s => {
      if (usedIds.has(s.id) && !(editingId && prices.find(p => p.id === editingId)?.stock_item_id === s.id)) return false
      if (providerId && s.accepted_provider_ids.length > 0 && !s.accepted_provider_ids.includes(providerId)) return false
      return true
    })
  }, [services, usedIds, editingId, prices, providerId])

  const selectedAddService = (adding ? services.find(s => s.id === adding.stock_item_id) : null) ?? null
  const selectedEditService = (editDraft ? services.find(s => s.id === editDraft.stock_item_id) : null) ?? null

  function calcTotal(draft: DraftPrice): number | null {
    const c = parseBR(draft.copay)
    const r = parseBR(draft.repass)
    if (!Number.isFinite(c) || !Number.isFinite(r)) return null
    return Number((c + r).toFixed(2))
  }

  function onCopayChange(draft: DraftPrice, val: string, refService: CatalogService | null): DraftPrice {
    const c = parseBR(val)
    if (refService && Number.isFinite(c)) {
      const total = refService.default_insurance_price ?? refService.unit_price
      const r = Number((total - c).toFixed(2))
      return { ...draft, copay: val, repass: r >= 0 ? toInput(r) : '' }
    }
    return { ...draft, copay: val }
  }

  function onRepassChange(draft: DraftPrice, val: string, refService: CatalogService | null): DraftPrice {
    const r = parseBR(val)
    if (refService && Number.isFinite(r)) {
      const total = refService.default_insurance_price ?? refService.unit_price
      const c = Number((total - r).toFixed(2))
      return { ...draft, repass: val, copay: c >= 0 ? toInput(c) : '' }
    }
    return { ...draft, repass: val }
  }

  function onServiceChange(draft: DraftPrice, newId: string): DraftPrice {
    const svc = services.find(s => s.id === newId)
    if (!svc) return { ...draft, stock_item_id: newId }
    const total = svc.default_insurance_price ?? svc.unit_price
    return {
      stock_item_id: newId,
      copay:  toInput(total * 0.3),
      repass: toInput(total * 0.7),
    }
  }

  async function handleSaveNew() {
    if (!adding) return
    const svc = selectedAddService
    if (!svc) { setError('Selecione um serviço.'); return }
    const copay = parseBR(adding.copay)
    const repass = parseBR(adding.repass)
    if (!Number.isFinite(copay) || !Number.isFinite(repass)) { setError('Informe coparticipação e repasse válidos.'); return }
    const total = Number((copay + repass).toFixed(2))
    if (total <= 0) { setError('Total deve ser maior que zero.'); return }
    setSaving(true)
    setError(null)
    const res = await upsertPatientCustomPrice({
      patient_id:    patientId,
      stock_item_id: svc.id,
      custom_price:  total,
      copay_amount:  copay,
      repass_amount: repass,
      provider_id:   providerId,
    })
    setSaving(false)
    if ('error' in res) { setError(res.error); return }
    setAdding(null)
    onChange()
  }

  async function handleSaveEdit() {
    if (!editingId || !editDraft) return
    const svc = selectedEditService
    if (!svc) { setError('Serviço não localizado.'); return }
    const copay = parseBR(editDraft.copay)
    const repass = parseBR(editDraft.repass)
    if (!Number.isFinite(copay) || !Number.isFinite(repass)) { setError('Valores inválidos.'); return }
    const total = Number((copay + repass).toFixed(2))
    setSaving(true)
    setError(null)
    const res = await upsertPatientCustomPrice({
      patient_id:    patientId,
      stock_item_id: svc.id,
      custom_price:  total,
      copay_amount:  copay,
      repass_amount: repass,
      provider_id:   providerId,
    })
    setSaving(false)
    if ('error' in res) { setError(res.error); return }
    setEditingId(null)
    setEditDraft(null)
    onChange()
  }

  async function handleDelete(p: PatientCustomPrice) {
    if (!confirm(`Remover preço fixado de ${p.stock_item_name}?`)) return
    setDeletingId(p.id)
    const res = await deletePatientCustomPrice(p.id)
    setDeletingId(null)
    if ('error' in res) { setError(res.error); return }
    onChange()
  }

  return (
    <div className="bg-purple-50/60 rounded-2xl border border-purple-200 overflow-hidden">
      <header className="px-5 py-3 border-b border-purple-200 flex items-center justify-between gap-2">
        <h3 className="text-xs font-black text-purple-900 uppercase tracking-wider flex items-center gap-2">
          <PawPrint className="h-4 w-4" />
          Preços do Convênio fixados neste pet
        </h3>
        <button
          type="button"
          onClick={() => setAdding({ stock_item_id: '', copay: '', repass: '' })}
          disabled={loadingServices || !!adding}
          className="flex items-center gap-1 rounded-lg bg-purple-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar serviço
        </button>
      </header>

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-5 py-2 text-xs text-red-700">{error}</div>
      )}

      {/* Form de adicionar */}
      {adding && (
        <div className="px-5 py-3 bg-white border-b border-purple-200 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px_110px_auto] gap-2 items-end">
            <div>
              <label className="block text-[10px] font-bold text-purple-700 uppercase tracking-wider mb-1">Serviço</label>
              <select
                value={adding.stock_item_id}
                onChange={e => setAdding(d => d && onServiceChange(d, e.target.value))}
                className="w-full rounded-lg border border-purple-200 bg-white px-2.5 py-1.5 text-xs focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              >
                <option value="">Selecione…</option>
                {availableServices.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.default_insurance_price !== null ? `(conv. ${fmtBRL(s.default_insurance_price)})` : `(${fmtBRL(s.unit_price)})`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Coparticipação</label>
              <input
                type="text"
                inputMode="decimal"
                value={adding.copay}
                onChange={e => setAdding(d => d && onCopayChange(d, e.target.value, selectedAddService))}
                placeholder="0,00"
                className="w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs text-right tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Repasse</label>
              <input
                type="text"
                inputMode="decimal"
                value={adding.repass}
                onChange={e => setAdding(d => d && onRepassChange(d, e.target.value, selectedAddService))}
                placeholder="0,00"
                className="w-full rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs text-right tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleSaveNew}
                disabled={saving || !adding.stock_item_id}
                className="rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 p-1.5 text-white"
                title="Salvar"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => { setAdding(null); setError(null) }}
                className="rounded-lg border border-slate-200 hover:bg-slate-100 p-1.5 text-slate-500"
                title="Cancelar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {selectedAddService && (
            <p className="text-[10px] text-purple-600">
              Total convênio: <strong className="tabular-nums">{fmtBRL(calcTotal(adding) ?? 0)}</strong>
              {' · '}
              Preço base ({selectedAddService.default_insurance_price !== null ? 'convênio' : 'particular'}): {fmtBRL(selectedAddService.default_insurance_price ?? selectedAddService.unit_price)}
              {' · '}
              ao digitar um dos campos, o outro é calculado automaticamente para fechar o total.
            </p>
          )}
        </div>
      )}

      {/* Lista de preços */}
      <div className="divide-y divide-purple-100 max-h-72 overflow-y-auto">
        {prices.length === 0 && !adding && (
          <p className="px-5 py-6 text-center text-xs text-purple-500">
            Nenhum preço fixado ainda. Clique em <strong>Adicionar serviço</strong> para travar valores deste pet.
          </p>
        )}
        {prices.map(p => {
          const isEditing = editingId === p.id
          if (isEditing && editDraft) {
            return (
              <div key={p.id} className="px-5 py-3 bg-amber-50/50 grid grid-cols-1 sm:grid-cols-[1fr_110px_110px_auto] gap-2 items-end">
                <div>
                  <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider mb-1">Serviço</p>
                  <p className="text-xs font-bold text-purple-900 truncate">{p.stock_item_name}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Coparticipação</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editDraft.copay}
                    onChange={e => setEditDraft(d => d && onCopayChange(d, e.target.value, selectedEditService))}
                    className="w-full rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs text-right tabular-nums focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-indigo-700 uppercase tracking-wider mb-1">Repasse</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editDraft.repass}
                    onChange={e => setEditDraft(d => d && onRepassChange(d, e.target.value, selectedEditService))}
                    className="w-full rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs text-right tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 p-1.5 text-white"
                    title="Salvar"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingId(null); setEditDraft(null); setError(null) }}
                    className="rounded-lg border border-slate-200 hover:bg-slate-100 p-1.5 text-slate-500"
                    title="Cancelar"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          }
          return (
            <div key={p.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <Pin className="h-3 w-3 text-emerald-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-purple-900 truncate">{p.stock_item_name}</p>
                  <p className="text-[10px] text-purple-500 flex items-center gap-1.5">
                    {p.provider_name ?? providerName ?? 'Convênio'}
                    {p.copay_amount !== null && p.repass_amount !== null && (
                      <>
                        <span className="text-purple-300">·</span>
                        <span className="text-emerald-700">Tutor {fmtBRL(p.copay_amount)}</span>
                        <span className="text-purple-300">+</span>
                        <span className="text-indigo-700">Plano {fmtBRL(p.repass_amount)}</span>
                      </>
                    )}
                    <span className="text-purple-300">·</span>
                    <span>{p.observation_count} ocorrência{p.observation_count !== 1 ? 's' : ''}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-sm font-black text-emerald-700 tabular-nums">{fmtBRL(p.custom_price)}</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(p.id)
                    setEditDraft({
                      stock_item_id: p.stock_item_id,
                      copay:  toInput(p.copay_amount ?? p.custom_price * 0.3),
                      repass: toInput(p.repass_amount ?? p.custom_price * 0.7),
                    })
                  }}
                  className="rounded-lg p-1.5 text-purple-500 hover:bg-purple-100"
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  disabled={deletingId === p.id}
                  className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 disabled:opacity-50"
                  title="Remover"
                >
                  {deletingId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <footer className="px-5 py-2 bg-purple-100/60 text-[10px] text-purple-600">
        Valor sugerido automaticamente no próximo atendimento. Editado tanto aqui quanto no consultório — a última edição vence.
      </footer>
    </div>
  )
}
