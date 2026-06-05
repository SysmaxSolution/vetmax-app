'use client'

import { useState, useCallback } from 'react'
import { Receipt, RefreshCw, ShoppingBag, Scissors, Ban, Users, AlertTriangle } from 'lucide-react'
import { getPendingInvoices, processSplitPayment, type InvoiceWithDetails } from '@/lib/actions/billing'
import {
  getPendingGroomingSessions,
  processGroomingPaymentFromCashier,
  updateGroomingPaymentStatus,
  type PendingGroomingPayment,
} from '@/lib/actions/grooming'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import CheckoutModal from '@/components/reception/CheckoutModal'
import CashierQuickSale from '@/components/cashier/CashierQuickSale'
import PaymentMethodModal, { type PaymentSplit } from '@/components/payments/PaymentMethodModal'
import { allocateSplitsSequentially } from '@/lib/multi-receive-allocation'

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐶', cat: '🐱', bird: '🐦', exotic: '🦜',
  rabbit: '🐰', rodent: '🐹', reptile: '🦎', fish: '🐟',
}

const PAYMENT_LABEL: Record<string, string> = {
  pix: 'PIX', credit: 'Cartão Crédito', debit: 'Cartão Débito', cash: 'Dinheiro',
}

function fmt(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// ─── Invoice card (consultas) ─────────────────────────────────────────────────

function InvoiceCard({
  invoice,
  onCheckout,
  selected,
  onToggleSelect,
}: {
  invoice: InvoiceWithDetails
  onCheckout: (id: string) => void
  /** Épico B — C3 (04/06): seleção para recebimento múltiplo. */
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  return (
    <div className={`flex items-center gap-4 rounded-xl border bg-white px-5 py-4 hover:shadow-sm transition-all ${selected ? 'border-teal-400 ring-1 ring-teal-200' : 'border-slate-200 hover:border-slate-300'}`}>
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={() => onToggleSelect(invoice.id)}
          className="h-4 w-4 flex-shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
          title="Selecionar para recebimento agrupado"
        />
      )}
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-amber-50 text-2xl">
        {SPECIES_EMOJI[invoice.patient.species] ?? '🐾'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-slate-900">{invoice.patient.name}</p>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500">{invoice.tutor.name}</span>
          <span className="rounded-full bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5">Consulta</span>
        </div>
        <div className="mt-0.5 flex items-center gap-3">
          <span className="text-xs text-slate-400">Alta às {fmtTime(invoice.created_at)}</span>
          {invoice.tutor.phone && (
            <span className="text-xs text-slate-400">{invoice.tutor.phone}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="text-right">
          <p className="text-xs text-slate-400">Total</p>
          <p className="text-lg font-bold text-slate-900">{fmt(invoice.total_amount)}</p>
        </div>
        <button
          onClick={() => onCheckout(invoice.id)}
          data-mentor-step="cashier-receive-invoice-btn"
          className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors shadow-sm"
        >
          <Receipt className="h-4 w-4" />
          Receber
        </button>
      </div>
    </div>
  )
}

// ─── Grooming card (banho e tosa) ─────────────────────────────────────────────

function GroomingPaymentCard({
  session,
  onReceive,
}: {
  session: PendingGroomingPayment
  onReceive: (session: PendingGroomingPayment) => void
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-violet-100 bg-white px-5 py-4 hover:shadow-sm hover:border-violet-200 transition-all">
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-violet-50 text-2xl">
        {SPECIES_EMOJI[session.patient_species] ?? '🐾'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-slate-900">{session.patient_name}</p>
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500">{session.tutor_name}</span>
          <span className="rounded-full bg-violet-50 text-violet-700 text-xs font-medium px-2 py-0.5 flex items-center gap-1">
            <Scissors className="h-3 w-3" />
            Banho e Tosa
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 flex-wrap">
          {session.services_requested.slice(0, 3).map(s => (
            <span key={s} className="text-xs text-slate-400 bg-slate-50 rounded px-1.5 py-0.5">{s}</span>
          ))}
          {session.services_requested.length > 3 && (
            <span className="text-xs text-slate-400">+{session.services_requested.length - 3}</span>
          )}
          {session.discount_percent > 0 && (
            <span className="text-xs text-emerald-600 font-medium">{session.discount_percent}% desc.</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="text-right">
          <p className="text-xs text-slate-400">Total</p>
          <p className="text-lg font-bold text-slate-900">{fmt(session.price_total)}</p>
        </div>
        <button
          onClick={() => onReceive(session)}
          data-mentor-step="cashier-receive-grooming-btn"
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors shadow-sm"
        >
          <Receipt className="h-4 w-4" />
          Receber
        </button>
      </div>
    </div>
  )
}

// ─── Grooming payment modal ───────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { key: 'pix',    label: 'PIX' },
  { key: 'credit', label: 'Cartão Crédito' },
  { key: 'debit',  label: 'Cartão Débito' },
  { key: 'cash',   label: 'Dinheiro' },
] as const

function GroomingPaymentModal({
  session,
  onClose,
  onSuccess,
  onWaived,
}: {
  session: PendingGroomingPayment
  onClose: () => void
  onSuccess: (petName: string, total: number) => void
  onWaived: (petName: string) => void
}) {
  const [method,    setMethod]    = useState<'pix' | 'credit' | 'debit' | 'cash'>('pix')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    const res = await processGroomingPaymentFromCashier(session.id, method)
    setLoading(false)
    if ('error' in res) { setError(res.error); return }
    onSuccess(session.patient_name, session.price_total)
  }

  async function handleWaive() {
    setLoading(true)
    setError(null)
    const res = await updateGroomingPaymentStatus(session.id, 'waived')
    setLoading(false)
    if ('error' in res) { setError(res.error); return }
    onWaived(session.patient_name)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100">
            <Scissors className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Receber — Banho e Tosa</h3>
            <p className="text-sm text-slate-500">{session.patient_name} · {session.tutor_name}</p>
          </div>
        </div>

        {session.services_requested.length > 0 && (
          <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500 font-medium mb-1">Serviços</p>
            <p className="text-sm text-slate-700">{session.services_requested.join(', ')}</p>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between rounded-lg bg-violet-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-700">Total a receber</span>
          <span className="text-xl font-bold text-violet-700">{fmt(session.price_total)}</span>
        </div>

        <div className="mb-5">
          <p className="text-sm font-medium text-slate-700 mb-2">Forma de pagamento</p>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map(pm => (
              <button
                key={pm.key}
                onClick={() => setMethod(pm.key)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors ${
                  method === pm.key
                    ? 'border-violet-500 bg-violet-50 text-violet-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {pm.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
        )}

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleWaive}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-50"
            title="Marcar como cortesia — sem cobrança"
          >
            <Ban className="h-4 w-4" />
            Cortesia
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            data-mentor-step="cashier-grooming-confirm-btn"
            className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Processando...' : `Confirmar ${PAYMENT_LABEL[method]}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  initialInvoices:        InvoiceWithDetails[]
  initialGroomingSessions: PendingGroomingPayment[]
  clinicId:               string
  /** Épico B (04/06): role do usuário (mantido para usos futuros). */
  userRole?:              string
  /** Épico B (04/06, Q4): PDV unificado — exibe a venda avulsa no topo (C2). */
  pdvUnified?:            boolean
  /**
   * HF 05/06: direito de acesso "Caixa Central > Dados Inteligentes do
   * Convênio > Visualizar". true = visão completa; false = checkout compacto
   * (itens + valor a cobrar). Configurável por usuário em Direitos de Acesso.
   */
  canViewInsuranceDetails?: boolean
  /** Módulos ativos da clínica — cadastro rápido do catálogo na venda avulsa. */
  activeModules?:         string[]
  onToast: (msg: string, type: 'success' | 'error') => void
}

export default function CashierTabReceivables({
  initialInvoices,
  initialGroomingSessions,
  clinicId,
  userRole = 'receptionist',
  pdvUnified = false,
  canViewInsuranceDetails = true,
  activeModules = [],
  onToast,
}: Props) {
  const [invoices,          setInvoices]          = useState<InvoiceWithDetails[]>(initialInvoices)
  const [groomingSessions,  setGroomingSessions]   = useState<PendingGroomingPayment[]>(initialGroomingSessions)
  const [refreshing,        setRefreshing]         = useState(false)
  const [activeInvoiceId,   setActiveInvoiceId]    = useState<string | null>(null)
  const [activeGrooming,    setActiveGrooming]     = useState<PendingGroomingPayment | null>(null)

  // Épico B — C3 (04/06): recebimento múltiplo
  const [selectedIds,        setSelectedIds]        = useState<Set<string>>(new Set())
  const [confirmMixedTutors, setConfirmMixedTutors] = useState(false)
  const [showMultiPayment,   setShowMultiPayment]   = useState(false)
  const [multiProcessing,    setMultiProcessing]    = useState(false)

  // HF 05/06: a visão completa dos dados inteligentes deixou de ser hardcoded
  // por role — agora é o direito de acesso "cashier.insurance_intelligence:
  // view" (default liberado; admin desmarca por usuário em Direitos de Acesso).
  const operatorView = !canViewInsuranceDetails

  const selectedInvoices = invoices.filter(i => selectedIds.has(i.id))
  const selectedTotal    = selectedInvoices.reduce((s, i) => s + Math.max(0, Number(i.total_amount) - Number(i.paid_amount ?? 0)), 0)
  const distinctTutors   = new Set(selectedInvoices.map(i => i.tutor.name)).size

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function startMultiReceive() {
    if (selectedInvoices.length < 2) return
    // Q3: tutores diferentes são permitidos COM AVISO de confirmação
    if (distinctTutors > 1) { setConfirmMixedTutors(true); return }
    setShowMultiPayment(true)
  }

  async function handleMultiPaymentConfirm(splits: PaymentSplit[]) {
    setMultiProcessing(true)
    // Q3: agrupamento é só do ato de receber — cada fatura é baixada
    // individualmente (Contas a Receber separado, rastreável por documento).
    const allocation = allocateSplitsSequentially(
      selectedInvoices.map(i => ({ id: i.id, due: Math.max(0, Number(i.total_amount) - Number(i.paid_amount ?? 0)) })),
      splits.map(s => ({ ...s })),
    )
    const failures: string[] = []
    let received = 0
    for (const inv of selectedInvoices) {
      const invSplits = allocation.get(inv.id) ?? []
      if (invSplits.length === 0) continue
      const res = await processSplitPayment(
        inv.id,
        invSplits.map(s => ({
          amount:             s.amount as number,
          payment_method:     s.payment_method as PaymentSplit['payment_method'],
          payment_card_id:    s.payment_card_id as string | null,
          installments:       s.installments as number,
          card_acquirer:      s.card_acquirer as string | null,
          card_brand:         s.card_brand as string | null,
          card_nsu:           s.card_nsu as string | null,
          card_authorization: s.card_authorization as string | null,
          transaction_date:   s.transaction_date as string | null,
        })),
      )
      if ('error' in res) {
        failures.push(`${inv.patient.name}: ${res.error}`)
        break // para na primeira falha — faturas restantes seguem pendentes
      }
      received += invSplits.reduce((s, p) => s + (p.amount as number), 0)
    }
    setMultiProcessing(false)
    setShowMultiPayment(false)
    setSelectedIds(new Set())
    await refresh()
    if (failures.length > 0) {
      onToast(`Recebimento parcial — falha em: ${failures.join(' · ')}. As demais faturas seguem pendentes.`, 'error')
      throw new Error(failures[0])
    }
    onToast(`Recebimento agrupado concluído! ${fmt(received)} em ${selectedInvoices.length} faturas.`, 'success')
  }

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const [invRes, grRes] = await Promise.all([
      getPendingInvoices(),
      getPendingGroomingSessions(),
    ])
    setRefreshing(false)
    if (!('error' in invRes)) setInvoices(invRes)
    if (!('error' in grRes)) setGroomingSessions(grRes)
  }, [])

  useRealtimeSync({ table: 'invoices',          clinicId, onEvent: refresh })
  useRealtimeSync({ table: 'grooming_sessions', clinicId, onEvent: refresh })

  function handleInvoiceSuccess(petName: string, total: number) {
    setActiveInvoiceId(null)
    setInvoices(prev => prev.filter(inv => inv.id !== activeInvoiceId))
    onToast(
      `Pagamento de ${petName} recebido! ${fmt(total)}`,
      'success'
    )
  }

  function handleGroomingSuccess(petName: string, total: number) {
    const id = activeGrooming?.id
    setActiveGrooming(null)
    setGroomingSessions(prev => prev.filter(s => s.id !== id))
    onToast(`Banho e Tosa de ${petName} recebido! ${fmt(total)}`, 'success')
  }

  function handleGroomingWaived(petName: string) {
    const id = activeGrooming?.id
    setActiveGrooming(null)
    setGroomingSessions(prev => prev.filter(s => s.id !== id))
    onToast(`Serviço de ${petName} marcado como cortesia.`, 'success')
  }

  const totalPending = invoices.length + groomingSessions.length

  return (
    <>
      {activeInvoiceId && (
        <CheckoutModal
          invoiceId={activeInvoiceId}
          operatorView={operatorView}
          onClose={() => setActiveInvoiceId(null)}
          onSuccess={handleInvoiceSuccess}
        />
      )}

      {/* Épico B — C3: pagamento agrupado */}
      {showMultiPayment && (
        <PaymentMethodModal
          totalDue={selectedTotal}
          subject={`${selectedInvoices.length} faturas selecionadas`}
          onCancel={() => { if (!multiProcessing) setShowMultiPayment(false) }}
          onConfirm={handleMultiPaymentConfirm}
        />
      )}

      {/* Q3: aviso de tutores diferentes */}
      {confirmMixedTutors && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Tutores diferentes selecionados</h3>
            </div>
            <p className="text-sm text-slate-600">
              Tutores diferentes selecionados, deseja realizar o recebimento agrupado mesmo assim?
              No financeiro, cada fatura continua lançada separadamente.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirmMixedTutors(false)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Voltar
              </button>
              <button
                onClick={() => { setConfirmMixedTutors(false); setShowMultiPayment(true) }}
                className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white hover:bg-amber-600"
              >
                Sim, agrupar
              </button>
            </div>
          </div>
        </div>
      )}

      {activeGrooming && (
        <GroomingPaymentModal
          session={activeGrooming}
          onClose={() => setActiveGrooming(null)}
          onSuccess={handleGroomingSuccess}
          onWaived={handleGroomingWaived}
        />
      )}

      {/* Épico B — C2 (Q4): venda avulsa no TOPO de Recebimentos quando o
          PDV está unificado ao Caixa */}
      {pdvUnified && (
        <CashierQuickSale
          clinicId={clinicId}
          activeModules={activeModules}
          onToast={onToast}
          onSaleCompleted={refresh}
        />
      )}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Recebimentos Pendentes</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {totalPending === 0
              ? 'Nenhum recebimento pendente'
              : `${totalPending} recebimento${totalPending !== 1 ? 's' : ''} aguardando pagamento`}
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Épico B — C3: barra de recebimento agrupado */}
      {selectedInvoices.length >= 2 && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border-2 border-teal-300 bg-teal-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-teal-900">
            <Users className="h-4 w-4 flex-shrink-0" />
            <span>
              <strong>{selectedInvoices.length} faturas</strong> selecionadas
              {distinctTutors > 1 && <span className="text-amber-700 font-semibold"> · {distinctTutors} tutores diferentes</span>}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-white"
            >
              Limpar
            </button>
            <button
              onClick={startMultiReceive}
              data-mentor-step="cashier-multi-receive-btn"
              className="rounded-xl bg-teal-600 hover:bg-teal-700 px-4 py-2 text-sm font-bold text-white"
            >
              Receber selecionados · {fmt(selectedTotal)}
            </button>
          </div>
        </div>
      )}

      {totalPending === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-slate-300 bg-white">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <ShoppingBag className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-500">Nenhum recebimento pendente no momento</p>
          <p className="mt-1 text-xs text-slate-400">
            Consultas e Banho e Tosa com cobrança configurada aparecem aqui automaticamente
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map(inv => (
            <InvoiceCard
              key={inv.id}
              invoice={inv}
              onCheckout={setActiveInvoiceId}
              selected={selectedIds.has(inv.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
          {groomingSessions.map(session => (
            <GroomingPaymentCard
              key={session.id}
              session={session}
              onReceive={setActiveGrooming}
            />
          ))}
        </div>
      )}
    </>
  )
}
