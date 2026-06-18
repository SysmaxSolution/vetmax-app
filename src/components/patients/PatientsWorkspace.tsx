'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, Users, Pencil, Plus, Archive, ArchiveRestore } from 'lucide-react'
import { getPatientsList, type PatientsListItem } from '@/lib/actions/timeline'
import { reactivatePatient } from '@/lib/actions/pets'
import PetTimelineModal from '@/components/pet/PetTimelineModal'
import PatientFullModal from '@/components/patients/PatientFullModal'
import { formatPetAge } from '@/lib/utils/pet-age'
import { PetAvatar } from '@/components/ui/PetAvatar'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SPECIES_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  dog:     { label: 'Cão',       emoji: '🐶', color: 'bg-amber-100 text-amber-700' },
  cat:     { label: 'Gato',      emoji: '🐱', color: 'bg-purple-100 text-purple-700' },
  bird:    { label: 'Ave',       emoji: '🐦', color: 'bg-sky-100 text-sky-700' },
  exotic:  { label: 'Silvestre', emoji: '🦜', color: 'bg-green-100 text-green-700' },
  rabbit:  { label: 'Coelho',    emoji: '🐰', color: 'bg-pink-100 text-pink-700' },
  rodent:  { label: 'Roedor',    emoji: '🐹', color: 'bg-orange-100 text-orange-700' },
  reptile: { label: 'Réptil',    emoji: '🦎', color: 'bg-lime-100 text-lime-700' },
  fish:    { label: 'Peixe',     emoji: '🐟', color: 'bg-blue-100 text-blue-700' },
}

const GENDER_LABELS: Record<string, string> = {
  male: 'Macho', female: 'Fêmea', unknown: 'N/I',
}

const calcAge = formatPetAge

function formatCpf(cpf: string) {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

// ─── Pet Card ─────────────────────────────────────────────────────────────────

function PatientCard({
  patient,
  onViewFeed,
  onEdit,
  archived = false,
  onReactivate,
  reactivating = false,
}: {
  patient: PatientsListItem
  onViewFeed: (p: PatientsListItem) => void
  onEdit: (p: PatientsListItem) => void
  archived?: boolean
  onReactivate?: (p: PatientsListItem) => void
  reactivating?: boolean
}) {
  const sp = SPECIES_LABELS[patient.species] ?? { label: patient.species, emoji: '🐾', color: 'bg-slate-100 text-slate-600' }
  const age = calcAge(patient.birth_date)
  const isDeceased = !!patient.deceased_at

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-xl border px-4 sm:px-5 py-4 transition-all ${
      archived
        ? 'border-amber-200 bg-amber-50/40'
        : isDeceased
        ? 'border-violet-200 bg-violet-50/40'
        : 'border-slate-200 bg-white hover:shadow-sm hover:border-slate-300'
    }`}>
      <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
        {/* Avatar */}
        <PetAvatar
          name={patient.name}
          species={patient.species}
          photoUrl={patient.photo_url}
          size="sm"
          deceased={isDeceased}
        />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-semibold ${isDeceased ? 'text-violet-800' : 'text-slate-900'}`}>{patient.name}</p>
            {isDeceased && (
              <span className="text-[10px] font-bold uppercase tracking-wider rounded-full bg-violet-100 text-violet-700 px-2 py-0.5">
                🕊️ In memoriam
              </span>
            )}
            {archived && (
              <span className="text-[10px] font-bold uppercase tracking-wider rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 flex items-center gap-1">
                <Archive className="h-3 w-3" /> Arquivado
              </span>
            )}
            <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${sp.color}`}>
              {sp.label}
            </span>
            {patient.neutered && (
              <span className="text-xs rounded-full bg-teal-50 text-teal-600 px-2 py-0.5 font-medium">Castrado(a)</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap">
            {patient.breed && <span className="text-xs text-slate-500">{patient.breed}</span>}
            {patient.gender && patient.gender !== 'unknown' && (
              <span className="text-xs text-slate-400">{GENDER_LABELS[patient.gender]}</span>
            )}
            {age && <span className="text-xs text-slate-400">{age}</span>}
          </div>
          {isDeceased && patient.deceased_at && (
            <p className="mt-1 text-xs italic text-violet-700">
              Partiu em {new Date(patient.deceased_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.
              Que descanse em paz. 🕊️
            </p>
          )}
          <p className="mt-1 text-xs text-slate-500 truncate">
            Tutor: <span className="font-medium text-slate-700">{patient.tutor.name ?? '—'}</span>
            {patient.tutor.cpf && (
              <span className="ml-1.5 text-slate-400">· CPF {formatCpf(patient.tutor.cpf)}</span>
            )}
            {patient.tutor.phone && (
              <span className="ml-1.5 text-slate-400">· {patient.tutor.phone}</span>
            )}
          </p>
          {archived && (
            <p className="mt-1 text-xs text-amber-700">
              {patient.delete_reason ? <>Motivo: <span className="font-medium">{patient.delete_reason}</span></> : 'Arquivado'}
              {patient.deleted_at && (
                <span className="ml-1.5 text-amber-600/70">· em {new Date(patient.deleted_at).toLocaleDateString('pt-BR')}</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Ações */}
      <div className="flex-shrink-0 flex items-center gap-2 pl-14 sm:pl-0">
        {archived ? (
          <button
            type="button"
            onClick={() => onReactivate?.(patient)}
            disabled={reactivating}
            className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
            title="Reativar pet"
          >
            <ArchiveRestore className="h-3.5 w-3.5" />
            {reactivating ? 'Reativando...' : 'Reativar'}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onEdit(patient)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              title="Editar cadastro"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">Editar Cadastro</span>
              <span className="xs:hidden">Editar</span>
            </button>
            <button
              type="button"
              onClick={() => onViewFeed(patient)}
              className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <span className="hidden xs:inline">Ver Histórico</span>
              <span className="xs:hidden">Histórico</span>
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  initialPatients: PatientsListItem[]
  clinicName: string
}

export default function PatientsWorkspace({ initialPatients, clinicName }: Props) {
  const [tab, setTab] = useState<'active' | 'archived'>('active')
  const [patients, setPatients] = useState<PatientsListItem[]>(initialPatients)
  const [archived, setArchived] = useState<PatientsListItem[]>([])
  const [archivedLoaded, setArchivedLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [feedPet, setFeedPet] = useState<PatientsListItem | null>(null)
  const [editPet, setEditPet] = useState<PatientsListItem | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [reactivatingId, setReactivatingId] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Carrega a lista de arquivados sob demanda na primeira vez que a aba abre.
  useEffect(() => {
    if (tab !== 'archived' || archivedLoaded) return
    getPatientsList('', { archived: true }).then(result => {
      if (!('error' in result)) setArchived(result)
      setArchivedLoaded(true)
    })
  }, [tab, archivedLoaded])

  // Busca debounced (respeita a aba ativa)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    const isArchived = tab === 'archived'

    if (query.trim().length === 0) {
      // Arquivados: recarrega a lista cheia só quando já foi carregada uma vez
      // (no 1º acesso quem popula é o effect de lazy-load — evita fetch duplo).
      if (isArchived) {
        if (archivedLoaded) getPatientsList('', { archived: true }).then(r => { if (!('error' in r)) setArchived(r) })
      } else setPatients(initialPatients)
      return
    }

    if (query.trim().length < 2) return

    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      const result = await getPatientsList(query.trim(), isArchived ? { archived: true } : undefined)
      setSearching(false)
      if (!('error' in result)) {
        if (isArchived) setArchived(result)
        else setPatients(result)
      }
    }, 350)

    return () => { if (searchTimer.current) clearTimeout(searchTimer.current) }
  }, [query, initialPatients, tab, archivedLoaded])

  // Reativa um pet arquivado: remove da lista de arquivados e limpa a busca.
  const handleReactivate = async (p: PatientsListItem) => {
    setReactivatingId(p.id)
    const res = await reactivatePatient(p.id)
    setReactivatingId(null)
    if ('success' in res) {
      setArchived(prev => prev.filter(x => x.id !== p.id))
    } else {
      alert('Erro ao reativar: ' + res.error)
    }
  }

  const list = tab === 'archived' ? archived : patients

  return (
    <>
      {/* Novo Paciente */}
      {showAddModal && (
        <PatientFullModal
          mode="new_tutor_and_pet"
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false)
            getPatientsList('').then(result => {
              if (!('error' in result)) setPatients(result)
            })
          }}
        />
      )}

      {/* Feed Modal */}
      {feedPet && (
        <PetTimelineModal
          petId={feedPet.id}
          petName={feedPet.name}
          petSpecies={feedPet.species}
          clinicName={clinicName}
          tutorName={feedPet.tutor.name ?? ''}
          tutorCpf={feedPet.tutor.cpf ?? ''}
          tutorId={feedPet.tutor.id}
          onClose={() => setFeedPet(null)}
        />
      )}

      {/* Editar Cadastro */}
      {editPet && (
        <PatientFullModal
          patient={editPet}
          onClose={() => setEditPet(null)}
          onSuccess={(updated) => {
            setPatients(prev =>
              prev.map(p => p.id === editPet.id ? { ...p, name: updated.patientName, tutor: { ...p.tutor, name: updated.tutorName } } : p)
            )
            setEditPet(null)
          }}
        />
      )}

      {/* Page Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Pacientes</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Diretório clínico — {initialPatients.length} paciente{initialPatients.length !== 1 ? 's' : ''} cadastrado{initialPatients.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          type="button"
          data-mentor-step="btn-novo-paciente"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors shadow-sm flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
          Novo Paciente
        </button>
      </div>

      {/* Abas: Ativos / Arquivados */}
      <div className="mb-5 flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => { setTab('active'); setQuery('') }}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            tab === 'active'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users className="h-4 w-4" /> Ativos
        </button>
        <button
          type="button"
          onClick={() => { setTab('archived'); setQuery('') }}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            tab === 'archived'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Archive className="h-4 w-4" /> Arquivados
          {archivedLoaded && archived.length > 0 && (
            <span className="ml-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5">{archived.length}</span>
          )}
        </button>
      </div>

      {/* Busca Inteligente */}
      <div className="relative mb-6">
        <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
          {searching ? (
            <svg className="h-4 w-4 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <Search className="h-4 w-4 text-slate-400" />
          )}
        </div>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar por nome do animal..."
          className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-4 text-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 shadow-sm"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute inset-y-0 right-4 flex items-center text-slate-400 hover:text-slate-600"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Lista de Pacientes */}
      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-dashed border-slate-300 bg-white">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            {tab === 'archived' ? <Archive className="h-7 w-7 text-slate-400" /> : <Users className="h-7 w-7 text-slate-400" />}
          </div>
          <p className="text-sm font-medium text-slate-500">
            {query
              ? `Nenhum paciente encontrado para "${query}"`
              : tab === 'archived' ? 'Nenhum pet arquivado' : 'Nenhum paciente cadastrado'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {query
              ? 'Tente um nome diferente'
              : tab === 'archived' ? 'Pets arquivados aparecem aqui e podem ser reativados' : 'Os pacientes aparecem aqui após o primeiro check-in'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(p => (
            <PatientCard
              key={p.id}
              patient={p}
              onViewFeed={setFeedPet}
              onEdit={setEditPet}
              archived={tab === 'archived'}
              onReactivate={handleReactivate}
              reactivating={reactivatingId === p.id}
            />
          ))}
          {list.length === 100 && (
            <p className="text-center text-xs text-slate-400 pt-2">
              Mostrando os primeiros 100 resultados. Use a busca para refinar.
            </p>
          )}
        </div>
      )}
    </>
  )
}
