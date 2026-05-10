import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getVetConsultation } from '@/lib/actions/vet'
import { getTemplates } from '@/lib/actions/templates'
import { getPatientDocuments } from '@/lib/actions/documents'
import { getAttachments } from '@/lib/actions/attachments'
import ExamDetail from '@/components/exams/ExamDetail'

export const metadata = { title: 'Exames — Laudo | SysVetMax' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function ExamDetailPage({ params }: Props) {
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

  const [consultResult, templatesResult, docsResult] = await Promise.all([
    getVetConsultation(id),
    getTemplates(),
    getPatientDocuments(id),
  ])

  if ('error' in consultResult) redirect('/dashboard/exams')

  // Só permite acesso se a consulta está em waiting_exam
  if (consultResult.status !== 'waiting_exam') redirect('/dashboard/exams')

  const templates         = 'error' in templatesResult ? [] : templatesResult
  const initialDocuments  = 'error' in docsResult      ? [] : docsResult

  const attachResult      = await getAttachments(consultResult.patient.id, id)
  const initialAttachments = 'error' in attachResult ? [] : attachResult

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 print:hidden">
      <ExamDetail
        consultation={consultResult}
        clinicName={clinicName}
        templates={templates}
        initialDocuments={initialDocuments}
        initialAttachments={initialAttachments}
      />
    </div>
  )
}
