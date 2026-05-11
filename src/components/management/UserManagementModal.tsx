'use client'

import { useState, useRef, useEffect } from 'react'
import {
  X, User, Shield, Loader2, Camera, FileSignature,
  Eye, EyeOff, Check, AlertTriangle,
} from 'lucide-react'
import {
  adminUpdateUser, adminChangePassword, uploadUserSignature,
  getUserModuleAccess, setUserModuleAccess,
  type ClinicUserFull,
} from '@/lib/actions/user-management'
import type { Room } from '@/lib/actions/rooms'
import type { UserRole } from '@/types'

// ─── Constantes ───────────────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'admin',        label: 'Administrador' },
  { value: 'vet',          label: 'Médico Veterinário' },
  { value: 'assistant',    label: 'Auxiliar Veterinário' },
  { value: 'receptionist', label: 'Recepcionista' },
  { value: 'pharmacist',   label: 'Técnico' },
]

const MODULE_OPTIONS: { key: string; label: string }[] = [
  { key: 'reception',            label: 'Recepção' },
  { key: 'triage',               label: 'Triagem' },
  { key: 'consultation',         label: 'Consultório' },
  { key: 'exams',                label: 'Exames' },
  { key: 'hospitalization',      label: 'Internação' },
  { key: 'pharmacy',             label: 'Farmácia' },
  { key: 'grooming',             label: 'Banho e Tosa' },
  { key: 'sales',                label: 'Vendas (PDV)' },
  { key: 'whatsapp',             label: 'WhatsApp' },
  { key: 'mentor',               label: 'Mentor IA' },
  { key: 'whatsapp_intelligent', label: 'WhatsApp IA' },
]

const SPECIALTY_OPTIONS = [
  'Clínica Geral', 'Cirurgia', 'Dermatologia', 'Cardiologia',
  'Neurologia', 'Oncologia', 'Ortopedia', 'Oftalmologia',
  'Odontologia', 'Nutrição', 'Acupuntura', 'Radiologia',
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  user:          ClinicUserFull | null
  rooms:         Room[]
  activeModules: string[]
  currentUserId: string
  onClose:       () => void
  onSaved:       () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function UserManagementModal({
  user, rooms, activeModules, currentUserId, onClose, onSaved,
}: Props) {
  const isNew = user === null
  const [activeTab, setActiveTab] = useState<'usuario' | 'acessos'>('usuario')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState<string | null>(null)

  // ── Campos da aba Usuário ──────────────────────────────────────────────────
  const [fullName,   setFullName]   = useState(user?.full_name ?? '')
  const [lastName,   setLastName]   = useState(user?.last_name ?? '')
  const [role,       setRole]       = useState<UserRole>((user?.role as UserRole) ?? 'receptionist')
  const [crmv,       setCrmv]       = useState(user?.crmv ?? '')
  const [phone,      setPhone]      = useState(user?.phone ?? '')
  const [address,    setAddress]    = useState(user?.address ?? '')
  const [nickname,   setNickname]   = useState(user?.nickname ?? '')
  const [specialties, setSpecialties] = useState<string[]>(user?.specialties ?? [])
  const [room,       setRoom]       = useState(user?.room ?? '')
  const [isActive,   setIsActive]   = useState(user?.is_active ?? true)
  const [photoUrl,   setPhotoUrl]   = useState<string | null>(user?.photo_url ?? null)
  const [signatureUrl, setSignatureUrl] = useState<string | null>(user?.electronic_signature_url ?? null)

  // ── Senha ──────────────────────────────────────────────────────────────────
  const [newPassword,    setNewPassword]    = useState('')
  const [showPassword,   setShowPassword]   = useState(false)
  const [changingPass,   setChangingPass]   = useState(false)

  // ── Uploads ────────────────────────────────────────────────────────────────
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingSig,   setUploadingSig]   = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)
  const sigRef   = useRef<HTMLInputElement>(null)

  // ── Módulos (aba Acessos) ──────────────────────────────────────────────────
  const [moduleMap,       setModuleMap]       = useState<Record<string, boolean>>({})
  const [loadingModules,  setLoadingModules]  = useState(false)
  const [savingModule,    setSavingModule]    = useState<string | null>(null)

  useEffect(() => {
    if (activeTab !== 'acessos' || isNew || !user) return
    setLoadingModules(true)
    getUserModuleAccess(user.id).then(res => {
      setLoadingModules(false)
      if ('error' in res) return
      const map: Record<string, boolean> = {}
      for (const r of res) map[r.module_name] = r.enabled
      setModuleMap(map)
    })
  }, [activeTab, isNew, user?.id])

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSaveUser() {
    if (!fullName.trim()) { setError('Nome é obrigatório.'); return }
    if (!user) return  // criação via convite, não via este modal
    setSaving(true); setError(null)
    const res = await adminUpdateUser({
      userId: user.id,
      full_name: fullName, last_name: lastName,
      role, crmv: crmv || null, phone: phone || null,
      address: address || null, nickname: nickname || null,
      specialties, room: room || null, is_active: isActive,
    })
    setSaving(false)
    if ('error' in res) { setError(res.error); return }
    setSuccess('Perfil salvo com sucesso!')
    setTimeout(() => { setSuccess(null); onSaved() }, 1200)
  }

  async function handleChangePassword() {
    if (!user) return
    if (newPassword.length < 6) { setError('A senha deve ter no mínimo 6 caracteres.'); return }
    setChangingPass(true); setError(null)
    const res = await adminChangePassword(user.id, newPassword)
    setChangingPass(false)
    if ('error' in res) { setError(res.error); return }
    setNewPassword('')
    setSuccess('Senha alterada com sucesso!')
    setTimeout(() => setSuccess(null), 2000)
  }

  async function handlePhotoUpload(file: File) {
    if (!user) return
    setUploadingPhoto(true)
    const fd = new FormData(); fd.append('logo', file)
    // Reutiliza o bucket user-avatars via API existente
    const res = await fetch('/api/upload-user-avatar', {
      method: 'POST',
      body: fd,
      headers: { 'x-user-id': user.id },
    })
    setUploadingPhoto(false)
    if (!res.ok) { setError('Falha ao enviar foto.'); return }
    const { url } = await res.json()
    setPhotoUrl(url)
    await adminUpdateUser({ userId: user.id, photo_url: url })
  }

  async function handleSignatureUpload(file: File) {
    if (!user) return
    setUploadingSig(true)
    const fd = new FormData(); fd.append('signature', file)
    const res = await uploadUserSignature(user.id, fd)
    setUploadingSig(false)
    if ('error' in res) { setError(res.error); return }
    setSignatureUrl(res.url)
    setSuccess('Assinatura salva!')
    setTimeout(() => setSuccess(null), 2000)
  }

  async function handleToggleModule(key: string, current: boolean) {
    if (!user) return
    const next = !current
    setSavingModule(key)
    setModuleMap(prev => ({ ...prev, [key]: next }))
    const res = await setUserModuleAccess(user.id, key, next)
    setSavingModule(null)
    if ('error' in res) {
      setModuleMap(prev => ({ ...prev, [key]: current }))
      setError(res.error)
    }
  }

  function toggleSpecialty(s: string) {
    setSpecialties(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
              <User className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                {isNew ? 'Novo Usuário' : (user?.full_name ?? 'Editar Usuário')}
              </h2>
              <p className="text-xs text-teal-100">
                {isNew ? 'Cadastrar membro da equipe' : 'Editar perfil e acessos'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-teal-100 hover:bg-teal-500 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 flex-shrink-0">
          {([
            { key: 'usuario', label: 'Usuário',  Icon: User   },
            { key: 'acessos', label: 'Acessos',  Icon: Shield },
          ] as const).map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              disabled={isNew && key === 'acessos'}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6">

          {/* ── Aba Usuário ── */}
          {activeTab === 'usuario' && (
            <div className="space-y-5">

              {/* Foto + Nome */}
              <div className="flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  <div className="h-20 w-20 rounded-full overflow-hidden bg-slate-100 border-2 border-slate-200">
                    {photoUrl
                      ? <img src={photoUrl} alt="Foto" className="h-full w-full object-cover" />
                      : <div className="h-full w-full flex items-center justify-center text-2xl font-bold text-slate-400">
                          {fullName.charAt(0).toUpperCase() || '?'}
                        </div>
                    }
                  </div>
                  {!isNew && (
                    <>
                      <button
                        onClick={() => photoRef.current?.click()}
                        disabled={uploadingPhoto}
                        className="absolute bottom-0 right-0 rounded-full bg-teal-600 p-1.5 text-white shadow-md hover:bg-teal-700 transition-colors"
                      >
                        {uploadingPhoto ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                      </button>
                      <input ref={photoRef} type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f) }} />
                    </>
                  )}
                </div>
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nome <span className="text-red-500">*</span></label>
                    <input
                      value={fullName} onChange={e => setFullName(e.target.value)}
                      placeholder="Nome"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Sobrenome</label>
                    <input
                      value={lastName} onChange={e => setLastName(e.target.value)}
                      placeholder="Sobrenome"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    />
                  </div>
                </div>
              </div>

              {/* Cargo + Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Cargo</label>
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as UserRole)}
                    disabled={user?.id === currentUserId}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white disabled:opacity-60"
                  >
                    {ROLE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Apelido / Nome de exibição</label>
                  <input
                    value={nickname} onChange={e => setNickname(e.target.value)}
                    placeholder="Ex: Dr. Carlos"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
              </div>

              {/* CRMV + Especialidades */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">CRMV</label>
                  <input
                    value={crmv} onChange={e => setCrmv(e.target.value.toUpperCase())}
                    placeholder="SP12345"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Box / Sala</label>
                  <select
                    value={room}
                    onChange={e => setRoom(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  >
                    <option value="">— Nenhum —</option>
                    {rooms.map(r => (
                      <option key={r.id} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Especialidades */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Especialidades</label>
                <div className="flex flex-wrap gap-1.5">
                  {SPECIALTY_OPTIONS.map(s => (
                    <button
                      key={s} type="button"
                      onClick={() => toggleSpecialty(s)}
                      className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                        specialties.includes(s)
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-600 border-slate-300 hover:border-teal-400'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Telefone + Endereço */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Telefone</label>
                  <input
                    value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="(11) 99999-0000"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
                <div className="flex items-center gap-3 pt-5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <div
                      onClick={() => setIsActive(v => !v)}
                      className={`relative h-5 w-9 rounded-full transition-colors ${isActive ? 'bg-teal-600' : 'bg-slate-300'}`}
                    >
                      <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${isActive ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-sm font-medium text-slate-700">Usuário ativo</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Endereço</label>
                <input
                  value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="Rua, número, bairro, cidade"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              {/* Assinatura eletrônica */}
              {!isNew && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-2">Assinatura Eletrônica</label>
                  <div className="flex items-center gap-3">
                    {signatureUrl ? (
                      <div className="flex-1 border border-slate-200 rounded-lg p-2 bg-slate-50">
                        <img src={signatureUrl} alt="Assinatura" className="h-14 object-contain" />
                      </div>
                    ) : (
                      <div className="flex-1 border border-dashed border-slate-300 rounded-lg p-4 text-center text-xs text-slate-400">
                        Nenhuma assinatura cadastrada
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => sigRef.current?.click()}
                      disabled={uploadingSig}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200 transition-colors"
                    >
                      {uploadingSig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSignature className="h-3.5 w-3.5" />}
                      {signatureUrl ? 'Alterar' : 'Carregar'}
                    </button>
                    <input ref={sigRef} type="file" accept="image/*,.png,.jpg,.jpeg" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleSignatureUpload(f) }} />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Será usada como carimbo em documentos gerados pelo sistema. Máx 2MB.
                  </p>
                </div>
              )}

              {/* Trocar senha */}
              {!isNew && (
                <div className="border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-700 mb-3">Trocar Senha</p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Nova senha (mín. 6 caracteres)"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-9 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleChangePassword}
                      disabled={changingPass || !newPassword}
                      className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                      {changingPass ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Alterar'}
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ── Aba Acessos ── */}
          {activeTab === 'acessos' && !isNew && (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Defina quais módulos <strong className="text-slate-800">{user?.full_name}</strong> pode acessar.
                Módulos desativados não aparecem na navegação para este usuário.
              </p>
              {user?.id === currentUserId && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">Você não pode alterar seus próprios acessos.</p>
                </div>
              )}
              {loadingModules ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {MODULE_OPTIONS.map(({ key, label }) => {
                    const enabled = moduleMap[key] !== false
                    const isSaving = savingModule === key
                    const disabled = user?.id === currentUserId
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => !disabled && handleToggleModule(key, enabled)}
                        disabled={disabled || isSaving}
                        className={`flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left transition-all ${
                          enabled
                            ? 'border-teal-300 bg-teal-50 text-teal-700'
                            : 'border-slate-200 bg-white text-slate-400'
                        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-sm cursor-pointer'}`}
                      >
                        <span className="text-sm font-medium">{label}</span>
                        <div className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                          enabled ? 'bg-teal-600' : 'bg-slate-200'
                        }`}>
                          {isSaving
                            ? <Loader2 className="h-3 w-3 animate-spin text-white" />
                            : enabled && <Check className="h-3 w-3 text-white" />
                          }
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="text-sm">
            {error   && <p className="text-red-600 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{error}</p>}
            {success && <p className="text-teal-600 flex items-center gap-1"><Check className="h-4 w-4" />{success}</p>}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Fechar
            </button>
            {activeTab === 'usuario' && !isNew && (
              <button
                type="button"
                onClick={handleSaveUser}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Salvar
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
