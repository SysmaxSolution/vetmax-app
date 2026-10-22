import { notFound } from 'next/navigation'
import { getStudyByToken } from '@/lib/actions/imaging'
import { FileImage, FileText, Download, ShieldCheck, Phone, Stethoscope, Clock, AlertTriangle } from 'lucide-react'
import DicomViewer from '@/components/imaging/DicomViewer'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return { title: 'Exame de Imagem', description: 'Resultado de exame de imagem — acesso seguro' }
}

const MODALITY_LABEL: Record<string, string> = {
  radiografia: 'Radiografia', ultrassom: 'Ultrassonografia',
  tomografia: 'Tomografia', ressonancia: 'Ressonância', outro: 'Exame de imagem',
}

function fmtDateTime(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default async function PublicLaudoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await getStudyByToken(token)

  // Link inválido/expirado/revogado → tela amigável (não 404 cru)
  if ('error' in result) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-sm text-center">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <h1 className="text-lg font-bold text-slate-900">{result.error}</h1>
          <p className="text-sm text-slate-500 mt-2">
            Solicite um novo link ao centro de diagnóstico que realizou o exame.
          </p>
        </div>
      </div>
    )
  }

  const {
    petName, clinicName, clinicPhone, modality, title, referringVetName,
    audience, images, laudoUrl, laudoAvailable, createdAt,
  } = result

  const dicomFiles = images.filter(f => f.kind === 'dicom')
  const pictureFiles = images.filter(f => f.kind === 'image')
  const modalityLabel = modality ? (MODALITY_LABEL[modality] ?? modality) : 'Exame de imagem'

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <header className="bg-white shadow-sm border-b border-slate-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
            <FileImage className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 leading-tight">{clinicName}</p>
            <p className="text-[11px] text-slate-400">Centro de Diagnóstico por Imagem</p>
            {clinicPhone && (
              <span className="text-[11px] text-slate-500 flex items-center gap-1">
                <Phone className="h-3 w-3" />{clinicPhone}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* Cabeçalho do exame */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">{modalityLabel}</p>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{title || `Exame de ${petName}`}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><Stethoscope className="h-3.5 w-3.5 text-slate-400" />Paciente: <strong className="text-slate-700">{petName}</strong></span>
            {referringVetName && <span>Solicitado por: <strong className="text-slate-700">{referringVetName}</strong></span>}
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-slate-400" />{fmtDateTime(createdAt)}</span>
          </div>
          {audience === 'referring_vet' && !laudoAvailable && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-start gap-2">
              <Clock className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                As imagens já estão disponíveis. <strong>O laudo assinado será liberado em breve</strong> — você
                receberá um novo e-mail quando ficar pronto.
              </p>
            </div>
          )}
        </div>

        {/* Laudo (quando liberado) */}
        {laudoAvailable && laudoUrl && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-500" />Laudo assinado
              </h2>
              <a href={laudoUrl} target="_blank" rel="noopener noreferrer"
                 className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5 flex items-center gap-1 hover:bg-emerald-100">
                <Download className="h-3.5 w-3.5" />Baixar PDF
              </a>
            </div>
            <iframe src={laudoUrl} className="w-full" style={{ height: '70vh', border: 0 }} title="Laudo" />
          </div>
        )}

        {/* Imagens (JPEG/PNG) */}
        {pictureFiles.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
              <FileImage className="h-4 w-4 text-slate-400" />Imagens ({pictureFiles.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {pictureFiles.map((f, i) => (
                <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                   className="block rounded-xl overflow-hidden border border-slate-200 bg-slate-900 aspect-square hover:ring-2 hover:ring-emerald-400">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.name} className="w-full h-full object-contain" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Arquivos DICOM — visualizador inline (Cornerstone3D) + download */}
        {dicomFiles.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
              <FileImage className="h-4 w-4 text-slate-400" />Imagens DICOM ({dicomFiles.length})
            </h2>
            <div className="space-y-4">
              {dicomFiles.map((f, i) => (
                <div key={i}>
                  <p className="text-xs text-slate-500 mb-1.5 truncate">{f.name}</p>
                  <DicomViewer url={f.url} fileName={f.name} />
                </div>
              ))}
            </div>
          </div>
        )}

        {images.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 text-center">
            <FileImage className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">As imagens ainda estão sendo processadas.</p>
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
          <p className="text-[11px] text-slate-500 leading-relaxed flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>
              Acesso seguro por link individual. Este conteúdo é sigiloso e destinado
              {audience === 'referring_vet' ? ' ao médico-veterinário solicitante' : ' ao tutor responsável'}.
              O laudo assinado é o documento oficial do exame, sob responsabilidade do médico-veterinário do centro de diagnóstico.
            </span>
          </p>
        </div>

        <div className="text-center text-xs text-slate-400 pb-4">
          <p>Emitido por <strong>{clinicName}</strong></p>
          <p className="mt-0.5">SYSVETMAX — Sistema de Gestão Veterinária</p>
        </div>
      </main>
    </div>
  )
}
