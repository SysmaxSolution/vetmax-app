import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getDailySales } from '@/lib/actions/sales'
import SalesWorkspace from '@/components/sales/SalesWorkspace'

export const metadata = { title: 'Vendas — SysVetMax' }

export default async function SalesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('clinic_id, role, clinics(name)')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) redirect('/onboarding')

  const allowedRoles = ['admin', 'owner', 'manager', 'receptionist', 'assistant']
  if (!allowedRoles.includes(profile.role)) redirect('/dashboard')

  const salesResult = await getDailySales()
  const dailySales  = Array.isArray(salesResult) ? salesResult : []

  const clinicName = (profile.clinics as unknown as { name: string } | null)?.name ?? 'Clínica'

  return (
    <SalesWorkspace
      clinicId={profile.clinic_id}
      clinicName={clinicName}
      dailySales={dailySales}
    />
  )
}
