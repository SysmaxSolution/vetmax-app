import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import ManagementNav from '@/components/management/ManagementNav'

export default async function ManagementLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let isSysmax = false
  if (user) {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('is_sysmax')
      .eq('id', user.id)
      .single()
    isSysmax = !!profile?.is_sysmax
  }

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Gestão da Clínica</h1>
        <p className="mt-0.5 text-sm text-slate-500">Templates, configurações e usuários</p>
      </div>
      <Suspense>
        <ManagementNav showMonitoramento={isSysmax} />
      </Suspense>
      {children}
    </div>
  )
}
