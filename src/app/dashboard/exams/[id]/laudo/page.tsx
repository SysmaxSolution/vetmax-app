// Laudos do atendimento.
//
// Sem `?exame=`, mostra a CAPA: um cartão por exame da OS, cada um com o seu
// estado. Com `?exame=`, monta o laudo daquele exame sozinho.
//
// Por que separado: no laudo real da Clínica Animais cada exame tem a sua
// própria assinatura — o hemograma assina sozinho e cada exame de bioquímica
// assina o seu. Na tabela de preços deles isso é explícito: "21 Hemograma" é
// um item, e "33 Creatinina", "47 Ureia", "46 ALT" são outros. Exame é a
// unidade que se confere, libera, assina e imprime.

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getExamReportData } from '@/lib/lab/exam-report-data'
import HemogramReportSheet from '@/components/exams/HemogramReportSheet'
import ReportToolbar from '@/components/exams/ReportToolbar'
import { FlaskConical, Lock, FileText, ArrowLeft } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ExamReportPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ exame?: string }>
}) {
  const { id } = await params
  const { exame } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) redirect('/onboarding')

  const data = await getExamReportData(admin, profile.clinic_id as string, id, exame ?? null)

  if (!data) {
    return (
      <div className="p-8 text-sm text-slate-600">
        {exame ? 'Exame não encontrado neste atendimento.' : 'Atendimento não encontrado nesta clínica.'}{' '}
        <Link href={`/dashboard/exams/${id}/laudo`} className="text-emerald-700 underline">Ver os laudos do atendimento</Link>
      </div>
    )
  }

  if (data.status === 'empty' && data.exams.length === 0) {
    return (
      <div className="p-8">
        <ReportToolbar consultationId={id} released={false} releasedAt={null} />
        <p className="mt-6 text-sm text-slate-600">
          Ainda não há resultado para este atendimento. Assim que o analisador enviar
          (ou alguém importar o HL7), os laudos aparecem aqui para conferência.
        </p>
      </div>
    )
  }

  // ---- Capa: um laudo por exame -------------------------------------------
  if (!exame) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <Link
            href={`/dashboard/exams/${id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar ao exame
          </Link>
          <span className="text-sm font-medium text-slate-700">
            Laudos de {data.header.patient.name} · OS {data.header.os_number}
          </span>
        </div>

        <div className="mx-auto max-w-3xl px-4 py-8">
          <h1 className="text-lg font-semibold text-slate-800">
            {data.exams.length} exame{data.exams.length > 1 ? 's' : ''} neste atendimento
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cada exame é conferido, liberado e assinado por conta própria — um não
            depende do outro.
          </p>

          <ul className="mt-5 space-y-2">
            {data.exams.map(e => (
              <li key={e.key}>
                <Link
                  href={`/dashboard/exams/${id}/laudo?exame=${encodeURIComponent(e.key)}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-emerald-400"
                >
                  <FlaskConical className="h-4 w-4 flex-shrink-0 text-emerald-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800">{e.title}</span>
                    <span className="block text-xs text-slate-500">
                      {e.total} parâmetro{e.total > 1 ? 's' : ''}
                      {e.group === 'hemograma' ? ' · analisador hematológico' : e.group === 'bioquimico' ? ' · analisador bioquímico' : ''}
                    </span>
                  </span>
                  {e.status === 'released' ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      <Lock className="h-3.5 w-3.5" /> Liberado
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                      Rascunho
                    </span>
                  )}
                  <FileText className="h-4 w-4 flex-shrink-0 text-slate-300" />
                </Link>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-xs leading-relaxed text-slate-400">
            A liberação é por exame. Enquanto houver exame em rascunho, as linhas
            de cobrança do atendimento continuam seguras.
          </p>
        </div>
      </div>
    )
  }

  // ---- Laudo de um exame ---------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-100">
      <ReportToolbar
        consultationId={id}
        released={data.status === 'released'}
        releasedAt={data.released_at}
        examTitle={data.exam?.title ?? null}
        hasOthers={data.exams.length > 1}
      />
      <HemogramReportSheet data={data} />
    </div>
  )
}
