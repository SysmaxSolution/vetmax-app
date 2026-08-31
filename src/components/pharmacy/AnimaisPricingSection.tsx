'use client'

// Seção "Preços" (Sprint Animais) do cadastro de produto/serviço.
// Renderiza a composição de custo SIMPLES ou COMPLETA (conforme a config da
// clínica em Gestão > Configurações > Preços) + a grade de preços por tabela.
// O cálculo do preço de venda respeita margem x markup (também da config).

import { Tags } from 'lucide-react'
import type { ItemForm } from './PharmacyWorkspace'
import type { PriceTable, CompositionMode, MarginCalcType } from '@/lib/actions/pricing'

const num = (s: string | undefined) => {
  const v = Number((s ?? '').toString().replace(',', '.'))
  return Number.isFinite(v) ? v : 0
}
const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500'

interface Props {
  form: ItemForm
  set: (key: keyof ItemForm, val: string) => void
  priceTables: PriceTable[]
  tablePrices: Record<string, string>
  setTablePrices: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  compositionMode: CompositionMode
  marginCalcType: MarginCalcType
}

export default function AnimaisPricingSection({
  form, set, priceTables, tablePrices, setTablePrices, compositionMode, marginCalcType,
}: Props) {
  // ── Preço de Custo ──────────────────────────────────────────────────────────
  // Simples: o usuário digita o custo direto (form.cost_price).
  // Completa: calculado de compra − desconto + impostos de entrada.
  let computedCost: number
  if (compositionMode === 'complete') {
    const net = num(form.purchase_price) * (1 - num(form.supplier_discount_percent) / 100)
    const add = num(form.entry_tax_st) + num(form.entry_tax_ipi) + num(form.entry_tax_freight) + num(form.entry_tax_ibs_cbs)
    computedCost = net * (1 - num(form.entry_tax_icms) / 100) * (1 + add / 100)
  } else {
    computedCost = num(form.cost_price) * (1 + num(form.entry_tax_percent) / 100)
  }

  // ── Preço de venda sugerido (margem x markup + impostos de venda) ────────────
  const margin = num(form.margin_percent)
  let base: number | null = null
  if (computedCost > 0 && margin > 0) {
    base = marginCalcType === 'markup'
      ? computedCost * (1 + margin / 100)
      : margin < 100 ? computedCost / (1 - margin / 100) : null
  } else if (computedCost > 0) {
    base = computedCost
  }
  const saleTax = compositionMode === 'complete' ? num(form.sale_tax_percent) : 0
  const suggestedPrice = base != null ? base * (1 + saleTax / 100) : null

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
        <Tags className="h-3.5 w-3.5" /> Precificação — composição {compositionMode === 'complete' ? 'completa' : 'simples'}
      </p>

      {/* ── COMPOSIÇÃO SIMPLES ── */}
      {compositionMode === 'simple' && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">Composição do preço</p>
          <div className="grid grid-cols-3 gap-3">
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
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                {marginCalcType === 'markup' ? 'Markup (%)' : 'Margem (%)'}
              </label>
              <input type="number" min="0" step="0.001" value={form.margin_percent}
                onChange={e => set('margin_percent', e.target.value)} placeholder="0" className={inputCls} />
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
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                {marginCalcType === 'markup' ? 'Markup (%)' : 'Margem (%)'}
              </label>
              <input type="number" min="0" step="0.001" value={form.margin_percent}
                onChange={e => set('margin_percent', e.target.value)} placeholder="0" className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Impostos da venda (%)</label>
              <input type="number" min="0" step="0.001" value={form.sale_tax_percent}
                onChange={e => set('sale_tax_percent', e.target.value)} placeholder="0" className={inputCls} />
            </div>
          </div>
        </>
      )}

      {/* Preço de Custo calculado + sugestão de venda */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-indigo-200 px-3 py-2">
        <span className="text-xs text-slate-600">
          Preço de Custo: <strong className="text-slate-800">R$ {computedCost.toFixed(2)}</strong>
          {suggestedPrice != null && (
            <>
              <span className="mx-2 text-slate-300">·</span>
              Venda sugerida: <strong className="text-indigo-700">R$ {suggestedPrice.toFixed(2)}</strong>
            </>
          )}
        </span>
        {suggestedPrice != null && (
          <button type="button" onClick={() => set('unit_price', suggestedPrice.toFixed(2))}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
            Usar como preço de venda
          </button>
        )}
      </div>

      {/* Grade de preços por tabela */}
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-2">Preço de venda por tabela</p>
        {priceTables.length === 0 ? (
          <p className="text-[11px] text-amber-600">
            Nenhuma tabela de preço criada. Crie tabelas em Gestão &gt; Configurações &gt; Preços.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {priceTables.map(t => (
              <div key={t.id} className="flex items-center gap-2">
                <label className="flex-1 text-xs text-slate-600 truncate" title={t.name}>{t.name}</label>
                <div className="relative w-32">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">R$</span>
                  <input type="number" min="0" step="0.01"
                    value={tablePrices[t.id] ?? ''}
                    onChange={e => setTablePrices(prev => ({ ...prev, [t.id]: e.target.value }))}
                    placeholder="—"
                    className="w-full rounded-lg border border-slate-300 pl-8 pr-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-slate-400 mt-1.5">
          Deixe em branco para a tabela usar o preço de venda padrão do item.
        </p>
      </div>
    </div>
  )
}
