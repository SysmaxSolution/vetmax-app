import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCentroCirurgico } from '@/lib/actions/clinic-settings'
import { getSurgeriesBoard } from '@/lib/actions/surgeries'
import SurgeryKanban from '@/components/hospitalization/SurgeryKanban'

export const metadata = { title: 'Centro Cirúrgico | SysVetMax' }

// Módulo isolado, gated pela feature flag flow_config.centro_cirurgico (Fase 3).
export default async function SurgeryPage() {
  const enabled = await isCentroCirurgico()
  if (!enabled) redirect('/dashboard')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) redirect('/onboarding')

  const board = await getSurgeriesBoard()
  const initialBoard = 'error' in board ? { preparo: [], sala: [], rpa: [] } : board

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6">
      <SurgeryKanban initialBoard={initialBoard} clinicId={profile.clinic_id as string} />
    </main>
  )
}
