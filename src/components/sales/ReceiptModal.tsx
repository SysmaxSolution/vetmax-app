'use client'

import { X, Printer, CheckCircle2 } from 'lucide-react'
import { PAYMENT_LABELS } from './SalesCart'
import type { Sale } from '@/lib/actions/sales'

interface ReceiptModalProps {
  sale:       Sale
  clinicName: string
  onClose:    () => void
}

export default function ReceiptModal({ sale, clinicName, onClose }: ReceiptModalProps) {
  const date = new Date(sale.created_at).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm print:bg-white">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden print:shadow-none print:rounded-none print:max-w-full">
        {/* Header — oculto na impressão */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <h2 className="text-base font-semibold text-slate-900">Venda Registrada!</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Recibo */}
        <div className="px-6 py-5 space-y-4" id="receipt-content">
          {/* Cabeçalho clínica */}
          <div className="text-center border-b border-dashed border-slate-300 pb-4">
            <p className="font-bold text-slate-900">{clinicName}</p>
            <p className="text-xs text-slate-500 mt-0.5">Comprovante de Venda</p>
            <p className="text-xs text-slate-400 mt-1">{date}</p>
            <p className="text-xs text-slate-300 mt-0.5 font-mono">#{sale.id.slice(0, 8).toUpperCase()}</p>
          </div>

          {/* Itens */}
          <div className="space-y-2">
            {(sale.items ?? []).map(item => (
              <div key={item.id} className="flex justify-between gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-slate-800 truncate">{item.description}</p>
                  <p className="text-xs text-slate-400">
                    {item.quantity} × R$ {item.unit_price.toFixed(2)}
                    {item.discount > 0 && ` (−R$ ${item.discount.toFixed(2)})`}
                  </p>
                </div>
                <span className="font-semibold text-slate-900 flex-shrink-0">R$ {item.total.toFixed(2)}</span>
              </div>
            ))}
          </div>

          {/* Totais */}
          <div className="border-t border-dashed border-slate-300 pt-3 space-y-1">
            {sale.discount_amount > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Desconto</span>
                <span>−R$ {sale.discount_amount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base text-slate-900">
              <span>TOTAL</span>
              <span>R$ {sale.total_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-500">
              <span>Pagamento</span>
              <span>{PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method}</span>
            </div>
          </div>

          <p className="text-center text-xs text-slate-300 pt-2 border-t border-dashed border-slate-200">
            Obrigado pela preferência!
          </p>
        </div>

        {/* Ações — ocultas na impressão */}
        <div className="px-6 pb-5 flex gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 flex items-center justify-center gap-2 border border-slate-200 rounded-xl py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-bold hover:bg-blue-700 transition-colors"
          >
            Nova Venda
          </button>
        </div>
      </div>
    </div>
  )
}
