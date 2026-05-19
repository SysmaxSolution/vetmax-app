import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCanvaPatientDocument } from '@/lib/actions/canva-templates'
import LaudoPrintable from '@/components/canva/LaudoPrintable'
import { buildResolveContext } from '@/lib/canva/resolve-context'

interface Props {
  params: Promise<{ docId: string }>
  searchParams: Promise<{ auto?: string }>
}

export default async function PrintLaudoPage({ params, searchParams }: Props) {
  const { docId } = await params
  const { auto } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const loaded = await loadCanvaPatientDocument(docId)

  const { data: doc } = await supabase
    .from('patient_documents')
    .select('patient_id, consultation_id, clinic_id, created_at')
    .eq('id', docId)
    .single()

  // Para print histórico: usa created_at do doc para que consulta.date,
  // consulta.month_name etc. mostrem a data REAL de quando foi emitido,
  // não a data atual de quem está reimprimindo meses depois.
  const resolveContext = doc
    ? await buildResolveContext(
        supabase, doc.clinic_id, doc.patient_id, doc.consultation_id,
        { documentDate: doc.created_at ? new Date(doc.created_at) : undefined },
      )
    : {}

  const patient = {
    patient_name: (resolveContext.patient as any)?.name,
    species:      (resolveContext.patient as any)?.species,
    breed:        (resolveContext.patient as any)?.breed,
    sex:          (resolveContext.patient as any)?.sex,
    date:         new Date().toLocaleDateString('pt-BR'),
    vet_name:     (resolveContext.vet as any)?.full_name,
    crmv:         (resolveContext.vet as any)?.crmv,
  }

  return (
    <LaudoPrintable
      documentTitle={loaded.document_name}
      config={loaded.config}
      content={loaded.content}
      canvasState={loaded.canvas_state}
      resolveContext={resolveContext}
      patient={patient}
      autoPrint={auto === '1'}
    />
  )
}
