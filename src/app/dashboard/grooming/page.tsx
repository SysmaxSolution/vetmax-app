import { requireModuleAccess } from '@/lib/server/require-module'
import { getGroomingBoard } from '@/lib/actions/grooming'
import GroomingKanban from '@/components/grooming/GroomingKanban'

export const metadata = { title: 'Banho e Tosa | SysVetMax' }

export default async function GroomingPage() {
  const profile = await requireModuleAccess('grooming')

  const boardResult = await getGroomingBoard()
  const board = 'error' in boardResult
    ? { scheduled: [], received: [], bathing: [], grooming: [], waiting_pickup: [], delivered: [] }
    : boardResult

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 sm:px-6">
      <GroomingKanban
        initialBoard={board}
        clinicId={profile.clinic_id}
      />
    </div>
  )
}
