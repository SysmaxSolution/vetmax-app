'use client'

// Finalização da entrada de mercadoria (1.8): confirma o recebimento (baixa em
// estoque) e, opcionalmente, LANÇA CONTAS A PAGAR — com parcelas, vencimentos e
// espécie. Parcelas pré-preenchidas pelas duplicatas do XML quando houver.

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X, Plus, Trash2, CheckCircle2, Wallet } from 'lucide-react'
import { confirmPurchaseReceipt, launchPayablesFromPurchase, type PurchaseOrder } from '@/lib/actions/purchases'
import { generateEqualInstallments } from '@/lib/purchases/installments'

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const ESPECIES = [
  { value: 'duplicata', label: 'Duplicata' },
  { value: 'boleto',    label: 'Boleto' },
  { value: 'pix',       label: 'PIX' },
  { value: 'dinheiro',  label: 'Dinheiro' },
  { value: 'cartao',    label: 'Cartão' },
  { value: 'ted',       label: 'TED/Transferência' },
  { value: 'outros',    label: 'Outros' },
]

function addDays(base: Date, days: number): string {
  const d = new Date(base.getTime() + days * 86400000)
  return d.toLocaleDateString('en-CA') // AAAA-MM-DD (local)
}

interface Installment { due_date: string; amount: string }

export default function ConfirmReceiptModal({ order, onClose, onDone }: {
  order:   PurchaseOrder
  onClose: () => void
  onDone:  () => void
}) {
  const total = Number(order.total_value ?? 0)
  const supplierName = (order.supplier as any)?.name ?? 'Fornecedor'

  const [launchPayable, setLaunchPayable] = useState(true)
  const [especie, setEspecie] = useState('duplicata')
  const [installments, setInstallments] = useState<Installment[]>(() => {
    const dups = order.duplicatas ?? []
    if (dups.length > 0) {
      return dups.map(d => ({ due_date: d.vencimento || addDays(new Date(), 30), amount: String(Number(d.valor ?? 0).toFixed(2)) }))
    }
    const base = order.issue_date ? new Date(order.issue_date + 'T12:00:00') : new Date()
    return [{ due_date: addDays(base, 30), amount: total > 0 ? String(total.toFixed(2)) : '' }]
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const parcelSum = useMemo(
    () => installments.reduce((s, i) => s + (parseFloat(i.amount.replace(',', '.')) || 0), 0),
    [installments],
  )
  const mismatch = launchPayable && total > 0 && Math.abs(parcelSum - total) > 0.01

  function setInst(idx: number, patch: Partial<Installment>) {
    setInstallments(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }
  function addInst() {
    const base = installments.length ? new Date(installments[installments.length - 1].due_date + 'T12:00:00') : new Date()
    setInstallments(prev => [...prev, { due_date: addDays(base, 30), amount: '' }])
  }
  function removeInst(idx: number) {
    setInstallments(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
  }
  // Gera N parcelas iguais a partir do total, a cada 30 dias (lógica pura testada).
  function generateEqual(n: number) {
    if (n < 1) return
    const baseISO = order.issue_date ?? new Date().toISOString().slice(0, 10)
    setInstallments(generateEqualInstallments(total, n, baseISO).map(g => ({ due_date: g.due_date, amount: g.amount.toFixed(2) })))
  }

  async function submit() {
    setSaving(true); setErr(null)
    const recv = await confirmPurchaseReceipt(order.id)
    if ('error' in recv) { setSaving(false); setErr(recv.error); return }

    if (launchPayable) {
      const parsed = installments.map(i => ({ due_date: i.due_date, amount: parseFloat(i.amount.replace(',', '.')) || 0, especie }))
      const res = await launchPayablesFromPurchase(order.id, { installments: parsed })
      setSaving(false)
      if ('error' in res) {
        // Estoque já foi recebido; avisa que o financeiro falhou (relançar manualmente).
        setErr('Entrada recebida no estoque, mas falhou ao lançar contas a pagar: ' + res.error)
        return
      }
    } else {
      setSaving(false)
    }
    onDone()
  }

  return typeof document === 'undefined' ? null : createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 p-4 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl my-4 flex flex-col max-h-[92vh]">
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50"><CheckCircle2 className="h-4 w-4 text-teal-600" /></div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Finalizar entrada de mercadoria</h3>
              <p className="text-xs text-slate-500">{supplierName}{order.nfe_number ? ` · NF ${order.nfe_number}` : ''} · {BRL(total)}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-4">
          <p className="text-sm text-slate-600">Confirmar o recebimento credita o estoque desta ordem.</p>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 cursor-pointer hover:bg-slate-50">
            <span className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-teal-600" />
              <span>
                <span className="block text-sm font-semibold text-slate-800">Lançar contas a pagar?</span>
                <span className="block text-xs text-slate-500">Desmarque em bonificação (entrada sem financeiro)</span>
              </span>
            </span>
            <input type="checkbox" checked={launchPayable} onChange={e => setLaunchPayable(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30" />
          </label>

          {launchPayable && (
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Parcelas</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">Gerar iguais:</span>
                  {[1, 2, 3, 6, 12].map(n => (
                    <button key={n} type="button" onClick={() => generateEqual(n)}
                      className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100">{n}x</button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {installments.map((inst, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 w-6 text-right">{i + 1}.</span>
                    <input type="date" value={inst.due_date} onChange={e => setInst(i, { due_date: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-teal-500 focus:outline-none" />
                    <input inputMode="decimal" value={inst.amount} onChange={e => setInst(i, { amount: e.target.value })} placeholder="0,00"
                      className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-right font-mono focus:border-teal-500 focus:outline-none" />
                    <button type="button" onClick={() => removeInst(i)} disabled={installments.length <= 1}
                      className="rounded-lg p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>

              <button type="button" onClick={addInst} className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline">
                <Plus className="h-3.5 w-3.5" /> Adicionar parcela
              </button>

              <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                <div>
                  <span className="block text-[11px] font-semibold text-slate-500 mb-1">Espécie</span>
                  <select value={especie} onChange={e => setEspecie(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-teal-500 focus:outline-none">
                    {ESPECIES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </div>
                <div className="text-right">
                  <span className="block text-[11px] text-slate-400">Soma das parcelas</span>
                  <span className={`font-mono tabular-nums font-bold ${mismatch ? 'text-amber-600' : 'text-slate-800'}`}>{BRL(parcelSum)}</span>
                </div>
              </div>
              {mismatch && (
                <p className="text-[11px] text-amber-600">A soma das parcelas ({BRL(parcelSum)}) difere do total da nota ({BRL(total)}). Ajuste se necessário — o lançamento é permitido mesmo assim.</p>
              )}
            </div>
          )}

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex-shrink-0 flex gap-3 border-t border-slate-100 px-5 py-4">
          <button onClick={onClose} disabled={saving} className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
          <button onClick={submit} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Processando…</> : <>{launchPayable ? 'Receber e lançar' : 'Confirmar recebimento'}</>}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
