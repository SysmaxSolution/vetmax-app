'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import confetti from 'canvas-confetti'
import { CheckCircle2, ArrowRight, Sparkles, Receipt, Gift, AlertCircle, Tags, TrendingUp, Users } from 'lucide-react'
import type { ApplyReconciliationResult } from '@/lib/actions/petlove-reconciliation'

export interface SuccessDialogSummary {
  remittance_number: string
  total_value:       number
  matched_count:     number
  partial_count:     number
  new_pets_count:    number
  /** Resultado real da transação applyReconciliation (preenchido após aprovar). */
  applied?:          ApplyReconciliationResult | null
}

export default function SuccessDialog({
  open,
  summary,
  onClose,
}: {
  open:    boolean
  summary: SuccessDialogSummary | null
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return

    // Confete: 3 bursts em sequência para um efeito mais rico
    const fireBurst = (originX: number, particles: number) => {
      confetti({
        particleCount: particles,
        spread: 70,
        origin: { x: originX, y: 0.6 },
        colors: ['#a855f7', '#c084fc', '#e879f9', '#fbbf24', '#34d399', '#60a5fa'],
        scalar: 1.1,
      })
    }

    fireBurst(0.5, 80)
    const t1 = setTimeout(() => fireBurst(0.2, 60), 250)
    const t2 = setTimeout(() => fireBurst(0.8, 60), 500)
    const t3 = setTimeout(() => fireBurst(0.5, 100), 900)

    // ESC fecha
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)

    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
      window.removeEventListener('keydown', handler)
    }
  }, [open, onClose])

  if (!open || !summary) return null

  const applied = summary.applied ?? null
  const totalIndividual = applied?.total_amount_individual ?? 0
  const totalStandalone = applied?.total_amount_standalone ?? 0
  const finalAmount = applied ? totalIndividual + totalStandalone : summary.total_value

  const totalEntries = applied
    ? applied.individual_entries_created + applied.retroactive_entries_created
    : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl border border-purple-200 w-full max-w-lg p-8 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-emerald-100 to-purple-100 border-2 border-purple-200 flex items-center justify-center mb-4">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>

        <h2 className="text-2xl font-bold text-slate-900 flex items-center justify-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          Conciliação concluída!
        </h2>

        <p className="text-base text-slate-600 mt-2">
          Você conciliou {' '}
          <span className="font-bold text-emerald-700 text-xl tabular-nums">
            {finalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
          {' '} da remessa <strong>#{summary.remittance_number}</strong>.
        </p>

        {applied ? (
          <>
            {/* Headline: títulos individuais + preços fixados */}
            <div className="grid grid-cols-2 gap-3 mt-6">
              <HeadlineCard
                icon={<Receipt className="h-5 w-5" />}
                value={totalEntries}
                label="Títulos individuais"
                sublabel={`gerados em A Receber · ${totalIndividual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
                tone="emerald"
              />
              <HeadlineCard
                icon={<Tags className="h-5 w-5" />}
                value={applied.custom_prices_set}
                label="Preços fixados"
                sublabel="nos perfis dos pets"
                tone="purple"
              />
            </div>

            {/* Detalhamento granular */}
            <div className="mt-4 space-y-1.5 text-left text-xs bg-slate-50 rounded-xl p-3.5">
              {applied.individual_entries_created > 0 && (
                <Line icon={<Receipt className="h-3.5 w-3.5 text-emerald-600" />}>
                  <strong>{applied.individual_entries_created}</strong> lançamento{applied.individual_entries_created !== 1 ? 's' : ''} individual{applied.individual_entries_created !== 1 ? 'is' : ''} por atendimento
                </Line>
              )}
              {applied.drift_adjusted_entries > 0 && (
                <Line icon={<TrendingUp className="h-3.5 w-3.5 text-amber-600" />}>
                  <strong>{applied.drift_adjusted_entries}</strong> com ajuste de drift (planilha ≠ esperado)
                </Line>
              )}
              {applied.retroactive_entries_created > 0 && (
                <Line icon={<Users className="h-3.5 w-3.5 text-blue-600" />}>
                  <strong>{applied.retroactive_entries_created}</strong> lançamento{applied.retroactive_entries_created !== 1 ? 's' : ''} retroativo{applied.retroactive_entries_created !== 1 ? 's' : ''} (recepção esqueceu de lançar)
                </Line>
              )}
              {applied.standalone_entries_created > 0 && (
                <Line icon={<Gift className="h-3.5 w-3.5 text-purple-600" />}>
                  <strong>{applied.standalone_entries_created}</strong> título{applied.standalone_entries_created !== 1 ? 's' : ''} avulso{applied.standalone_entries_created !== 1 ? 's' : ''} (bônus / ajustes)
                </Line>
              )}
              {applied.pet_insurance_updated > 0 && (
                <Line icon={<Sparkles className="h-3.5 w-3.5 text-purple-500" />}>
                  <strong>{applied.pet_insurance_updated}</strong> cadastro{applied.pet_insurance_updated !== 1 ? 's' : ''} de plano atualizado{applied.pet_insurance_updated !== 1 ? 's' : ''}
                </Line>
              )}
              {applied.pending_manual > 0 && (
                <Line icon={<AlertCircle className="h-3.5 w-3.5 text-amber-600" />}>
                  <strong>{applied.pending_manual}</strong> linha{applied.pending_manual !== 1 ? 's' : ''} pendente{applied.pending_manual !== 1 ? 's' : ''} (cadastre os pets e re-execute o matching)
                </Line>
              )}
              {applied.errors.length > 0 && (
                <Line icon={<AlertCircle className="h-3.5 w-3.5 text-rose-600" />}>
                  <span className="text-rose-700"><strong>{applied.errors.length}</strong> erro{applied.errors.length !== 1 ? 's' : ''} parcial{applied.errors.length !== 1 ? 'is' : ''}: {applied.errors.slice(0, 2).join('; ')}</span>
                </Line>
              )}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-2 mt-6">
            <Stat label="Casados"     value={summary.matched_count}  tone="emerald" />
            <Stat label="Divergentes" value={summary.partial_count}  tone="amber" />
            <Stat label="Novos Pets"  value={summary.new_pets_count} tone="purple" />
          </div>
        )}

        <Link
          href="/dashboard/financial"
          className="mt-6 inline-flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          Ver Títulos em A Receber
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/dashboard/financial/insurance-reconciliation"
          className="mt-2 inline-flex items-center justify-center gap-2 w-full text-purple-700 hover:text-purple-900 text-sm font-medium"
        >
          Voltar para Remessas
        </Link>
      </div>
    </div>
  )
}

function HeadlineCard({
  icon, value, label, sublabel, tone,
}: {
  icon: React.ReactNode
  value: number
  label: string
  sublabel: string
  tone: 'emerald' | 'purple'
}) {
  const styles = {
    emerald: 'bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-900',
    purple:  'bg-gradient-to-br from-purple-50 to-fuchsia-100 border-purple-200 text-purple-900',
  }[tone]
  const iconWrap = {
    emerald: 'bg-emerald-200 text-emerald-700',
    purple:  'bg-purple-200 text-purple-700',
  }[tone]
  return (
    <div className={`text-left rounded-2xl border p-4 ${styles}`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${iconWrap}`}>{icon}</div>
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-xs font-semibold mt-1">{label}</p>
      <p className="text-[10px] opacity-70 mt-0.5">{sublabel}</p>
    </div>
  )
}

function Line({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-slate-700">
      <span className="flex-shrink-0 mt-0.5">{icon}</span>
      <span className="flex-1">{children}</span>
    </p>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'purple' | 'rose' }) {
  const styles = {
    emerald: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    amber:   'bg-amber-50 text-amber-900 border-amber-200',
    purple:  'bg-purple-50 text-purple-900 border-purple-200',
    rose:    'bg-rose-50 text-rose-900 border-rose-200',
  }[tone]
  return (
    <div className={`p-3 rounded-xl border ${styles}`}>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] uppercase tracking-wide opacity-70">{label}</p>
    </div>
  )
}
