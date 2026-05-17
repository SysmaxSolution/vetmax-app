import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getReviewBundle } from '@/lib/actions/petlove-matching'
import { getProcedureMappingStatus } from '@/lib/actions/petlove-mapping'
import ReviewDashboard from '@/components/financial/insurance/ReviewDashboard'

export const metadata = { title: 'Revisão de Remessa | SysVetMax' }

export default async function RemittanceReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('role, clinic_id').eq('id', user.id).single()
  if (!profile || !['admin', 'owner', 'manager'].includes(profile.role)) {
    redirect('/dashboard')
  }

  // Module guard
  const { data: clinic } = await admin
    .from('clinics').select('active_modules').eq('id', profile.clinic_id).single()
  const modules = (clinic?.active_modules as string[] | null) ?? []
  if (!modules.includes('petlove_reconciliation')) {
    redirect('/dashboard/financial')
  }

  const [bundle, mappingStatus] = await Promise.all([
    getReviewBundle(id),
    getProcedureMappingStatus(id),
  ])
  if ('error' in bundle) notFound()
  const initialMappingRows = Array.isArray(mappingStatus) ? mappingStatus : []

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <Link
          href="/dashboard/financial/insurance-reconciliation"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Conciliação de Convênios
        </Link>

        <ReviewDashboard bundle={bundle} initialMappingRows={initialMappingRows} />
      </main>
    </div>
  )
}
