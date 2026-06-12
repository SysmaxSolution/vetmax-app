'use client'

import { useEffect, useState } from 'react'
import { Info, History, AlertTriangle, CheckCircle2 } from 'lucide-react'
import CashierSessionControl from './CashierSessionControl'
import { listClosedSessions, type CashierSession } from '@/lib/actions/cashier-sessions'

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface Props {
  session:   CashierSession | null
  userRole:  string
  onRefresh: () => void
  onToast:   (msg: string, type: 'success' | 'error') => void
}

type ClosedSession = CashierSession & { opened_by_name?: string; closed_by_name?: string }

export default function CashierTabSession({ session, userRole, onRefresh, onToast }: Props) {
  const canManage  = ['admin', 'owner', 'manager'].includes(userRole)
  const canHistory = ['admin', 'owner', 'manager', 'accountant'].includes(userRole)

  const [history, setHistory] = useState<ClosedSession[]>([])
  useEffect(() => {
    if (!canHistory) return
    listClosedSessions(20).then(res => { if (!('error' in res)) setHistory(res) })
  }, [canHistory, session?.id])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Gestão de Sessão</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Controle de abertura e fechamento do caixa diário
        </p>
      </div>

      <CashierSessionControl
        session={session}
        userRole={userRole}
        onRefresh={onRefresh}
        onToast={onToast}
      />

      {!canManage && (
        <div className="flex items-start gap-3 rounded-xl bg-slate-50 border border-slate-200 p-4">
          <Info className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-slate-500">
            Apenas administradores, proprietários e gerentes podem abrir e fechar o caixa.
          </p>
        </div>
      )}

      {session && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">Detalhes da Sessão Atual</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-slate-400">Abertura</p>
              <p className="font-medium text-slate-800">
                {new Date(session.opened_at).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Fundo de Troco</p>
              <p className="font-medium text-slate-800">
                {session.opening_balance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            {session.notes && (
              <div className="col-span-2">
                <p className="text-xs text-slate-400">Observações</p>
                <p className="font-medium text-slate-800">{session.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Histórico de fechamentos com divergência (auditoria por operador) */}
      {canHistory && history.length > 0 && (
        <div data-mentor-step="cashier-historico" className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100">
            <History className="h-4 w-4 text-slate-400" />
            <h3 className="text-sm font-semibold text-slate-700">Histórico de Fechamentos</h3>
            <span className="text-xs text-slate-400">· últimos {history.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">Fechado em</th>
                  <th className="px-4 py-2.5">Operador</th>
                  <th className="px-4 py-2.5 text-right">Fundo</th>
                  <th className="px-4 py-2.5 text-right">Saldo Final</th>
                  <th className="px-4 py-2.5 text-right">Conferência</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {history.map(s => {
                  const diff = s.difference != null ? Number(s.difference) : null
                  const ok = diff != null && Math.abs(diff) < 0.01
                  return (
                    <tr key={s.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                        {s.closed_at ? new Date(s.closed_at).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        }) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{s.closed_by_name ?? s.opened_by_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">{fmt(Number(s.opening_balance ?? 0))}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-slate-900 tabular-nums">
                        {s.closing_balance != null ? fmt(Number(s.closing_balance)) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {diff == null ? (
                          <span className="text-xs text-slate-400">sem conferência</span>
                        ) : ok ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" /> bateu
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-semibold ${diff > 0 ? 'text-blue-600' : 'text-red-600'}`}
                            title={s.closing_notes ?? undefined}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {diff > 0 ? 'sobra' : 'falta'} {fmt(Math.abs(diff))}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
