'use client'

import { useState, useCallback } from 'react'
import { CheckCircle2, AlertCircle, LayoutDashboard, Receipt, ArrowDownCircle, Settings } from 'lucide-react'
import { listCashierEntries, getCashierSummary } from '@/lib/actions/core-management'
import { getCashierDashboard, getCurrentSession, listOutflows } from '@/lib/actions/cashier-sessions'
import type { CentralCashierEntry, CashierSummary } from '@/lib/actions/core-management'
import type { CashierDashboard, CashierSession, CashierOutflow } from '@/lib/actions/cashier-sessions'
import type { InvoiceWithDetails } from '@/lib/actions/billing'
import type { PendingGroomingPayment } from '@/lib/actions/grooming'
import CentralCashierWorkspace from './CentralCashierWorkspace'
import CashierDashboardCards from './CashierDashboardCards'
import CashierTabReceivables from './CashierTabReceivables'
import CashierTabOutflows from './CashierTabOutflows'
import CashierTabSession from './CashierTabSession'

type Tab = 'overview' | 'receivables' | 'outflows' | 'session'

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: 'overview',    label: 'Visão Geral',  icon: LayoutDashboard  },
  { key: 'receivables', label: 'Recebimentos', icon: Receipt          },
  { key: 'outflows',    label: 'Saídas',       icon: ArrowDownCircle  },
  { key: 'session',     label: 'Sessão',       icon: Settings         },
]

interface Props {
  initialEntries:          CentralCashierEntry[]
  initialSummary:          CashierSummary | null
  initialDashboard:        CashierDashboard | null
  initialSession:          CashierSession | null
  initialInvoices:         InvoiceWithDetails[]
  initialOutflows:         CashierOutflow[]
  initialGroomingSessions: PendingGroomingPayment[]
  userRole:                string
  clinicId:                string
  today:                   string
  firstOfMonth:            string
}

export default function CashierPageClient({
  initialEntries, initialSummary, initialDashboard, initialSession,
  initialInvoices, initialOutflows, initialGroomingSessions,
  userRole, clinicId, today, firstOfMonth,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [entries,   setEntries]   = useState<CentralCashierEntry[]>(initialEntries)
  const [summary,   setSummary]   = useState<CashierSummary | null>(initialSummary)
  const [dashboard, setDashboard] = useState<CashierDashboard | null>(initialDashboard)
  const [session,   setSession]   = useState<CashierSession | null>(initialSession)
  const [toast,     setToast]     = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const refresh = useCallback(async () => {
    const [newEntries, newSummary, newDashboard, newSession] = await Promise.all([
      listCashierEntries({ from_date: firstOfMonth }),
      getCashierSummary({ from_date: firstOfMonth, to_date: today }),
      getCashierDashboard(today),
      getCurrentSession(),
    ])
    if (!('error' in newEntries))   setEntries(newEntries)
    if (!('error' in newSummary))   setSummary(newSummary)
    if (!('error' in newDashboard)) setDashboard(newDashboard)
    if (newSession && !('error' in newSession)) setSession(newSession)
    else if (!newSession || ('error' in newSession)) setSession(null)
  }, [today, firstOfMonth])

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-lg text-sm font-medium ${
          toast.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.type === 'success'
            ? <CheckCircle2 className="h-4 w-4" />
            : <AlertCircle className="h-4 w-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Caixa</h1>
        <p className="mt-0.5 text-sm text-slate-500">Central de recebimentos, saídas e gestão de sessão</p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                active
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.key === 'receivables' && (initialInvoices.length + initialGroomingSessions.length) > 0 && (
                <span className="ml-1 rounded-full bg-teal-100 text-teal-700 text-xs font-bold px-1.5 py-0.5 leading-none">
                  {initialInvoices.length + initialGroomingSessions.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {dashboard && <CashierDashboardCards dashboard={dashboard} />}
          <CentralCashierWorkspace
            initialEntries={entries}
            summary={summary}
            userRole={userRole}
            sessionId={session?.id}
          />
        </div>
      )}

      {activeTab === 'receivables' && (
        <CashierTabReceivables
          initialInvoices={initialInvoices}
          initialGroomingSessions={initialGroomingSessions}
          clinicId={clinicId}
          onToast={showToast}
        />
      )}

      {activeTab === 'outflows' && (
        <CashierTabOutflows
          initialOutflows={initialOutflows}
          sessionId={session?.id}
          userRole={userRole}
          onToast={showToast}
        />
      )}

      {activeTab === 'session' && (
        <CashierTabSession
          session={session}
          userRole={userRole}
          onRefresh={refresh}
          onToast={showToast}
        />
      )}
    </div>
  )
}
