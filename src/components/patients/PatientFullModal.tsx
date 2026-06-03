'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { X, Save, Loader2, User, Dog, MapPin, PhoneCall, Syringe, Camera, Shield, Trash2, Plus, AlertTriangle, Cpu, Paperclip, FileText, Upload, ExternalLink, Share2, Pencil, Calendar, StickyNote, Tag } from 'lucide-react'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { DateInput } from '@/components/ui/DatePicker'
import { updateFullProfile, uploadPetPhoto, softDeletePatient } from '@/lib/actions/pets'
import { uploadAttachment, getAttachments, deleteAttachment, updateAttachmentMetadata, type Attachment, type AttachmentMetadata } from '@/lib/actions/attachments'
import { registerTutorAndPet, addPatientToTutor, getTutorByCpf, recordConsent } from '@/lib/actions/tutors'
import { getRegistrationSettings } from '@/lib/actions/clinic-settings'
import ConsentModal from '@/components/reception/ConsentModal'
import SMSConsentToggle from '@/components/reception/SMSConsentToggle'
import { getPatientVaccines, type PatientVaccine } from '@/lib/actions/vaccines'
import { getInsuranceProviders, type InsuranceProvider } from '@/lib/actions/insurance-providers'
import { getPetInsurance, upsertPetInsurance, removePetInsurance, type PetInsurance } from '@/lib/actions/pet-insurance'
import { getCustomPricesForPatient, getPetlovePatientHistory, type PatientCustomPrice, type PetlovePatientHistoryEvent } from '@/lib/actions/patient-custom-prices'
import { updatePatientWeight } from '@/lib/actions/patient-weight'
import { PawPrint, Pin, History, UserPlus, ArrowRight, DollarSign, Receipt } from 'lucide-react'
import CustomPricesEditor from './CustomPricesEditor'
import PatientNotesPanel from './PatientNotesPanel'
import { FileText as FileTextIcon } from 'lucide-react'
import VaccinationCard from '@/components/vet/VaccinationCard'
import { ShareButton } from '@/components/ui/ShareButton'
import { BehaviorTagsSelector } from '@/components/ui/BehaviorTagsBadges'
import { BreedCombobox } from '@/components/ui/BreedCombobox'
import { lookupCepAction } from '@/lib/actions/cep'
import { lookupCnpjAction } from '@/lib/actions/cnpj'
import { getClientAppUrl } from '@/lib/app-url'
import type { PatientsListItem } from '@/lib/actions/timeline'
import type { PatientSpecies } from '@/types'

// ─── Castrado: 3-state helper ────────────────────────────────────────────────
type NeuteredState = 'yes' | 'no' | 'unknown'

function neuteredFromPatient(neutered: boolean | null | undefined, reproductive: string | null | undefined): NeuteredState {
  if (neutered === true) return 'yes'
  if (neutered === false && reproductive && !/Desconhecido/i.test(reproductive)) return 'no'
  return 'unknown'
}

function neuteredToBoolean(state: NeuteredState): boolean | null {
  if (state === 'yes') return true
  if (state === 'no')  return false
  return null
}

function deriveReproductiveStatus(gender: string, neutered: NeuteredState): string {
  if (neutered === 'unknown' || !gender) return 'Desconhecido'
  if (gender === 'male'   && neutered === 'yes') return 'Macho Castrado'
  if (gender === 'male'   && neutered === 'no')  return 'Macho Inteiro'
  if (gender === 'female' && neutered === 'yes') return 'Fêmea Castrada'
  if (gender === 'female' && neutered === 'no')  return 'Fêmea Inteira'
  return 'Desconhecido'
}

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

function formatCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`
}

function formatCpfCnpj(v: string) {
  const d = v.replace(/\D/g, '')
  return d.length <= 11 ? formatCpf(d) : formatCnpj(d)
}

function formatCep(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

function validateCpf(digits: string): boolean {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false
  const calc = (s: string, w: number[]) => {
    const sum = s.split('').reduce((a, d, i) => a + parseInt(d) * w[i], 0)
    const r = sum % 11; return r < 2 ? 0 : 11 - r
  }
  return calc(digits.slice(0,9), [10,9,8,7,6,5,4,3,2]) === parseInt(digits[9])
      && calc(digits.slice(0,10), [11,10,9,8,7,6,5,4,3,2]) === parseInt(digits[10])
}

function validateCnpj(digits: string): boolean {
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false
  const calc = (s: string, w: number[]) => {
    const sum = s.split('').reduce((a, d, i) => a + parseInt(d) * w[i], 0)
    const r = sum % 11; return r < 2 ? 0 : 11 - r
  }
  return calc(digits.slice(0,12), [5,4,3,2,9,8,7,6,5,4,3,2]) === parseInt(digits[12])
      && calc(digits.slice(0,13), [6,5,4,3,2,9,8,7,6,5,4,3,2]) === parseInt(digits[13])
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
      className={`flex flex-shrink-0 items-center gap-1.5 px-2 sm:px-5 py-2 sm:py-3 text-xs font-bold border-b-2 transition-all ${
        locked
          ? 'border-transparent text-slate-300 cursor-not-allowed'
          : active
          ? 'border-teal-600 text-teal-600 bg-white'
          : 'border-transparent text-slate-400 hover:text-slate-600'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
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

  const [tab, setTab] = useState<'pet' | 'tutor' | 'vacinas' | 'convenio' | 'documentos' | 'notas'>('pet')
  const [saving, setSaving] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteReason, setDeleteReason]       = useState('')
  const [deleting, setDeleting]               = useState(false)
  const [deleteError, setDeleteError]         = useState<string | null>(null)

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
  const [birthDateMode,       setBirthDateMode]       = useState<'date' | 'age'>(patient?.birth_date_estimated ? 'age' : 'date')
  const [ageValue,            setAgeValue]            = useState('')
  const [ageUnit,             setAgeUnit]             = useState<'A' | 'M'>('A')
  const [gender,              setGender]              = useState<'male'|'female'|''>((patient?.gender as 'male'|'female'|null) ?? '')
  const [neuteredState,       setNeuteredState]       = useState<NeuteredState>(neuteredFromPatient(patient?.neutered, patient?.reproductive_status))
  const [coatColor,           setCoatColor]           = useState(patient?.coat_color ?? '')
  const [tags,                setTags]                = useState<string[]>(patient?.behavior_tags ?? [])
  const [allergies,           setAllergies]           = useState(patient?.allergies ?? '')
  const [chronicDiseases,     setChronicDiseases]     = useState(patient?.chronic_diseases ?? '')
  const [microchipId,         setMicrochipId]         = useState(patient?.microchip_id ?? '')
  // Peso conhecido + auditoria (last_known_weight) — 2026-06-03
  const [weightKg,            setWeightKg]            = useState<string>(
    (patient as any)?.last_known_weight != null ? String((patient as any).last_known_weight).replace('.', ',') : ''
  )
  const lastWeightAt: string | null = (patient as any)?.last_known_weight_at ?? null
  const lastWeightSource: string | null = (patient as any)?.last_known_weight_source ?? null

  // ── Tutor fields ──
  const [tutorName,           setTutorName]           = useState(patient?.tutor?.name       ?? propTutorName ?? '')
  const [tutorPhone,          setTutorPhone]          = useState(patient?.tutor?.phone      ?? '')
  const [tutorCpf,            setTutorCpf]            = useState(patient?.tutor?.cpf        ?? '')
  const [tutorEmail,          setTutorEmail]          = useState(patient?.tutor?.email      ?? '')
  const [tutorAddress,        setTutorAddress]        = useState(patient?.tutor?.address    ?? '')
  const [emergencyContact,    setEmergencyContact]    = useState(patient?.tutor?.emergency_contact ?? '')
  // Endereço estruturado
  const tutorAny = patient?.tutor as any
  const [tutorCep,            setTutorCep]            = useState<string>(tutorAny?.cep            ?? '')
  const [tutorStreet,         setTutorStreet]         = useState<string>(tutorAny?.street         ?? '')
  const [tutorNeighborhood,   setTutorNeighborhood]   = useState<string>(tutorAny?.neighborhood   ?? '')
  const [tutorCity,           setTutorCity]           = useState<string>(tutorAny?.city           ?? '')
  const [tutorState,          setTutorState]          = useState<string>(tutorAny?.state          ?? '')
  const [tutorAddressNumber,  setTutorAddressNumber]  = useState<string>(tutorAny?.address_number ?? '')
  const [tutorComplement,     setTutorComplement]     = useState<string>(tutorAny?.address_complement ?? '')

  // ── Config de cadastro (verify_cpf_cnpj / verify_cep) ──
  const [regSettings, setRegSettings] = useState({ verify_cpf_cnpj: false, verify_cep: false })
  useEffect(() => {
    getRegistrationSettings().then(setRegSettings)
  }, [])

  // ── Status de validação CPF/CNPJ ──
  const [cpfCnpjStatus, setCpfCnpjStatus] = useState<'idle'|'invalid'|'valid'|'found_cnpj'|'searching_cnpj'>('idle')
  const cpfCnpjTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Status de busca CEP ──
  const [cepStatus, setCepStatus] = useState<'idle'|'searching'|'found'|'not_found'|'error'>('idle')

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

  // ── Preços do Convênio + Histórico Petlove (carregados junto com convenio) ──
  const [customPrices,    setCustomPrices]    = useState<PatientCustomPrice[] | null>(null)
  const [petloveHistory,  setPetloveHistory]  = useState<PetlovePatientHistoryEvent[] | null>(null)

  // ── Documentos ──
  const [attachments,       setAttachments]      = useState<Attachment[] | null>(null)
  const [loadingDocs,       setLoadingDocs]      = useState(false)
  const [uploadingDoc,      setUploadingDoc]     = useState(false)
  const docInputRef = useRef<HTMLInputElement>(null)
  // Staging do upload de anexos (título/data/observação são opcionais)
  const [stagedDoc, setStagedDoc] = useState<{ file: File; title: string; document_date: string; notes: string } | null>(null)
  // Edição inline de metadados de um anexo já enviado
  const [editingDocId, setEditingDocId] = useState<string | null>(null)
  const [editingDocForm, setEditingDocForm] = useState<AttachmentMetadata>({})
  const [savingDocEdit, setSavingDocEdit] = useState(false)

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
        setTutorName(result.name ?? '')
        setTutorPhone(result.phone ? formatPhone(result.phone) : '')
        setTutorEmail(result.email ?? '')
        setTutorAddress(result.address ?? '')
        setTutorCep(result.cep ? formatCep(result.cep) : '')
        setTutorStreet(result.street ?? '')
        setTutorNeighborhood(result.neighborhood ?? '')
        setTutorCity(result.city ?? '')
        setTutorState(result.state ?? '')
        setTutorAddressNumber(result.address_number ?? '')
        setTutorComplement(result.address_complement ?? '')
        setCpfLookupStatus('found')
      } else {
        setFoundTutorId(null)
        setCpfLookupStatus('not_found')
      }
    }, 400)
    return () => { if (cpfLookupTimer.current) clearTimeout(cpfLookupTimer.current) }
  }, [tutorCpf, isEdit, isPetOnly])

  // ─── Validação CPF/CNPJ (quando verify_cpf_cnpj ativo) ───────────────────────
  useEffect(() => {
    if (!regSettings.verify_cpf_cnpj) { setCpfCnpjStatus('idle'); return }
    const digits = tutorCpf.replace(/\D/g, '')
    if (digits.length < 11) { setCpfCnpjStatus('idle'); return }
    if (cpfCnpjTimer.current) clearTimeout(cpfCnpjTimer.current)

    if (digits.length === 11) {
      setCpfCnpjStatus(validateCpf(digits) ? 'valid' : 'invalid')
      return
    }
    if (digits.length === 14) {
      if (!validateCnpj(digits)) { setCpfCnpjStatus('invalid'); return }
      setCpfCnpjStatus('searching_cnpj')
      cpfCnpjTimer.current = setTimeout(async () => {
        const result = await lookupCnpjAction(digits)
        if (result.ok) {
          const razao = result.razao_social || result.nome_fantasia
          if (razao && !tutorName.trim()) setTutorName(razao)
          setCpfCnpjStatus('found_cnpj')
        } else {
          // Mantém como "válido" — o dígito verificador já passou; só não conseguimos
          // enriquecer com razão social. O usuário pode digitar o nome manualmente.
          setCpfCnpjStatus('valid')
        }
      }, 600)
    }
    return () => { if (cpfCnpjTimer.current) clearTimeout(cpfCnpjTimer.current) }
  }, [tutorCpf, regSettings.verify_cpf_cnpj]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Busca CEP com fallback ViaCEP → BrasilAPI ───────────────────────────────
  useEffect(() => {
    if (!regSettings.verify_cep) { setCepStatus('idle'); return }
    const digits = tutorCep.replace(/\D/g, '')
    if (digits.length !== 8) { setCepStatus('idle'); return }
    setCepStatus('searching')
    let cancelled = false
    const timer = setTimeout(async () => {
      const result = await lookupCepAction(digits)
      if (cancelled) return
      if (result.ok) {
        setTutorStreet(result.street)
        setTutorNeighborhood(result.neighborhood)
        setTutorCity(result.city)
        setTutorState(result.state)
        setCepStatus('found')
      } else {
        setCepStatus(result.reason === 'network' ? 'error' : 'not_found')
      }
    }, 500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [tutorCep, regSettings.verify_cep])

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

  // ─── Documentos lazy load ─────────────────────────────────────────────────────
  useEffect(() => {
    const patId = isEdit ? patient.id : createdPatientId
    if (tab === 'documentos' && attachments === null && patId) {
      setLoadingDocs(true)
      getAttachments(patId).then(res => {
        setAttachments(Array.isArray(res) ? res : [])
        setLoadingDocs(false)
      })
    }
  }, [tab, patient?.id, createdPatientId, attachments, isEdit])

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
    if (customPrices === null) {
      getCustomPricesForPatient(patId).then(res => {
        setCustomPrices(Array.isArray(res) ? res : [])
      })
    }
    if (petloveHistory === null) {
      getPetlovePatientHistory(patId).then(res => {
        setPetloveHistory(Array.isArray(res) ? res : [])
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
        name: petName, species, breed, birth_date: birthDate || null,
        birth_date_estimated: birthDateMode === 'age',
        gender: gender || null,
        neutered: neuteredToBoolean(neuteredState),
        coat_color: coatColor.trim() || null,
        reproductive_status: deriveReproductiveStatus(gender, neuteredState),
        behavior_tags: tags,
        allergies: allergies || null, chronic_diseases: chronicDiseases || null, microchip_id: microchipId || null,
      },
      { name: tutorName, phone: tutorPhone, cpf: tutorCpf, email: tutorEmail, address: tutorAddress, emergency_contact: emergencyContact, cep: tutorCep.replace(/\D/g,'') || null, street: tutorStreet || null, neighborhood: tutorNeighborhood || null, city: tutorCity || null, state: tutorState || null, address_number: tutorAddressNumber || null, address_complement: tutorComplement || null }
    )
    if (res && 'success' in res) {
      // Atualiza peso (best-effort — não bloqueia o save principal).
      const parsedWeight = parseFloat(weightKg.replace(',', '.'))
      if (Number.isFinite(parsedWeight) && parsedWeight > 0) {
        await updatePatientWeight({
          patient_id: patient.id,
          weight_kg:  parsedWeight,
          source:     'manual',
        }).catch(() => {})
      }
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

    // LGPD: para novo tutor com algum dado pessoal, exige consentimento
    const isNewTutor = !isEdit && !isPetOnly && !foundTutorId
    const hasTutorData = !!(tutorName.trim() || tutorPhone.trim() || tutorEmail.trim() || tutorCpf.trim())
    if (isNewTutor && hasTutorData && !consentGiven) {
      setShowConsent(true)
      return
    }

    doCreate()
  }

  const handleConsentAccept = () => {
    setConsentGiven(true)
    setShowConsent(false)
    doCreate(true) // passa flag explícito — React ainda não commitou setConsentGiven
  }

  const doCreate = (consentJustGiven = false) => {
    startTransition(async () => {
      const petPayload = {
        name:    petName,
        species: species as PatientSpecies,
        breed:   breed || undefined,
        birth_date:          birthDate || undefined,
        gender:              (gender || undefined) as 'male'|'female'|undefined,
        neutered:            neuteredToBoolean(neuteredState),
        coat_color:          coatColor.trim() || undefined,
        reproductive_status: deriveReproductiveStatus(gender, neuteredState),
        behavior_tags:       tags,
        allergies:           allergies || undefined,
        chronic_diseases:    chronicDiseases || undefined,
      }

      let result: { tutorId: string; patientId: string } | { error: string }

      const existingTutorId = isPetOnly ? propTutorId : foundTutorId
      if (existingTutorId) {
        const res = await addPatientToTutor(existingTutorId, petPayload)
        result = 'error' in res ? res : { tutorId: existingTutorId, patientId: res.id }
      } else {
        result = await registerTutorAndPet(
          {
            name: tutorName, cpf: tutorCpf, phone: tutorPhone,
            email: tutorEmail || undefined, address: tutorAddress || undefined,
            cep: tutorCep.replace(/\D/g,'') || undefined,
            street: tutorStreet || undefined, neighborhood: tutorNeighborhood || undefined,
            city: tutorCity || undefined, state: tutorState || undefined,
            address_number: tutorAddressNumber || undefined,
            address_complement: tutorComplement || undefined,
          },
          petPayload
        )
      }

      if ('error' in result) {
        setCreateError(result.error)
        return
      }

      setCreatedPatientId(result.patientId)
      setCreatedTutorId(result.tutorId)

      // Peso inicial: se o usuário preencheu na aba pet, grava no patients +
      // registra evento weight_update no feed (fire-and-forget).
      const parsedWeight = parseFloat(weightKg.replace(',', '.'))
      if (Number.isFinite(parsedWeight) && parsedWeight > 0) {
        updatePatientWeight({
          patient_id: result.patientId,
          weight_kg:  parsedWeight,
          source:     'manual',
        }).catch(() => {})
      }

      // Upload da foto pendente (selecionada antes da criação)
      await uploadPendingPhoto(result.patientId)
      // Avança para Vacinas imediatamente — não bloqueia na gravação do consentimento
      setTab('vacinas')

      // LGPD: registrar consentimento para novo tutor criado (fire-and-forget)
      // usa consentJustGiven para contornar batching do React 18 (setConsentGiven ainda não commitou)
      if (!isEdit && !isPetOnly && !foundTutorId && (consentGiven || consentJustGiven)) {
        recordConsent(result.tutorId, 'granted').catch(() => {})
      }
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
          <div className="flex gap-1 mb-[-1px] overflow-x-auto">
            <TabButton active={tab === 'pet'}     onClick={() => setTab('pet')}     icon={<Dog     className="h-4 w-4" />} label="Paciente" />
            <TabButton active={tab === 'tutor'}   onClick={() => setTab('tutor')}   icon={<User    className="h-4 w-4" />} label="Tutor" />
            <TabButton active={tab === 'vacinas'} onClick={() => setTab('vacinas')} icon={<Syringe  className="h-4 w-4" />} label="Vacinas" />
            <TabButton active={tab === 'convenio'} onClick={() => setTab('convenio')} icon={<Shield  className="h-4 w-4" />} label="Convênio" />
            <TabButton active={tab === 'documentos'} onClick={() => setTab('documentos')} icon={<Paperclip className="h-4 w-4" />} label="Documentos" />
            <TabButton active={tab === 'notas'} onClick={() => setTab('notas')} icon={<FileTextIcon className="h-4 w-4" />} label="Notas" />
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">

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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FieldInput label="Nome do Pet *" value={petName} onChange={setPetName} placeholder="Ex: Thor, Luna..." data-mentor-step="pet-name-input" />
                <FieldSelect label="Espécie" value={species} options={SPECIES_OPTIONS} onChange={setSpecies} data-mentor-step="pet-species-select" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <BreedCombobox
                  value={breed}
                  onChange={setBreed}
                  species={species as PatientSpecies}
                  placeholder="Ex: Labrador"
                  inputProps={{ 'data-mentor-step': 'pet-breed-input' } as React.InputHTMLAttributes<HTMLInputElement>}
                />
                <div>
                  <div className="flex items-center justify-between mb-1.5 ml-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nascimento</label>
                    <div className="flex rounded-lg overflow-hidden border border-slate-200 text-[9px] font-bold">
                      <button type="button" onClick={() => setBirthDateMode('age')}
                        className={`px-2 py-0.5 transition-colors ${birthDateMode === 'age' ? 'bg-teal-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                        Idade
                      </button>
                      <button type="button" onClick={() => setBirthDateMode('date')}
                        className={`px-2 py-0.5 transition-colors ${birthDateMode === 'date' ? 'bg-teal-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                        Data
                      </button>
                    </div>
                  </div>
                  {birthDateMode === 'date' ? (
                    <DateInput value={birthDate} onChange={setBirthDate} placeholder="DD/MM/AAAA" />
                  ) : (
                    <div className="flex gap-1">
                      <input
                        type="number" min="0" max="99"
                        value={ageValue}
                        onChange={e => {
                          const n = e.target.value
                          setAgeValue(n)
                          const num = parseInt(n, 10)
                          if (!isNaN(num) && num >= 0) {
                            const today = new Date()
                            const born = ageUnit === 'A'
                              ? new Date(today.getFullYear() - num, today.getMonth(), today.getDate())
                              : new Date(today.getFullYear(), today.getMonth() - num, today.getDate())
                            const iso = `${born.getFullYear()}-${String(born.getMonth()+1).padStart(2,'0')}-${String(born.getDate()).padStart(2,'0')}`
                            setBirthDate(iso)
                          }
                        }}
                        placeholder="Ex: 3"
                        className="flex-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      />
                      <select
                        value={ageUnit}
                        onChange={e => setAgeUnit(e.target.value as 'A' | 'M')}
                        className="rounded-xl border border-slate-300 px-2 py-2.5 text-sm text-slate-700 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                      >
                        <option value="A">Anos</option>
                        <option value="M">Meses</option>
                      </select>
                    </div>
                  )}
                  {birthDateMode === 'age' && birthDate && (
                    <p className="text-[10px] text-slate-400 mt-0.5 ml-1">
                      Nascimento estimado: {birthDate.split('-').reverse().join('/')}
                    </p>
                  )}
                </div>
                <FieldInput label="Cor / Pelagem" value={coatColor} onChange={setCoatColor} placeholder="Ex: Caramelo, Tigrado, Tricolor" data-mentor-step="pet-coat-color-input" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <FieldInput
                    label="Peso (kg)"
                    value={weightKg}
                    onChange={(v: string) => setWeightKg(v.replace(/[^0-9,.]/g, '').replace('.', ','))}
                    placeholder="Ex: 12,5"
                    data-mentor-step="pet-weight-input"
                  />
                  {lastWeightAt && (
                    <p className="text-[10px] text-slate-400 mt-1 ml-1">
                      Última medição: {new Date(lastWeightAt).toLocaleDateString('pt-BR')}
                      {lastWeightSource ? ` via ${({
                        manual: 'cadastro',
                        reception: 'recepção',
                        triage: 'triagem',
                        vet: 'consultório',
                        hospitalization: 'internação',
                      } as Record<string,string>)[lastWeightSource] ?? lastWeightSource}` : ''}
                    </p>
                  )}
                </div>
                <div /> {/* spacer para manter o grid 2 cols */}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FieldSelect
                  label="Sexo"
                  value={gender}
                  options={[
                    { value: '',       label: '— Não informado —' },
                    { value: 'male',   label: 'Macho' },
                    { value: 'female', label: 'Fêmea' },
                  ]}
                  onChange={(v: string) => setGender(v as 'male'|'female'|'')}
                  data-mentor-step="pet-gender-select"
                />
                <FieldSelect
                  label="Castrado"
                  value={neuteredState}
                  options={[
                    { value: 'yes',     label: 'Sim' },
                    { value: 'no',      label: 'Não' },
                    { value: 'unknown', label: 'Desconhecido' },
                  ]}
                  onChange={(v: string) => setNeuteredState(v as NeuteredState)}
                  data-mentor-step="pet-neutered-select"
                />
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

          {/* ══ ABA: TUTOR ══ */}
          {tab === 'tutor' && (
            <div className="space-y-6">

              {/* Aviso: dados opcionais */}
              {!isEdit && (
                <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                  <AlertTriangle className="h-4 w-4 text-sky-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-sky-700">
                    Os dados do tutor são <strong>opcionais</strong> neste momento. Você pode salvar o cadastro do pet agora e preencher as informações do responsável posteriormente.
                  </p>
                </div>
              )}

              {/* CPF/CNPJ com lookup — só no modo criação de novo tutor */}
              {!isEdit && !isPetOnly && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 ml-1 tracking-wider">CPF / CNPJ</label>
                  <div className="relative">
                    <input
                      value={tutorCpf}
                      onChange={e => setTutorCpf(formatCpfCnpj(e.target.value))}
                      placeholder="000.000.000-00 ou CNPJ"
                      inputMode="numeric"
                      maxLength={18}
                      className={`w-full bg-slate-100/50 border rounded-xl px-4 py-3 pr-10 text-sm font-medium outline-none transition-all ${
                        cpfLookupStatus === 'found' || cpfCnpjStatus === 'valid' || cpfCnpjStatus === 'found_cnpj'
                          ? 'border-green-400 bg-green-50 focus:border-green-500'
                          : cpfCnpjStatus === 'invalid'
                          ? 'border-red-400 bg-red-50 focus:border-red-500'
                          : 'border-slate-200 focus:border-teal-500'
                      }`}
                    />
                    {(cpfLookupStatus === 'searching' || cpfCnpjStatus === 'searching_cnpj') && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      </div>
                    )}
                    {(cpfLookupStatus === 'found' || cpfCnpjStatus === 'valid' || cpfCnpjStatus === 'found_cnpj') && cpfLookupStatus !== 'searching' && cpfCnpjStatus !== 'searching_cnpj' && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      </div>
                    )}
                    {cpfCnpjStatus === 'invalid' && cpfLookupStatus !== 'searching' && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {cpfLookupStatus === 'found' && (
                    <p className="mt-1.5 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700 font-medium">
                      Tutor encontrado — dados preenchidos automaticamente.
                    </p>
                  )}
                  {cpfLookupStatus === 'not_found' && cpfCnpjStatus !== 'invalid' && (
                    <p className="mt-1 text-xs text-slate-500">CPF não cadastrado — preencha os dados abaixo.</p>
                  )}
                  {regSettings.verify_cpf_cnpj && cpfCnpjStatus === 'invalid' && (
                    <p className="mt-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600 font-medium">
                      CPF/CNPJ inválido — verifique os dígitos informados.
                    </p>
                  )}
                  {regSettings.verify_cpf_cnpj && cpfCnpjStatus === 'found_cnpj' && (
                    <p className="mt-1.5 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700 font-medium">
                      CNPJ verificado — razão social preenchida automaticamente.
                    </p>
                  )}
                  {regSettings.verify_cpf_cnpj && cpfCnpjStatus === 'searching_cnpj' && (
                    <p className="mt-1 text-xs text-slate-500">Consultando CNPJ...</p>
                  )}
                </div>
              )}

              <FieldInput label="Nome do Responsável" value={tutorName} onChange={setTutorName} icon={<User className="h-4 w-4 text-slate-400" />} placeholder="Ex: Maria Silva" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <FieldInput label="Celular" value={tutorPhone} onChange={(v: string) => setTutorPhone(formatPhone(v))} placeholder="(00) 00000-0000" />
                {/* Em edição, CPF/CNPJ fica aqui junto ao telefone */}
                {isEdit && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 ml-1 tracking-wider">CPF / CNPJ</label>
                    <div className="relative">
                      <input
                        value={tutorCpf}
                        onChange={e => setTutorCpf(formatCpfCnpj(e.target.value))}
                        placeholder="000.000.000-00 ou CNPJ"
                        inputMode="numeric"
                        maxLength={18}
                        className={`w-full bg-slate-100/50 border rounded-xl px-4 py-3 pr-10 text-sm font-medium outline-none transition-all ${
                          cpfCnpjStatus === 'valid' || cpfCnpjStatus === 'found_cnpj'
                            ? 'border-green-400 bg-green-50 focus:border-green-500'
                            : cpfCnpjStatus === 'invalid'
                            ? 'border-red-400 bg-red-50 focus:border-red-500'
                            : 'border-slate-200 focus:border-teal-500'
                        }`}
                      />
                      {cpfCnpjStatus === 'searching_cnpj' && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        </div>
                      )}
                      {(cpfCnpjStatus === 'valid' || cpfCnpjStatus === 'found_cnpj') && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        </div>
                      )}
                      {cpfCnpjStatus === 'invalid' && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                          </svg>
                        </div>
                      )}
                    </div>
                    {regSettings.verify_cpf_cnpj && cpfCnpjStatus === 'invalid' && (
                      <p className="mt-1 text-xs text-red-500">CPF/CNPJ inválido.</p>
                    )}
                  </div>
                )}
              </div>
              <FieldInput label="E-mail" value={tutorEmail} onChange={setTutorEmail} placeholder="tutor@email.com" type="email" />

              {/* ── Endereço ── */}
              <div className="pt-4 border-t border-slate-100 space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> Endereço
                </p>

                {/* CEP */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 ml-1 tracking-wider">
                    CEP{regSettings.verify_cep && <span className="ml-1 font-normal text-teal-600 normal-case">(preenchimento automático)</span>}
                  </label>
                  <div className="relative">
                    <input
                      value={tutorCep}
                      onChange={e => setTutorCep(formatCep(e.target.value))}
                      placeholder="00000-000"
                      inputMode="numeric"
                      maxLength={9}
                      className={`w-full bg-slate-100/50 border rounded-xl px-4 py-3 pr-10 text-sm font-medium outline-none transition-all ${
                        cepStatus === 'found'
                          ? 'border-green-400 bg-green-50 focus:border-green-500'
                          : cepStatus === 'not_found'
                          ? 'border-red-300 bg-red-50 focus:border-red-400'
                          : cepStatus === 'error'
                          ? 'border-amber-300 bg-amber-50 focus:border-amber-400'
                          : 'border-slate-200 focus:border-teal-500'
                      }`}
                    />
                    {cepStatus === 'searching' && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      </div>
                    )}
                    {cepStatus === 'found' && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {cepStatus === 'found' && (
                    <p className="mt-1 text-xs text-green-600">Endereço preenchido automaticamente.</p>
                  )}
                  {cepStatus === 'not_found' && (
                    <p className="mt-1 text-xs text-red-500">CEP não encontrado — preencha o endereço manualmente.</p>
                  )}
                  {cepStatus === 'error' && (
                    <p className="mt-1 text-xs text-amber-600">
                      Não foi possível consultar o CEP agora. Você pode preencher manualmente ou tentar de novo em alguns segundos.
                    </p>
                  )}
                </div>

                {/* Rua / Logradouro */}
                <FieldInput
                  label="Rua / Logradouro"
                  value={tutorStreet}
                  onChange={setTutorStreet}
                  placeholder="Ex: Av. Paulista"
                />

                {/* Bairro + Cidade */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FieldInput label="Bairro" value={tutorNeighborhood} onChange={setTutorNeighborhood} placeholder="Ex: Centro" />
                  <FieldInput label="Cidade" value={tutorCity} onChange={setTutorCity} placeholder="Ex: São Paulo" />
                </div>

                {/* Estado + Número + Complemento */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 ml-1 tracking-wider">UF</label>
                    <input
                      value={tutorState}
                      onChange={e => setTutorState(e.target.value.toUpperCase().slice(0, 2))}
                      placeholder="SP"
                      maxLength={2}
                      className="w-full bg-slate-100/50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-teal-500 outline-none transition-all text-center tracking-widest"
                    />
                  </div>
                  <FieldInput label="Número" value={tutorAddressNumber} onChange={setTutorAddressNumber} placeholder="123" />
                  <FieldInput label="Complemento" value={tutorComplement} onChange={setTutorComplement} placeholder="Apto 4" />
                </div>
              </div>

              <FieldInput label="Contato de Emergência" value={emergencyContact} onChange={setEmergencyContact} icon={<PhoneCall className="h-4 w-4 text-slate-400" />} placeholder="(00) 00000-0000" />

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
                <>
                  <VaccinationCard
                    patientId={(isEdit ? patient.id : createdPatientId)!}
                    initialVaccines={vaccines || []}
                    isFinalized={false}
                  />
                  {/* Botões Compartilhar Histórico — share nativo + atalho WhatsApp */}
                  {isEdit && patient?.id && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        <ShareButton
                          title={`Carteira de vacinação — ${patient.name}`}
                          text={`Olá! Aqui está o histórico de vacinação do ${patient.name} atualizado:`}
                          url={`${getClientAppUrl()}/public/vaccines/${patient.id}`}
                          label="Compartilhar"
                          variant="primary"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${getClientAppUrl()}/public/vaccines/${patient.id}`
                            const msg = `Olá! Aqui está o histórico de vacinação do ${patient.name} atualizado: ${url}`
                            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
                          }}
                          className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 transition-colors active:scale-95"
                        >
                          <Share2 className="h-4 w-4" />
                          WhatsApp
                        </button>
                      </div>
                      <p className="text-xs text-slate-400">
                        "Compartilhar" abre o menu de apps do celular (Telegram, e-mail, etc.). "WhatsApp" é atalho direto.
                      </p>
                    </div>
                  )}
                </>
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

                  {/* ── Preços fixados do convênio para este pet (patient_custom_prices) ── */}
                  {currentInsurance && (isEdit ? patient.id : createdPatientId) && (
                    <CustomPricesEditor
                      patientId={(isEdit ? patient.id : createdPatientId) as string}
                      providerId={currentInsurance.provider_id}
                      providerName={(currentInsurance as any).provider?.name ?? null}
                      prices={customPrices ?? []}
                      onChange={() => {
                        const pid = isEdit ? patient.id : createdPatientId
                        if (pid) {
                          getCustomPricesForPatient(pid).then(res => {
                            setCustomPrices(Array.isArray(res) ? res : [])
                          })
                        }
                      }}
                    />
                  )}

                  {/* ── Histórico Petlove (eventos da conciliação) ── */}
                  {petloveHistory && petloveHistory.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                      <header className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-2">
                          <History className="h-4 w-4" />
                          Histórico do Convênio
                        </h3>
                        <span className="text-[10px] text-slate-400">{petloveHistory.length} evento{petloveHistory.length !== 1 ? 's' : ''}</span>
                      </header>
                      <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                        {petloveHistory.map(e => {
                          const map = {
                            patient_created: { Icon: UserPlus,    cls: 'bg-purple-100 text-purple-700' },
                            plan_updated:    { Icon: ArrowRight,  cls: 'bg-blue-100 text-blue-700' },
                            price_updated:   { Icon: DollarSign,  cls: 'bg-amber-100 text-amber-700' },
                            entry_created:   { Icon: Receipt,     cls: 'bg-emerald-100 text-emerald-700' },
                          } as const
                          const { Icon, cls } = map[e.event_type] ?? map.entry_created
                          const d = new Date(e.created_at)
                          const stamp = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
                          return (
                            <div key={e.id} className="px-5 py-2.5 flex items-start gap-3">
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md flex-shrink-0 mt-0.5 ${cls}`}>
                                <Icon className="h-3 w-3" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-slate-800 break-words">{e.description}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{stamp}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {/* ── Aba Documentos ── */}
          {tab === 'documentos' && (
            <div className="p-4 space-y-4">
              {!createdPatientId && !isEdit ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Paperclip className="h-10 w-10 text-slate-300 mb-3" />
                  <p className="text-sm font-bold text-slate-400">Documentos disponíveis após criar o cadastro</p>
                </div>
              ) : (
                <>
                  {/* Botão upload — opcionalmente seguido de staging com título/data/observação */}
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500">Arquivos do pet (PDF, imagem, laudo...)</p>
                    <button
                      type="button"
                      onClick={() => docInputRef.current?.click()}
                      disabled={uploadingDoc || !!stagedDoc}
                      className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Enviar Arquivo
                    </button>
                    <input
                      ref={docInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (!file) return
                        setStagedDoc({ file, title: '', document_date: '', notes: '' })
                      }}
                    />
                  </div>

                  {/* Staging do anexo selecionado */}
                  {stagedDoc && (
                    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-teal-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{stagedDoc.file.name}</p>
                          <p className="text-xs text-slate-500">{(stagedDoc.file.size / 1024).toFixed(0)} KB · pronto para enviar</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setStagedDoc(null)}
                          disabled={uploadingDoc}
                          className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                          title="Cancelar"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Detalhes (opcionais)</p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block">
                          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                            <Tag className="h-3 w-3" /> Título
                          </span>
                          <input
                            type="text"
                            value={stagedDoc.title}
                            onChange={e => setStagedDoc({ ...stagedDoc, title: e.target.value })}
                            placeholder="ex.: Carteirinha de vacina"
                            disabled={uploadingDoc}
                            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-teal-400 focus:outline-none disabled:bg-slate-50"
                          />
                        </label>
                        <label className="block">
                          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                            <Calendar className="h-3 w-3" /> Data do documento
                          </span>
                          <input
                            type="date"
                            value={stagedDoc.document_date}
                            onChange={e => setStagedDoc({ ...stagedDoc, document_date: e.target.value })}
                            disabled={uploadingDoc}
                            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-teal-400 focus:outline-none disabled:bg-slate-50"
                          />
                        </label>
                      </div>

                      <label className="block">
                        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1">
                          <StickyNote className="h-3 w-3" /> Observação
                        </span>
                        <textarea
                          value={stagedDoc.notes}
                          onChange={e => setStagedDoc({ ...stagedDoc, notes: e.target.value })}
                          rows={2}
                          placeholder="Notas livres sobre o documento..."
                          disabled={uploadingDoc}
                          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-teal-400 focus:outline-none disabled:bg-slate-50 resize-none"
                        />
                      </label>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setStagedDoc(null)}
                          disabled={uploadingDoc}
                          className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const patId = isEdit ? patient.id : createdPatientId
                            if (!patId) return
                            setUploadingDoc(true)
                            const fd = new FormData()
                            fd.append('file', stagedDoc.file)
                            const res = await uploadAttachment(fd, patId, undefined, {
                              title:         stagedDoc.title,
                              document_date: stagedDoc.document_date || null,
                              notes:         stagedDoc.notes,
                            })
                            setUploadingDoc(false)
                            if ('error' in res) return
                            setAttachments(prev => prev ? [res, ...prev] : [res])
                            setStagedDoc(null)
                          }}
                          disabled={uploadingDoc}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                        >
                          {uploadingDoc
                            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...</>
                            : <><Upload className="h-3.5 w-3.5" /> Enviar anexo</>
                          }
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lista de anexos */}
                  {loadingDocs ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    </div>
                  ) : !attachments || attachments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-slate-200 rounded-xl">
                      <FileText className="h-8 w-8 text-slate-300 mb-2" />
                      <p className="text-sm text-slate-400">Nenhum documento enviado</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {attachments.map(att => {
                        const isEditingDoc = editingDocId === att.id
                        const hasMeta = !!(att.title || att.document_date || att.notes)
                        const headline = att.title?.trim() || att.file_name
                        const docDate = att.document_date
                          ? (() => {
                              const [y, m, d] = att.document_date.split('-').map(Number)
                              return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
                            })()
                          : null
                        return (
                          <div key={att.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 hover:border-slate-300 transition-colors">
                            <div className="flex items-start gap-3">
                              <FileText className="h-4 w-4 text-slate-400 flex-shrink-0 mt-1" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800 truncate">{headline}</p>
                                {att.title && att.title.trim() && (
                                  <p className="text-xs text-slate-400 truncate">{att.file_name}</p>
                                )}
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs">
                                  {docDate && (
                                    <span className="inline-flex items-center gap-1 text-slate-500">
                                      <Calendar className="h-3 w-3" /> {docDate}
                                    </span>
                                  )}
                                  <span className="text-slate-400">
                                    Enviado em {new Date(att.created_at).toLocaleDateString('pt-BR')}
                                  </span>
                                </div>
                                {att.notes && att.notes.trim() && (
                                  <p className="text-xs text-slate-600 mt-1 italic">"{att.notes}"</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <a
                                  href={att.signed_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg text-teal-600 hover:bg-teal-50"
                                  title="Abrir"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isEditingDoc) {
                                      setEditingDocId(null); setEditingDocForm({})
                                    } else {
                                      setEditingDocId(att.id)
                                      setEditingDocForm({
                                        title:         att.title ?? '',
                                        document_date: att.document_date ?? '',
                                        notes:         att.notes ?? '',
                                      })
                                    }
                                  }}
                                  className={`p-1.5 rounded-lg ${isEditingDoc
                                    ? 'text-blue-600 bg-blue-50'
                                    : `${hasMeta ? 'text-slate-500' : 'text-slate-400'} hover:text-blue-600 hover:bg-blue-50`
                                  }`}
                                  title={isEditingDoc ? 'Cancelar edição' : (hasMeta ? 'Editar detalhes' : 'Adicionar detalhes')}
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    if (!confirm(`Excluir "${att.file_name}"?`)) return
                                    const res = await deleteAttachment(att.id)
                                    if (!('error' in res)) {
                                      setAttachments(prev => prev ? prev.filter(a => a.id !== att.id) : prev)
                                    }
                                  }}
                                  className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50"
                                  title="Excluir"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            {isEditingDoc && (
                              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <label className="block">
                                    <span className="text-[11px] font-medium text-slate-600">Título</span>
                                    <input
                                      type="text"
                                      value={editingDocForm.title ?? ''}
                                      onChange={e => setEditingDocForm({ ...editingDocForm, title: e.target.value })}
                                      disabled={savingDocEdit}
                                      className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none disabled:bg-slate-50"
                                    />
                                  </label>
                                  <label className="block">
                                    <span className="text-[11px] font-medium text-slate-600">Data do documento</span>
                                    <input
                                      type="date"
                                      value={editingDocForm.document_date ?? ''}
                                      onChange={e => setEditingDocForm({ ...editingDocForm, document_date: e.target.value })}
                                      disabled={savingDocEdit}
                                      className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none disabled:bg-slate-50"
                                    />
                                  </label>
                                </div>
                                <label className="block">
                                  <span className="text-[11px] font-medium text-slate-600">Observação</span>
                                  <textarea
                                    value={editingDocForm.notes ?? ''}
                                    onChange={e => setEditingDocForm({ ...editingDocForm, notes: e.target.value })}
                                    rows={2}
                                    disabled={savingDocEdit}
                                    className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none disabled:bg-slate-50 resize-none"
                                  />
                                </label>
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => { setEditingDocId(null); setEditingDocForm({}) }}
                                    disabled={savingDocEdit}
                                    className="rounded-md px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setSavingDocEdit(true)
                                      const res = await updateAttachmentMetadata(att.id, {
                                        title:         editingDocForm.title,
                                        document_date: editingDocForm.document_date || null,
                                        notes:         editingDocForm.notes,
                                      })
                                      setSavingDocEdit(false)
                                      if ('error' in res) return
                                      setAttachments(prev => prev ? prev.map(a => a.id === att.id ? {
                                        ...a,
                                        title:         (editingDocForm.title?.trim() || null),
                                        document_date: (editingDocForm.document_date || null),
                                        notes:         (editingDocForm.notes?.trim() || null),
                                      } : a) : prev)
                                      setEditingDocId(null); setEditingDocForm({})
                                    }}
                                    disabled={savingDocEdit}
                                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    {savingDocEdit
                                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Salvando</>
                                      : <><Save className="h-3 w-3" /> Salvar</>
                                    }
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {/* ── Aba Notas (observação / clínica / comportamento / óbito) ── */}
          {tab === 'notas' && (
            <div className="p-4">
              {!createdPatientId && !isEdit ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <FileTextIcon className="h-10 w-10 text-slate-300 mb-3" />
                  <p className="text-sm font-bold text-slate-400">Notas disponíveis após criar o cadastro</p>
                </div>
              ) : (
                <PatientNotesPanel
                  patientId={(isEdit ? patient.id : createdPatientId) as string}
                  patientName={petName}
                  isDeceased={!!(patient as any)?.deceased_at}
                  onDeathRecorded={() => {
                    // O cadastro permanece aberto após o óbito — o usuário pode
                    // anexar documentos, atualizar tutor, registrar notas e
                    // demais ajustes que continuem necessários. Apenas os fluxos
                    // de atendimento (check-in/triagem/consultório/etc.) ficam
                    // bloqueados, conforme regra de negócio.
                    // (NÃO fechar o modal — só reload da lista de notas, que
                    // o próprio panel já refresca após onSaved.)
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="p-4 bg-white border-t border-slate-100 flex justify-between gap-3">
          {/* Arquivar pet (soft delete, apenas edição) */}
          {isEdit && (
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Arquivar pet (soft delete com motivo)"
            >
              <Trash2 className="h-4 w-4" />
              Arquivar
            </button>
          )}

          <div className="flex gap-3 ml-auto">
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

      {/* Modal: Arquivar Pet */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <h2 className="text-base font-semibold text-slate-900">Arquivar Pet</h2>
            </div>
            <p className="text-sm text-slate-600">
              O pet será arquivado e removido das filas. O histórico clínico é preservado para fins de auditoria.
            </p>
            {deleteError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deleteError}</p>}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Motivo do Arquivamento <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                placeholder="Ex: Óbito, mudança de cidade, tutor solicitou remoção..."
                rows={3}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowDeleteModal(false); setDeleteReason(''); setDeleteError(null) }}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleting || !deleteReason.trim()}
                onClick={async () => {
                  if (!patient?.id || !deleteReason.trim()) return
                  setDeleting(true)
                  setDeleteError(null)
                  const res = await softDeletePatient(patient.id, deleteReason.trim())
                  setDeleting(false)
                  if ('error' in res) { setDeleteError(res.error); return }
                  setShowDeleteModal(false)
                  onClose()
                }}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                {deleting ? 'Arquivando...' : 'Confirmar Arquivamento'}
              </button>
            </div>
          </div>
        </div>
      )}
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
