'use client'

/**
 * Venda avulsa no topo de Caixa > Recebimentos (Épico B — C2, 04/06/2026).
 *
 * Substitui o PDV quando flow_config.pdv_unified_with_cashier está ativo
 * (decisão Q4 do PO). Tutor é OPCIONAL (Q2): sem tutor, a venda sai como
 * "Consumidor avulso". Persistência inalterada: createSale() → sales/
 * sale_items + central_cashier + estoque — só muda o ponto de entrada da UI.
 *
 * HF 05/06: a busca de produtos reutiliza o ProductSearch DO PDV — mesma
 * funcionalidade completa: estoque + sugestões do catálogo veterinário
 * (cadastro rápido com 1 clique) + item manual + EAN. O card não usa
 * overflow-hidden para o dropdown de resultados não ficar cortado.
 */

import { useState, useEffect } from 'react'
import { ShoppingCart, X, Plus, Minus, ChevronDown, ChevronUp, Loader2, ClipboardList, PawPrint } from 'lucide-react'
import { createSale, launchPendingSale, listTutorPets, type SaleTutor } from '@/lib/actions/sales'
import TutorSearch from '@/components/sales/TutorSearch'
import ProductSearch from '@/components/sales/ProductSearch'
import type { CartItem } from '@/components/sales/SalesCart'
import PaymentMethodModal, { type PaymentSplit } from '@/components/payments/PaymentMethodModal'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface Props {
  clinicId: string
  /** Módulos ativos da clínica — usados pelo cadastro rápido do catálogo. */
  activeModules?: string[]
  onToast:  (msg: string, type: 'success' | 'error') => void
  /** Notifica o pai para atualizar listas/totais após a venda. */
  onSaleCompleted?: () => void
}

export default function CashierQuickSale({ clinicId, activeModules = [], onToast, onSaleCompleted }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [tutor,    setTutor]    = useState<SaleTutor | null>(null)
  const [cart,     setCart]     = useState<CartItem[]>([])
  const [refocusTrigger, setRefocusTrigger] = useState(0)

  // Pet do tutor (opcional) — para o card da venda lançada exibir o pet,
  // igual aos cards de consulta (pedido do PO 05/06).
  const [tutorPets,  setTutorPets]  = useState<Array<{ id: string; name: string; species: string }>>([])
  const [petId,      setPetId]      = useState<string>('')

  useEffect(() => {
    setPetId('')
    if (!tutor) { setTutorPets([]); return }
    let cancelled = false
    listTutorPets(tutor.id).then(res => {
      if (cancelled || !Array.isArray(res)) return
      setTutorPets(res)
      // Tutor com um único pet → pré-seleciona (zero-click)
      if (res.length === 1) setPetId(res[0].id)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [tutor])

  const [showPayment, setShowPayment] = useState(false)
  const [launching,   setLaunching]   = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const total = cart.reduce((s, l) => s + (l.unit_price - l.discount) * l.quantity, 0)

  /** Mesmo contrato do PDV: itens iguais (mesmo stock_item) somam quantidade. */
  function addToCart(item: CartItem) {
    setCart(prev => {
      if (item.stock_item_id) {
        const existing = prev.find(l => l.stock_item_id === item.stock_item_id)
        if (existing) {
          return prev.map(l => l.stock_item_id === item.stock_item_id
            ? { ...l, quantity: l.quantity + item.quantity }
            : l)
        }
      }
      return [...prev, item]
    })
    setRefocusTrigger(n => n + 1)
  }

  function setQty(key: string, qty: number) {
    if (qty <= 0) { setCart(prev => prev.filter(l => l.key !== key)); return }
    setCart(prev => prev.map(l => l.key === key ? { ...l, quantity: qty } : l))
  }

  /**
   * LANÇAR (05/06, pedido do PO): a venda fica PENDENTE nos Recebimentos —
   * para receber junto com a consulta num pagamento só (cartão único).
   * Estoque é baixado no lançamento (reserva).
   */
  async function handleLaunch() {
    if (cart.length === 0 || launching) return
    setError(null)
    setLaunching(true)
    const res = await launchPendingSale({
      items: cart.map(l => ({
        stock_item_id: l.stock_item_id,
        description:   l.description,
        quantity:      l.quantity,
        unit_price:    l.unit_price,
        discount:      l.discount,
      })),
      tutor_id:   tutor?.id ?? null,
      patient_id: petId || null,
      notes:      tutor ? null : 'Consumidor avulso',
    })
    setLaunching(false)
    if ('error' in res) { setError(res.error); return }
    setCart([])
    setTutor(null)
    setExpanded(false)
    onToast(`Venda lançada como pendente (${fmt(res.total)}) — selecione junto com a consulta para receber tudo num pagamento só.`, 'success')
    onSaleCompleted?.()
  }

  async function handlePaymentConfirm(splits: PaymentSplit[]) {
    setError(null)
    const res = await createSale({
      clinic_id:      clinicId,
      items: cart.map(l => ({
        stock_item_id: l.stock_item_id,
        description:   l.description,
        quantity:      l.quantity,
        unit_price:    l.unit_price,
        discount:      l.discount,
      })),
      // Método principal = primeiro split (o detalhe por split vai em splits[])
      payment_method: (splits[0]?.payment_method ?? 'cash') as 'cash' | 'credit' | 'debit' | 'pix' | 'convenio' | 'other',
      tutor_id:       tutor?.id ?? null,
      patient_id:     petId || null,
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
    // SEM overflow-hidden — o dropdown de resultados da busca é absoluto e
    // ficava cortado pelo card (bug reportado com print em 05/06).
    <div className="mb-5 rounded-2xl border border-teal-200 bg-teal-50/40">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-teal-50 transition-colors rounded-2xl"
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

          {/* Pet do tutor (opcional) — exibido no card da venda lançada */}
          {tutor && tutorPets.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                <PawPrint className="h-3 w-3" /> Pet <span className="font-normal normal-case">(opcional)</span>
              </p>
              <select
                value={petId}
                onChange={e => setPetId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
              >
                <option value="">— Sem pet vinculado —</option>
                {tutorPets.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* HF 05/06: busca COMPLETA do PDV — estoque + catálogo veterinário
              (cadastro rápido) + item manual + EAN */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">
              Produtos e serviços
            </p>
            <ProductSearch
              onAdd={addToCart}
              refocusTrigger={refocusTrigger}
              activeModules={activeModules}
            />
          </div>

          {/* Carrinho */}
          {cart.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
              {cart.map(l => (
                <div key={l.key} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{l.description}</span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button type="button" onClick={() => setQty(l.key, l.quantity - 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-7 text-center text-sm font-semibold tabular-nums">{l.quantity}</span>
                    <button type="button" onClick={() => setQty(l.key, l.quantity + 1)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="w-20 text-right text-sm font-semibold text-slate-900 tabular-nums flex-shrink-0">
                    {fmt((l.unit_price - l.discount) * l.quantity)}
                  </span>
                  <button type="button" onClick={() => setQty(l.key, 0)} className="rounded p-1 text-rose-400 hover:bg-rose-50 flex-shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-b-xl">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total</span>
                <span className="text-base font-bold text-slate-900 tabular-nums">{fmt(total)}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div className="flex gap-2">
            {/* LANÇAR: fica pendente para receber junto com a consulta */}
            <button
              type="button"
              disabled={cart.length === 0 || launching}
              onClick={handleLaunch}
              data-mentor-step="cashier-quick-sale-launch-btn"
              title="A venda fica pendente nos Recebimentos — marque junto com a consulta e receba tudo num pagamento só."
              className="flex-1 rounded-xl border-2 border-teal-600 bg-white hover:bg-teal-50 py-2.5 text-sm font-bold text-teal-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {launching
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Lançando...</>
                : <><ClipboardList className="h-4 w-4" /> Lançar</>}
            </button>
            <button
              type="button"
              disabled={cart.length === 0 || launching}
              onClick={() => { setError(null); setShowPayment(true) }}
              data-mentor-step="cashier-quick-sale-receive-btn"
              className="flex-[1.4] rounded-xl bg-teal-600 hover:bg-teal-700 py-2.5 text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Receber {total > 0 ? fmt(total) : ''}
            </button>
          </div>
          <p className="text-[10px] text-slate-500 -mt-1">
            <strong>Lançar</strong> deixa a venda pendente para receber junto com a consulta num pagamento só. <strong>Receber</strong> cobra agora.
          </p>
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
