// Laudo de hemograma — tela imprimível alimentada pelos resultados que o
// aparelho enviou (exam_results + exam_result_graphs). Rota IRMÃ de
// /dashboard/exams/[id] de propósito: aquela página é `print:hidden` inteira.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getExamReportData } from '@/lib/lab/exam-report-data'
import HemogramReportSheet from '@/components/exams/HemogramReportSheet'
import ReportToolbar from '@/components/exams/ReportToolbar'

export const dynamic = 'force-dynamic'

export default async function ExamReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) redirect('/onboarding')

  const data = await getExamReportData(admin, profile.clinic_id as string, id)

  if (!data) {
    return (
      <div className="p-8 text-sm text-slate-600">
        Atendimento não encontrado nesta clínica.{' '}
        <Link href="/dashboard/exams" className="text-emerald-700 underline">Voltar à fila de exames</Link>
      </div>
    )
  }

  if (data.status === 'empty') {
    return (
      <div className="p-8">
        <ReportToolbar consultationId={id} released={false} releasedAt={null} />
        <p className="mt-6 text-sm text-slate-600">
          Ainda não há resultado para este atendimento. Assim que o analisador enviar
          (ou alguém importar o HL7), o rascunho aparece aqui para conferência.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <ReportToolbar consultationId={id} released={data.status === 'released'} releasedAt={data.released_at} />
      <HemogramReportSheet data={data} />
    </div>
  )
}
