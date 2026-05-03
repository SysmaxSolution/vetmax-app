'use client'

import { useState } from 'react'
import { Lock, Unlock, Loader2 } from 'lucide-react'
import {
  openCashierSession,
  closeCashierSession,
  type CashierSession,
  type CashierClosingReport,
} from '@/lib/actions/cashier-sessions'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const MODULE_LABELS: Record<string, string> = {
  grooming: 'Banho e Tosa', pharmacy: 'Farmácia',
  consultation: 'Consulta', exam: 'Exame',
  manual: 'Manual', adjustment: 'Ajuste',
}

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX', credit: 'Crédito', debit: 'Débito',
  cash: 'Dinheiro', convenio: 'Convênio', other: 'Outro',
  nao_informado: 'Não informado',
}

interface Props {
  session:    CashierSession | null
  userRole:   string
  onRefresh:  () => void
  onToast:    (msg: string, type: 'success' | 'error') => void
}

export default function CashierSessionControl({ session, userRole, onRefresh, onToast }: Props) {
  const [loading,       setLoading]       = useState(false)
  const [openBalance,   setOpenBalance]   = useState('0')
  const [showOpenForm,  setShowOpenForm]  = useState(false)
  const [closingReport, setClosingReport] = useState<CashierClosingReport | null>(null)

  const canManage = ['admin', 'owner', 'manager'].includes(userRole)

  async function handleOpen() {
    const balance = parseFloat(openBalance.replace(',', '.'))
    if (isNaN(balance) || balance < 0) {
      onToast('Saldo de abertura inválido', 'error')
      return
    }
    setLoading(true)
    const res = await openCashierSession(balance)
    setLoading(false)
    if ('error' in res) { onToast(res.error, 'error'); return }
    onToast('Caixa aberto com sucesso!', 'success')
    setShowOpenForm(false)
    onRefresh()
  }

  async function handleClose() {
    if (!session) return
    if (!confirm('Confirmar fechamento do caixa? Esta ação irá gerar o relatório de fechamento.')) return
    setLoading(true)
    const res = await closeCashierSession(session.id)
    setLoading(false)
    if ('error' in res) { onToast(res.error, 'error'); return }
    setClosingReport(res)
    onToast('Caixa fechado com sucesso!', 'success')
    onRefresh()
  }

  // Closing report modal
  if (closingReport) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Relatório de Fechamento</h2>
            <button
              onClick={() => { setClosingReport(null); onRefresh() }}
              className="text-slate-400 hover:text-slate-600 text-xl font-bold"
            >×</button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-emerald-50 p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Entradas</p>
              <p className="text-base font-bold text-emerald-700">{fmt(closingReport.total_inflows)}</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Saídas</p>
              <p className="text-base font-bold text-red-600">{fmt(closingReport.total_outflows)}</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">Saldo Final</p>
              <p className="text-base font-bold text-blue-700">{fmt(closingReport.net_balance)}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Por Módulo</p>
            <div className="space-y-1.5">
              {Object.entries(closingReport.by_module).map(([mod, data]) => (
                <div key={mod} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{MODULE_LABELS[mod] ?? mod}</span>
                  <span className="font-semibold text-slate-900">{fmt(data.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Por Forma de Pagamento</p>
            <div className="space-y-1.5">
              {Object.entries(closingReport.by_payment_method).map(([method, data]) => (
                <div key={method} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{PAYMENT_LABELS[method] ?? method}</span>
                  <div className="text-right">
                    <span className="font-semibold text-slate-900">{fmt(data.amount)}</span>
                    <span className="text-xs text-slate-400 ml-1">({data.count})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => { setClosingReport(null); onRefresh() }}
            className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
          >
            Fechar Relatório
          </button>
        </div>
      </div>
    )
  }

  if (!canManage) return null

  // No session open
  if (!session) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Lock className="h-5 w-5 text-amber-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Caixa Fechado</p>
            <p className="text-xs text-amber-600">Abra o caixa para registrar movimentações do dia</p>
          </div>
        </div>
        {!showOpenForm ? (
          <button
            onClick={() => setShowOpenForm(true)}
            className="flex-shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
          >
            Abrir Caixa
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-shrink-0">
            <div>
              <label className="text-[10px] text-amber-700 font-semibold block mb-0.5">Fundo de Troco</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openBalance}
                onChange={e => setOpenBalance(e.target.value)}
                className="w-28 rounded-lg border border-amber-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                placeholder="0,00"
              />
            </div>
            <button
              onClick={handleOpen}
              disabled={loading}
              className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar'}
            </button>
            <button
              onClick={() => setShowOpenForm(false)}
              className="text-xs text-amber-600 hover:text-amber-800"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    )
  }

  // Session is open
  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Unlock className="h-5 w-5 text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-emerald-800">Caixa Aberto</p>
          <p className="text-xs text-emerald-600">
            Fundo: {fmt(session.opening_balance)} · Aberto às{' '}
            {new Date(session.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
      <button
        onClick={handleClose}
        disabled={loading}
        className="flex-shrink-0 flex items-center gap-1.5 rounded-xl bg-slate-700 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
        Fechar Caixa
      </button>
    </div>
  )
}
