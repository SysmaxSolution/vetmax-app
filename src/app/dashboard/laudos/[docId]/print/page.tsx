import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { loadCanvaPatientDocument } from '@/lib/actions/canva-templates'
import LaudoPrintable from '@/components/canva/LaudoPrintable'
import { buildResolveContext } from '@/lib/canva/resolve-context'
import { parseMedicamentosText } from '@/lib/canva/parse-medicamentos'
import { listClinicFonts } from '@/lib/actions/clinic-fonts'
import { headers } from 'next/headers'
import { buildDocVerificationContext } from '@/lib/canva/doc-verification'

async function getOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  if (host) return `${proto}://${host}`
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://sysvetmax-dev.vercel.app'
}

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

  const [loaded, clinicFonts] = await Promise.all([
    loadCanvaPatientDocument(docId),
    listClinicFonts(),
  ])

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

  // Autenticidade: ctx.doc (código, URL, QR em SVG, emissor) consumido pelo
  // elemento qr_validation e pelas tags doc.verify_code / doc.verify_url.
  // doc.page / doc.total_pages são injetados por página pelo LaudoPrintable.
  resolveContext.doc = await buildDocVerificationContext({
    verifyCode: loaded.verify_code,
    origin: await getOrigin(),
    signedAt: loaded.signed_at,
    signerName: loaded.signer_name,
    signerCrmv: loaded.signer_crmv,
  })

  // Fallback do Repeater de prescrições: quando a consulta NÃO tem
  // entradas na tabela `prescriptions` mas o vet digitou medicações no
  // campo livre (static_fields.medicamentos), parseia o texto em itens
  // virtuais para que o repeater renderize a receita conforme o salvo.
  const ctxConsult = resolveContext.consultation as Record<string, unknown> | undefined
  const livePrescriptions = Array.isArray(ctxConsult?.prescriptions) ? ctxConsult!.prescriptions as unknown[] : []
  const livePosologia = loaded.content?.static_fields?.posologia
  const liveOrientacoes = loaded.content?.static_fields?.observacoes
  if (ctxConsult && livePrescriptions.length === 0) {
    const parsed = parseMedicamentosText(loaded.content?.static_fields?.medicamentos ?? '')
    if (parsed.length > 0) {
      // Anexa posologia/orientações comuns como sufixo no primeiro item
      // se elas não existirem por linha — vet costuma escrever uma vez.
      if (livePosologia && !parsed[0].frequency) parsed[0].frequency = livePosologia
      if (liveOrientacoes) {
        for (const p of parsed) if (!p.orientation) p.orientation = liveOrientacoes
      }
      ctxConsult.prescriptions = parsed
    }
  }

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
      clinicFonts={clinicFonts}
    />
  )
}
