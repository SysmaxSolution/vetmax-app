'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  X, Loader2, Upload, Link2, Copy, Send, Ban, FileText, FileImage, UserCheck, Clock, CheckCircle2,
} from 'lucide-react'
import {
  getStudyDetail, uploadImagingFile, attachLaudoToStudy, releaseStudyToTutor,
  resendReferringVetLink, revokeShareLink, listLaudoCandidates,
} from '@/lib/actions/imaging'
import type { StaffStudyDetail } from '@/lib/imaging/types'
import { STUDY_STATUS_LABELS, type StudyStatus } from '@/lib/imaging/study-status'

interface Props {
  studyId: string
  role: string
  onClose: () => void
  onChanged: () => void
  notify: (type: 'success' | 'error', msg: string) => void
}

const STATUS_STYLE: Record<StudyStatus, string> = {
  awaiting_images: 'bg-slate-100 text-slate-600',
  images_ready:    'bg-amber-100 text-amber-700',
  reported:        'bg-green-100 text-green-700',
  cancelled:       'bg-red-100 text-red-600',
}

export default function StudyDetailDrawer({ studyId, role, onClose, onChanged, notify }: Props) {
  const [detail, setDetail] = useState<StaffStudyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [laudos, setLaudos] = useState<{ id: string; name: string }[]>([])
  const [selectedLaudo, setSelectedLaudo] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const canReleaseLaudo = ['vet', 'admin'].includes(role)

  async function reload() {
    const res = await getStudyDetail(studyId)
    if ('error' in res) { notify('error', res.error); return }
    setDetail(res)
    if (canReleaseLaudo) {
      const l = await listLaudoCandidates(res.patient_id)
      if (Array.isArray(l)) setLaudos(l)
    }
  }

  useEffect(() => {
    let active = true
    ;(async () => { setLoading(true); await reload(); if (active) setLoading(false) })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId])

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    let emailed = false
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      const res = await uploadImagingFile(fd, studyId)
      if ('error' in res) { notify('error', `${file.name}: ${res.error}`); setBusy(false); return }
      if (res.emailedVet) emailed = true
    }
    setBusy(false)
    notify('success', emailed ? 'Imagens enviadas — e-mail com o link disparado ao veterinário solicitante.' : 'Imagens enviadas.')
    if (fileRef.current) fileRef.current.value = ''
    await reload(); onChanged()
  }

  async function handleAttachLaudo() {
    if (!selectedLaudo) { notify('error', 'Selecione o documento do laudo.'); return }
    setBusy(true)
    const res = await attachLaudoToStudy(studyId, selectedLaudo)
    setBusy(false)
    if ('error' in res) { notify('error', res.error); return }
    notify('success', res.emailedVet ? 'Laudo liberado — e-mail enviado ao veterinário solicitante.' : 'Laudo liberado.')
    await reload(); onChanged()
  }

  async function handleReleaseTutor() {
    setBusy(true)
    const res = await releaseStudyToTutor(studyId)
    setBusy(false)
    if ('error' in res) { notify('error', res.error); return }
    notify('success', 'Liberado ao tutor.')
    await reload(); onChanged()
  }

  async function handleResend() {
    setBusy(true)
    const res = await resendReferringVetLink(studyId)
    setBusy(false)
    if ('error' in res) { notify('error', res.error); return }
    notify('success', 'Link reenviado ao veterinário solicitante.')
  }

  async function handleRevoke(linkId: string) {
    setBusy(true)
    const res = await revokeShareLink(linkId)
    setBusy(false)
    if ('error' in res) { notify('error', res.error); return }
    notify('success', 'Link revogado.')
    await reload()
  }

  function copy(url: string) {
    navigator.clipboard?.writeText(url).then(() => notify('success', 'Link copiado.')).catch(() => {})
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <FileImage className="h-5 w-5 text-teal-600" />
            <h2 className="text-base font-semibold text-slate-900">Estudo de imagem</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        {loading || !detail ? (
          <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Cabeçalho */}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-slate-900">{detail.title || detail.modality || 'Exame de imagem'}</h3>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[detail.status]}`}>
                  {STUDY_STATUS_LABELS[detail.status]}
                </span>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Paciente: <strong className="text-slate-700">{detail.patient_name}</strong>
                {detail.os_number && <> · OS {detail.os_number}</>}
              </p>
              {(detail.referring_vet_name || detail.referring_vet_email) && (
                <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <UserCheck className="h-3.5 w-3.5 text-teal-500" />
                  Solicitante: {detail.referring_vet_name ?? '—'}
                  {detail.referring_vet_crmv ? ` · CRMV ${detail.referring_vet_crmv}` : ''}
                  {detail.referring_vet_email ? ` · ${detail.referring_vet_email}` : ''}
                </p>
              )}
              {!detail.referring_vet_email && (
                <p className="text-xs text-amber-600 mt-1">⚠ Sem e-mail do vet solicitante — nenhum link será enviado por e-mail.</p>
              )}
            </div>

            {/* Upload */}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><FileImage className="h-4 w-4 text-slate-400" />Imagens / DICOM ({detail.file_count})</h4>
                <button onClick={() => fileRef.current?.click()} disabled={busy}
                        className="text-xs font-semibold text-white bg-teal-600 rounded-lg px-3 py-1.5 flex items-center gap-1 hover:bg-teal-700 disabled:opacity-50">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Enviar arquivos
                </button>
                <input ref={fileRef} type="file" multiple accept="image/*,.dcm,.dicom,application/dicom" className="hidden"
                       onChange={e => handleUpload(e.target.files)} />
              </div>
              {detail.files.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhum arquivo ainda. O 1º envio dispara o e-mail ao vet solicitante.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {detail.files.map((f, i) => (
                    <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                       className="block aspect-square rounded-lg border border-slate-200 overflow-hidden bg-slate-900 relative group">
                      {f.kind === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.url} alt={f.name} className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 text-[10px] gap-1">
                          <FileImage className="h-6 w-6" />DICOM
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Laudo */}
            <div className="rounded-xl border border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2 mb-3"><FileText className="h-4 w-4 text-slate-400" />Laudo</h4>
              {detail.laudo_released_at ? (
                <p className="text-sm text-green-700 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />Laudo liberado — e-mail enviado ao solicitante.</p>
              ) : canReleaseLaudo ? (
                <div className="flex items-center gap-2">
                  <select value={selectedLaudo} onChange={e => setSelectedLaudo(e.target.value)}
                          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">Selecionar documento (laudo) do pet…</option>
                    {laudos.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <button onClick={handleAttachLaudo} disabled={busy || !selectedLaudo}
                          className="text-xs font-semibold text-white bg-teal-600 rounded-lg px-3 py-2 hover:bg-teal-700 disabled:opacity-50 whitespace-nowrap">
                    Liberar laudo
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-400">Somente o Médico Veterinário pode liberar o laudo.</p>
              )}
              {canReleaseLaudo && laudos.length === 0 && !detail.laudo_released_at && (
                <p className="text-[11px] text-slate-400 mt-2">Nenhum documento com PDF gerado para este pet. Gere o laudo em Laudos/Documentos primeiro.</p>
              )}
            </div>

            {/* Links de acesso */}
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><Link2 className="h-4 w-4 text-slate-400" />Links de acesso</h4>
                <div className="flex gap-2">
                  {detail.images_uploaded_at && (
                    <button onClick={handleResend} disabled={busy}
                            className="text-xs font-medium text-teal-700 border border-teal-200 rounded-lg px-2.5 py-1 flex items-center gap-1 hover:bg-teal-50 disabled:opacity-50">
                      <Send className="h-3 w-3" />Reenviar ao vet
                    </button>
                  )}
                  {!detail.released_to_tutor_at && (
                    <button onClick={handleReleaseTutor} disabled={busy}
                            className="text-xs font-medium text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1 hover:bg-slate-50 disabled:opacity-50">
                      Liberar ao tutor
                    </button>
                  )}
                </div>
              </div>
              {detail.links.length === 0 ? (
                <p className="text-xs text-slate-400 flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Nenhum link gerado — envie a 1ª imagem para gerar o link do vet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.links.map(l => (
                    <div key={l.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${l.revoked ? 'border-slate-200 bg-slate-50 opacity-60' : 'border-slate-200'}`}>
                      <span className="text-[11px] font-semibold uppercase text-slate-400 w-16 flex-shrink-0">
                        {l.audience === 'referring_vet' ? 'Vet' : 'Tutor'}
                      </span>
                      <span className="text-xs text-slate-500 truncate flex-1">{l.url}</span>
                      <span className="text-[11px] text-slate-400 flex-shrink-0">{l.views} views</span>
                      {!l.revoked ? (
                        <>
                          <button onClick={() => copy(l.url)} className="text-slate-400 hover:text-teal-600"><Copy className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleRevoke(l.id)} disabled={busy} className="text-slate-400 hover:text-red-600"><Ban className="h-3.5 w-3.5" /></button>
                        </>
                      ) : (
                        <span className="text-[11px] text-red-500 flex-shrink-0">revogado</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
