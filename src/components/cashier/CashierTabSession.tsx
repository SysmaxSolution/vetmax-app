'use client'

import { Info } from 'lucide-react'
import CashierSessionControl from './CashierSessionControl'
import type { CashierSession } from '@/lib/actions/cashier-sessions'

interface Props {
  session:   CashierSession | null
  userRole:  string
  onRefresh: () => void
  onToast:   (msg: string, type: 'success' | 'error') => void
}

export default function CashierTabSession({ session, userRole, onRefresh, onToast }: Props) {
  const canManage = ['admin', 'owner', 'manager'].includes(userRole)

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
    </div>
  )
}
