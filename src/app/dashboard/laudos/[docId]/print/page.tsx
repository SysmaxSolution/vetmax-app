import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCanvaPatientDocument } from '@/lib/actions/canva-templates'
import LaudoPrintable from '@/components/canva/LaudoPrintable'

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
    .select('patient_id, consultation_id')
    .eq('id', docId)
    .single()

  let patientName: string | undefined
  let species: string | undefined
  let breed: string | undefined
  let sex: string | undefined
  let vetName: string | undefined
  let crmv: string | undefined

  if (doc) {
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase.from('patients').select('name, species, breed, sex').eq('id', doc.patient_id).single(),
      supabase.from('consultations').select('professional_id').eq('id', doc.consultation_id).single(),
    ])
    patientName = p?.name ?? undefined
    species = p?.species ?? undefined
    breed = p?.breed ?? undefined
    sex = p?.sex ?? undefined

    if (c?.professional_id) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('full_name, crmv')
        .eq('id', c.professional_id)
        .single()
      vetName = prof?.full_name ?? undefined
      crmv = prof?.crmv ?? undefined
    }
  }

  const patient = {
    patient_name: patientName,
    species,
    breed,
    sex,
    date: new Date().toLocaleDateString('pt-BR'),
    vet_name: vetName,
    crmv,
  }

  // Contexto para resolver Dynamic Tags do Canvas Visual (quando o template
  // tem canvas_state — o motor visual lê tutor/pet/consulta/vet via path).
  const resolveContext = {
    patient: { name: patientName, species, breed, sex },
    consultation: { date: new Date().toLocaleDateString('pt-BR') },
    vet: { full_name: vetName, crmv },
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
