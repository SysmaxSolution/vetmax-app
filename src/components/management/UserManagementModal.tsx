'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import {
  X, User, Shield, Loader2, Camera, FileSignature,
  Eye, EyeOff, Check, AlertTriangle, Lock,
  Percent, Plus, Trash2, Search, Package, Wrench, ShoppingBag,
} from 'lucide-react'
import {
  adminUpdateUser, adminChangePassword, uploadUserSignature,
  getUserModuleAccess, setUserModuleAccess,
  type ClinicUserFull,
} from '@/lib/actions/user-management'
import {
  listUserCommissions, upsertUserCommission, deleteUserCommission,
  searchItemsForCommission,
  type UserCommission, type CommissionableItem,
} from '@/lib/actions/commissions'
import type { Room } from '@/lib/actions/rooms'
import type { UserRole } from '@/types'
import UserPermissionsMatrix from './UserPermissionsMatrix'

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

const ITEM_TYPE_LABELS: Record<UserCommission['item_type'], string> = {
  all:     'Toda a venda',
  product: 'Produtos',
  service: 'Serviços',
  package: 'Pacotes',
}

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
  const [activeTab, setActiveTab] = useState<'usuario' | 'acessos' | 'permissoes' | 'comissoes'>('usuario')
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState<string | null>(null)

  // ── Campos da aba Usuário ──────────────────────────────────────────────────
  const [fullName,   setFullName]   = useState(user?.full_name ?? '')
  const [lastName,   setLastName]   = useState(user?.last_name ?? '')
  const [role,       setRole]       = useState<UserRole>((user?.role as UserRole) ?? 'receptionist')
  const [crmv,       setCrmv]       = useState(user?.crmv ?? '')
  const [mapaCode,   setMapaCode]   = useState(user?.mapa_code ?? '')
  const [phone,      setPhone]      = useState(user?.phone ?? '')
  const [address,    setAddress]    = useState(user?.address ?? '')
  const [nickname,   setNickname]   = useState(user?.nickname ?? '')
  const [specialties, setSpecialties] = useState<string[]>(user?.specialties ?? [])
  const [room,       setRoom]       = useState(user?.room ?? '')
  const [isActive,            setIsActive]            = useState(user?.is_active ?? true)
  const [photoUrl,            setPhotoUrl]            = useState<string | null>(user?.photo_url ?? null)
  const [signatureUrl,        setSignatureUrl]        = useState<string | null>(user?.electronic_signature_url ?? null)
  const [appointmentInterval, setAppointmentInterval] = useState<string>(String(user?.appointment_interval_minutes ?? 60))

  // ── Senha ──────────────────────────────────────────────────────────────────
  const [newPassword,  setNewPassword]  = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [changingPass, setChangingPass] = useState(false)

  // ── Uploads ────────────────────────────────────────────────────────────────
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingSig,   setUploadingSig]   = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)
  const sigRef   = useRef<HTMLInputElement>(null)

  // ── Módulos (aba Acessos) ──────────────────────────────────────────────────
  const [moduleMap,      setModuleMap]      = useState<Record<string, boolean>>({})
  const [loadingModules, setLoadingModules] = useState(false)
  const [savingModule,   setSavingModule]   = useState<string | null>(null)

  // ── Comissões ──────────────────────────────────────────────────────────────
  const [commissions,    setCommissions]    = useState<UserCommission[]>([])
  const [loadingComm,    setLoadingComm]    = useState(false)
  const [showCommForm,   setShowCommForm]   = useState(false)
  const [commType,       setCommType]       = useState<UserCommission['item_type']>('all')
  const [commPct,        setCommPct]        = useState('')
  const [commDesc,       setCommDesc]       = useState('')
  const [savingComm,     setSavingComm]     = useState(false)
  const [deletingComm,   setDeletingComm]   = useState<string | null>(null)

  // Modal de busca de item específico
  const [showItemModal,   setShowItemModal]   = useState(false)
  const [itemModalType,   setItemModalType]   = useState<'product' | 'service' | 'package'>('product')
  const [itemQuery,       setItemQuery]       = useState('')
  const [itemResults,     setItemResults]     = useState<CommissionableItem[]>([])
  const [searchingItems,  setSearchingItems]  = useState(false)
  const [selectedItem,    setSelectedItem]    = useState<CommissionableItem | null>(null)
  const [itemPct,         setItemPct]         = useState('')
  const [savingItemComm,  setSavingItemComm]  = useState(false)

  const [, startTransition] = useTransition()

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

  useEffect(() => {
    if (activeTab !== 'comissoes' || isNew || !user) return
    setLoadingComm(true)
    listUserCommissions(user.id).then(res => {
      setLoadingComm(false)
      if (!('error' in res)) setCommissions(res)
    })
  }, [activeTab, isNew, user?.id])

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSaveUser() {
    if (!fullName.trim()) { setError('Nome é obrigatório.'); return }
    if (!user) return
    setSaving(true); setError(null)
    const intervalNum = parseInt(appointmentInterval, 10)
    const res = await adminUpdateUser({
      userId: user.id,
      full_name: fullName, last_name: lastName,
      role, crmv: crmv || null, mapa_code: mapaCode || null,
      phone: phone || null, address: address || null,
      nickname: nickname || null, specialties, room: room || null,
      is_active: isActive,
      appointment_interval_minutes: (!isNaN(intervalNum) && intervalNum > 0) ? intervalNum : 60,
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
    const res = await fetch('/api/upload-user-avatar', {
      method: 'POST', body: fd,
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

  async function handleSaveCommission() {
    if (!user) return
    const pct = parseFloat(commPct)
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      setError('Percentual deve ser entre 0,01% e 100%.'); return
    }
    setSavingComm(true); setError(null)
    const res = await upsertUserCommission({
      user_id:     user.id,
      item_type:   commType,
      item_id:     null,
      percentage:  pct,
      description: commDesc.trim() || undefined,
    })
    setSavingComm(false)
    if ('error' in res) { setError(res.error); return }
    setCommPct(''); setCommDesc(''); setCommType('all'); setShowCommForm(false)
    const updated = await listUserCommissions(user.id)
    if (!('error' in updated)) setCommissions(updated)
  }

  async function handleDeleteCommission(id: string) {
    setDeletingComm(id)
    const res = await deleteUserCommission(id)
    setDeletingComm(null)
    if ('error' in res) { setError(res.error); return }
    setCommissions(prev => prev.filter(c => c.id !== id))
  }

  async function handleSearchItems() {
    if (!itemQuery.trim()) return
    setSearchingItems(true)
    const res = await searchItemsForCommission(itemQuery, itemModalType)
    setSearchingItems(false)
    if (!('error' in res)) setItemResults(res)
  }

  async function handleSaveItemCommission() {
    if (!user || !selectedItem) return
    const pct = parseFloat(itemPct)
    if (isNaN(pct) || pct <= 0 || pct > 100) {
      setError('Percentual deve ser entre 0,01% e 100%.'); return
    }
    setSavingItemComm(true); setError(null)
    const res = await upsertUserCommission({
      user_id:     user.id,
      item_type:   itemModalType,
      item_id:     selectedItem.id,
      percentage:  pct,
      description: `${selectedItem.name} — ${pct.toFixed(2)}%`,
    })
    setSavingItemComm(false)
    if ('error' in res) { setError(res.error); return }
    // Fechar modal e atualizar lista
    setShowItemModal(false)
    setSelectedItem(null); setItemQuery(''); setItemResults([]); setItemPct('')
    const updated = await listUserCommissions(user.id)
    if (!('error' in updated)) setCommissions(updated)
  }

  function openItemModal(type: 'product' | 'service' | 'package') {
    setItemModalType(type)
    setItemQuery(''); setItemResults([]); setSelectedItem(null); setItemPct('')
    setShowItemModal(true)
  }

  function toggleSpecialty(s: string) {
    setSpecialties(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])
  }

  const TABS = [
    { key: 'usuario',    label: 'Usuário',    Icon: User    },
    { key: 'acessos',    label: 'Módulos',    Icon: Shield  },
    { key: 'permissoes', label: 'Permissões', Icon: Lock    },
    { key: 'comissoes',  label: 'Comissões',  Icon: Percent },
  ] as const

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
        <div className="flex border-b border-slate-200 flex-shrink-0 overflow-x-auto">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              disabled={isNew && key !== 'usuario'}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
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

              {/* Cargo + Apelido */}
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

              {/* CRMV + MAPA (apenas vets) */}
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
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Credencial MAPA
                    <span className="ml-1 text-[10px] font-normal text-slate-400">(receituário controlado)</span>
                  </label>
                  <input
                    value={mapaCode} onChange={e => setMapaCode(e.target.value.toUpperCase())}
                    placeholder="Ex: RQA-SP-00001"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Número de habilitação junto ao Ministério da Agricultura (MAPA) para prescrição de produtos controlados
                  </p>
                </div>
              </div>

              {/* Box / Sala */}
              <div className="grid grid-cols-2 gap-3">
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
                {(role === 'vet' || role === 'assistant') && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Intervalo de Agendamento (min)
                    </label>
                    <input
                      type="number" min="15" max="240" step="15"
                      value={appointmentInterval}
                      onChange={e => setAppointmentInterval(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    />
                  </div>
                )}
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

              {/* Telefone + Ativo */}
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

          {/* ── Aba Comissões ── */}
          {activeTab === 'comissoes' && !isNew && user && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Regras de Comissão</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Defina o percentual de comissão que <strong>{user.full_name}</strong> recebe por tipo de venda.
                  Os lançamentos são gerados automaticamente em Contas a Pagar após cada venda no PDV.
                </p>
              </div>

              {/* Botão adicionar */}
              {!showCommForm && (
                <button
                  type="button"
                  onClick={() => setShowCommForm(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-teal-300 text-teal-700 text-sm font-medium hover:bg-teal-50 transition-colors w-full justify-center"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar Regra de Comissão
                </button>
              )}

              {/* Formulário inline */}
              {showCommForm && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-700">Nova Regra</p>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Tipo */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Aplica sobre</label>
                      <select
                        value={commType}
                        onChange={e => setCommType(e.target.value as UserCommission['item_type'])}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                      >
                        <option value="all">Toda a venda</option>
                        <option value="product">Produtos</option>
                        <option value="service">Serviços</option>
                        <option value="package">Pacotes</option>
                      </select>
                    </div>

                    {/* Percentual */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Comissão (%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0.01" max="100" step="0.01"
                          value={commPct}
                          onChange={e => setCommPct(e.target.value)}
                          placeholder="Ex: 5"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-8 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        />
                        <span className="absolute right-3 top-2.5 text-slate-400 text-sm">%</span>
                      </div>
                    </div>
                  </div>

                  {/* Descrição */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Observação (opcional)</label>
                    <input
                      value={commDesc}
                      onChange={e => setCommDesc(e.target.value)}
                      placeholder={
                        commType === 'all' ? 'Ex: Comissão padrão sobre vendas'
                        : commType === 'product' ? 'Ex: Comissão sobre medicamentos'
                        : commType === 'service' ? 'Ex: Comissão sobre consultas'
                        : 'Ex: Comissão sobre pacotes de banho'
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveCommission}
                      disabled={savingComm || !commPct}
                      className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
                    >
                      {savingComm ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Salvar Regra
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowCommForm(false); setCommPct(''); setCommDesc(''); setCommType('all') }}
                      className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de regras */}
              {loadingComm ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
                </div>
              ) : commissions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Percent className="h-10 w-10 text-slate-200 mb-3" />
                  <p className="text-sm font-medium text-slate-500">Nenhuma regra cadastrada</p>
                  <p className="text-xs text-slate-400 mt-1">Adicione uma regra para gerar comissões automaticamente</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {commissions.map(c => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-teal-100">
                          <Percent className="h-4 w-4 text-teal-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-800">
                              {c.percentage.toFixed(2).replace('.', ',')}%
                            </span>
                            <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 font-medium">
                              {ITEM_TYPE_LABELS[c.item_type]}
                            </span>
                          </div>
                          {c.description && (
                            <p className="text-xs text-slate-400 truncate mt-0.5">{c.description}</p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCommission(c.id)}
                        disabled={deletingComm === c.id}
                        className="flex-shrink-0 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {deletingComm === c.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Atalhos para comissão por item específico */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-600">Comissão por Item Específico</p>
                <p className="text-xs text-slate-400">
                  Comissione produto a produto, serviço a serviço ou pacote a pacote — além das regras gerais acima.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { type: 'product' as const, label: 'Produto',  Icon: ShoppingBag, color: 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100' },
                    { type: 'service' as const, label: 'Serviço',  Icon: Wrench,      color: 'text-purple-700 bg-purple-50 border-purple-200 hover:bg-purple-100' },
                    { type: 'package' as const, label: 'Pacote',   Icon: Package,     color: 'text-teal-700 bg-teal-50 border-teal-200 hover:bg-teal-100' },
                  ]).map(({ type, label, Icon, color }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => openItemModal(type)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed py-3 text-xs font-semibold transition-colors ${color}`}
                    >
                      <Icon className="h-5 w-5" />
                      + {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Info */}
              <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700">
                <strong>Como funciona:</strong> As comissões são lançadas automaticamente em <em>Contas a Pagar</em>
                após vendas no PDV, pagamento de consultas (checkout) e tosas (caixa).
                Visualize em <strong>Relatórios → Comissões</strong>.
              </div>
            </div>
          )}

          {/* ── Modal de busca de item específico ── */}
          {showItemModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
              <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className={`px-5 py-4 flex items-center justify-between ${
                  itemModalType === 'product' ? 'bg-blue-600' :
                  itemModalType === 'service' ? 'bg-purple-600' : 'bg-teal-600'
                }`}>
                  <div className="flex items-center gap-2 text-white">
                    {itemModalType === 'product' && <ShoppingBag className="h-5 w-5" />}
                    {itemModalType === 'service' && <Wrench className="h-5 w-5" />}
                    {itemModalType === 'package' && <Package className="h-5 w-5" />}
                    <span className="font-semibold text-sm">
                      Comissão por {itemModalType === 'product' ? 'Produto' : itemModalType === 'service' ? 'Serviço' : 'Pacote'}
                    </span>
                  </div>
                  <button onClick={() => setShowItemModal(false)} className="text-white/70 hover:text-white p-1 rounded-lg">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {/* Busca */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Buscar {itemModalType === 'product' ? 'produto' : itemModalType === 'service' ? 'serviço' : 'pacote'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={itemQuery}
                        onChange={e => setItemQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearchItems()}
                        placeholder={`Digite o nome do ${itemModalType === 'package' ? 'pacote' : itemModalType}...`}
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={handleSearchItems}
                        disabled={searchingItems || !itemQuery.trim()}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
                      >
                        {searchingItems ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Resultados */}
                  {itemResults.length > 0 && !selectedItem && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {itemResults.map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedItem(item)}
                          className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-800">{item.name}</p>
                            <p className="text-xs text-slate-400">{item.category}</p>
                          </div>
                          <span className="text-xs font-semibold text-slate-600 ml-4 flex-shrink-0">
                            {item.price > 0
                              ? item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                              : '—'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {itemResults.length === 0 && itemQuery && !searchingItems && (
                    <p className="text-xs text-slate-400 text-center py-2">
                      Nenhum resultado. Tente outro termo.
                    </p>
                  )}

                  {/* Item selecionado */}
                  {selectedItem && (
                    <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{selectedItem.name}</p>
                        <p className="text-xs text-slate-400">{selectedItem.category}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setSelectedItem(null); setItemResults([]) }}
                        className="text-slate-400 hover:text-slate-600 p-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {/* Percentual */}
                  {selectedItem && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        Comissão sobre este item (%)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="0.01" max="100" step="0.01"
                          value={itemPct}
                          onChange={e => setItemPct(e.target.value)}
                          placeholder="Ex: 10"
                          autoFocus
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-8 text-sm outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                        />
                        <span className="absolute right-3 top-2.5 text-slate-400 text-sm">%</span>
                      </div>
                      {selectedItem.price > 0 && itemPct && !isNaN(parseFloat(itemPct)) && (
                        <p className="mt-1 text-[11px] text-slate-500">
                          = {(selectedItem.price * (parseFloat(itemPct) / 100)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} por unidade vendida
                        </p>
                      )}
                    </div>
                  )}

                  {/* Botões */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveItemCommission}
                      disabled={!selectedItem || !itemPct || savingItemComm}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50"
                    >
                      {savingItemComm ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Salvar Comissão
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowItemModal(false)}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Aba Permissões Granulares ── */}
          {activeTab === 'permissoes' && !isNew && user && (
            <UserPermissionsMatrix
              userId={user.id}
              userFullName={user.full_name}
              isAdmin={user.role === 'admin'}
              onToast={(type, message) => {
                if (type === 'error') setError(message)
                else setSuccess(message)
              }}
            />
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
                    const enabled  = moduleMap[key] !== false
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
