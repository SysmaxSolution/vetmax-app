'use client'

import { useState, useActionState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  BarChart3, Plus, Trash2, Building2, Users, Save, X,
  FileText, CheckCircle2, Mail, Copy, Check, Link as LinkIcon, Shield,
  Upload, Image, Loader2, Send, Pencil,
} from 'lucide-react'
import { useRef } from 'react'
import { deleteTemplate } from '@/lib/actions/templates'
import { createInvitation, createAndSendInvitation, revokeInvitation } from '@/lib/actions/invitations'
import { uploadClinicLogo, removeClinicLogo } from '@/lib/actions/clinic-settings'
import type { DocumentTemplate, TemplateType, UserRole, Invitation, InvitationRole } from '@/types'
import type { CatalogItem } from '@/lib/actions/catalog'
import type { ClinicConfig, ClinicSettingsConfig } from '@/lib/actions/clinic-settings'
import ImportTemplateModal from './ImportTemplateModal'
import CatalogTab from './CatalogTab'
import { Toast } from '@/components/ui/toast'
import ConveniosTab from './ConveniosTab'
import RoomsTab from './RoomsTab'
import AppearanceTab from './AppearanceTab'
import ErrorMonitoringDashboard from './ErrorMonitoringDashboard'
import SettingsWorkspace from './Settings/SettingsWorkspace'
import BusinessHoursTab from './BusinessHoursTab'
import { updateUserPhone, getUserModuleAccess, setUserModuleAccess, updateUserNickname } from '@/lib/actions/user-management'
import type { ClinicUserFull } from '@/lib/actions/user-management'
import type { Room } from '@/lib/actions/rooms'
import UserManagementModal from './UserManagementModal'
import type { WhatsAppSettingsDisplay } from '@/lib/actions/whatsapp'

type ClinicUser = ClinicUserFull

interface ManagementWorkspaceProps {
  initialTemplates:    DocumentTemplate[]
  clinicData:          any
  users:               ClinicUser[]
  initialInvitations:  Invitation[]
  userLimit:           number
  currentUserId:       string
  userEmail:           string
  userFullName:        string
  initialCatalog:           CatalogItem[]
  initialClinicConfig:      ClinicConfig | null
  initialSettingsConfig?:   ClinicSettingsConfig | null
  initialRooms?:                Room[]
  activeModules?:               string[]
  isSysmax?:                    boolean
  initialWhatsAppSettings?:     WhatsAppSettingsDisplay | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<TemplateType, { text: string; light: string }> = {
  laudo:          { text: 'text-blue-700',   light: 'bg-blue-50' },
  receita:        { text: 'text-green-700',  light: 'bg-green-50' },
  encaminhamento: { text: 'text-orange-700', light: 'bg-orange-50' },
  termo:          { text: 'text-purple-700', light: 'bg-purple-50' },
  exame:          { text: 'text-teal-700',   light: 'bg-teal-50' },
  outro:          { text: 'text-slate-700',  light: 'bg-slate-100' },
}

const TYPE_LABELS: Record<TemplateType, string> = {
  laudo: 'Laudo', receita: 'Receita', encaminhamento: 'Encaminhamento',
  termo: 'Termo', exame: 'Exame', outro: 'Outro',
}

const ROLE_LABELS: Record<string, string> = {
  admin:        'Administrador',
  vet:          'Médico Veterinário',
  assistant:    'Auxiliar Veterinário',
  receptionist: 'Recepcionista',
  pharmacist:   'Técnico',
  pending:      'Pendente',
}

const ROLE_BADGE: Record<string, string> = {
  admin:        'bg-red-100 text-red-700',
  vet:          'bg-green-100 text-green-700',
  assistant:    'bg-blue-100 text-blue-700',
  receptionist: 'bg-amber-100 text-amber-700',
  pharmacist:   'bg-slate-100 text-slate-600',
  pending:      'bg-yellow-100 text-yellow-700',
}

const INVITE_ROLE_OPTIONS: { value: InvitationRole; label: string }[] = [
  { value: 'vet',          label: 'Médico Veterinário' },
  { value: 'assistant',    label: 'Auxiliar Veterinário' },
  { value: 'receptionist', label: 'Recepcionista' },
  { value: 'pharmacist',   label: 'Técnico' },
]

type ActiveTab = 'templates' | 'clinica' | 'usuarios' | 'catalogo' | 'configuracoes' | 'convenios' | 'salas' | 'aparencia' | 'monitoramento'

// ─── Inline Field Helper ─────────────────────────────────────────────────────

function UserInlineField({ label, value, placeholder, onSave }: {
  label: string; value: string; placeholder: string; onSave: (val: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await onSave(val)
    setSaving(false)
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-1 mt-0.5">
        <span className="text-[10px] text-slate-400">{label}:</span>
        <span className="text-[10px] text-slate-600">{value || '—'}</span>
        <button onClick={() => { setVal(value); setEditing(true) }} className="text-[10px] text-teal-600 hover:text-teal-700 underline ml-1">editar</button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 mt-0.5">
      <input value={val} onChange={e => setVal(e.target.value)} placeholder={placeholder}
        className="text-xs px-2 py-0.5 rounded border border-teal-400 bg-teal-50 outline-none w-36"
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
      />
      <button onClick={save} disabled={saving} className="text-[10px] bg-teal-600 text-white px-1.5 py-0.5 rounded disabled:opacity-50">{saving ? '...' : 'OK'}</button>
      <button onClick={() => setEditing(false)} className="text-[10px] text-slate-400 hover:text-slate-600">✕</button>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ManagementWorkspace({
  initialTemplates, clinicData, users, initialInvitations, userLimit, currentUserId, userEmail, userFullName,
  initialCatalog, initialClinicConfig, initialSettingsConfig = null, initialRooms = [],
  activeModules = [], isSysmax = false, initialWhatsAppSettings = null,
}: ManagementWorkspaceProps) {
  const searchParams = useSearchParams()
  const activeTab = (searchParams.get('tab') as ActiveTab | null) ?? 'templates'
  const [templates, setTemplates] = useState<DocumentTemplate[]>(initialTemplates)
  const [showModal, setShowModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Clinic edit state
  const [isEditingClinic, setIsEditingClinic] = useState(false)
  const [clinicName, setClinicName]       = useState(clinicData?.name || '')
  const [clinicCnpj, setClinicCnpj]       = useState(clinicData?.cnpj || '')
  const [clinicAddress, setClinicAddress] = useState(clinicData?.address || '')
  const [clinicPhone, setClinicPhone]     = useState(clinicData?.phone || '')
  const [clinicChecklist, setClinicChecklist] = useState<string[]>(clinicData?.reception_checklist || [])
  const [newChecklistItem, setNewChecklistItem] = useState('')
  const [isSavingClinic, setIsSavingClinic] = useState(false)

  // Logo state
  const [logoUrl, setLogoUrl]               = useState<string | null>(initialClinicConfig?.logo_url ?? null)
  const [uploadingLogo, setUploadingLogo]   = useState(false)
  const logoFileRef = useRef<HTMLInputElement>(null)

  async function handleLogoFile(file: File) {
    setUploadingLogo(true)
    const fd = new FormData()
    fd.append('logo', file)
    const res = await uploadClinicLogo(fd)
    setUploadingLogo(false)
    if ('error' in res) { setToast({ type: 'error', message: res.error }); return }
    setLogoUrl(res.url)
    setToast({ type: 'success', message: 'Logo atualizada com sucesso!' })
  }

  async function handleRemoveLogo() {
    const res = await removeClinicLogo()
    if ('error' in res) { setToast({ type: 'error', message: res.error }); return }
    setLogoUrl(null)
    setToast({ type: 'success', message: 'Logo removida.' })
  }

  // G-08: RBAC por módulo — mapa userId → módulos desativados
  const [userModuleOverrides, setUserModuleOverrides] = useState<Record<string, Record<string, boolean>>>({})
  const [loadingModulesForUser, setLoadingModulesForUser] = useState<string | null>(null)
  const [expandedModulesUser, setExpandedModulesUser] = useState<string | null>(null)

  const MODULE_LABELS: Record<string, string> = {
    grooming: 'Banho e Tosa', consultation: 'Consultório', exams: 'Exames',
    hospitalization: 'Internação', pharmacy: 'Farmácia', whatsapp_intelligent: 'WhatsApp IA',
  }

  async function handleExpandModules(userId: string) {
    if (expandedModulesUser === userId) { setExpandedModulesUser(null); return }
    setExpandedModulesUser(userId)
    if (userModuleOverrides[userId]) return
    setLoadingModulesForUser(userId)
    const res = await getUserModuleAccess(userId)
    setLoadingModulesForUser(null)
    if ('error' in res) return
    const map: Record<string, boolean> = {}
    for (const r of res) map[r.module_name] = r.enabled
    setUserModuleOverrides(prev => ({ ...prev, [userId]: map }))
  }

  async function handleToggleModule(userId: string, moduleName: string, currentEnabled: boolean) {
    const newEnabled = !currentEnabled
    setUserModuleOverrides(prev => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? {}), [moduleName]: newEnabled },
    }))
    const res = await setUserModuleAccess(userId, moduleName, newEnabled)
    if ('error' in res) {
      setToast({ type: 'error', message: res.error })
      setUserModuleOverrides(prev => ({
        ...prev,
        [userId]: { ...(prev[userId] ?? {}), [moduleName]: currentEnabled },
      }))
    }
  }

  // CRMV edit state
  const [editingCrmvUserId, setEditingCrmvUserId] = useState<string | null>(null)
  const [crmvInputValue, setCrmvInputValue] = useState('')
  const [savingCrmv, setSavingCrmv] = useState(false)
  const CRMV_REGEX = /^[A-Za-z]{2}[0-9]{4,10}$/

  const handleEditCrmv = (userId: string, currentCrmv: string | null) => {
    setEditingCrmvUserId(userId)
    setCrmvInputValue(currentCrmv ?? '')
  }

  const handleSaveCrmv = async (userId: string) => {
    const val = crmvInputValue.trim().toUpperCase()
    if (val && !CRMV_REGEX.test(val)) {
      setToast({ type: 'error', message: 'Formato CRMV inválido. Use: UF + 4-10 dígitos (ex: SP12345)' })
      return
    }
    setSavingCrmv(true)
    try {
      const res = await fetch('/api/update-user-crmv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, crmv: val || null }),
      })
      if (res.ok) {
        setToast({ type: 'success', message: 'CRMV atualizado com sucesso.' })
        setEditingCrmvUserId(null)
        window.location.reload()
      } else {
        const data = await res.json()
        setToast({ type: 'error', message: data.error ?? 'Erro ao salvar CRMV.' })
      }
    } catch {
      setToast({ type: 'error', message: 'Erro de conexão.' })
    } finally {
      setSavingCrmv(false)
    }
  }

  // Modal de usuário (G-08 + G-10)
  const [userModalTarget, setUserModalTarget] = useState<ClinicUserFull | null | undefined>(undefined)
  // undefined = fechado, null = novo usuário, objeto = editar

  // Invite state
  const [invitations, setInvitations] = useState<Invitation[]>(initialInvitations)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteState, inviteAction, invitePending] = useActionState(createInvitation, null)
  const [sendInviteState, sendInviteAction, sendInvitePending] = useActionState(createAndSendInvitation, null)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [emailSentSuccess, setEmailSentSuccess] = useState(false)
  const [copiedToken, setCopiedToken] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const inviteFormRef = useRef<HTMLFormElement>(null)

  // ── Template handlers ──────────────────────────────────────────────────────

  const handleDeleteTemplate = async (id: string) => {
    setDeletingId(id)
    const result = await deleteTemplate(id)
    if ('error' in result) {
      setToast({ type: 'error', message: result.error })
    } else {
      setTemplates(templates.filter(t => t.id !== id))
      setToast({ type: 'success', message: 'Modelo removido com sucesso.' })
    }
    setDeletingId(null)
  }

  const handleTemplateAdded = (t: DocumentTemplate) => {
    if (editingTemplate) {
      // Update existing template in list
      setTemplates(prev => prev.map(tpl => tpl.id === t.id ? t : tpl))
      setEditingTemplate(null)
      setToast({ type: 'success', message: `Modelo "${t.name}" atualizado com sucesso!` })
    } else {
      setTemplates([t, ...templates])
      setShowModal(false)
      setToast({ type: 'success', message: `Modelo "${t.name}" salvo com sucesso!` })
    }
  }

  // ── Clinic handlers ────────────────────────────────────────────────────────

  const handleSaveClinic = async () => {
    setIsSavingClinic(true)
    try {
      const res = await fetch('/api/update-clinic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:                clinicName,
          cnpj:                clinicCnpj,
          address:             clinicAddress,
          phone:               clinicPhone,
          reception_checklist: clinicChecklist,
        }),
      })
      if (res.ok) {
        setToast({ type: 'success', message: 'Dados da clínica atualizados!' })
        setIsEditingClinic(false)
      } else {
        const err = await res.json()
        setToast({ type: 'error', message: err.error || 'Erro ao atualizar.' })
      }
    } catch {
      setToast({ type: 'error', message: 'Erro de conexão.' })
    } finally {
      setIsSavingClinic(false)
    }
  }

  const handleCancelClinic = () => {
    setClinicName(clinicData?.name || '')
    setClinicCnpj(clinicData?.cnpj || '')
    setClinicAddress(clinicData?.address || '')
    setClinicPhone(clinicData?.phone || '')
    setClinicChecklist(clinicData?.reception_checklist || [])
    setIsEditingClinic(false)
  }

  // ── User role handler ──────────────────────────────────────────────────────

  const handleChangeRole = async (userId: string, newRole: UserRole) => {
    try {
      const res = await fetch('/api/update-user-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, role: newRole }),
      })
      if (res.ok) {
        setToast({ type: 'success', message: 'Role atualizada com sucesso.' })
        // Force page refresh to reflect changes
        window.location.reload()
      } else {
        setToast({ type: 'error', message: 'Erro ao atualizar role.' })
      }
    } catch {
      setToast({ type: 'error', message: 'Erro de conexão.' })
    }
  }

  // ── Invite handlers ───────────────────────────────────────────────────────

  // Detecta sucesso do convite via useEffect (useActionState retorna void no handler)
  useEffect(() => {
    if (inviteState && 'url' in inviteState) {
      setGeneratedUrl(inviteState.url)
      setEmailSentSuccess(false)
      setShowInviteForm(false)
    }
  }, [inviteState])

  // Detecta sucesso do envio com email
  useEffect(() => {
    if (sendInviteState && 'url' in sendInviteState) {
      setGeneratedUrl(sendInviteState.url)
      setEmailSentSuccess(!!sendInviteState.emailSent)
      setShowInviteForm(false)
      if (sendInviteState.emailSent) {
        setToast({ type: 'success', message: 'Convite enviado por e-mail com sucesso!' })
      } else {
        setToast({ type: 'error', message: 'Link gerado, mas falha ao enviar e-mail. Copie e envie manualmente.' })
      }
    }
    if (sendInviteState && 'error' in sendInviteState) {
      setToast({ type: 'error', message: sendInviteState.error })
    }
  }, [sendInviteState])

  const handleCopyLink = () => {
    if (generatedUrl) {
      navigator.clipboard.writeText(generatedUrl)
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2500)
    }
  }

  const handleRevoke = async (id: string) => {
    setRevokingId(id)
    const result = await revokeInvitation(id)
    if (result.error) {
      setToast({ type: 'error', message: result.error })
    } else {
      setInvitations(prev => prev.filter(i => i.id !== id))
      setToast({ type: 'success', message: 'Convite revogado.' })
    }
    setRevokingId(null)
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}


      {/* ── Tab: Templates ── */}
      {activeTab === 'templates' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                <BarChart3 className="h-4 w-4 text-slate-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Modelos de Documentos</h2>
                <p className="text-xs text-slate-500">Templates customizados pela clínica</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
                {templates.length} modelo{templates.length !== 1 ? 's' : ''}
              </span>
              <button onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
                <Plus className="w-4 h-4" /><span className="hidden sm:inline">Importar Novo Modelo</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {templates.length === 0 ? (
              <div className="p-10 text-center">
                <BarChart3 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-500">Nenhum modelo cadastrado</p>
                <p className="text-xs text-slate-400 mt-1">Clique em "Importar Novo Modelo" para começar</p>
              </div>
            ) : (
              templates.map(template => {
                const colors = TYPE_COLORS[template.type]
                return (
                  <div key={template.id} className="p-5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-900">{template.name}</h3>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.light} ${colors.text}`}>
                            {TYPE_LABELS[template.type]}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {template.extracted_fields.length} campos · criado em {new Date(template.created_at).toLocaleDateString('pt-BR')}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {template.extracted_fields.slice(0, 4).map(f => (
                            <span key={f.field_name} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                              {f.label}
                            </span>
                          ))}
                          {template.extracted_fields.length > 4 && (
                            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                              +{template.extracted_fields.length - 4} mais
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => setEditingTemplate(template)}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar Layout">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteTemplate(template.id)}
                          disabled={deletingId === template.id}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Excluir Template">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Catálogo ── */}
      {activeTab === 'catalogo' && (
        <CatalogTab
          initialItems={initialCatalog}
          onToast={(type, message) => setToast({ type, message })}
        />
      )}

      {/* ── Tab: Convênios ── */}
      {activeTab === 'convenios' && (
        <ConveniosTab onToast={(type, message) => setToast({ type, message })} />
      )}

      {/* ── Tab: Configurações (G-15 — categorias reorganizadas) ── */}
      {activeTab === 'configuracoes' && (
        <SettingsWorkspace
          initialClinicConfig={initialClinicConfig}
          initialSettingsConfig={initialSettingsConfig}
          initialWhatsappSettings={initialWhatsAppSettings}
          initialChecklist={(clinicData?.reception_checklist as string[] | null) ?? []}
          activeModules={activeModules}
          onToast={(type, message) => setToast({ type, message })}
        />
      )}

      {/* ── Tab: Clínica ── */}
      {activeTab === 'clinica' && (
        <div className="space-y-5">
          {/* Dados da Clínica */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                  <Building2 className="h-4 w-4 text-slate-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Dados da Clínica</h2>
                  <p className="text-xs text-slate-500">Nome, CNPJ, endereço e contato</p>
                </div>
              </div>
              {!isEditingClinic && (
                <button onClick={() => setIsEditingClinic(true)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                  Editar
                </button>
              )}
            </div>

            <div className="p-6">
              {!isEditingClinic ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InfoField label="Nome da Clínica" value={clinicName} />
                  <InfoField label="CNPJ" value={clinicCnpj} />
                  <InfoField label="Endereço" value={clinicAddress} />
                  <InfoField label="Telefone" value={clinicPhone} />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <EditField label="Nome da Clínica" value={clinicName} onChange={setClinicName} placeholder="Ex: Clínica Veterinária ABC" />
                    <EditField label="CNPJ" value={clinicCnpj} onChange={setClinicCnpj} placeholder="00.000.000/0001-00" />
                    <EditField label="Endereço" value={clinicAddress} onChange={setClinicAddress} placeholder="Rua, número, bairro" />
                    <EditField label="Telefone" value={clinicPhone} onChange={setClinicPhone} placeholder="(00) 00000-0000" />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button onClick={handleSaveClinic} disabled={isSavingClinic}
                      className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50">
                      <Save className="w-4 h-4" />{isSavingClinic ? 'Salvando...' : 'Salvar'}
                    </button>
                    <button onClick={handleCancelClinic} disabled={isSavingClinic}
                      className="flex items-center gap-2 px-5 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
                      <X className="w-4 h-4" />Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Identidade Visual */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                <Image className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">Identidade Visual (White-label)</h2>
                <p className="text-xs text-slate-500">Logo que substitui "SysVetMax" no menu e nos documentos</p>
              </div>
            </div>
            <div className="p-6">
              {logoUrl ? (
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-auto max-w-[180px] items-center rounded-xl border border-slate-200 bg-slate-50 px-4">
                    <img src={logoUrl} alt="Logo da clínica" className="h-10 w-auto object-contain" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-700">Logo carregada</p>
                    <div className="flex gap-2">
                      <button onClick={() => logoFileRef.current?.click()}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                        <Upload className="h-3.5 w-3.5" />Trocar
                      </button>
                      <button onClick={handleRemoveLogo}
                        className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />Remover
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <button onClick={() => logoFileRef.current?.click()} disabled={uploadingLogo}
                  className="flex flex-col items-center justify-center w-full rounded-xl border-2 border-dashed border-slate-200 py-8 gap-3 hover:border-blue-400 hover:bg-blue-50/30 transition-colors disabled:opacity-50">
                  {uploadingLogo
                    ? <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                    : <Upload className="h-8 w-8 text-slate-400" />}
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-700">
                      {uploadingLogo ? 'Enviando...' : 'Clique para fazer upload da logo'}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">PNG, JPEG, WebP ou SVG · Máx 2MB</p>
                  </div>
                </button>
              )}
              <input ref={logoFileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); e.target.value = '' }}
              />
            </div>
          </div>

          {/* Checklist de Recepção */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="border-b border-slate-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                  <CheckCircle2 className="h-4 w-4 text-slate-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Checklist de Recepção</h2>
                  <p className="text-xs text-slate-500">Itens exibidos durante o check-in</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-3">
              {isEditingClinic && (
                <div className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newChecklistItem}
                    onChange={e => setNewChecklistItem(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newChecklistItem.trim()) {
                        setClinicChecklist(prev => [...prev, newChecklistItem.trim()])
                        setNewChecklistItem('')
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Ex: Verificar carteira de vacinação"
                  />
                  <button
                    onClick={() => {
                      if (newChecklistItem.trim()) {
                        setClinicChecklist(prev => [...prev, newChecklistItem.trim()])
                        setNewChecklistItem('')
                      }
                    }}
                    className="px-4 py-2 bg-blue-100 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-200 transition-colors"
                  >
                    + Adicionar
                  </button>
                </div>
              )}
              {clinicChecklist.length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center py-4">Nenhum item configurado</p>
              ) : (
                clinicChecklist.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      {item}
                    </div>
                    {isEditingClinic && (
                      <button onClick={() => setClinicChecklist(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors">
                        Remover
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Horário de Funcionamento */}
          <BusinessHoursTab initialConfig={clinicData} onToast={(type, msg) => setToast({ type, message: msg })} />
        </div>
      )}

      {/* ── Tab: Salas/Boxes ── */}
      {activeTab === 'salas' && (
        <RoomsTab initialRooms={initialRooms} />
      )}

      {/* ── Tab: Aparência ── */}
      {activeTab === 'aparencia' && (
        <AppearanceTab />
      )}

      {/* ── Tab: Monitoramento de Erros (G-07-D) — restrito a is_sysmax ── */}
      {activeTab === 'monitoramento' && isSysmax && (
        <ErrorMonitoringDashboard />
      )}

      {/* ── Tab: Usuários ── */}
      {activeTab === 'usuarios' && (
        <div className="space-y-5">

          {/* Licença / capacidade */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-6 py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">Licença da Clínica</span>
              </div>
              <span className="text-sm font-bold text-slate-900">{users.length} / {userLimit} usuários</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${users.length >= userLimit ? 'bg-red-500' : users.length >= userLimit * 0.8 ? 'bg-amber-400' : 'bg-teal-500'}`}
                style={{ width: `${Math.min((users.length / userLimit) * 100, 100)}%` }}
              />
            </div>
            {users.length >= userLimit && (
              <p className="mt-2 text-xs text-red-600">Limite atingido. Contate a SisMax Solutions para expandir sua licença.</p>
            )}
          </div>

          {/* Convite gerado */}
          {generatedUrl && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-teal-600">
                  <LinkIcon className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-teal-900 mb-1">
                    {emailSentSuccess ? 'Convite enviado por e-mail!' : 'Link de convite gerado!'}
                  </p>
                  {emailSentSuccess && (
                    <p className="text-xs text-teal-700 mb-1 flex items-center gap-1">
                      <Check className="w-3 h-3" /> E-mail de convite enviado com sucesso
                    </p>
                  )}
                  <p className="text-xs text-teal-700 break-all font-mono bg-teal-100 rounded px-2 py-1">{generatedUrl}</p>
                  <p className="text-xs text-teal-600 mt-1">Válido por 7 dias. Compartilhe apenas com a pessoa convidada.</p>
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={handleCopyLink}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors">
                    {copiedToken ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedToken ? 'Copiado!' : 'Copiar'}
                  </button>
                  <button onClick={() => setGeneratedUrl(null)}
                    className="text-xs text-teal-500 hover:text-teal-700 text-center">Fechar</button>
                </div>
              </div>
            </div>
          )}

          {/* Formulário de convite inline */}
          {showInviteForm && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-slate-900">Novo Convite</p>
                <button onClick={() => setShowInviteForm(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form ref={inviteFormRef} className="flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <input type="email" name="email" required placeholder="email@exemplo.com"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  />
                  <select name="role" required
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white">
                    {INVITE_ROLE_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    formAction={inviteAction}
                    disabled={invitePending || sendInvitePending}
                    className="flex items-center gap-1.5 px-5 py-2 bg-slate-600 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors disabled:opacity-50 whitespace-nowrap">
                    <LinkIcon className="w-3.5 h-3.5" />
                    {invitePending ? 'Gerando...' : 'Gerar Link'}
                  </button>
                  <button
                    type="submit"
                    formAction={sendInviteAction}
                    disabled={invitePending || sendInvitePending}
                    className="flex items-center gap-1.5 px-5 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 whitespace-nowrap">
                    <Send className="w-3.5 h-3.5" />
                    {sendInvitePending ? 'Enviando...' : 'Enviar Convite'}
                  </button>
                </div>
              </form>
              {inviteState && 'error' in inviteState && (
                <p className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{inviteState.error}</p>
              )}
            </div>
          )}

          {/* Lista de usuários */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                  <Users className="h-4 w-4 text-slate-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Equipe Ativa</h2>
                  <p className="text-xs text-slate-500">Gerencie roles e permissões</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowInviteForm(true); setGeneratedUrl(null) }}
                  disabled={users.length >= userLimit}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  <Mail className="w-4 h-4" />Convidar
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {users.map(u => (
                <div key={u.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{u.full_name}</p>
                      {u.id === currentUserId && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Você</span>
                      )}
                    </div>
                    {/* CRMV: exibe para vets, editável via inline */}
                    {u.role === 'vet' && editingCrmvUserId !== u.id && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {u.crmv ? (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${CRMV_REGEX.test(u.crmv) ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                            CRMV: {u.crmv}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded font-medium">
                            CRMV não cadastrado
                          </span>
                        )}
                        <button
                          onClick={() => handleEditCrmv(u.id, u.crmv)}
                          className="text-[10px] text-teal-600 hover:text-teal-700 underline"
                        >
                          editar
                        </button>
                      </div>
                    )}
                    {u.role === 'vet' && editingCrmvUserId === u.id && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <input
                          data-testid={`crmv-input-${u.id}`}
                          value={crmvInputValue}
                          onChange={e => setCrmvInputValue(e.target.value.toUpperCase())}
                          placeholder="SP12345"
                          className={`text-xs px-2 py-1 rounded border font-mono w-28 outline-none ${
                            crmvInputValue && !CRMV_REGEX.test(crmvInputValue)
                              ? 'border-red-400 bg-red-50'
                              : 'border-teal-400 bg-teal-50 focus:border-teal-600'
                          }`}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveCrmv(u.id); if (e.key === 'Escape') setEditingCrmvUserId(null) }}
                        />
                        <button
                          data-testid={`crmv-save-${u.id}`}
                          onClick={() => handleSaveCrmv(u.id)}
                          disabled={savingCrmv || (!!crmvInputValue && !CRMV_REGEX.test(crmvInputValue))}
                          className="text-[10px] bg-teal-600 text-white px-2 py-1 rounded disabled:opacity-50"
                        >
                          {savingCrmv ? '...' : 'OK'}
                        </button>
                        <button onClick={() => setEditingCrmvUserId(null)} className="text-[10px] text-slate-400 hover:text-slate-600">✕</button>
                      </div>
                    )}
                    {/* Phone */}
                    <UserInlineField
                      label="Tel"
                      value={u.phone ?? ''}
                      placeholder="(11) 99999-0000"
                      onSave={async (val) => { await updateUserPhone(u.id, val) }}
                    />
                    {/* Apelido (G-10) */}
                    <UserInlineField
                      label="Apelido"
                      value={u.nickname ?? ''}
                      placeholder="Ex: Dr. Carlos"
                      onSave={async (val) => { await updateUserNickname(u.id, val) }}
                    />
                    {/* Specialties */}
                    {(u.role === 'vet' || u.role === 'assistant') && (
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        {(u.specialties ?? []).map((s, i) => (
                          <span key={i} className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium">{s}</span>
                        ))}
                        {(u.specialties ?? []).length === 0 && (
                          <span className="text-[10px] text-slate-400 italic">Sem especialidade</span>
                        )}
                      </div>
                    )}
                    {/* G-08: RBAC por módulo (não mostrar para o próprio admin) */}
                    {u.id !== currentUserId && activeModules.length > 0 && (
                      <div className="mt-1">
                        <button
                          type="button"
                          onClick={() => handleExpandModules(u.id)}
                          className="text-[10px] text-teal-600 hover:text-teal-700 underline flex items-center gap-0.5"
                        >
                          {expandedModulesUser === u.id ? '▲' : '▼'} Acesso a Módulos
                        </button>
                        {expandedModulesUser === u.id && (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {loadingModulesForUser === u.id ? (
                              <span className="text-[10px] text-slate-400 italic">Carregando...</span>
                            ) : (
                              activeModules.map(mod => {
                                const overrides = userModuleOverrides[u.id] ?? {}
                                const enabled = overrides[mod] !== undefined ? overrides[mod] : true
                                return (
                                  <button
                                    key={mod}
                                    type="button"
                                    onClick={() => handleToggleModule(u.id, mod, enabled)}
                                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border transition-colors ${
                                      enabled
                                        ? 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
                                        : 'bg-red-50 text-red-500 border-red-200 hover:bg-red-100'
                                    }`}
                                    title={enabled ? 'Clique para revogar acesso' : 'Clique para liberar acesso'}
                                  >
                                    {enabled ? '✓' : '✗'} {MODULE_LABELS[mod] ?? mod}
                                  </button>
                                )
                              })
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      value={u.role}
                      onChange={e => handleChangeRole(u.id, e.target.value as UserRole)}
                      disabled={u.id === currentUserId}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border-0 outline-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${ROLE_BADGE[u.role] ?? 'bg-slate-100 text-slate-600'}`}
                    >
                      <option value="admin">Administrador</option>
                      <option value="vet">Médico Veterinário</option>
                      <option value="assistant">Auxiliar Veterinário</option>
                      <option value="receptionist">Recepcionista</option>
                    </select>
                    <button
                      onClick={() => setUserModalTarget(u as ClinicUserFull)}
                      title="Editar usuário"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Convites pendentes */}
          {invitations.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50">
                  <Mail className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Convites Pendentes</h2>
                  <p className="text-xs text-slate-500">{invitations.length} convite{invitations.length !== 1 ? 's' : ''} aguardando aceite</p>
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {invitations.map(inv => (
                  <div key={inv.id} className="px-6 py-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{inv.email}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_BADGE[inv.role] ?? 'bg-slate-100 text-slate-600'}`}>
                          {ROLE_LABELS[inv.role]}
                        </span>
                        <span className="text-xs text-slate-400">
                          Expira {new Date(inv.expires_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevoke(inv.id)}
                      disabled={revokingId === inv.id}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal de Importação de Template */}
      {showModal && (
        <ImportTemplateModal onClose={() => setShowModal(false)} onSuccess={handleTemplateAdded} clinicLogoUrl={logoUrl} />
      )}

      {/* Modal de Edição de Layout do Template */}
      {editingTemplate && (
        <ImportTemplateModal
          onClose={() => setEditingTemplate(null)}
          onSuccess={handleTemplateAdded}
          clinicLogoUrl={logoUrl}
          editTemplate={editingTemplate}
        />
      )}

      {/* Modal Usuário (G-08 + G-10) */}
      {userModalTarget !== undefined && (
        <UserManagementModal
          user={userModalTarget}
          rooms={initialRooms}
          activeModules={activeModules}
          currentUserId={currentUserId}
          onClose={() => setUserModalTarget(undefined)}
          onSaved={() => { setUserModalTarget(undefined); window.location.reload() }}
        />
      )}
    </>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm text-slate-800 font-medium">{value || <span className="text-slate-400 italic font-normal">Não informado</span>}</p>
    </div>
  )
}

function EditField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
    </div>
  )
}
