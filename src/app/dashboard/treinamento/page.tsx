import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTrainingCatalog } from '@/lib/actions/training'
import TrainingAcademy from '@/components/training/TrainingAcademy'

export const metadata = { title: 'Treinamento | SysVetMax' }

export default async function TreinamentoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Gate: a clínica precisa ter a Academia ativada (Gestão > Configurações).
  // SysMax (suporte) sempre acessa. Acervo é global; ativação é por clínica.
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id, is_sysmax').eq('id', user.id).single()
  if (!profile?.clinic_id) redirect('/dashboard')
  if (!profile.is_sysmax) {
    const { data: clinic } = await admin
      .from('clinics').select('flow_config').eq('id', profile.clinic_id).single()
    const usaTreinamento = (clinic?.flow_config as { usa_treinamento?: boolean } | null)?.usa_treinamento === true
    if (!usaTreinamento) redirect('/dashboard')
  }

  const cat = await getTrainingCatalog()
  if ('error' in cat) redirect('/dashboard')

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6 animate-enter">
      <TrainingAcademy user={cat.user} videos={cat.videos} />
    </main>
  )
}
