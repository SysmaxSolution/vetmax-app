import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCentroCirurgico } from '@/lib/actions/clinic-settings'
import { getSurgeriesBoard } from '@/lib/actions/surgeries'
import SurgeryKanban from '@/components/hospitalization/SurgeryKanban'
import AutoRefresh from '@/components/shared/AutoRefresh'
import MapaDoDiaPanel from '@/components/surgery/MapaDoDiaPanel'

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
    <main className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6 animate-enter">
      <AutoRefresh />
      <SurgeryKanban initialBoard={initialBoard} clinicId={profile.clinic_id as string} />

      {/* Mapa do dia (item 4.3): substitui o quadro mantido a mao. Vem DEPOIS do
          kanban de proposito — o kanban e o trabalho de agora, o mapa e a visao
          do dia inteiro, incluindo o que ainda nao comecou. */}
      <div className="mt-6">
        <MapaDoDiaPanel />
      </div>
    </main>
  )
}
