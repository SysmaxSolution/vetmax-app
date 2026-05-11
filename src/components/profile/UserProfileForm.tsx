'use client'

import { useState, useTransition, useRef } from 'react'
import { Save, Camera, Loader2, CheckCircle2, X } from 'lucide-react'
import { updateOwnProfile } from '@/lib/actions/user-management'
import { createClient } from '@/lib/supabase/client'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador', vet: 'Médico Veterinário',
  assistant: 'Auxiliar Veterinário', receptionist: 'Recepcionista',
}

const SPECIALTY_OPTIONS = [
  'Clínica Geral', 'Cirurgia', 'Dermatologia', 'Cardiologia', 'Neurologia',
  'Oncologia', 'Ortopedia', 'Oftalmologia', 'Reprodução', 'Anestesiologia',
  'Diagnóstico por Imagem', 'Medicina Felina', 'Medicina de Animais Selvagens',
]

const CRMV_RE = /^[A-Z]{2}[0-9]{4,10}$/

interface Props {
  profile: {
    id:           string
    full_name:    string
    nickname?:    string | null
    phone?:       string | null
    crmv?:        string | null
    specialties?: string[] | null
    photo_url?:   string | null
    role:         string
    clinic_id:    string
  }
  email: string
}

export default function UserProfileForm({ profile, email }: Props) {
  const [fullName,    setFullName]    = useState(profile.full_name ?? '')
  const [nickname,    setNickname]    = useState(profile.nickname ?? '')
  const [phone,       setPhone]       = useState(profile.phone ?? '')
  const [crmv,        setCrmv]        = useState(profile.crmv ?? '')
  const [specialties, setSpecialties] = useState<string[]>(profile.specialties ?? [])
  const [photoUrl,    setPhotoUrl]    = useState<string | null>(profile.photo_url ?? null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploading,   setUploading]   = useState(false)

  const [saved,  setSaved]  = useState(false)
  const [error,  setError]  = useState('')
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const isVetOrAssistant = profile.role === 'vet' || profile.role === 'assistant'
  const crmvValid = !crmv || CRMV_RE.test(crmv)

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('Foto deve ter menos de 5 MB.'); return }

    setPhotoPreview(URL.createObjectURL(file))
    setUploading(true)
    const supabase = createClient()
    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `${profile.clinic_id}/${profile.id}/avatar.${ext}`
    const { error: upErr } = await supabase.storage
      .from('user-avatars')
      .upload(path, file, { upsert: true })

    if (upErr) { setError('Erro no upload da foto: ' + upErr.message); setUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('user-avatars').getPublicUrl(path)
    setPhotoUrl(publicUrl)
    setUploading(false)
  }

  function toggleSpecialty(s: string) {
    setSpecialties(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    )
  }

  function handleSave() {
    if (!fullName.trim()) { setError('Nome é obrigatório.'); return }
    if (crmv && !crmvValid) { setError('CRMV inválido. Use o formato UF + dígitos (ex: SP12345).'); return }
    setError('')
    setSaved(false)

    startTransition(async () => {
      const res = await updateOwnProfile({
        full_name:   fullName,
        nickname,
        phone,
        ...(isVetOrAssistant ? { crmv, specialties } : {}),
        photo_url: photoUrl,
      })
      if ('error' in res) { setError(res.error); return }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    })
  }

  return (
    <div className="space-y-5">

      {/* Foto + nome */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex items-center gap-5">
        <div className="relative flex-shrink-0">
          <div className="h-20 w-20 rounded-full overflow-hidden bg-slate-100 border-2 border-slate-200">
            {(photoPreview ?? photoUrl) ? (
              <img src={photoPreview ?? photoUrl!} alt="Foto de perfil" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-blue-600">
                <span className="text-2xl font-bold text-white">{fullName[0]?.toUpperCase() ?? '?'}</span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 bg-white border border-slate-200 rounded-full p-1.5 shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Trocar foto"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" /> : <Camera className="h-3.5 w-3.5 text-slate-500" />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-slate-900 truncate">{fullName || 'Sem nome'}</p>
          <p className="text-sm text-slate-500">{ROLE_LABELS[profile.role] ?? profile.role}</p>
          <p className="text-xs text-slate-400 mt-0.5">{email}</p>
        </div>
      </div>

      {/* Dados pessoais */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Dados Pessoais</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nome completo *</label>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Apelido / Nome de exibição</label>
            <input
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="Ex: Dr. Carlos"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Celular</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(11) 99999-0000"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Dados profissionais — só para vet/assistant */}
      {isVetOrAssistant && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Dados Profissionais</h2>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              CRMV {profile.role === 'vet' ? '*' : ''}
            </label>
            <input
              value={crmv}
              onChange={e => setCrmv(e.target.value.toUpperCase())}
              placeholder="SP12345"
              className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                crmv && !crmvValid ? 'border-red-400 bg-red-50' : 'border-slate-300'
              }`}
            />
            {crmv && !crmvValid && (
              <p className="text-xs text-red-500 mt-1">Formato: 2 letras (UF) + 4–10 dígitos. Ex: SP12345</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-2">Especialidades</label>
            <div className="flex flex-wrap gap-2">
              {SPECIALTY_OPTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSpecialty(s)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                    specialties.includes(s)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Feedback + Salvar */}
      <div className="flex items-center justify-between">
        {error && (
          <p className="text-sm text-red-600 flex items-center gap-1.5">
            <X className="h-4 w-4" />{error}
          </p>
        )}
        {saved && !error && (
          <p className="text-sm text-green-600 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />Perfil atualizado!
          </p>
        )}
        {!error && !saved && <div />}
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending || uploading}
          className="flex items-center gap-2 bg-blue-600 text-white rounded-xl px-6 py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isPending ? 'Salvando...' : 'Salvar Perfil'}
        </button>
      </div>

    </div>
  )
}
