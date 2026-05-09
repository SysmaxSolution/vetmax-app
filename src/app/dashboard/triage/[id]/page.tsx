import { getTriageConsultation, getTriageRecordById } from '@/lib/actions/triage'
import { getTemplates } from '@/lib/actions/templates'
import { getClinicSettingsConfig } from '@/lib/actions/clinic-settings'
import { getPatientVaccines } from '@/lib/actions/vaccines'
import TriageForm from '@/components/triage/TriageForm'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const metadata = {
  title: 'Triagem - VetMax',
}

interface TriageScreenProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string }>
}

export default async function TriageScreen({
  params,
  searchParams,
}: TriageScreenProps) {
  const { id } = await params
  const { edit } = await searchParams

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

  const [consultationResult, triageRecordResult, templatesResult, settingsResult] = await Promise.all([
    getTriageConsultation(id),
    getTriageRecordById(id),
    getTemplates(),
    getClinicSettingsConfig(),
  ])

  const triageRequiredFields = 'error' in settingsResult ? ['weight', 'temperature', 'chief_complaint'] : settingsResult.triage_required_fields

  // Prefer consultation data; fall back to triage_record
  const result = !('error' in consultationResult)
    ? consultationResult
    : triageRecordResult

  const templates  = 'error' in templatesResult ? [] : templatesResult
  const isEditMode = edit === 'true'

  if ('error' in result) {
    return (
      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
        <div className="rounded-xl border-2 border-red-400 bg-red-50 p-8">
          <h1 className="text-2xl font-bold text-red-900 mb-2">
            🚨 ERRO AO CARREGAR TRIAGEM
          </h1>
          <p className="text-red-800 font-semibold mb-4">
            Consulta ID: <code className="bg-red-100 px-2 py-0.5 rounded">{id}</code>
          </p>
          <p className="text-red-700 mb-6 text-lg">
            Mensagem: <strong>{result.error}</strong>
          </p>
          <pre className="bg-red-100 rounded-lg p-4 text-sm text-red-900 overflow-x-auto">
            {JSON.stringify({ consultationId: id, error: result.error }, null, 2)}
          </pre>
          <p className="mt-4 text-xs text-red-600">
            Verifique o terminal do Next.js para o log completo do Supabase (--- DEBUG TRIAGEM ---).
          </p>
        </div>
      </div>
    )
  }

  const vaccinesResult = await getPatientVaccines(result.patient.id)
  const initialVaccines = 'error' in vaccinesResult ? [] : vaccinesResult

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
      <TriageForm
        consultation={result}
        isEditMode={isEditMode}
        templates={templates}
        initialVaccines={initialVaccines}
        triageRequiredFields={triageRequiredFields}
      />
    </div>
  )
}
