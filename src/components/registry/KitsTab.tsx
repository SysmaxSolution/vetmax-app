'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, Pencil, X, Trash2, Package, CheckCircle2 } from 'lucide-react'
import {
  listServiceKits, createServiceKit, updateServiceKit, getServiceKit, deleteServiceKit,
  type ServiceKitSummary, type KitItem,
} from '@/lib/actions/surgery-kits'
import { getPharmacyStockV2, type StockItemV2 } from '@/lib/actions/stock'

/**
 * Cadastro de Kits Cirúrgicos (Cadastros). Cria um kit nomeado e vincula
 * insumos do estoque (stock_items) com quantidade. No Centro Cirúrgico o kit
 * é aplicado com 1 clique: baixa FIFO dos insumos + lança o total na fatura.
 */

interface Draft {
  id?: string
  name: string
  description: string
  items: KitItem[]
}

function fmtBRL(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

export default function KitsTab() {
  const [kits, setKits] = useState<ServiceKitSummary[]>([])
  const [stock, setStock] = useState<StockItemV2[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  async function reload() {
    const [ks, st] = await Promise.all([listServiceKits(), getPharmacyStockV2()])
    if (Array.isArray(ks)) setKits(ks)
    if (Array.isArray(st)) setStock(st)
    setLoading(false)
  }
  useEffect(() => { void reload() }, [])

  function newDraft() {
    setError(null)
    setDraft({ name: '', description: '', items: [{ stock_item_id: null, item_name: '', quantity: 1 }] })
  }
  async function editDraft(id: string) {
    setError(null); setBusy(true)
    const res = await getServiceKit(id)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    setDraft({
      id: res.id, name: res.name, description: res.description ?? '',
      items: res.items.length > 0 ? res.items : [{ stock_item_id: null, item_name: '', quantity: 1 }],
    })
  }

  function setItem(idx: number, patch: Partial<KitItem>) {
    setDraft(d => d ? { ...d, items: d.items.map((it, i) => i === idx ? { ...it, ...patch } : it) } : d)
  }
  function addItem() {
    setDraft(d => d ? { ...d, items: [...d.items, { stock_item_id: null, item_name: '', quantity: 1 }] } : d)
  }
  function removeItem(idx: number) {
    setDraft(d => d ? { ...d, items: d.items.filter((_, i) => i !== idx) } : d)
  }
  // Ao escolher um insumo do estoque, herda o nome (item_name) automaticamente.
  function pickStock(idx: number, stockId: string) {
    if (!stockId) { setItem(idx, { stock_item_id: null }); return }
    const s = stock.find(x => x.id === stockId)
    setItem(idx, { stock_item_id: stockId, item_name: s?.name ?? '' })
  }

  async function save() {
    if (!draft) return
    if (!draft.name.trim()) { setError('Informe o nome do kit.'); return }
    const items = draft.items.filter(i => i.item_name.trim() && i.quantity > 0)
    if (items.length === 0) { setError('Adicione ao menos um insumo ao kit.'); return }
    setBusy(true); setError(null)
    const res = draft.id
      ? await updateServiceKit(draft.id, { name: draft.name.trim(), description: draft.description, items })
      : await createServiceKit({ name: draft.name.trim(), description: draft.description, items })
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    setDraft(null); await reload()
  }

  async function remove(id: string) {
    if (!confirm('Remover este kit? Ele deixará de aparecer no Centro Cirúrgico.')) return
    setBusy(true); await deleteServiceKit(id); setBusy(false); await reload()
  }

  // Preço estimado do kit em edição (soma unit_price × qtd dos insumos vinculados).
  const draftTotal = draft
    ? draft.items.reduce((s, i) => s + (i.stock_item_id ? (stock.find(x => x.id === i.stock_item_id)?.unit_price ?? 0) * i.quantity : 0), 0)
    : 0

  return (
    <div className="space-y-4" data-testid="kits-tab">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Kits cirúrgicos: agrupam insumos do estoque para aplicar com 1 clique na ficha cirúrgica (baixa FIFO + fatura).</p>
        <button onClick={newDraft} data-testid="kit-new"
          className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 px-4 py-2 text-sm font-semibold text-white">
          <Plus className="h-4 w-4" /> Novo Kit
        </button>
      </div>

      {/* Form */}
      {draft && (
        <div className="rounded-2xl border-2 border-teal-200 bg-teal-50/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">{draft.id ? 'Editar' : 'Novo'} Kit</h3>
            <button onClick={() => setDraft(null)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Nome do Kit</span>
              <input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Ex.: Kit Castração Felina"
                className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Descrição (opcional)</span>
              <input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="Ex.: Procedimentos de pequeno porte"
                className="mt-0.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none" />
            </label>
          </div>

          {/* Insumos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Insumos do Kit</span>
              <button onClick={addItem} type="button" className="flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900">
                <Plus className="h-3 w-3" /> Adicionar insumo
              </button>
            </div>
            {draft.items.map((it, idx) => (
              <div key={idx} className="flex items-center gap-2" data-testid={`kit-item-${idx}`}>
                <select value={it.stock_item_id ?? ''} onChange={e => pickStock(idx, e.target.value)}
                  className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm focus:border-teal-500 focus:outline-none">
                  <option value="">— Selecione um insumo do estoque —</option>
                  {stock.map(s => (
                    <option key={s.id} value={s.id}>{s.name}{s.unit ? ` (${s.unit})` : ''} · {fmtBRL(s.unit_price ?? 0)}</option>
                  ))}
                </select>
                <input type="number" min="1" step="1" value={it.quantity}
                  onChange={e => setItem(idx, { quantity: Math.max(1, parseInt(e.target.value || '1', 10) || 1) })}
                  className="w-20 rounded-lg border border-slate-300 px-2 py-2 text-sm text-center focus:border-teal-500 focus:outline-none" title="Quantidade" />
                <button onClick={() => removeItem(idx)} type="button" className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Remover insumo">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {draftTotal > 0 && (
              <p className="text-[11px] text-slate-500">Valor estimado do kit: <strong className="text-teal-700 tabular-nums">{fmtBRL(draftTotal)}</strong></p>
            )}
          </div>

          {error && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
          <button onClick={save} disabled={busy} data-testid="kit-save"
            className="flex items-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Salvar Kit
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      ) : kits.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center">
          <Package className="h-10 w-10 text-slate-200 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-500">Nenhum kit cadastrado</p>
          <p className="text-xs text-slate-400 mt-1">Crie kits para agilizar o lançamento de insumos no Centro Cirúrgico.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {kits.map(k => (
            <div key={k.id} data-testid={`kit-row-${k.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Package className="h-4 w-4" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">{k.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{k.item_count} insumo(s){k.description ? ` • ${k.description}` : ''}</p>
              </div>
              <button onClick={() => editDraft(k.id)} disabled={busy} className="p-1.5 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => remove(k.id)} disabled={busy} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
