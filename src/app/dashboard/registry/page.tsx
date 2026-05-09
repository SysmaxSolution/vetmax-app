import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { listSuppliers } from '@/lib/actions/suppliers'
import RegistryWorkspace from '@/components/registry/RegistryWorkspace'

export const metadata = { title: 'Cadastros Gerais | VetMax' }

const ALLOWED_ROLES = ['admin', 'owner', 'manager', 'accountant', 'receptionist']

export default async function RegistryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, role, clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) redirect('/onboarding')
  if (!ALLOWED_ROLES.includes(profile.role)) redirect('/dashboard')

  const suppliersResult = await listSuppliers({ is_active: true })
  const suppliers = 'error' in suppliersResult ? [] : suppliersResult

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <RegistryWorkspace
        initialSuppliers={suppliers}
        userRole={profile.role}
      />
    </div>
  )
}
