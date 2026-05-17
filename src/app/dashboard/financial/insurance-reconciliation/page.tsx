import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FileSpreadsheet } from 'lucide-react'
import { listImportedRemittances } from '@/lib/actions/petlove-import'
import PetloveReconciliationClient from '@/components/financial/insurance/PetloveReconciliationClient'

export const metadata = { title: 'Conciliação de Convênios | SysVetMax' }

export default async function InsuranceReconciliationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('role, clinic_id').eq('id', user.id).single()
  if (!profile || !['admin', 'owner', 'manager'].includes(profile.role)) {
    redirect('/dashboard')
  }

  // Module guard: só acessa se 'petlove_reconciliation' estiver ativo na clínica
  const { data: clinic } = await admin
    .from('clinics').select('active_modules').eq('id', profile.clinic_id).single()
  const modules = (clinic?.active_modules as string[] | null) ?? []
  if (!modules.includes('petlove_reconciliation')) {
    redirect('/dashboard/financial')
  }

  const remittances = await listImportedRemittances()
  const initialList = Array.isArray(remittances) ? remittances : []

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <Link
          href="/dashboard/financial"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Financeiro
        </Link>

        <header className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
            <FileSpreadsheet className="h-6 w-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Conciliação de Convênios</h1>
            <p className="text-sm text-slate-500 mt-1">
              Importe a planilha mensal da Petlove para conciliar repasses, atualizar cadastros e identificar glosas.
            </p>
          </div>
        </header>

        <PetloveReconciliationClient initialRemittances={initialList} />
      </main>
    </div>
  )
}
