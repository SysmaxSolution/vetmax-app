'use client'

import { useState, useEffect, useCallback } from 'react'
import { Receipt, RefreshCw, ShoppingBag, Scissors, Ban, Users, AlertTriangle, ShoppingCart, Trash2, Loader2 } from 'lucide-react'
import { getPendingInvoices, processSplitPayment, type InvoiceWithDetails } from '@/lib/actions/billing'
import {
  getPendingGroomingSessions,
  processGroomingPaymentFromCashier,
  updateGroomingPaymentStatus,
  type PendingGroomingPayment,
} from '@/lib/actions/grooming'
import {
  listPendingSales, settlePendingSale, cancelPendingLaunch,
  type PendingSale,
} from '@/lib/actions/sales'
import {
  previewConsultationInsurance, getConsultationCopayInterestPreview,
} from '@/lib/actions/insurance-checkout'
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
    // Mobile (05/06): no celular o bloco Total+Receber desce para a linha de
    // baixo (w-full) — antes ficava espremido/sobreposto ao lado do texto.
    <div className={`flex flex-wrap items-center gap-3 sm:gap-4 rounded-xl border bg-white px-4 sm:px-5 py-4 hover:shadow-sm transition-all ${selected ? 'border-teal-400 ring-1 ring-teal-200' : 'border-slate-200 hover:border-slate-300'}`}>
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
      <div className="flex-1 min-w-0 basis-40">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="font-semibold text-slate-900 truncate max-w-full">{invoice.patient.name}</p>
          <span className="text-xs text-slate-400 hidden sm:inline">·</span>
          <span className="text-xs text-slate-500 truncate max-w-full">{invoice.tutor.name}</span>
          <span className="rounded-full bg-blue-50 text-blue-700 text-xs font-medium px-2 py-0.5 flex-shrink-0">Consulta</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="text-xs text-slate-400 whitespace-nowrap">Alta às {fmtTime(invoice.created_at)}</span>
          {invoice.tutor.phone && (
            <span className="text-xs text-slate-400 whitespace-nowrap">{invoice.tutor.phone}</span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 w-full sm:w-auto sm:flex-shrink-0 sm:justify-end">
        <div className="text-left sm:text-right">
          <p className="text-xs text-slate-400">Total</p>
          <p className="text-lg font-bold text-slate-900 whitespace-nowrap">{fmt(invoice.total_amount)}</p>
        </div>
        <button
          onClick={() => onCheckout(invoice.id)}
          data-mentor-step="cashier-receive-invoice-btn"
          className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors shadow-sm flex-shrink-0"
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
    <div className="flex flex-wrap items-center gap-3 sm:gap-4 rounded-xl border border-violet-100 bg-white px-4 sm:px-5 py-4 hover:shadow-sm hover:border-violet-200 transition-all">
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-violet-50 text-2xl">
        {SPECIES_EMOJI[session.patient_species] ?? '🐾'}
      </div>
      <div className="flex-1 min-w-0 basis-40">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="font-semibold text-slate-900 truncate max-w-full">{session.patient_name}</p>
          <span className="text-xs text-slate-400 hidden sm:inline">·</span>
          <span className="text-xs text-slate-500 truncate max-w-full">{session.tutor_name}</span>
          <span className="rounded-full bg-violet-50 text-violet-700 text-xs font-medium px-2 py-0.5 flex items-center gap-1 flex-shrink-0">
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
      <div className="flex items-center justify-between gap-4 w-full sm:w-auto sm:flex-shrink-0 sm:justify-end">
        <div className="text-left sm:text-right">
          <p className="text-xs text-slate-400">Total</p>
          <p className="text-lg font-bold text-slate-900 whitespace-nowrap">{fmt(session.price_total)}</p>
        </div>
        <button
          onClick={() => onReceive(session)}
          data-mentor-step="cashier-receive-grooming-btn"
          className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors shadow-sm flex-shrink-0"
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
  const [pendingSales,      setPendingSales]       = useState<PendingSale[]>([])
  const [refreshing,        setRefreshing]         = useState(false)
  const [activeInvoiceId,   setActiveInvoiceId]    = useState<string | null>(null)
  const [activeGrooming,    setActiveGrooming]     = useState<PendingGroomingPayment | null>(null)
  const [activeSale,        setActiveSale]         = useState<PendingSale | null>(null)
  const [cancellingSaleId,  setCancellingSaleId]   = useState<string | null>(null)

  // Épico B — C3 (04/06): recebimento múltiplo (consultas + vendas lançadas)
  const [selectedIds,        setSelectedIds]        = useState<Set<string>>(new Set())
  const [selectedSaleIds,    setSelectedSaleIds]    = useState<Set<string>>(new Set())
  const [confirmMixedTutors, setConfirmMixedTutors] = useState(false)
  const [showMultiPayment,   setShowMultiPayment]   = useState(false)
  const [multiProcessing,    setMultiProcessing]    = useState(false)
  const [preparingMulti,     setPreparingMulti]     = useState(false)
  // Plano calculado no clique: cobrança certa por unidade (copart p/ convênio)
  // + taxa adm. SÓ sobre a parte conveniada (pedido do PO 05/06).
  const [multiPlan, setMultiPlan] = useState<{
    units: Array<{
      kind:           'invoice' | 'sale'
      id:             string
      label:          string
      charge:         number
      interest_full:  number
      percent:        number
      interestItems:  Array<{ consultation_service_id: string; interest: number }>
      insurance:      null | { receivable_amount: number; clinic_discount: number; procedure_pattern: string }
    }>
    totalDue:      number
    copayInterest: { copay_total: number; interest_full: number; percent: number } | null
  } | null>(null)

  // HF 05/06: a visão completa dos dados inteligentes deixou de ser hardcoded
  // por role — agora é o direito de acesso "cashier.insurance_intelligence:
  // view" (default liberado; admin desmarca por usuário em Direitos de Acesso).
  const operatorView = !canViewInsuranceDetails

  const selectedInvoices  = invoices.filter(i => selectedIds.has(i.id))
  const selectedSales     = pendingSales.filter(s => selectedSaleIds.has(s.id))
  const selectedCount     = selectedInvoices.length + selectedSales.length
  const selectedGrossTotal =
    selectedInvoices.reduce((s, i) => s + Math.max(0, Number(i.total_amount) - Number(i.paid_amount ?? 0)), 0) +
    selectedSales.reduce((s, v) => s + v.total_amount, 0)
  const distinctTutors = new Set([
    ...selectedInvoices.map(i => i.tutor.name),
    ...selectedSales.map(s => s.tutor_name ?? 'Consumidor avulso'),
  ]).size

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectSale(id: string) {
    setSelectedSaleIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /**
   * Monta o plano do recebimento agrupado (05/06, pedido do PO): para cada
   * consulta conveniada cobra a COPARTICIPAÇÃO (cobertura aplicada
   * automaticamente; repasse vira Aguardando Petlove) e calcula a taxa adm.
   * SÓ sobre essa parte; vendas lançadas entram pelo valor cheio SEM taxa.
   * Total = venda avulsa + copart da consulta + taxa sobre a copart.
   */
  async function prepareMultiPlan() {
    setPreparingMulti(true)
    const units: NonNullable<typeof multiPlan>['units'] = []
    let copayTotal = 0
    let interestFullTotal = 0
    let percentSample = 0

    for (const inv of selectedInvoices) {
      const paid = Number(inv.paid_amount ?? 0)
      let charge = Math.max(0, Number(inv.total_amount) - paid)
      let insurance: NonNullable<typeof multiPlan>['units'][number]['insurance'] = null
      let interestFull = 0
      let percent = 0
      let interestItems: Array<{ consultation_service_id: string; interest: number }> = []

      if (inv.consultation_id) {
        const preview = await previewConsultationInsurance(inv.consultation_id)
        if (!('error' in preview) && preview.has_insurance && preview.totals.charge_now < preview.totals.grand_total) {
          charge = Math.max(0, Number(preview.totals.charge_now.toFixed(2)) - paid)
          insurance = {
            receivable_amount: Number((preview.totals.receivable + preview.totals.deferred_provider).toFixed(2)),
            clinic_discount:   Number(preview.totals.clinic_discount.toFixed(2)),
            procedure_pattern: preview.items[0]?.coverage?.procedure_pattern ?? preview.items[0]?.description ?? 'Procedimento',
          }
          const interestPrev = await getConsultationCopayInterestPreview(inv.consultation_id)
          if (!('error' in interestPrev) && interestPrev.interest_full > 0) {
            interestFull  = interestPrev.interest_full
            percent       = interestPrev.percent
            interestItems = interestPrev.items.map(i => ({ consultation_service_id: i.consultation_service_id, interest: i.interest }))
            copayTotal        += interestPrev.copay_total
            interestFullTotal += interestPrev.interest_full
            percentSample      = percentSample || interestPrev.percent
          }
        }
      }

      units.push({
        kind: 'invoice', id: inv.id, label: inv.patient.name,
        charge: Number(charge.toFixed(2)),
        interest_full: interestFull, percent, interestItems, insurance,
      })
    }

    for (const sale of selectedSales) {
      units.push({
        kind: 'sale', id: sale.id, label: sale.patient_name ?? sale.tutor_name ?? 'Venda avulsa',
        charge: sale.total_amount,
        interest_full: 0, percent: 0, interestItems: [], insurance: null,
      })
    }

    const totalDue = Number(units.reduce((s, u) => s + u.charge, 0).toFixed(2))
    setMultiPlan({
      units,
      totalDue,
      copayInterest: interestFullTotal > 0
        ? { copay_total: Number(copayTotal.toFixed(2)), interest_full: Number(interestFullTotal.toFixed(2)), percent: percentSample }
        : null,
    })
    setPreparingMulti(false)
    setShowMultiPayment(true)
  }

  function startMultiReceive() {
    if (selectedCount < 2 || preparingMulti) return
    // Q3: tutores diferentes são permitidos COM AVISO de confirmação
    if (distinctTutors > 1) { setConfirmMixedTutors(true); return }
    void prepareMultiPlan()
  }

  async function handleMultiPaymentConfirm(splits: PaymentSplit[], extras?: { copay_interest: number }) {
    if (!multiPlan) return
    setMultiProcessing(true)

    // Distribui a taxa líquida (após desconto no modal) entre as unidades
    // proporcionalmente à taxa bruta de cada uma (última absorve centavos).
    const netTotal = extras?.copay_interest ?? 0
    const grossTotal = multiPlan.units.reduce((s, u) => s + u.interest_full, 0)
    let allocated = 0
    const withInterest = multiPlan.units.filter(u => u.interest_full > 0)
    const netByUnit = new Map<string, number>()
    withInterest.forEach((u, idx) => {
      const share = idx === withInterest.length - 1
        ? Math.round((netTotal - allocated) * 100) / 100
        : Math.round(netTotal * (u.interest_full / grossTotal) * 100) / 100
      allocated = Math.round((allocated + share) * 100) / 100
      netByUnit.set(u.id, Math.max(0, share))
    })

    // Alvos COBRADOS por unidade (base + taxa própria) — Q3: cada documento
    // é baixado individualmente no financeiro.
    const targets = multiPlan.units.map(u => ({
      id:  `${u.kind}:${u.id}`,
      due: Math.round((u.charge + (netByUnit.get(u.id) ?? 0)) * 100) / 100,
    }))
    const allocation = allocateSplitsSequentially(targets, splits.map(s => ({ ...s })))

    const failures: string[] = []
    let received = 0
    for (const unit of multiPlan.units) {
      const unitSplits = (allocation.get(`${unit.kind}:${unit.id}`) ?? []).map(s => ({
        amount:             s.amount as number,
        payment_method:     s.payment_method as PaymentSplit['payment_method'],
        payment_card_id:    s.payment_card_id as string | null,
        installments:       s.installments as number,
        card_acquirer:      s.card_acquirer as string | null,
        card_brand:         s.card_brand as string | null,
        card_nsu:           s.card_nsu as string | null,
        card_authorization: s.card_authorization as string | null,
        transaction_date:   s.transaction_date as string | null,
      }))
      if (unitSplits.length === 0) continue

      const unitInterest = netByUnit.get(unit.id) ?? 0
      const res = unit.kind === 'invoice'
        ? await processSplitPayment(unit.id, unitSplits, {
            discount: unit.insurance?.clinic_discount ?? 0,
            ...(unit.insurance ? {
              insurance_split: {
                receivable_amount: unit.insurance.receivable_amount,
                receivable_source: 'petlove_open' as const,
                clinic_discount:   unit.insurance.clinic_discount,
                procedure_pattern: unit.insurance.procedure_pattern,
              },
            } : {}),
            ...(unitInterest > 0 ? {
              copay_interest: { total: unitInterest, percent: unit.percent, items: unit.interestItems },
            } : {}),
          })
        : await settlePendingSale(unit.id, unitSplits)

      if ('error' in res) {
        failures.push(`${unit.label}: ${res.error}`)
        break // para na primeira falha — unidades restantes seguem pendentes
      }
      received += unitSplits.reduce((s, p) => s + p.amount, 0)
    }

    setMultiProcessing(false)
    setShowMultiPayment(false)
    setMultiPlan(null)
    setSelectedIds(new Set())
    setSelectedSaleIds(new Set())
    await refresh()
    if (failures.length > 0) {
      onToast(`Recebimento parcial — falha em: ${failures.join(' · ')}. Itens restantes seguem pendentes.`, 'error')
      throw new Error(failures[0])
    }
    onToast(`Recebimento agrupado concluído! ${fmt(received)} em ${multiPlan.units.length} documentos.`, 'success')
  }

  const refresh = useCallback(async () => {
    setRefreshing(true)
    const [invRes, grRes, salesRes] = await Promise.all([
      getPendingInvoices(),
      getPendingGroomingSessions(),
      listPendingSales(),
    ])
    setRefreshing(false)
    if (!('error' in invRes)) setInvoices(invRes)
    if (!('error' in grRes)) setGroomingSessions(grRes)
    if (Array.isArray(salesRes)) setPendingSales(salesRes)
  }, [])

  // Vendas lançadas não vêm do server component — carrega no mount
  useEffect(() => {
    listPendingSales().then(res => { if (Array.isArray(res)) setPendingSales(res) })
  }, [])

  useRealtimeSync({ table: 'invoices',          clinicId, onEvent: refresh })
  useRealtimeSync({ table: 'grooming_sessions', clinicId, onEvent: refresh })
  useRealtimeSync({ table: 'sales',             clinicId, onEvent: refresh })

  async function handleCancelLaunch(sale: PendingSale) {
    if (!confirm(`Cancelar o lançamento de ${fmt(sale.total_amount)}? O estoque será devolvido.`)) return
    setCancellingSaleId(sale.id)
    const res = await cancelPendingLaunch(sale.id)
    setCancellingSaleId(null)
    if ('error' in res) { onToast(res.error, 'error'); return }
    setPendingSales(prev => prev.filter(s => s.id !== sale.id))
    onToast('Lançamento cancelado — estoque devolvido.', 'success')
  }

  async function handleSettleSale(splits: PaymentSplit[]) {
    if (!activeSale) return
    const res = await settlePendingSale(activeSale.id, splits.map(s => ({
      amount:             s.amount,
      payment_method:     s.payment_method,
      payment_card_id:    s.payment_card_id,
      installments:       s.installments,
      card_acquirer:      s.card_acquirer,
      card_brand:         s.card_brand,
      card_nsu:           s.card_nsu,
      card_authorization: s.card_authorization,
      transaction_date:   s.transaction_date,
    })))
    if ('error' in res) { onToast(res.error, 'error'); throw new Error(res.error) }
    const total = activeSale.total_amount
    setActiveSale(null)
    setPendingSales(prev => prev.filter(s => s.id !== activeSale.id))
    onToast(`Venda recebida! ${fmt(total)}`, 'success')
  }

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

  const totalPending = invoices.length + groomingSessions.length + pendingSales.length

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

      {/* Recebimento individual de venda lançada */}
      {activeSale && (
        <PaymentMethodModal
          totalDue={activeSale.total_amount}
          subject={activeSale.tutor_name ?? 'Venda avulsa'}
          onCancel={() => setActiveSale(null)}
          onConfirm={handleSettleSale}
        />
      )}

      {/* Épico B — C3: pagamento agrupado (consultas + vendas lançadas).
          totalDue e taxa vêm do PLANO: copart das consultas conveniadas +
          valor cheio das vendas; taxa adm. SÓ sobre a parte conveniada. */}
      {showMultiPayment && multiPlan && (
        <PaymentMethodModal
          totalDue={multiPlan.totalDue}
          subject={`${multiPlan.units.length} documentos selecionados`}
          copayInterest={multiPlan.copayInterest}
          onCancel={() => { if (!multiProcessing) { setShowMultiPayment(false); setMultiPlan(null) } }}
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
                onClick={() => { setConfirmMixedTutors(false); void prepareMultiPlan() }}
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

      {/* Épico B — C3: barra de recebimento agrupado (consultas + vendas) */}
      {selectedCount >= 2 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-teal-300 bg-teal-50 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-teal-900">
            <Users className="h-4 w-4 flex-shrink-0" />
            <span>
              <strong>{selectedCount} documentos</strong> selecionados
              {selectedSales.length > 0 && <span className="text-teal-700"> ({selectedInvoices.length} consulta{selectedInvoices.length !== 1 ? 's' : ''} + {selectedSales.length} venda{selectedSales.length !== 1 ? 's' : ''})</span>}
              {distinctTutors > 1 && <span className="text-amber-700 font-semibold"> · {distinctTutors} tutores diferentes</span>}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { setSelectedIds(new Set()); setSelectedSaleIds(new Set()) }}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-white"
            >
              Limpar
            </button>
            <button
              onClick={startMultiReceive}
              disabled={preparingMulti}
              data-mentor-step="cashier-multi-receive-btn"
              className="rounded-xl bg-teal-600 hover:bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-60 flex items-center gap-2"
            >
              {preparingMulti
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Calculando convênio...</>
                : <>Receber selecionados · até {fmt(selectedGrossTotal)}</>}
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
          {/* Vendas lançadas (pendentes) — paridade visual com os cards de
              consulta: pet/tutor + telefone + data/hora + itens + total */}
          {pendingSales.map(sale => (
            <div
              key={sale.id}
              className={`flex flex-wrap items-center gap-3 sm:gap-4 rounded-xl border bg-white px-4 sm:px-5 py-4 hover:shadow-sm transition-all ${selectedSaleIds.has(sale.id) ? 'border-teal-400 ring-1 ring-teal-200' : 'border-emerald-100 hover:border-emerald-200'}`}
            >
              <input
                type="checkbox"
                checked={selectedSaleIds.has(sale.id)}
                onChange={() => toggleSelectSale(sale.id)}
                className="h-4 w-4 flex-shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                title="Selecionar para recebimento agrupado"
              />
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-emerald-50 text-2xl">
                {sale.patient_species
                  ? (SPECIES_EMOJI[sale.patient_species] ?? '🐾')
                  : <ShoppingCart className="h-5 w-5 text-emerald-600" />}
              </div>
              <div className="flex-1 min-w-0 basis-40">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className="font-semibold text-slate-900 truncate max-w-full">
                    {sale.patient_name ?? sale.tutor_name ?? 'Consumidor avulso'}
                  </p>
                  {sale.patient_name && sale.tutor_name && (
                    <>
                      <span className="text-xs text-slate-400 hidden sm:inline">·</span>
                      <span className="text-xs text-slate-500 truncate max-w-full">{sale.tutor_name}</span>
                    </>
                  )}
                  <span className="rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium px-2 py-0.5 flex-shrink-0">Venda</span>
                </div>
                <div className="mt-0.5 flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-slate-400">
                    Lançada às {fmtTime(sale.created_at)} · {new Date(sale.created_at).toLocaleDateString('pt-BR')}
                  </span>
                  {sale.tutor_phone && (
                    <span className="text-xs text-slate-400">{sale.tutor_phone}</span>
                  )}
                </div>
                {sale.items_preview && (
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    {sale.items_preview.split(', ').map(item => (
                      <span key={item} className="text-xs text-slate-400 bg-slate-50 rounded px-1.5 py-0.5">{item}</span>
                    ))}
                    {sale.items_count > 3 && (
                      <span className="text-xs text-slate-400">+{sale.items_count - 3}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 w-full sm:w-auto sm:flex-shrink-0 sm:justify-end">
                <div className="text-left sm:text-right">
                  <p className="text-xs text-slate-400">Total</p>
                  <p className="text-lg font-bold text-slate-900 whitespace-nowrap">{fmt(sale.total_amount)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleCancelLaunch(sale)}
                    disabled={cancellingSaleId === sale.id}
                    title="Cancelar lançamento (devolve o estoque)"
                    className="rounded-lg p-2 text-rose-400 hover:bg-rose-50 disabled:opacity-50"
                  >
                    {cancellingSaleId === sale.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => setActiveSale(sale)}
                    data-mentor-step="cashier-receive-sale-btn"
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
                  >
                    <Receipt className="h-4 w-4" />
                    Receber
                  </button>
                </div>
              </div>
            </div>
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
