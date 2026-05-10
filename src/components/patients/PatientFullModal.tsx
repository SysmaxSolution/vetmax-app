'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { X, Save, Loader2, User, Dog, MapPin, PhoneCall, Syringe, Camera, Shield, Trash2, Plus, AlertTriangle, Cpu } from 'lucide-react'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { DateInput } from '@/components/ui/DatePicker'
import { updateFullProfile, uploadPetPhoto } from '@/lib/actions/pets'
import { registerTutorAndPet, addPatientToTutor, getTutorByCpf, recordConsent } from '@/lib/actions/tutors'
import ConsentModal from '@/components/reception/ConsentModal'
import SMSConsentToggle from '@/components/reception/SMSConsentToggle'
import { getPatientVaccines, type PatientVaccine } from '@/lib/actions/vaccines'
import { getInsuranceProviders, type InsuranceProvider } from '@/lib/actions/insurance-providers'
import { getPetInsurance, upsertPetInsurance, removePetInsurance, type PetInsurance } from '@/lib/actions/pet-insurance'
import VaccinationCard from '@/components/vet/VaccinationCard'
import { BehaviorTagsSelector } from '@/components/ui/BehaviorTagsBadges'
import type { PatientsListItem } from '@/lib/actions/timeline'
import type { PatientSpecies } from '@/types'
import { REPRODUCTIVE_STATUS_OPTIONS } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const SPECIES_OPTIONS = [
  { value: 'dog',     label: 'Cão' },
  { value: 'cat',     label: 'Gato' },
  { value: 'bird',    label: 'Ave' },
  { value: 'rabbit',  label: 'Coelho' },
  { value: 'rodent',  label: 'Roedor' },
  { value: 'reptile', label: 'Réptil' },
  { value: 'fish',    label: 'Peixe' },
  { value: 'exotic',  label: 'Silvestre/Exótico' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function formatPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// ─── Props ────────────────────────────────────────────────────────────────────

type EditProps = {
  patient: PatientsListItem
  mode?: never
  tutorId?: never
  tutorName?: never
}

type CreateNewProps = {
  patient?: never
  mode: 'new_tutor_and_pet'
  tutorId?: never
  tutorName?: never
}

type CreateAddPetProps = {
  patient?: never
  mode: 'add_pet_to_tutor'
  tutorId: string
  tutorName: string
}

type Props = (EditProps | CreateNewProps | CreateAddPetProps) & {
  onClose: () => void
  onSuccess: (data: { tutorId: string; patientId: string; patientName: string; tutorName: string }) => void
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TabButton({ active, locked, onClick, icon, label }: {
  active: boolean; locked?: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={locked}
      title={locked ? 'Salve o cadastro primeiro para acessar esta aba' : undefined}
      className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
        locked
          ? 'border-transparent text-slate-300 cursor-not-allowed'
          : active
          ? 'border-teal-600 text-teal-600 bg-white'
          : 'border-transparent text-slate-400 hover:text-slate-600'
      }`}
    >
      {icon}
      {label}
      {locked && <span className="ml-1 text-[9px] bg-slate-100 text-slate-400 rounded-full px-1.5 py-0.5 font-medium">após salvar</span>}
    </button>
  )
}

function FieldInput({ label, value, onChange, icon, ...props }: any) {
  return (
    <div className="relative">
      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 ml-1 tracking-wider">{label}</label>
      <div className="relative group">
        {icon && <div className="absolute left-4 top-1/2 -translate-y-1/2">{icon}</div>}
        <input
          className={`w-full bg-slate-100/50 border border-slate-200 rounded-xl ${icon ? 'pl-11' : 'px-4'} py-3 text-sm font-medium focus:border-teal-500 outline-none transition-all`}
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          {...props}
        />
      </div>
    </div>
  )
}

function FieldSelect({ label, value, options, onChange, ...props }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; [k: string]: unknown }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 ml-1 tracking-wider">{label}</label>
      <select
        className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-teal-500 outline-none cursor-pointer"
        value={value}
        onChange={e => onChange(e.target.value)}
        {...(props as React.SelectHTMLAttributes<HTMLSelectElement>)}
      >
        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PatientFullModal({ patient, mode, tutorId: propTutorId, tutorName: propTutorName, onClose, onSuccess }: Props) {
  const isEdit = !!patient
  const isPetOnly = mode === 'add_pet_to_tutor'

  // ── After-creation IDs (used in create mode after pet is saved) ──
  const [createdPatientId, setCreatedPatientId] = useState<string | null>(isEdit ? patient.id : null)
  const [createdTutorId,   setCreatedTutorId]   = useState<string | null>(isEdit ? patient.tutor?.id ?? null : null)

  const locked = false // abas sempre acessíveis; Vacinas/Convênio carregam patId assim que disponível

  const [tab, setTab] = useState<'pet' | 'tutor' | 'vacinas' | 'convenio'>('pet')
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ── Foto ──
  const [photoUrl, setPhotoUrl] = useState<string | null>(patient?.photo_url ?? null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null) // foto selecionada antes de criar o pet
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Pet fields ──
  const [petName,             setPetName]             = useState(patient?.name ?? '')
  const [species,             setSpecies]             = useState<string>(patient?.species ?? 'dog')
  const [breed,               setBreed]               = useState(patient?.breed ?? '')
  const [birthDate,           setBirthDate]           = useState(patient?.birth_date ?? '')
  const [reproductiveStatus,  setReproductiveStatus]  = useState(patient?.reproductive_status ?? 'Desconhecido')
  const [tags,                setTags]                = useState<string[]>(patient?.behavior_tags ?? [])
  const [allergies,           setAllergies]           = useState(patient?.allergies ?? '')
  const [chronicDiseases,     setChronicDiseases]     = useState(patient?.chronic_diseases ?? '')
  const [microchipId,         setMicrochipId]         = useState(patient?.microchip_id ?? '')

  // ── Tutor fields ──
  const [tutorName,         setTutorName]         = useState(patient?.tutor?.name       ?? propTutorName ?? '')
  const [tutorPhone,        setTutorPhone]        = useState(patient?.tutor?.phone      ?? '')
  const [tutorCpf,          setTutorCpf]          = useState(patient?.tutor?.cpf        ?? '')
  const [tutorEmail,        setTutorEmail]        = useState(patient?.tutor?.email      ?? '')
  const [tutorAddress,      setTutorAddress]      = useState(patient?.tutor?.address    ?? '')
  const [emergencyContact,  setEmergencyContact]  = useState(patient?.tutor?.emergency_contact ?? '')

  // ── Consentimento LGPD ──
  const [showConsent, setShowConsent]   = useState(false)
  const [consentGiven, setConsentGiven] = useState(false)

  // ── CPF lookup (só modo criação) ──
  const [cpfLookupStatus, setCpfLookupStatus] = useState<'idle' | 'searching' | 'found' | 'not_found'>('idle')
  const [foundTutorId,    setFoundTutorId]    = useState<string | null>(null)
  const cpfLookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Vacinas ──
  const [vaccines,       setVaccines]       = useState<PatientVaccine[] | null>(null)
  const [loadingVaccines, setLoadingVaccines] = useState(false)

  // ── Convênio ──
  const [providers,        setProviders]        = useState<InsuranceProvider[]>([])
  const [currentInsurance, setCurrentInsurance] = useState<PetInsurance | null>(null)
  const [loadingInsurance, setLoadingInsurance] = useState(false)
  const [savingInsurance,  setSavingInsurance]  = useState(false)
  const [insProviderId,    setInsProviderId]    = useState('')
  const [insPlanType,      setInsPlanType]      = useState('')
  const [insMemberId,      setInsMemberId]      = useState('')
  const [insCoverage,      setInsCoverage]      = useState<'active' | 'suspended' | 'cancelled'>('active')
  const selectedProvider = providers.find(p => p.id === insProviderId)

  // ─── CPF Lookup effect (só modo criação de novo tutor) ───────────────────────
  useEffect(() => {
    if (isEdit || isPetOnly) return
    const digits = tutorCpf.replace(/\D/g, '')
    if (digits.length !== 11) {
      setCpfLookupStatus('idle')
      setFoundTutorId(null)
      if (cpfLookupTimer.current) clearTimeout(cpfLookupTimer.current)
      return
    }
    setCpfLookupStatus('searching')
    if (cpfLookupTimer.current) clearTimeout(cpfLookupTimer.current)
    cpfLookupTimer.current = setTimeout(async () => {
      const result = await getTutorByCpf(digits)
      if (result && !('error' in result)) {
        setFoundTutorId(result.id)
        setTutorName(result.name)
        setTutorPhone(formatPhone(result.phone))
        setTutorEmail(result.email ?? '')
        setTutorAddress(result.address ?? '')
        setCpfLookupStatus('found')
      } else {
        setFoundTutorId(null)
        setCpfLookupStatus('not_found')
      }
    }, 400)
    return () => { if (cpfLookupTimer.current) clearTimeout(cpfLookupTimer.current) }
  }, [tutorCpf, isEdit, isPetOnly])

  // ─── Vacinas lazy load ────────────────────────────────────────────────────────
  useEffect(() => {
    const patId = isEdit ? patient.id : createdPatientId
    if (tab === 'vacinas' && !vaccines && patId) {
      setLoadingVaccines(true)
      getPatientVaccines(patId).then(res => {
        if (Array.isArray(res)) setVaccines(res)
        setLoadingVaccines(false)
      })
    }
  }, [tab, patient?.id, createdPatientId, vaccines, isEdit])

  // ─── Convênio lazy load ───────────────────────────────────────────────────────
  useEffect(() => {
    const patId = isEdit ? patient.id : createdPatientId
    if (tab !== 'convenio' || !patId) return
    if (providers.length === 0) {
      getInsuranceProviders().then(res => { if (!('error' in res)) setProviders(res) })
    }
    if (!loadingInsurance && currentInsurance === null) {
      setLoadingInsurance(true)
      getPetInsurance(patId).then(res => {
        if (res && !('error' in res)) {
          setCurrentInsurance(res)
          setInsProviderId(res.provider_id)
          setInsPlanType(res.plan_type)
          setInsMemberId(res.member_id)
          setInsCoverage(res.coverage_status)
        }
        setLoadingInsurance(false)
      })
    }
  }, [tab, createdPatientId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Handlers ─────────────────────────────────────────────────────────────────

  // Salvar (edição)
  const handleSave = async () => {
    if (!isEdit) return
    setSaving(true)
    const res = await updateFullProfile(
      patient.id,
      patient.tutor.id,
      {
        name: petName, species, breed, birth_date: birthDate || null, reproductive_status: reproductiveStatus, behavior_tags: tags,
        allergies: allergies || null, chronic_diseases: chronicDiseases || null, microchip_id: microchipId || null,
      },
      { name: tutorName, phone: tutorPhone, cpf: tutorCpf, email: tutorEmail, address: tutorAddress, emergency_contact: emergencyContact }
    )
    if (res && 'success' in res) {
      onSuccess({ tutorId: patient.tutor.id, patientId: patient.id, patientName: petName, tutorName })
      onClose()
    } else {
      alert('Erro ao salvar: ' + (res && 'error' in res ? res.error : 'Verifique a conexão'))
    }
    setSaving(false)
  }

  // Criar pet (modo criação) — chamado pelo botão "Criar Cadastro" na aba Pet
  const handleCreate = () => {
    setCreateError(null)
    if (!petName.trim()) { setCreateError('Nome do Pet é obrigatório.'); return }
    if (!isEdit && !isPetOnly) {
      if (!tutorName.trim()) { setCreateError('Preencha o nome do tutor na aba Recepção.'); return }
      const cpfDigits = tutorCpf.replace(/\D/g, '')
      if (cpfDigits.length !== 11) { setCreateError('CPF inválido na aba Recepção — deve ter 11 dígitos.'); return }
      if (!tutorPhone.trim()) { setCreateError('Celular do tutor é obrigatório na aba Recepção.'); return }
    }

    // LGPD: para novo tutor (não encontrado por CPF), exige consentimento
    const isNewTutor = !isEdit && !isPetOnly && !foundTutorId
    if (isNewTutor && !consentGiven) {
      setShowConsent(true)
      return
    }

    doCreate()
  }

  const handleConsentAccept = () => {
    setConsentGiven(true)
    setShowConsent(false)
    doCreate()
  }

  const doCreate = () => {
    startTransition(async () => {
      const petPayload = {
        name:    petName,
        species: species as PatientSpecies,
        breed:   breed || undefined,
      }

      let result: { tutorId: string; patientId: string } | { error: string }

      const existingTutorId = isPetOnly ? propTutorId : foundTutorId
      if (existingTutorId) {
        const res = await addPatientToTutor(existingTutorId, petPayload)
        result = 'error' in res ? res : { tutorId: existingTutorId, patientId: res.id }
      } else {
        result = await registerTutorAndPet(
          { name: tutorName, cpf: tutorCpf, phone: tutorPhone, email: tutorEmail || undefined, address: tutorAddress || undefined },
          petPayload
        )
      }

      if ('error' in result) {
        setCreateError(result.error)
        return
      }

      setCreatedPatientId(result.patientId)
      setCreatedTutorId(result.tutorId)

      // LGPD: registrar consentimento para novo tutor criado
      if (!isEdit && !isPetOnly && !foundTutorId && consentGiven) {
        await recordConsent(result.tutorId, 'granted')
      }

      // Upload da foto pendente (selecionada antes da criação)
      await uploadPendingPhoto(result.patientId)
      // Avança para Vacinas automaticamente
      setTab('vacinas')
    })
  }

  // Upload foto
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const petId = isEdit ? patient.id : createdPatientId

    if (!petId) {
      // Modo criação: armazena pending e mostra preview local
      setPendingPhotoFile(file)
      setPendingPhotoPreview(URL.createObjectURL(file))
      return
    }

    // Tem petId: faz upload imediato
    setUploadingPhoto(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await uploadPetPhoto(petId, fd)
    if ('url' in res) {
      setPhotoUrl(res.url)
      setPendingPhotoFile(null)
      setPendingPhotoPreview(null)
      if (isEdit) {
        onSuccess({ tutorId: patient.tutor.id, patientId: patient.id, patientName: petName, tutorName })
      }
    } else {
      alert('Erro no upload: ' + res.error)
    }
    setUploadingPhoto(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Dispara upload da foto pendente após criação do pet
  const uploadPendingPhoto = async (petId: string) => {
    if (!pendingPhotoFile) return
    const fd = new FormData()
    fd.append('file', pendingPhotoFile)
    const res = await uploadPetPhoto(petId, fd)
    if ('url' in res) {
      setPhotoUrl(res.url)
    }
    setPendingPhotoFile(null)
    setPendingPhotoPreview(null)
  }

  // Convênio
  const handleSaveInsurance = async () => {
    const patId = isEdit ? patient.id : createdPatientId
    const tutId = isEdit ? patient.tutor?.id : createdTutorId ?? undefined
    if (!insProviderId || !insPlanType || !insMemberId.trim()) {
      alert('Preencha convênio, plano e número de carteirinha.')
      return
    }
    if (!patId) return
    setSavingInsurance(true)
    const res = await upsertPetInsurance({ patient_id: patId, tutor_id: tutId, provider_id: insProviderId, plan_type: insPlanType, member_id: insMemberId, coverage_status: insCoverage })
    if ('error' in res) { alert('Erro: ' + res.error) }
    else {
      setCurrentInsurance({ id: res.id, clinic_id: '', patient_id: patId, tutor_id: tutId ?? null, provider_id: insProviderId, plan_type: insPlanType, member_id: insMemberId, coverage_status: insCoverage, valid_until: null, notes: null, created_at: new Date().toISOString(), provider: selectedProvider ? { name: selectedProvider.name, plan_types: selectedProvider.plan_types } : undefined })
    }
    setSavingInsurance(false)
  }

  const handleRemoveInsurance = async () => {
    const patId = isEdit ? patient.id : createdPatientId
    if (!confirm('Desvincular convênio deste pet?') || !patId) return
    setSavingInsurance(true)
    const res = await removePetInsurance(patId)
    if ('error' in res) { alert('Erro: ' + res.error) }
    else { setCurrentInsurance(null); setInsProviderId(''); setInsPlanType(''); setInsMemberId(''); setInsCoverage('active') }
    setSavingInsurance(false)
  }

  // Concluir (modo criação, após desbloqueio)
  const handleFinish = () => {
    onSuccess({
      tutorId:     createdTutorId!,
      patientId:   createdPatientId!,
      patientName: petName,
      tutorName:   isPetOnly ? (propTutorName ?? '') : tutorName,
    })
  }

  // ─── Título do modal ──────────────────────────────────────────────────────────
  const modalTitle = isEdit
    ? `Editar ${petName || 'Pet'}`
    : isPetOnly
    ? `Novo Pet — ${propTutorName}`
    : 'Novo Cadastro'

  const modalSubtitle = isEdit ? 'Gestão de Cadastro' : 'Cadastrar Tutor e Pet'

  // ─── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <>
    {showConsent && (
      <ConsentModal
        tutorName={tutorName}
        onAccept={handleConsentAccept}
        onDecline={() => setShowConsent(false)}
      />
    )}
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="px-6 pt-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-teal-500 p-2 rounded-xl">
                <Dog className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">{modalTitle}</h2>
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">{modalSubtitle}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
              <X className="h-5 w-5 text-slate-400" />
            </button>
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-1 mb-[-1px]">
            <TabButton active={tab === 'pet'}     onClick={() => setTab('pet')}     icon={<Dog     className="h-4 w-4" />} label="Paciente" />
            <TabButton active={tab === 'tutor'}   onClick={() => setTab('tutor')}   icon={<User    className="h-4 w-4" />} label="Recepção" />
            <TabButton active={tab === 'vacinas'} onClick={() => setTab('vacinas')} icon={<Syringe  className="h-4 w-4" />} label="Vacinas" />
            <TabButton active={tab === 'convenio'} onClick={() => setTab('convenio')} icon={<Shield  className="h-4 w-4" />} label="Convênio" />
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-8">

          {/* ══ ABA: PACIENTE ══ */}
          {tab === 'pet' && (
            <div className="space-y-6">

              {/* Foto */}
              <div className="flex items-center gap-5">
                <div className="relative h-20 w-20 flex-shrink-0 rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-100">
                  {(photoUrl || pendingPhotoPreview) ? (
                    <ImageLightbox src={photoUrl ?? pendingPhotoPreview!} alt={petName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-3xl text-slate-300">
                      {petName[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                  {uploadingPhoto && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                      <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Foto do Animal</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    {(photoUrl || pendingPhotoPreview) ? 'Alterar Foto' : 'Enviar Foto'}
                  </button>
                  {pendingPhotoPreview && !createdPatientId && (
                    <p className="mt-1.5 text-[10px] text-teal-600 font-medium">Foto será enviada ao criar o cadastro</p>
                  )}
                  {!pendingPhotoPreview && (
                    <p className="mt-1.5 text-[10px] text-slate-400">JPG, PNG ou WebP · max 5 MB</p>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
                </div>
              </div>

              {/* Banner pós-criação */}
              {!isEdit && createdPatientId && (
                <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm font-medium text-green-800">
                  Pet cadastrado com sucesso! Complete as abas Vacinas e Convênio ou clique em Concluir.
                </div>
              )}

              <div className="grid grid-cols-2 gap-5">
                <FieldInput label="Nome do Pet *" value={petName} onChange={setPetName} placeholder="Ex: Thor, Luna..." data-mentor-step="pet-name-input" />
                <FieldSelect label="Espécie" value={species} options={SPECIES_OPTIONS} onChange={setSpecies} data-mentor-step="pet-species-select" />
              </div>
              <div className="grid grid-cols-3 gap-5">
                <FieldInput label="Raça" value={breed} onChange={setBreed} placeholder="Ex: Labrador" data-mentor-step="pet-breed-input" />
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 ml-1 tracking-wider">Data de Nascimento</label>
                  <DateInput value={birthDate} onChange={setBirthDate} placeholder="DD/MM/AAAA" />
                </div>
                <FieldSelect label="Estado Reprodutivo" value={reproductiveStatus} options={REPRODUCTIVE_STATUS_OPTIONS} onChange={setReproductiveStatus} data-mentor-step="pet-reproductive-select" />
              </div>
              <div data-mentor-step="pet-behavior-tags">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-3 tracking-widest">Tags de Comportamento</label>
                <BehaviorTagsSelector selected={tags} onChange={setTags} />
              </div>

              {/* ── Campos Clínicos ── */}
              <div className="pt-4 border-t border-slate-100 space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dados Clínicos</p>

                {/* Alergias — destaque vermelho */}
                <div className="relative">
                  <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase mb-1.5 ml-1 tracking-wider text-red-500">
                    <AlertTriangle className="h-3 w-3" />
                    Alergias Conhecidas
                  </label>
                  <textarea
                    data-mentor-step="pet-allergies"
                    value={allergies}
                    onChange={e => setAllergies(e.target.value)}
                    placeholder="Ex: Amoxicilina, picada de abelha, látex..."
                    rows={2}
                    className="w-full bg-red-50/50 border border-red-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-red-400 outline-none transition-all resize-none placeholder:text-slate-400"
                  />
                </div>

                {/* Doenças Crônicas — destaque laranja */}
                <div className="relative">
                  <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase mb-1.5 ml-1 tracking-wider text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    Doenças Crônicas
                  </label>
                  <textarea
                    data-mentor-step="pet-chronic-diseases"
                    value={chronicDiseases}
                    onChange={e => setChronicDiseases(e.target.value)}
                    placeholder="Ex: Diabetes mellitus, Leishmaniose, Hipotireoidismo..."
                    rows={2}
                    className="w-full bg-amber-50/50 border border-amber-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-amber-400 outline-none transition-all resize-none placeholder:text-slate-400"
                  />
                </div>

                {/* Microchip */}
                <div>
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase mb-1.5 ml-1 tracking-wider">
                    <Cpu className="h-3 w-3" />
                    Microchip ID
                  </label>
                  <input
                    data-mentor-step="pet-microchip"
                    type="text"
                    value={microchipId}
                    onChange={e => setMicrochipId(e.target.value)}
                    placeholder="Ex: 985112345678901 (15 dígitos ISO)"
                    maxLength={20}
                    className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-teal-500 outline-none transition-all"
                  />
                </div>
              </div>

              {createError && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">{createError}</div>
              )}
            </div>
          )}

          {/* ══ ABA: RECEPÇÃO ══ */}
          {tab === 'tutor' && (
            <div className="space-y-6">

              {/* CPF com lookup — só no modo criação de novo tutor */}
              {!isEdit && !isPetOnly && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 ml-1 tracking-wider">CPF *</label>
                  <div className="relative">
                    <input
                      value={tutorCpf}
                      onChange={e => setTutorCpf(formatCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      inputMode="numeric"
                      className={`w-full bg-slate-100/50 border rounded-xl px-4 py-3 pr-10 text-sm font-medium outline-none transition-all ${
                        cpfLookupStatus === 'found'
                          ? 'border-green-400 bg-green-50 focus:border-green-500'
                          : 'border-slate-200 focus:border-teal-500'
                      }`}
                    />
                    {cpfLookupStatus === 'searching' && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      </div>
                    )}
                    {cpfLookupStatus === 'found' && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {cpfLookupStatus === 'found' && (
                    <p className="mt-1.5 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700 font-medium">
                      Tutor encontrado — dados preenchidos automaticamente.
                    </p>
                  )}
                  {cpfLookupStatus === 'not_found' && (
                    <p className="mt-1 text-xs text-slate-500">CPF não cadastrado — preencha os dados abaixo.</p>
                  )}
                </div>
              )}

              <FieldInput label="Nome do Responsável *" value={tutorName} onChange={setTutorName} icon={<User className="h-4 w-4 text-slate-400" />} placeholder="Ex: Maria Silva" />
              <div className="grid grid-cols-2 gap-5">
                <FieldInput label="Celular *" value={tutorPhone} onChange={(v: string) => setTutorPhone(formatPhone(v))} placeholder="(00) 00000-0000" />
                {/* Em edição, CPF fica aqui junto ao telefone */}
                {isEdit && (
                  <FieldInput label="CPF" value={tutorCpf} onChange={setTutorCpf} placeholder="000.000.000-00" />
                )}
              </div>
              <FieldInput label="E-mail" value={tutorEmail} onChange={setTutorEmail} placeholder="tutor@email.com" type="email" />
              <div className="pt-4 border-t border-slate-100 space-y-4">
                <FieldInput label="Endereço Completo" value={tutorAddress} onChange={setTutorAddress} icon={<MapPin className="h-4 w-4 text-slate-400" />} placeholder="Rua, Número, Cidade" />
                <FieldInput label="Contacto de Emergência" value={emergencyContact} onChange={setEmergencyContact} icon={<PhoneCall className="h-4 w-4 text-slate-400" />} placeholder="(00) 00000-0000" />
              </div>

              {/* LGPD: toggle de consentimento WhatsApp — só em modo edição com tutorId conhecido */}
              {isEdit && patient?.tutor?.id && (
                <div className="pt-4 border-t border-slate-100">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-wider">
                    Comunicações (LGPD)
                  </label>
                  <SMSConsentToggle
                    tutorId={patient.tutor.id}
                    initialConsent={(patient.tutor as any).whatsapp_consent ?? false}
                  />
                </div>
              )}
            </div>
          )}

          {/* ══ ABA: VACINAS ══ */}
          {tab === 'vacinas' && (
            <div className="animate-in slide-in-from-bottom-2 duration-300">
              {!(isEdit || createdPatientId) ? (
                <LockedTabPlaceholder icon={<Syringe className="h-8 w-8 text-slate-300" />} message="Crie o cadastro primeiro para registrar vacinas." />
              ) : loadingVaccines ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-teal-500 mb-2" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carregando...</p>
                </div>
              ) : (
                <VaccinationCard
                  patientId={(isEdit ? patient.id : createdPatientId)!}
                  initialVaccines={vaccines || []}
                  isFinalized={false}
                />
              )}
            </div>
          )}

          {/* ══ ABA: CONVÊNIO ══ */}
          {tab === 'convenio' && (
            <div className="space-y-5 animate-in slide-in-from-bottom-2 duration-300">
              {!(isEdit || createdPatientId) ? (
                <LockedTabPlaceholder icon={<Shield className="h-8 w-8 text-slate-300" />} message="Crie o cadastro primeiro para vincular um convênio." />
              ) : loadingInsurance ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-teal-500 mb-2" />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Carregando...</p>
                </div>
              ) : (
                <>
                  {currentInsurance && (
                    <div className="flex items-center gap-3 bg-teal-50 border border-teal-200 rounded-2xl px-5 py-4">
                      <Shield className="h-5 w-5 text-teal-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-black text-teal-800">{currentInsurance.provider?.name ?? 'Convênio'}</p>
                        <p className="text-[11px] text-teal-600 mt-0.5">Plano: {currentInsurance.plan_type} · Carteirinha: {currentInsurance.member_id}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        currentInsurance.coverage_status === 'active'    ? 'bg-green-100 text-green-700'  :
                        currentInsurance.coverage_status === 'suspended' ? 'bg-amber-100 text-amber-700' :
                                                                            'bg-red-100 text-red-700'
                      }`}>
                        {currentInsurance.coverage_status === 'active' ? 'Ativo' : currentInsurance.coverage_status === 'suspended' ? 'Suspenso' : 'Cancelado'}
                      </span>
                    </div>
                  )}

                  {providers.length === 0 ? (
                    <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                      <Shield className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm font-bold text-slate-400">Nenhum convênio cadastrado</p>
                      <Link href="/dashboard/management?tab=convenios" className="text-xs text-teal-500 hover:text-teal-700 underline mt-1 block">
                        Configure em Gestão → Convênios
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 ml-1 tracking-wider">Convênio</label>
                        <select className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-teal-500 outline-none" value={insProviderId} onChange={e => { setInsProviderId(e.target.value); setInsPlanType('') }}>
                          <option value="">— Selecionar —</option>
                          {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      {insProviderId && selectedProvider && (
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 ml-1 tracking-wider">Plano</label>
                          <select className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-teal-500 outline-none" value={insPlanType} onChange={e => setInsPlanType(e.target.value)}>
                            <option value="">— Selecionar —</option>
                            {selectedProvider.plan_types.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 ml-1 tracking-wider">Número da Carteirinha</label>
                        <input className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-teal-500 outline-none" value={insMemberId} onChange={e => setInsMemberId(e.target.value)} placeholder="Ex: PTLV-123456" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 ml-1 tracking-wider">Status da Cobertura</label>
                        <select className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-teal-500 outline-none" value={insCoverage} onChange={e => setInsCoverage(e.target.value as 'active' | 'suspended' | 'cancelled')}>
                          <option value="active">Ativo</option>
                          <option value="suspended">Suspenso</option>
                          <option value="cancelled">Cancelado</option>
                        </select>
                      </div>
                      <div className="flex gap-3 pt-2">
                        <button onClick={handleSaveInsurance} disabled={savingInsurance || !insProviderId || !insPlanType || !insMemberId.trim()} className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-black flex items-center justify-center gap-2">
                          {savingInsurance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                          {savingInsurance ? 'Salvando...' : 'Vincular Convênio'}
                        </button>
                        {currentInsurance && (
                          <button onClick={handleRemoveInsurance} disabled={savingInsurance} className="px-4 py-2.5 rounded-xl text-sm font-black text-red-400 hover:bg-red-50 border border-red-100 disabled:opacity-50 flex items-center gap-1.5">
                            <Trash2 className="h-4 w-4" /> Remover
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="p-4 bg-white border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-600">
            {!isEdit && createdPatientId ? 'Fechar' : 'Sair'}
          </button>

          {/* Modo edição: salva */}
          {isEdit && (
            <button onClick={handleSave} disabled={saving} className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-2.5 rounded-xl text-sm font-black flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'A GUARDAR...' : 'CONFIRMAR ALTERAÇÕES'}
            </button>
          )}

          {/* Modo criação, pet ainda não criado: cria */}
          {!isEdit && !createdPatientId && (
            <button onClick={handleCreate} disabled={isPending} className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-2.5 rounded-xl text-sm font-black flex items-center gap-2 disabled:opacity-50">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {isPending ? 'Criando...' : 'CRIAR CADASTRO'}
            </button>
          )}

          {/* Modo criação, pet já criado: conclui */}
          {!isEdit && createdPatientId && (
            <button onClick={handleFinish} className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-2.5 rounded-xl text-sm font-black flex items-center gap-2">
              <Save className="h-4 w-4" />
              CONCLUIR CADASTRO
            </button>
          )}
        </div>
      </div>
    </div>
    </>
  )
}

// ─── Locked placeholder ───────────────────────────────────────────────────────
function LockedTabPlaceholder({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-3 opacity-40">{icon}</div>
      <p className="text-sm font-bold text-slate-400">{message}</p>
      <p className="text-xs text-slate-400 mt-1">Preencha as abas Paciente e Recepção e clique em Criar Cadastro.</p>
    </div>
  )
}
