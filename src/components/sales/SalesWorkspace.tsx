'use client'

import { useState, useTransition } from 'react'
import { ShoppingCart, RotateCcw, Tag, AlertCircle } from 'lucide-react'
import ProductSearch from './ProductSearch'
import SalesCart, { cartSubtotal, type CartItem } from './SalesCart'
import CheckoutModal from './CheckoutModal'
import ReceiptModal from './ReceiptModal'
import SalesHistoryTable from './SalesHistoryTable'
import type { Sale } from '@/lib/actions/sales'

interface SalesWorkspaceProps {
  clinicId:   string
  clinicName: string
  dailySales: Sale[]
}

export default function SalesWorkspace({ clinicId, clinicName, dailySales }: SalesWorkspaceProps) {
  const [tab,          setTab]          = useState<'pdv' | 'historico'>('pdv')
  const [cart,         setCart]         = useState<CartItem[]>([])
  const [discount,     setDiscount]     = useState(0)
  const [discountInput, setDiscountInput] = useState('')
  const [showCheckout, setShowCheckout] = useState(false)
  const [receipt,      setReceipt]      = useState<Sale | null>(null)
  const [sales,        setSales]        = useState<Sale[]>(dailySales)
  const [, startTransition]             = useTransition()

  const subtotal    = cartSubtotal(cart)
  const total       = Math.max(subtotal - discount, 0)
  const hasItems    = cart.length > 0

  function handleSaleSuccess(sale: Sale) {
    setShowCheckout(false)
    setReceipt(sale)
    setSales(prev => [sale, ...prev])
    setCart([])
    setDiscount(0)
    setDiscountInput('')
  }

  function applyDiscount() {
    const val = parseFloat(discountInput.replace(',', '.'))
    setDiscount(isNaN(val) || val < 0 ? 0 : Math.min(val, subtotal))
  }

  function resetPDV() {
    setCart([])
    setDiscount(0)
    setDiscountInput('')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-4xl px-3 sm:px-6 py-6 sm:py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Vendas / PDV</h1>
            <p className="mt-0.5 text-sm text-slate-500">Registre vendas de produtos e serviços</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
          {(['pdv', 'historico'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                tab === t
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'pdv' ? <ShoppingCart className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
              {t === 'pdv' ? 'PDV' : 'Histórico do Dia'}
              {t === 'historico' && sales.length > 0 && (
                <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-bold ${tab === 'historico' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>
                  {sales.filter(s => s.payment_status !== 'cancelled').length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* PDV */}
        {tab === 'pdv' && (
          <div className="grid gap-4 lg:grid-cols-5">
            {/* Coluna principal */}
            <div className="lg:col-span-3 space-y-4">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
                <h2 className="text-sm font-semibold text-slate-700">Adicionar produto</h2>
                <ProductSearch onAdd={item => setCart(prev => [...prev, item])} />
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-700">Carrinho</h2>
                  {hasItems && (
                    <button
                      type="button"
                      onClick={resetPDV}
                      className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                    >
                      Limpar tudo
                    </button>
                  )}
                </div>
                <SalesCart items={cart} onChange={setCart} />
              </div>
            </div>

            {/* Painel lateral */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
                {/* Desconto */}
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                    <Tag className="h-4 w-4 text-slate-400" />
                    Desconto global (R$)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="0,00"
                      value={discountInput}
                      onChange={e => setDiscountInput(e.target.value)}
                      onBlur={applyDiscount}
                      onKeyDown={e => e.key === 'Enter' && applyDiscount()}
                      disabled={!hasItems}
                      className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
                    />
                  </div>
                </div>

                {/* Totais */}
                <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Subtotal</span>
                    <span>R$ {subtotal.toFixed(2)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Desconto</span>
                      <span>−R$ {discount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg text-slate-900 pt-1 border-t border-slate-200">
                    <span>Total</span>
                    <span>R$ {total.toFixed(2)}</span>
                  </div>
                </div>

                {!hasItems && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                    Adicione itens ao carrinho para continuar
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowCheckout(true)}
                  disabled={!hasItems}
                  className="w-full bg-green-600 text-white rounded-xl py-3 text-sm font-bold hover:bg-green-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Finalizar Venda →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Histórico */}
        {tab === 'historico' && (
          <SalesHistoryTable sales={sales} clinicId={clinicId} onSalesUpdate={setSales} />
        )}
      </main>

      {showCheckout && (
        <CheckoutModal
          clinicId={clinicId}
          items={cart}
          discount={discount}
          onSuccess={handleSaleSuccess}
          onClose={() => setShowCheckout(false)}
        />
      )}

      {receipt && (
        <ReceiptModal
          sale={receipt}
          clinicName={clinicName}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  )
}
