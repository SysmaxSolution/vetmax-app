import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ImagingWorkspace from '@/components/imaging/ImagingWorkspace'
import { listImagingStudies } from '@/lib/actions/imaging'
import { listPartnerClinics } from '@/lib/actions/partner-clinics'
import { getCatalog } from '@/lib/actions/catalog'

export const metadata = { title: 'Imagem & Laudos | SysVetMax' }

export default async function ImagingPage() {
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

  const { data: clinicRow } = await supabase.from('clinics').select('active_modules').eq('id', profile.clinic_id).single()
  const mods = clinicRow?.active_modules as string[] | null
  if (mods && !mods.includes('exams')) redirect('/dashboard')

  const [studiesResult, partnersResult, catalogResult] = await Promise.all([
    listImagingStudies(),
    listPartnerClinics({ is_active: true }),
    getCatalog(),
  ])

  const studies  = 'error' in studiesResult  ? [] : studiesResult
  const partners = 'error' in partnersResult ? [] : partnersResult
  const services = Array.isArray(catalogResult)
    ? catalogResult.filter(c => c.item_type === 'exam' && c.is_active)
        .map(c => ({ id: c.id, name: c.name, publishToPortal: c.publish_to_portal }))
    : []

  return (
    <ImagingWorkspace
      studies={studies}
      partners={partners.map(p => ({ id: p.id, name: p.name }))}
      services={services}
      role={(profile.role as string) ?? ''}
    />
  )
}
