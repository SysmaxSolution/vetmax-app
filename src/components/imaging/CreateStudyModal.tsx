'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, FileImage, Loader2, Search, Stethoscope } from 'lucide-react'
import { createImagingStudy } from '@/lib/actions/imaging'
import { searchPatientsForTriage } from '@/lib/actions/triage'
import { listPartnerProfessionals } from '@/lib/actions/partner-portal'

const MODALITIES = [
  { value: 'radiografia', label: 'Radiografia (Raio-X)' },
  { value: 'ultrassom',   label: 'Ultrassonografia' },
  { value: 'tomografia',  label: 'Tomografia' },
  { value: 'ressonancia', label: 'Ressonância' },
  { value: 'outro',       label: 'Outro' },
]

interface Partner { id: string; name: string }
interface Service { id: string; name: string; publishToPortal: boolean }
interface SelPatient { id: string; name: string; species?: string }

interface Props {
  partners: Partner[]
  services?: Service[]
  onClose: () => void
  onSuccess: (studyId: string) => void
}

export default function CreateStudyModal({ partners, services = [], onClose, onSuccess }: Props) {
  const [catalogItemId, setCatalogItemId] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SelPatient[]>([])
  const [selected, setSelected] = useState<SelPatient | null>(null)
  const [searching, setSearching] = useState(false)

  const [modality, setModality] = useState('radiografia')
  const [title, setTitle] = useState('')
  const [partnerClinicId, setPartnerClinicId] = useState('')
  const [professionals, setProfessionals] = useState<{ id: string; name: string; crmv: string | null }[]>([])
  const [referringProfessionalId, setReferringProfessionalId] = useState('')
  const [vetName, setVetName] = useState('')
  const [vetEmail, setVetEmail] = useState('')
  const [vetCrmv, setVetCrmv] = useState('')
  const [notes, setNotes] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (selected || query.trim().length < 2) { setResults([]); return }
    let active = true
    setSearching(true)
    const t = setTimeout(async () => {
      const res = await searchPatientsForTriage(query.trim())
      if (!active) return
      setSearching(false)
      setResults(Array.isArray(res) ? res.map((r: any) => ({ id: r.id, name: r.name, species: r.species })) : [])
    }, 300)
    return () => { active = false; clearTimeout(t) }
  }, [query, selected])

  // profissionais da clínica parceira selecionada (p/ filtro por MV no portal)
  useEffect(() => {
    if (!partnerClinicId) { setProfessionals([]); setReferringProfessionalId(''); return }
    let active = true
    listPartnerProfessionals(partnerClinicId).then(r => {
      if (!active) return
      setProfessionals(Array.isArray(r) ? r.map(p => ({ id: p.id, name: p.name, crmv: p.crmv })) : [])
    })
    return () => { active = false }
  }, [partnerClinicId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) { setError('Selecione o paciente.'); return }
    setSaving(true); setError(null)
    const res = await createImagingStudy({
      patientId: selected.id,
      modality,
      title: title.trim() || null,
      notes: notes.trim() || null,
      referringVetName: vetName.trim() || null,
      referringVetEmail: vetEmail.trim() || null,
      referringVetCrmv: vetCrmv.trim() || null,
      partnerClinicId: partnerClinicId || null,
      catalogItemId: catalogItemId || null,
      referringProfessionalId: referringProfessionalId || null,
    })
    setSaving(false)
    if ('error' in res) { setError(res.error); return }
    onSuccess(res.id)
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <FileImage className="h-5 w-5 text-teal-600" />
            <h2 className="text-base font-semibold text-slate-900">Novo estudo de imagem</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Paciente */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Paciente *</label>
            {selected ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
                <span className="text-sm font-medium text-slate-800 flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-teal-600" />{selected.name}
                </span>
                <button type="button" onClick={() => { setSelected(null); setQuery('') }}
                        className="text-xs text-teal-700 hover:underline">trocar</button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input value={query} onChange={e => setQuery(e.target.value)} autoFocus
                         placeholder="Buscar por nome do pet ou tutor…"
                         className="flex-1 text-sm outline-none" />
                  {searching && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                </div>
                {results.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {results.map(r => (
                      <button key={r.id} type="button" onClick={() => { setSelected(r); setResults([]) }}
                              className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                        {r.name} <span className="text-slate-400 text-xs">· {r.species ?? ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Modalidade + título */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Modalidade</label>
              <select value={modality} onChange={e => setModality(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {MODALITIES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Descrição</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                     placeholder="Ex.: Tórax 2 incidências"
                     className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Serviço do catálogo (define publicação no portal) */}
          {services.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Serviço (catálogo)</label>
              <select value={catalogItemId} onChange={e => setCatalogItemId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">— Não vincular —</option>
                {services.map(s => <option key={s.id} value={s.id}>{s.name}{s.publishToPortal ? ' • publica no portal' : ''}</option>)}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Se o serviço estiver marcado como "publicar no portal", o laudo vai automaticamente ao tutor ao ser liberado.</p>
            </div>
          )}

          {/* Clínica parceira (prefill do vet) */}
          {partners.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Clínica que encaminhou (opcional)</label>
              <select value={partnerClinicId} onChange={e => setPartnerClinicId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">— Nenhuma / avulso —</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Se a clínica tiver contato cadastrado, o vet é preenchido automaticamente.</p>
            </div>
          )}

          {/* Profissional solicitante (filtra o portal por MV) */}
          {professionals.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Veterinário solicitante (da clínica parceira)</label>
              <select value={referringProfessionalId} onChange={e => setReferringProfessionalId(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">— Não especificar (só acesso geral) —</option>
                {professionals.map(p => <option key={p.id} value={p.id}>{p.name}{p.crmv ? ` · CRMV ${p.crmv}` : ''}</option>)}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">O MV escolhido vê este exame no portal com o código dele.</p>
            </div>
          )}

          {/* Vet solicitante */}
          <div className="rounded-xl border border-slate-200 p-3 space-y-3 bg-slate-50/50">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Veterinário solicitante</p>
            <div className="grid grid-cols-2 gap-3">
              <input value={vetName} onChange={e => setVetName(e.target.value)} placeholder="Nome do MV"
                     className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input value={vetCrmv} onChange={e => setVetCrmv(e.target.value)} placeholder="CRMV"
                     className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <input value={vetEmail} onChange={e => setVetEmail(e.target.value)} type="email"
                   placeholder="E-mail do MV (recebe o link das imagens)"
                   className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <p className="text-[11px] text-slate-400">
              Assim que as imagens subirem, este e-mail recebe o link — <strong>antes do laudo</strong>.
            </p>
          </div>

          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                    placeholder="Observações internas (opcional)"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancelar</button>
            <button type="submit" disabled={saving || !selected}
                    className="px-4 py-2 text-sm font-semibold text-white bg-teal-600 rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}Criar estudo
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
