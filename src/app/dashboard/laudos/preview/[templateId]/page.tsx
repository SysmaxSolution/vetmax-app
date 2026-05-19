import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LaudoPrintable from '@/components/canva/LaudoPrintable'
import { buildPreviewContext } from '@/lib/canva/resolve-context'
import { hydrateCanvasState, type CanvasState } from '@/lib/canva/canvas-state'
import type { CanvaContentJson, CanvaTemplateConfig, CanvaBlockStyle } from '@/lib/canva/types'

interface Props {
  params: Promise<{ templateId: string }>
  searchParams: Promise<{ auto?: string }>
}

export default async function PreviewTemplatePage({ params, searchParams }: Props) {
  const { templateId } = await params
  const { auto } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) redirect('/dashboard?canva_preview_error=no_clinic')

  const { data: tpl } = await supabase
    .from('document_templates')
    .select(`
      name, type, canvas_state,
      background_image_url, margin_top, margin_bottom, margin_left, margin_right, block_style
    `)
    .eq('id', templateId)
    .eq('clinic_id', profile.clinic_id)
    .single()

  if (!tpl) redirect('/dashboard/management?canva_preview_error=template_not_found')

  const canvasState: CanvasState = hydrateCanvasState(tpl.canvas_state)
  const resolveContext = await buildPreviewContext(supabase, profile.clinic_id, user.id)

  const config: CanvaTemplateConfig = {
    background_image_url: tpl.background_image_url ?? canvasState.page.backgroundImageUrl ?? null,
    margins: {
      top: Number(tpl.margin_top ?? 2),
      bottom: Number(tpl.margin_bottom ?? 2),
      left: Number(tpl.margin_left ?? 2),
      right: Number(tpl.margin_right ?? 2),
    },
    block_style: (tpl.block_style as CanvaBlockStyle) ?? 'solid',
  }

  // Content compatível com fallback do CanvaA4Preview (motor antigo).
  // Quando o template usa canvas_state, esses dados são ignorados.
  const content: CanvaContentJson = {
    static_fields: {
      medicamentos: 'Dipirona 25mg/mL — 1 mL a cada 8h por 5 dias\nTramadol 50mg — 50mg a cada 12h por 5 dias',
      posologia: '1 mL a cada 8h após a alimentação',
      observacoes: 'Pré-visualização — dados de exemplo (Toby).',
    },
    dynamic_fields: [
      { key: 'Pressão Arterial', value: '120/80 mmHg' },
      { key: 'Glicemia', value: '95 mg/dL' },
    ],
  }

  const patient = (resolveContext.patient as Record<string, unknown>) ?? {}
  const vet = (resolveContext.vet as Record<string, unknown>) ?? {}

  return (
    <LaudoPrintable
      documentTitle={`${tpl.name} — Pré-visualização`}
      config={config}
      content={content}
      canvasState={canvasState}
      resolveContext={resolveContext}
      patient={{
        patient_name: String(patient.name ?? ''),
        species:      String(patient.species ?? ''),
        breed:        String(patient.breed ?? ''),
        sex:          String(patient.sex ?? ''),
        date:         new Date().toLocaleDateString('pt-BR'),
        vet_name:     String(vet.full_name ?? ''),
        crmv:         String(vet.crmv ?? ''),
      }}
      autoPrint={auto === '1'}
    />
  )
}
