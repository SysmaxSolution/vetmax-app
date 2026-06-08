import { requireModuleAccess } from '@/lib/server/require-module'
import {
  listBillingDocuments, getBillingSummary, listClinicProfessionals,
} from '@/lib/actions/billing-documents'
import BillingWorkspace from '@/components/billing/BillingWorkspace'

export const metadata = { title: 'Faturamento | SysVetMax' }

export default async function BillingPage() {
  const profile = await requireModuleAccess('billing')
  const clinicName = (profile.clinics as unknown as { name: string } | null)?.name ?? 'Minha Clínica'

  const [docsRes, summaryRes, profsRes] = await Promise.all([
    listBillingDocuments(),
    getBillingSummary(),
    listClinicProfessionals(),
  ])

  const documents     = Array.isArray(docsRes)  ? docsRes  : []
  const summary       = 'error' in summaryRes   ? null     : summaryRes
  const professionals = Array.isArray(profsRes) ? profsRes : []

  return (
    <BillingWorkspace
      clinicId={profile.clinic_id}
      clinicName={clinicName}
      currentUserId={profile.id}
      initialDocuments={documents}
      initialSummary={summary}
      professionals={professionals}
    />
  )
}
