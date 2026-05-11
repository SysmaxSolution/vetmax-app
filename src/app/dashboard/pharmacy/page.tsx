import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getPharmacyStockV2 } from '@/lib/actions/stock'
import PharmacyWorkspace from '@/components/pharmacy/PharmacyWorkspace'

export const metadata = { title: 'Estoque | SysVetMax' }

export default async function PharmacyPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role, clinic_id')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'vet'].includes(profile.role)) redirect('/dashboard')

  if (profile.clinic_id) {
    const { data: clinicRow } = await supabase.from('clinics').select('active_modules').eq('id', profile.clinic_id).single()
    const mods = clinicRow?.active_modules as string[] | null
    if (mods && !mods.includes('pharmacy')) redirect('/dashboard')
  }

  const stockResult = await getPharmacyStockV2()
  const stock = Array.isArray(stockResult) ? stockResult : []

  return <PharmacyWorkspace stock={stock} userRole={profile.role as 'admin' | 'vet'} />
}
