'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { getTutorCreditStatement, type TutorCreditDetail } from '@/lib/actions/tutor-credits'

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(',', '')
const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Dinheiro', pix: 'PIX', credit: 'Cartão de crédito', debit: 'Cartão de débito',
  voucher: 'Voucher', transfer: 'Transferência', convenio: 'Convênio', other: 'Outro',
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return <span className="text-[11px] text-slate-500"><span className="text-slate-400">{label}:</span> <span className="text-slate-700 font-medium">{value}</span></span>
}

/** Extrato de crédito de um tutor — reutilizado no cadastro do cliente. */
export default function TutorCreditsPanel({ tutorId }: { tutorId: string }) {
  const [movs, setMovs]       = useState<TutorCreditDetail[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getTutorCreditStatement(tutorId).then(r => { if (!('error' in r)) setMovs(r); setLoading(false) })
  }, [tutorId])

  if (loading) return <div className="p-8 flex items-center justify-center gap-2 text-slate-400 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Carregando créditos…</div>

  const inserted = movs.filter(m => m.kind === 'advance')
  const used     = movs.filter(m => m.kind === 'usage')
  const totalIns  = inserted.reduce((a, m) => a + m.amount, 0)
  const totalUsed = used.reduce((a, m) => a + Math.abs(m.amount), 0)
  const available = Math.round((totalIns - totalUsed) * 100) / 100

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total inserido"  value={totalIns}   color="text-slate-800" />
        <Stat label="Total utilizado" value={totalUsed}  color="text-rose-600" />
        <Stat label="Disponível"      value={available}  color="text-emerald-600" />
      </div>

      <Section title="Créditos inseridos" empty="Nenhum adiantamento lançado.">
        {inserted.map(m => (
          <Card key={m.id} kind="in" title="Adiantamento (Caixa)" amount={m.amount}>
            <Field label="Recebido em" value={fmtDate(m.created_at)} />
            <Field label="Forma" value={m.payment_method ? (PAYMENT_LABEL[m.payment_method] ?? m.payment_method) : null} />
            <Field label="Lançado por" value={m.user_name} />
          </Card>
        ))}
      </Section>

      <Section title="Créditos utilizados" empty="Nenhum crédito utilizado ainda.">
        {used.map(m => (
          <Card key={m.id} kind="out" title={m.os_number ? `OS ${m.os_number}` : 'Uso do crédito'} amount={m.amount}>
            <Field label="Pet" value={m.patient_name} />
            <Field label="Tutor" value={m.tutor_name} />
            <Field label="Data da consulta" value={m.consultation_date ? fmtDate(m.consultation_date) : null} />
            <Field label="Crédito usado em" value={fmtDate(m.created_at)} />
            <Field label="Utilizado por" value={m.user_name} />
          </Card>
        ))}
      </Section>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold font-mono tabular-nums ${color}`}>{BRL(value)}</p>
    </div>
  )
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-slate-900 mb-2">{title}</h3>
      {children.length === 0
        ? <p className="text-slate-400 text-sm py-3">{empty}</p>
        : <div className="space-y-2">{children}</div>}
    </div>
  )
}

function Card({ kind, title, amount, children }: { kind: 'in' | 'out'; title: string; amount: number; children: React.ReactNode }) {
  const isIn = kind === 'in'
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${isIn ? 'border-emerald-100 bg-emerald-50/40' : 'border-rose-100 bg-rose-50/30'}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <span className={`text-sm font-bold font-mono tabular-nums flex-shrink-0 ${isIn ? 'text-emerald-700' : 'text-rose-600'}`}>
          {isIn ? '+' : '−'}{BRL(Math.abs(amount))}
        </span>
      </div>
      <div className="mt-1 flex flex-col gap-0.5">{children}</div>
    </div>
  )
}
