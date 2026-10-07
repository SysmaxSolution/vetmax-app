'use client'

// Card "Exames não realizados" dos portais. O cliente (clínica parceira,
// protetor, MV solicitante ou o próprio tutor) responde: recoletar ou não.
// Usado em /parceiro e em /portal.

import { useState, useTransition } from 'react'
import { AlertTriangle, RotateCw, Ban, Loader2, CheckCircle2 } from 'lucide-react'
import type { PendingExamDecision } from '@/lib/actions/exam-rejection-portal'
import { submitPartnerExamDecision, submitTutorExamDecision } from '@/lib/actions/exam-rejection-portal'

const fmt = (iso: string) => iso
  ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
  : ''

export default function ExamDecisionCard({ items, audience }: {
  items:    PendingExamDecision[]
  audience: 'partner' | 'tutor'
}) {
  const [done, setDone]   = useState<Record<string, 'recollect' | 'no_recollect'>>({})
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startT] = useTransition()

  if (items.length === 0) return null

  function respond(id: string, decision: 'recollect' | 'no_recollect') {
    setBusyId(id); setError(null)
    startT(async () => {
      const submit = audience === 'partner' ? submitPartnerExamDecision : submitTutorExamDecision
      const res = await submit(id, decision)
      setBusyId(null)
      if ('error' in res) { setError(res.error); return }
      setDone(d => ({ ...d, [id]: decision }))
    })
  }

  return (
    <section className="rounded-2xl border border-[var(--pt-accent-light)] bg-[var(--pt-accent-faint)] p-6 sm:p-7">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--pt-accent-strong)]" />
        <div>
          <h2 className="text-lg text-[var(--pt-text)]" style={{ fontFamily: 'var(--pt-heading-font)' }}>
            Exames não realizados
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--pt-muted)]">
            Não foi possível realizar {items.length === 1 ? 'o exame abaixo' : 'os exames abaixo'}.{' '}
            <strong className="text-[var(--pt-text)]">Nada disso será cobrado.</strong>{' '}
            Escolha se prefere uma nova coleta.
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      <ul className="mt-5 space-y-3">
        {items.map(it => {
          const decided = done[it.serviceLineId]
          return (
            <li key={it.serviceLineId} className="rounded-xl border border-[var(--pt-accent-light)] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--pt-text)]">
                    {it.examName} <span className="font-normal text-[var(--pt-muted-soft)]">· {it.petName}</span>
                  </p>
                  <p className="mt-0.5 text-[13px] text-[var(--pt-accent-strong)]">Motivo: {it.reason}</p>
                  {it.note && <p className="mt-0.5 text-[13px] text-[var(--pt-muted)]">{it.note}</p>}
                  <p className="mt-1 text-[11px] text-[var(--pt-muted-soft)]">
                    {it.osNumber ? `OS ${it.osNumber} · ` : ''}{fmt(it.rejectedAt)}
                  </p>
                </div>

                {decided ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pt-accent-faint)] px-3 py-1.5 text-xs font-semibold text-[var(--pt-primary)]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {decided === 'recollect' ? 'Recoleta solicitada' : 'Sem recoleta'}
                  </span>
                ) : (
                  <div className="flex flex-shrink-0 flex-wrap gap-2">
                    <button onClick={() => respond(it.serviceLineId, 'recollect')} disabled={busyId === it.serviceLineId}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--pt-primary)] px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-[var(--pt-primary-dark)] disabled:opacity-50">
                      {busyId === it.serviceLineId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
                      Solicitar recoleta
                    </button>
                    <button onClick={() => respond(it.serviceLineId, 'no_recollect')} disabled={busyId === it.serviceLineId}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--pt-border)] bg-white px-3.5 py-2 text-xs font-semibold text-[var(--pt-muted)] transition hover:bg-[var(--pt-tint)] disabled:opacity-50">
                      <Ban className="h-3.5 w-3.5" /> Não recoletar
                    </button>
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
