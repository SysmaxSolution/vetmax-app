'use client'

// Barra de ações do laudo (fora da folha, some na impressão).
// A regra de liberação é a que já existe: rascunho não imprime nem assina —
// o Médico Veterinário confere e libera no painel de resultados primeiro.

import Link from 'next/link'
import { ArrowLeft, Printer, Lock } from 'lucide-react'

export default function ReportToolbar({
  consultationId, released, releasedAt,
}: { consultationId: string; released: boolean; releasedAt: string | null }) {
  return (
    <div className="print:hidden sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <Link
        href={`/dashboard/exams/${consultationId}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar ao exame
      </Link>

      <span className="text-sm font-medium text-slate-700">Laudo de hemograma</span>

      {released ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
          <Lock className="h-3.5 w-3.5" />
          Liberado{releasedAt ? ` em ${new Date(releasedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
          Rascunho — aguardando conferência e liberação do Médico Veterinário
        </span>
      )}

      <div className="ml-auto">
        {released ? (
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </button>
        ) : (
          <button
            type="button"
            disabled
            title="Libere o resultado em Conferir e liberar para imprimir o laudo assinado."
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-500"
          >
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </button>
        )}
      </div>
    </div>
  )
}
