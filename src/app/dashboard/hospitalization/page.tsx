import { redirect } from 'next/navigation'
import { requireModuleAccess } from '@/lib/server/require-module'
import { getHospitalizationsBoard } from '@/lib/actions/hospitalizations'
import HospitalizationKanban from '@/components/hospitalization/HospitalizationKanban'

export const metadata = { title: 'Internação | SysVetMax' }

export default async function HospitalizationPage() {
  const profile = await requireModuleAccess('hospitalization')

  const boardResult = await getHospitalizationsBoard()
  
  const board = 'error' in boardResult
    ? { observation: [], ward: [], icu: [], ready_for_discharge: [] }
    : boardResult
  
  return (
    <main className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6">
      <HospitalizationKanban
        initialBoard={board}
        clinicId={profile.clinic_id}
      />
    </main>
  )
}
