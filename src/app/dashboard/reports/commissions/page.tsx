import { getCommissionsReport } from '@/lib/actions/commissions'
import { TrendingUp, User, AlertCircle, BadgeDollarSign } from 'lucide-react'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Pendente', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  paid:      { label: 'Pago',     color: 'text-green-600 bg-green-50 border-green-200' },
  cancelled: { label: 'Cancelado', color: 'text-slate-400 bg-slate-50 border-slate-200' },
}

export default async function CommissionsReportPage() {
  const result = await getCommissionsReport()
  const isError = !Array.isArray(result)
  const reports = isError ? [] : result

  const totalAll     = reports.reduce((s, r) => s + r.total_amount, 0)
  const pendingAll   = reports.reduce((s, r) => s + r.pending_amount, 0)

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-blue-600" />
            Relatório de Comissões
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Lançamentos automáticos em Contas a Pagar gerados pelas regras de comissão
          </p>
        </div>

        {/* Erro de permissão */}
        {isError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {(result as any).error}
          </div>
        )}

        {/* Resumo geral */}
        {!isError && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p className="text-xs text-slate-500 mb-1">Total em Comissões</p>
              <p className="text-2xl font-bold text-slate-900">R$ {totalAll.toFixed(2)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p className="text-xs text-slate-500 mb-1">Pendente de Pagamento</p>
              <p className="text-2xl font-bold text-amber-600">R$ {pendingAll.toFixed(2)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm col-span-2 sm:col-span-1">
              <p className="text-xs text-slate-500 mb-1">Profissionais com Comissão</p>
              <p className="text-2xl font-bold text-blue-600">{reports.length}</p>
            </div>
          </div>
        )}

        {/* Sem registros */}
        {!isError && reports.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-10 text-center shadow-sm">
            <BadgeDollarSign className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Nenhuma comissão registrada</p>
            <p className="text-sm text-slate-400 mt-1">
              Configure regras em <strong>Configurações → Comissões</strong> para iniciar o rastreamento automático.
            </p>
          </div>
        )}

        {/* Lista por profissional */}
        {!isError && reports.map(prof => (
          <div key={prof.professional_id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Cabeçalho do profissional */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-400" />
                <span className="font-semibold text-slate-800">{prof.professional_name}</span>
                <span className="text-xs text-slate-400">({prof.entry_count} lançamento{prof.entry_count !== 1 ? 's' : ''})</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-900">R$ {prof.total_amount.toFixed(2)}</p>
                {prof.pending_amount > 0 && (
                  <p className="text-xs text-amber-600">R$ {prof.pending_amount.toFixed(2)} pendente</p>
                )}
              </div>
            </div>

            {/* Lançamentos */}
            <div className="divide-y divide-slate-100">
              {prof.entries.map(entry => {
                const s = STATUS_LABELS[entry.status] ?? STATUS_LABELS.pending
                return (
                  <div key={entry.id} className="flex items-start justify-between gap-4 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-700 truncate">{entry.description}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Vencimento: {new Date(entry.due_date).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${s.color}`}>
                        {s.label}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">
                        R$ {entry.amount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}
