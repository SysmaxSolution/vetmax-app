'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileImage, Plus, UserCheck, Mail, Clock, CheckCircle2, ImageOff } from 'lucide-react'
import { Toast } from '@/components/ui/toast'
import CreateStudyModal from './CreateStudyModal'
import StudyDetailDrawer from './StudyDetailDrawer'
import type { ImagingStudyRow } from '@/lib/imaging/types'
import { STUDY_STATUS_LABELS, type StudyStatus } from '@/lib/imaging/study-status'

interface Props {
  studies: ImagingStudyRow[]
  partners: { id: string; name: string }[]
  services?: { id: string; name: string; publishToPortal: boolean }[]
  role: string
}

const STATUS_STYLE: Record<StudyStatus, string> = {
  awaiting_images: 'bg-slate-100 text-slate-600',
  images_ready:    'bg-amber-100 text-amber-700',
  reported:        'bg-green-100 text-green-700',
  cancelled:       'bg-red-100 text-red-600',
}

function fmt(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function ImagingWorkspace({ studies, partners, services = [], role }: Props) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const notify = (type: 'success' | 'error', message: string) => setToast({ type, message })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileImage className="h-6 w-6 text-teal-600" />Imagem & Laudos
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Entrega de imagens e laudos ao veterinário solicitante e ao tutor.
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
                className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 flex items-center gap-2">
          <Plus className="h-4 w-4" />Novo estudo
        </button>
      </div>

      {studies.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <ImageOff className="h-12 w-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Nenhum estudo de imagem ainda</p>
          <p className="text-sm text-slate-400 mt-1">Crie o primeiro estudo para enviar imagens ao veterinário solicitante.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-400 border-b border-slate-100">
                <th className="px-4 py-3 font-semibold">Paciente</th>
                <th className="px-4 py-3 font-semibold">Exame</th>
                <th className="px-4 py-3 font-semibold">Solicitante</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Criado</th>
              </tr>
            </thead>
            <tbody>
              {studies.map(s => (
                <tr key={s.id} onClick={() => setOpenId(s.id)}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer">
                  <td className="px-4 py-3">
                    <span className="font-medium text-slate-800">{s.patient_name ?? '—'}</span>
                    {s.os_number && <span className="text-xs text-slate-400 block">OS {s.os_number}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.title || s.modality || 'Imagem'}
                    <span className="text-xs text-slate-400 block">{s.file_count} arquivo(s)</span>
                  </td>
                  <td className="px-4 py-3">
                    {s.referring_vet_name ? (
                      <span className="text-slate-600 flex items-center gap-1"><UserCheck className="h-3.5 w-3.5 text-teal-500" />{s.referring_vet_name}</span>
                    ) : <span className="text-slate-300">—</span>}
                    {s.referring_vet_email && <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5"><Mail className="h-3 w-3" />{s.referring_vet_email}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[s.status]}`}>
                      {STUDY_STATUS_LABELS[s.status]}
                    </span>
                    <div className="flex gap-1.5 mt-1">
                      {s.images_uploaded_at && <span title="Imagens enviadas"><FileImage className="h-3.5 w-3.5 text-amber-500" /></span>}
                      {s.laudo_released_at && <span title="Laudo liberado"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /></span>}
                      {s.released_to_tutor_at && <span title="Liberado ao tutor" className="text-[10px] text-slate-400">tutor</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 flex items-center gap-1"><Clock className="h-3 w-3" />{fmt(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateStudyModal
          partners={partners}
          services={services}
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => { setShowCreate(false); notify('success', 'Estudo criado.'); router.refresh(); setOpenId(id) }}
        />
      )}

      {openId && (
        <StudyDetailDrawer
          studyId={openId}
          role={role}
          onClose={() => setOpenId(null)}
          onChanged={() => router.refresh()}
          notify={notify}
        />
      )}

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  )
}
