'use client'

/**
 * Badge do número do orçamento vinculado a uma consulta — Faturamento Fase 2.
 *
 * Aparece no cabeçalho dos módulos clínicos (Triagem, Consultório, Cirurgia,
 * Internação) para que a equipe saiba que aquele atendimento nasceu de um
 * orçamento. Silencioso quando não há orçamento vinculado (não ocupa espaço).
 */

import { useEffect, useState } from 'react'
import { getConsultationQuotations } from '@/lib/actions/billing-documents'

interface Props {
  consultationId: string | null | undefined
  className?: string
}

export default function ConsultationQuotationBadge({ consultationId, className }: Props) {
  const [quotes, setQuotes] = useState<Array<{ doc_number: string; is_billed: boolean }>>([])

  useEffect(() => {
    if (!consultationId) { setQuotes([]); return }
    let cancelled = false
    getConsultationQuotations(consultationId).then(res => {
      if (cancelled || 'error' in res) return
      setQuotes(res.map(q => ({ doc_number: q.doc_number, is_billed: q.is_billed })))
    })
    return () => { cancelled = true }
  }, [consultationId])

  if (quotes.length === 0) return null

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className ?? ''}`}>
      {quotes.map(q => (
        <span
          key={q.doc_number}
          title={q.is_billed ? 'Orçamento já faturado no caixa' : 'Atendimento vinculado a este orçamento'}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
            q.is_billed ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700'
          }`}
        >
          🧾 {q.doc_number}{q.is_billed ? ' · faturado' : ''}
        </span>
      ))}
    </span>
  )
}
