'use client'

// Seção "Preços" (Sprint Animais) do cadastro de produto/serviço.
// Composição de custo SIMPLES ou COMPLETA (conforme a config da clínica) e a
// grade de PREÇO DE VENDA POR TABELA, com Margem/Markup PRÓPRIA por tabela.
// Margem ↔ preço são auto-calculados nos dois sentidos, a partir do custo.

import { useEffect } from 'react'
import { Tags } from 'lucide-react'
import type { ItemForm } from './PharmacyWorkspace'
import type { PriceTable, CompositionMode, MarginCalcType } from '@/lib/actions/pricing'

const num = (s: string | undefined) => {
  const v = Number((s ?? '').toString().replace(',', '.'))
  return Number.isFinite(v) ? v : 0
}
const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500'

export interface TableRow { margin: string; price: string }

interface Props {
  form: ItemForm
  set: (key: keyof ItemForm, val: string) => void
  priceTables: PriceTable[]
  tableRows: Record<string, TableRow>
  setTableRows: (updater: (prev: Record<string, TableRow>) => Record<string, TableRow>) => void
  compositionMode: CompositionMode
  marginCalcType: MarginCalcType
}

export default function AnimaisPricingSection({
  form, set, priceTables, tableRows, setTableRows, compositionMode, marginCalcType,
}: Props) {
  // ── Preço de Custo ──────────────────────────────────────────────────────────
  let computedCost: number
  if (compositionMode === 'complete') {
    const net = num(form.purchase_price) * (1 - num(form.supplier_discount_percent) / 100)
    const add = num(form.entry_tax_st) + num(form.entry_tax_ipi) + num(form.entry_tax_freight) + num(form.entry_tax_ibs_cbs)
    computedCost = net * (1 - num(form.entry_tax_icms) / 100) * (1 + add / 100)
  } else {
    computedCost = num(form.cost_price) * (1 + num(form.entry_tax_percent) / 100)
  }
  const saleTax = compositionMode === 'complete' ? num(form.sale_tax_percent) : 0

  const marginLabel = marginCalcType === 'markup' ? 'Markup' : 'Margem'

  // preço de venda a partir da margem/markup daquela tabela
  function priceFromMargin(cost: number, m: number): number | null {
    if (cost <= 0) return null
    const b = marginCalcType === 'markup'
      ? cost * (1 + m / 100)
      : (m < 100 ? cost / (1 - m / 100) : null)
    if (b == null || !Number.isFinite(b)) return null
    return b * (1 + saleTax / 100)
  }
  // margem/markup a partir do preço de venda informado
  function marginFromPrice(cost: number, price: number): number | null {
    if (cost <= 0 || price <= 0) return null
    const base = price / (1 + saleTax / 100)
    const m = marginCalcType === 'markup'
      ? (base / cost - 1) * 100
      : (1 - cost / base) * 100
    return Number.isFinite(m) ? m : null
  }

  // Recalcula os preços quando o CUSTO (ou impostos de venda / tipo de cálculo)
  // muda, mantendo a margem de cada tabela.
  useEffect(() => {
    setTableRows(prev => {
      let changed = false
      const next: Record<string, TableRow> = { ...prev }
      for (const [id, row] of Object.entries(prev)) {
        if (row.margin.trim() !== '' && computedCost > 0) {
          const p = priceFromMargin(computedCost, num(row.margin))
          const pStr = p == null ? row.price : p.toFixed(2)
          if (pStr !== row.price) { next[id] = { ...row, price: pStr }; changed = true }
        }
      }
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedCost, saleTax, marginCalcType])

  function onMarginChange(id: string, val: string) {
    setTableRows(prev => {
      const cur = prev[id] ?? { margin: '', price: '' }
      let price = cur.price
      if (val.trim() !== '' && computedCost > 0) {
        const p = priceFromMargin(computedCost, num(val))
        if (p != null) price = p.toFixed(2)
      }
      return { ...prev, [id]: { margin: val, price } }
    })
  }
  function onPriceChange(id: string, val: string) {
    setTableRows(prev => {
      const cur = prev[id] ?? { margin: '', price: '' }
      let margin = cur.margin
      if (val.trim() !== '' && computedCost > 0) {
        const m = marginFromPrice(computedCost, num(val))
        if (m != null) margin = m.toFixed(2)
      } else if (val.trim() === '') {
        margin = ''
      }
      return { ...prev, [id]: { margin, price: val } }
    })
  }

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
        <Tags className="h-3.5 w-3.5" /> Precificação — composição {compositionMode === 'complete' ? 'completa' : 'simples'}
      </p>

      {/* ── COMPOSIÇÃO SIMPLES ── */}
      {compositionMode === 'simple' && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">Composição do custo</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Custo (R$)</label>
              <input type="number" min="0" step="0.01" value={form.cost_price}
                onChange={e => set('cost_price', e.target.value)} placeholder="0.00" className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Imposto entrada (%)</label>
              <input type="number" min="0" step="0.001" value={form.entry_tax_percent}
                onChange={e => set('entry_tax_percent', e.target.value)} placeholder="0" className={inputCls} />
            </div>
          </div>
        </div>
      )}

      {/* ── COMPOSIÇÃO COMPLETA ── */}
      {compositionMode === 'complete' && (
        <>
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Entrada</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Preço de compra (R$)</label>
                <input type="number" min="0" step="0.01" value={form.purchase_price}
                  onChange={e => set('purchase_price', e.target.value)} placeholder="0.00" className={inputCls} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Desconto do fornecedor (%)</label>
                <input type="number" min="0" step="0.001" value={form.supplier_discount_percent}
                  onChange={e => set('supplier_discount_percent', e.target.value)} placeholder="0" className={inputCls} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-600 mb-2">Impostos de entrada (%)</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">ICMS (−)</label>
                <input type="number" min="0" step="0.001" value={form.entry_tax_icms}
                  onChange={e => set('entry_tax_icms', e.target.value)} placeholder="0" className={inputCls} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">ST (+)</label>
                <input type="number" min="0" step="0.001" value={form.entry_tax_st}
                  onChange={e => set('entry_tax_st', e.target.value)} placeholder="0" className={inputCls} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">IPI (+)</label>
                <input type="number" min="0" step="0.001" value={form.entry_tax_ipi}
                  onChange={e => set('entry_tax_ipi', e.target.value)} placeholder="0" className={inputCls} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Frete (+)</label>
                <input type="number" min="0" step="0.001" value={form.entry_tax_freight}
                  onChange={e => set('entry_tax_freight', e.target.value)} placeholder="0" className={inputCls} />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">IBS/CBS (+)</label>
                <input type="number" min="0" step="0.001" value={form.entry_tax_ibs_cbs}
                  onChange={e => set('entry_tax_ibs_cbs', e.target.value)} placeholder="0" className={inputCls} />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              Preencha manualmente ou puxe da entrada por XML de NF-e. ICMS entra como crédito (subtrai); os demais somam.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Impostos da venda (%)</label>
              <input type="number" min="0" step="0.001" value={form.sale_tax_percent}
                onChange={e => set('sale_tax_percent', e.target.value)} placeholder="0" className={inputCls} />
            </div>
          </div>
        </>
      )}

      {/* Preço de Custo calculado */}
      <div className="rounded-lg bg-white border border-indigo-200 px-3 py-2">
        <span className="text-xs text-slate-600">
          Preço de Custo: <strong className="text-slate-800">R$ {computedCost.toFixed(2)}</strong>
          {saleTax > 0 && <span className="text-slate-400"> · impostos de venda {saleTax}% aplicados no preço final</span>}
        </span>
      </div>

      {/* Grade: margem/markup + preço POR TABELA (auto-calculados) */}
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-2">{marginLabel} e preço de venda por tabela</p>
        {priceTables.length === 0 ? (
          <p className="text-[11px] text-amber-600">
            Nenhuma tabela de preço criada. Crie tabelas em Gestão &gt; Configurações &gt; Preços.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-[1fr_7rem_8rem] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <span>Tabela</span>
              <span>{marginLabel} (%)</span>
              <span>Preço (R$)</span>
            </div>
            {priceTables.map(t => {
              const row = tableRows[t.id] ?? { margin: '', price: '' }
              // Margem (sobre a venda) não pode chegar a 100% — venda = custo ÷ (1 − margem%).
              const marginInvalid = marginCalcType === 'margin' && row.margin.trim() !== '' && num(row.margin) >= 100
              return (
                <div key={t.id} className="grid grid-cols-2 sm:grid-cols-[1fr_7rem_8rem] gap-2 items-center">
                  <label className="col-span-2 sm:col-span-1 text-xs font-medium text-slate-600 truncate" title={t.name}>{t.name}</label>
                  <input type="number" min="0" max={marginCalcType === 'margin' ? 99.99 : undefined} step="0.001" value={row.margin}
                    onChange={e => onMarginChange(t.id, e.target.value)}
                    placeholder={marginLabel}
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${
                      marginInvalid
                        ? 'border-red-400 focus:ring-red-500/20 focus:border-red-500'
                        : 'border-slate-300 focus:ring-indigo-500/20 focus:border-indigo-500'
                    }`} />
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">R$</span>
                    <input type="number" min="0" step="0.01" value={row.price}
                      onChange={e => onPriceChange(t.id, e.target.value)}
                      placeholder="—"
                      className="w-full rounded-lg border border-slate-300 pl-8 pr-2 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                  </div>
                  {marginInvalid && (
                    <p className="col-span-2 sm:col-span-3 text-[11px] text-red-600">
                      A margem deve ser <strong>menor que 100%</strong> (margem é sobre o preço de venda). Para lucro maior que o custo, use o cálculo por <strong>Markup</strong>.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <p className="text-[10px] text-slate-400 mt-1.5">
          Informe a {marginLabel.toLowerCase()} e o preço é calculado sozinho — ou digite o preço e a {marginLabel.toLowerCase()} é deduzida. Cada tabela tem a sua.
          {marginCalcType === 'margin' && ' A margem deve ser abaixo de 100%.'}
        </p>
      </div>
    </div>
  )
}
