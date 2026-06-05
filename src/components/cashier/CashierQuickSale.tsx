'use client'

/**
 * Venda avulsa no topo de Caixa > Recebimentos (Épico B — C2, 04/06/2026).
 *
 * Substitui o PDV quando flow_config.pdv_unified_with_cashier está ativo
 * (decisão Q4 do PO). Tutor é OPCIONAL (Q2): sem tutor, a venda sai como
 * "Consumidor avulso". Persistência inalterada: createSale() → sales/
 * sale_items + central_cashier + estoque — só muda o ponto de entrada da UI.
 */

import { useState, useRef } from 'react'
import { ShoppingCart, Search, X, Plus, Minus, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import {
  searchSalesProducts, createSale,
  type StockProduct, type SaleTutor,
} from '@/lib/actions/sales'
import TutorSearch from '@/components/sales/TutorSearch'
import PaymentMethodModal, { type PaymentSplit } from '@/components/payments/PaymentMethodModal'

interface CartLine {
  product:  StockProduct
  quantity: number
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface Props {
  clinicId: string
  onToast:  (msg: string, type: 'success' | 'error') => void
  /** Notifica o pai para atualizar listas/totais após a venda. */
  onSaleCompleted?: () => void
}

export default function CashierQuickSale({ clinicId, onToast, onSaleCompleted }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [tutor,    setTutor]    = useState<SaleTutor | null>(null)
  const [cart,     setCart]     = useState<CartLine[]>([])

  const [query,     setQuery]     = useState('')
  const [results,   setResults]   = useState<StockProduct[]>([])
  const [searching, setSearching] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showPayment, setShowPayment] = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const total = cart.reduce((s, l) => s + l.product.unit_price * l.quantity, 0)

  function handleQueryChange(q: string) {
    setQuery(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (q.trim().length < 2) { setResults([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await searchSalesProducts(q)
        setResults(r)
      } catch {
        setResults([])
        setError('Falha ao buscar produtos — tente novamente.')
      } finally {
        setSearching(false)
      }
    }, 250)
  }

  function addToCart(p: StockProduct) {
    setCart(prev => {
      const existing = prev.find(l => l.product.id === p.id)
      if (existing) return prev.map(l => l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l)
      return [...prev, { product: p, quantity: 1 }]
    })
    setQuery('')
    setResults([])
  }

  function setQty(id: string, qty: number) {
    if (qty <= 0) { setCart(prev => prev.filter(l => l.product.id !== id)); return }
    setCart(prev => prev.map(l => l.product.id === id ? { ...l, quantity: qty } : l))
  }

  async function handlePaymentConfirm(splits: PaymentSplit[]) {
    setError(null)
    const res = await createSale({
      clinic_id:      clinicId,
      items: cart.map(l => ({
        stock_item_id: l.product.id,
        description:   l.product.name,
        quantity:      l.quantity,
        unit_price:    l.product.unit_price,
        discount:      0,
      })),
      // Método principal = primeiro split (o detalhe por split vai em splits[])
      payment_method: (splits[0]?.payment_method ?? 'cash') as 'cash' | 'credit' | 'debit' | 'pix' | 'convenio' | 'other',
      tutor_id:       tutor?.id ?? null,
      notes:          tutor ? null : 'Consumidor avulso',
      splits: splits.map(s => ({
        amount:             s.amount,
        payment_method:     s.payment_method,
        payment_card_id:    s.payment_card_id,
        installments:       s.installments,
        card_acquirer:      s.card_acquirer,
        card_brand:         s.card_brand,
        card_nsu:           s.card_nsu,
        card_authorization: s.card_authorization,
        transaction_date:   s.transaction_date,
      })),
    })
    if ('error' in res) { setError(res.error); throw new Error(res.error) }
    setShowPayment(false)
    setCart([])
    setTutor(null)
    setExpanded(false)
    onToast(`Venda avulsa recebida! ${fmt(res.total)}${tutor ? ` · ${tutor.name}` : ' · Consumidor avulso'}`, 'success')
    onSaleCompleted?.()
  }

  return (
    <div className="mb-5 rounded-2xl border border-teal-200 bg-teal-50/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-teal-50 transition-colors"
        data-mentor-step="cashier-quick-sale-toggle"
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold text-teal-800">
          <ShoppingCart className="h-4 w-4" />
          Nova venda avulsa
          {cart.length > 0 && (
            <span className="rounded-full bg-teal-600 text-white text-[10px] font-bold px-2 py-0.5">
              {cart.length} item{cart.length !== 1 ? 's' : ''} · {fmt(total)}
            </span>
          )}
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-teal-600" /> : <ChevronDown className="h-4 w-4 text-teal-600" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t border-teal-100 pt-4">
          {/* Tutor opcional (Q2) */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
              Tutor <span className="font-normal normal-case">(opcional — vazio = consumidor avulso)</span>
            </p>
            <TutorSearch selected={tutor} onSelect={setTutor} />
          </div>

          {/* Busca de produto/serviço */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              placeholder="Buscar produto ou serviço (nome ou código de barras)..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
            />
            {(searching || results.length > 0) && query.trim().length >= 2 && (
              <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-56 overflow-y-auto">
                {searching ? (
                  <div className="px-4 py-3 text-xs text-slate-400 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando...
                  </div>
                ) : results.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addToCart(p)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-teal-50 transition-colors"
                  >
                    <span className="text-sm text-slate-700 truncate">{p.name}</span>
                    <span className="text-sm font-semibold text-slate-900 tabular-nums flex-shrink-0 ml-3">{fmt(p.unit_price)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Carrinho */}
          {cart.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
              {cart.map(l => (
                <div key={l.product.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{l.product.name}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button type="button" onClick={() => setQty(l.product.id, l.quantity - 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-7 text-center text-sm font-semibold tabular-nums">{l.quantity}</span>
                    <button type="button" onClick={() => setQty(l.product.id, l.quantity + 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="w-20 text-right text-sm font-semibold text-slate-900 tabular-nums flex-shrink-0">
                    {fmt(l.product.unit_price * l.quantity)}
                  </span>
                  <button type="button" onClick={() => setQty(l.product.id, 0)} className="rounded p-1 text-rose-400 hover:bg-rose-50 flex-shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total</span>
                <span className="text-base font-bold text-slate-900 tabular-nums">{fmt(total)}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <button
            type="button"
            disabled={cart.length === 0}
            onClick={() => { setError(null); setShowPayment(true) }}
            data-mentor-step="cashier-quick-sale-receive-btn"
            className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 py-2.5 text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Receber {total > 0 ? fmt(total) : ''}
          </button>
        </div>
      )}

      {showPayment && (
        <PaymentMethodModal
          totalDue={total}
          subject={tutor ? tutor.name : 'Consumidor avulso'}
          onCancel={() => setShowPayment(false)}
          onConfirm={handlePaymentConfirm}
        />
      )}
    </div>
  )
}
