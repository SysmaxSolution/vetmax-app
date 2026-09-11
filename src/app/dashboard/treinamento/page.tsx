import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTrainingCatalog } from '@/lib/actions/training'
import TrainingAcademy from '@/components/training/TrainingAcademy'

export const metadata = { title: 'Treinamento | SysVetMax' }

export default async function TreinamentoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cat = await getTrainingCatalog()
  if ('error' in cat) redirect('/dashboard')

  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6 animate-enter">
      <TrainingAcademy user={cat.user} videos={cat.videos} />
    </main>
  )
}
