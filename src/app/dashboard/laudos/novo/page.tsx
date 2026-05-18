import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NewCanvaLaudoForm from './NewCanvaLaudoForm'
import type { CanvaTemplateConfig } from '@/lib/canva/types'

interface Props {
  searchParams: Promise<{ consultation_id?: string; template_id?: string }>
}

export default async function NewCanvaLaudoPage({ searchParams }: Props) {
  const { consultation_id, template_id } = await searchParams
  if (!consultation_id || !template_id) {
    redirect('/dashboard?canva_error=missing_params')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('clinic_id').eq('id', user.id).single()
  if (!profile?.clinic_id) redirect('/dashboard?canva_error=no_clinic')

  const [{ data: tpl }, { data: consultation }] = await Promise.all([
    supabase
      .from('document_templates')
      .select('id, name, type, background_image_url, margin_top, margin_bottom, margin_left, margin_right, block_style')
      .eq('id', template_id)
      .eq('clinic_id', profile.clinic_id)
      .single(),
    supabase
      .from('consultations')
      .select(`
        id,
        patient_id,
        patients ( id, name, species, breed, sex, birth_date ),
        professional_id,
        profiles!consultations_professional_id_fkey ( full_name, crmv )
      `)
      .eq('id', consultation_id)
      .eq('clinic_id', profile.clinic_id)
      .single(),
  ])

  if (!tpl) redirect('/dashboard/management?canva_error=template_not_found')
  if (!consultation) redirect('/dashboard?canva_error=consultation_not_found')

  const config: CanvaTemplateConfig = {
    background_image_url: tpl.background_image_url ?? null,
    margins: {
      top:    Number(tpl.margin_top    ?? 2),
      bottom: Number(tpl.margin_bottom ?? 2),
      left:   Number(tpl.margin_left   ?? 2),
      right:  Number(tpl.margin_right  ?? 2),
    },
    block_style: (tpl.block_style as 'solid' | 'transparent') ?? 'solid',
  }

  const patient = consultation.patients as any
  const vet = (consultation.profiles as any) ?? {}

  return (
    <NewCanvaLaudoForm
      templateId={tpl.id}
      templateName={tpl.name}
      templateType={tpl.type}
      consultationId={consultation_id}
      patientId={consultation.patient_id}
      patient={{
        patient_name: patient?.name,
        species: patient?.species,
        breed: patient?.breed,
        sex: patient?.sex,
        date: new Date().toLocaleDateString('pt-BR'),
        vet_name: vet?.full_name,
        crmv: vet?.crmv,
      }}
      config={config}
    />
  )
}
