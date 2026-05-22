import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVetConsultation } from '@/lib/actions/vet'
import { getTemplates } from '@/lib/actions/templates'
import { getPatientDocuments } from '@/lib/actions/documents'
import { getAppliedMedications } from '@/lib/actions/pharmacy'
import { getAttachments } from '@/lib/actions/attachments'
import { getPatientVaccines } from '@/lib/actions/vaccines'
import { getInsuranceCard } from '@/lib/actions/insurance-coverage'
import ConsultationDetail from '@/components/vet/ConsultationDetail'
import type { FlowConfig } from '@/lib/actions/clinic-settings'

export const metadata = { title: 'Consultório | SysVetMax' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function VetConsultationPage({ params }: Props) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, role, clinic_id, clinics(name)')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) redirect('/onboarding')

  const clinicName = (profile.clinics as unknown as { name: string } | null)?.name ?? 'Minha Clínica'
  const [vetResult, templatesResult, docsResult, medsResult, clinicRow] = await Promise.all([
    getVetConsultation(id),
    getTemplates(),
    getPatientDocuments(id),
    getAppliedMedications(id),
    admin.from('clinics').select('flow_config').eq('id', profile.clinic_id).single(),
  ])

  if ('error' in vetResult) redirect('/dashboard/vet')

  const templates          = 'error' in templatesResult ? [] : templatesResult
  const initialDocuments   = 'error' in docsResult      ? [] : docsResult
  const initialMedications = 'error' in medsResult      ? [] : medsResult
  const flowConfig         = (clinicRow.data?.flow_config as FlowConfig | null) ?? { vet_merged_modules: [] }

  const [attachResult, vaccinesResult, insuranceCardResult] = await Promise.all([
    getAttachments(vetResult.patient.id, id),
    getPatientVaccines(vetResult.patient.id),
    getInsuranceCard(vetResult.patient.id),
  ])
  const initialAttachments = 'error' in attachResult   ? [] : attachResult
  const initialVaccines    = 'error' in vaccinesResult ? [] : vaccinesResult
  const insuranceCard      = 'error' in insuranceCardResult ? null : insuranceCardResult

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 print:hidden">
      <ConsultationDetail
        consultation={vetResult}
        clinicName={clinicName}
        clinicId={profile.clinic_id}
        templates={templates}
        initialDocuments={initialDocuments}
        initialMedications={initialMedications}
        initialAttachments={initialAttachments}
        initialVaccines={initialVaccines}
        flowConfig={flowConfig}
        userRole={profile.role}
        currentUserId={user.id}
        insuranceCard={insuranceCard}
      />
    </div>
  )
}
