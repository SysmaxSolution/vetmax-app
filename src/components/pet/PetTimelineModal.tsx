'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Calendar, Clock, Gift } from 'lucide-react'
import { getPetTimeline, type TimelineEvent } from '@/lib/actions/timeline'
import { getPatientVaccines, type PatientVaccine } from '@/lib/actions/vaccines'
import { getPetPackageSummary, getPackageSessionsMap, type PatientActivePackage, type PackageSessionInfo } from '@/lib/actions/packages'
import { createClient } from '@/lib/supabase/client'
import PetTimeline from './PetTimeline'
import { PetAvatar } from '@/components/ui/PetAvatar'
import VaccinationCard from '@/components/vet/VaccinationCard'
import NewAppointmentModal from '@/components/reception/NewAppointmentModal'
import EditAppointmentModal from '@/components/reception/EditAppointmentModal'
import type { PrintState } from '@/components/vet/DocumentsSection'
import type { ExtractedField } from '@/types'

// ─── Species helpers ──────────────────────────────────────────────────────────

const SPECIES_LABELS: Record<string, { label: string; emoji: string }> = {
  dog:     { label: 'Cão',       emoji: '🐶' },
  cat:     { label: 'Gato',      emoji: '🐱' },
  bird:    { label: 'Ave',       emoji: '🐦' },
  exotic:  { label: 'Silvestre', emoji: '🦜' },
  rabbit:  { label: 'Coelho',    emoji: '🐰' },
  rodent:  { label: 'Roedor',    emoji: '🐹' },
  reptile: { label: 'Réptil',    emoji: '🦎' },
  fish:    { label: 'Peixe',     emoji: '🐟' },
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PetTimelineModalProps {
  petId:      string
  petName:    string
  petSpecies: string
  clinicName: string
  tutorName:  string
  tutorCpf?:  string
  tutorId?:   string
  onClose:    () => void
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PetTimelineModal({
  petId, petName, petSpecies, clinicName, tutorName, tutorCpf, tutorId, onClose,
}: PetTimelineModalProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const isDeceased = events.some(e => e.type === 'memorial')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [printData, setPrintData] = useState<PrintState | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [editApptId, setEditApptId] = useState<string | null>(null)
  const [vaccines, setVaccines] = useState<PatientVaccine[]>([])
  const [packages, setPackages] = useState<PatientActivePackage[]>([])
  const [packageMap, setPackageMap] = useState<Record<string, PackageSessionInfo>>({})

  const sp = SPECIES_LABELS[petSpecies] ?? { label: petSpecies, emoji: '🐾' }

  const loadData = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true)
    const [timelineResult, vaccinesResult, pkgSummary, pkgMap] = await Promise.all([
      getPetTimeline(petId),
      getPatientVaccines(petId),
      getPetPackageSummary(petId),
      getPackageSessionsMap(petId),
    ])
    if ('error' in timelineResult) setError(timelineResult.error)
    else setEvents(timelineResult)
    if (!('error' in vaccinesResult)) setVaccines(vaccinesResult)
    if (!('error' in pkgSummary))     setPackages(pkgSummary)
    if (!('error' in pkgMap))         setPackageMap(pkgMap)
    setLoading(false)
  }, [petId])

  // Carga inicial
  useEffect(() => { loadData(true) }, [loadData])

  // Real-time: recarrega ao detectar INSERT/UPDATE em appointments ou pacotes do pet
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`pet-feed-${petId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments',             filter: `pet_id=eq.${petId}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_active_packages', filter: `pet_id=eq.${petId}` }, () => loadData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [petId, loadData])

  // Limpa print após impressão
  useEffect(() => {
    const handler = () => setPrintData(null)
    window.addEventListener('afterprint', handler)
    return () => window.removeEventListener('afterprint', handler)
  }, [])

  // Aciona impressão
  const handlePrint = (data: PrintState) => {
    setPrintData(data)
    setTimeout(() => window.print(), 400)
  }

  // ─── PackagesSummaryCard inline ──────────────────────────────────────────────

  function PackagesSummaryCard() {
    if (packages.length === 0) return null

    // Consolida contratos do mesmo pacote (package_id) somando contadores
    const consolidated = packages.reduce<Record<string, PatientActivePackage>>((acc, pkg) => {
      const key = pkg.package_id
      if (!acc[key]) {
        acc[key] = { ...pkg, sessions_total: 0, sessions_used: 0, sessions_scheduled: 0 }
      }
      const e = acc[key]
      e.sessions_total     = (e.sessions_total     ?? 0) + (pkg.sessions_total     ?? 0)
      e.sessions_used      = (e.sessions_used      ?? 0) + (pkg.sessions_used      ?? 0)
      e.sessions_scheduled = (e.sessions_scheduled ?? 0) + (pkg.sessions_scheduled ?? 0)
      if (pkg.status === 'active') e.status = 'active'
      return acc
    }, {})
    const list = Object.values(consolidated)

    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50/60 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-teal-200 bg-teal-100/50">
          <Gift className="h-4 w-4 text-teal-600" />
          <span className="text-xs font-bold text-teal-800 uppercase tracking-wide">Pacotes / Planos</span>
        </div>
        <div className="divide-y divide-teal-100">
          {list.map(pkg => {
            const total     = pkg.sessions_total     ?? 0
            const used      = pkg.sessions_used      ?? 0
            const scheduled = pkg.sessions_scheduled ?? 0
            const remaining = total - used - scheduled
            const pct       = total > 0 ? Math.round((used / total) * 100) : 0
            const isActive  = pkg.status === 'active'
            return (
              <div key={pkg.package_id} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">{pkg.package?.name ?? 'Pacote'}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isActive ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isActive ? 'Ativo' : 'Concluído'}
                  </span>
                </div>
                {/* barra de progresso */}
                <div className="w-full h-1.5 bg-teal-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {/* grid de contadores */}
                <div className="grid grid-cols-2 xs:grid-cols-4 gap-1.5 text-center">
                  {([
                    ['Total',      total,     'text-slate-600'],
                    ['Realizados', used,      'text-teal-700'],
                    ['Agendados',  scheduled, 'text-amber-600'],
                    ['Restantes',  remaining, remaining === 0 ? 'text-red-600' : 'text-slate-700'],
                  ] as [string, number, string][]).map(([lbl, val, cls]) => (
                    <div key={lbl} className="bg-white rounded-xl py-2 border border-teal-100 shadow-sm">
                      <p className={`text-lg font-bold ${cls}`}>{val}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{lbl}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Portal de impressão (mesma estratégia do ConsultationDetail)
  const printPortal = printData ? createPortal(
    <div
      className="vetmax-print-root"
      style={{
        position: 'static', minHeight: '100vh', background: 'white',
        color: '#000', fontFamily: 'Arial, sans-serif',
        padding: '40px 56px', boxSizing: 'border-box',
      }}
    >
      {/* Cabeçalho */}
      <div style={{ borderBottom: '2px solid #000', paddingBottom: 16, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{clinicName}</p>
            <p style={{ fontSize: 13, color: '#555', marginTop: 4 }}>Prontuário Veterinário</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 13, margin: 0 }}>
              {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {/* Dados do paciente */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
          <p style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', margin: '0 0 4px' }}>Animal (Paciente)</p>
          <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{sp.emoji} {petName}</p>
          <p style={{ fontSize: 12, color: '#475569', margin: '2px 0 0' }}>{sp.label}</p>
        </div>
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
          <p style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', margin: '0 0 4px' }}>Tutor (Responsável)</p>
          <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{tutorName}</p>
          {tutorCpf && (
            <p style={{ fontSize: 12, color: '#475569', margin: '2px 0 0' }}>
              CPF: {tutorCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
            </p>
          )}
        </div>
      </div>

      {/* Título do documento */}
      <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: 12, marginBottom: 20 }}>
        <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{printData.name}</p>
        {printData.type && (
          <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0', textTransform: 'capitalize' }}>{printData.type}</p>
        )}
      </div>

      {/* Campos do documento */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {printData.extracted_fields.map(f => {
          const value = printData.fields[f.field_name]
          if (!value && value !== 0) return null
          return (
            <div key={f.field_name} style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: 12 }}>
              <p style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>
                {f.label}
              </p>
              <p style={{ fontSize: 14, color: '#0f172a', margin: 0, lineHeight: 1.5 }}>
                {typeof value === 'boolean' ? (value ? 'Sim' : 'Não') : String(value)}
              </p>
            </div>
          )
        })}
      </div>

      {/* Assinaturas */}
      <div style={{ marginTop: 60, display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ textAlign: 'center', minWidth: 180 }}>
          <div style={{ borderTop: '1px solid #000', paddingTop: 8 }}>
            <p style={{ fontSize: 12, margin: 0 }}>Médico Veterinário</p>
          </div>
        </div>
        <div style={{ textAlign: 'center', minWidth: 180 }}>
          <div style={{ borderTop: '1px solid #000', paddingTop: 8 }}>
            <p style={{ fontSize: 12, margin: 0 }}>Tutor / Responsável</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null

  return (
    <>
      {printPortal}

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-4 pb-4 px-4 overflow-y-auto overflow-x-hidden"
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div role="dialog" aria-modal="true" aria-label={`Prontuário de ${petName}`} className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

          {/* Header */}
          <div className={`flex items-center justify-between border-b px-6 py-4 flex-shrink-0 ${
            isDeceased ? 'border-violet-200 bg-violet-50/40' : 'border-slate-100'
          }`}>
            <div className="flex items-center gap-3">
              <PetAvatar
                name={petName}
                species={petSpecies}
                photoUrl={null}
                size="sm"
                deceased={isDeceased}
              />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className={`text-base font-bold ${isDeceased ? 'text-violet-900' : 'text-slate-900'}`}>
                    Feed do {petName}
                  </h2>
                  {isDeceased && (
                    <span className="text-[10px] font-bold uppercase tracking-wider rounded-full bg-violet-100 text-violet-700 px-2 py-0.5">
                      🕊️ In memoriam
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {sp.label} · Tutor: {tutorName}
                  {events.length > 0 && ` · ${events.filter(e => e.type === 'checkin').length} visita${events.filter(e => e.type === 'checkin').length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isDeceased && (
                <button
                  onClick={() => setShowSchedule(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  + Marcar Agendamento
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Pacotes / Planos */}
            <PackagesSummaryCard />

            {/* Carteira de Vacinação (leitura) */}
            <VaccinationCard
              patientId={petId}
              initialVaccines={vaccines}
              isFinalized={true}
            />

            {/* Timeline */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                  <Clock className="h-5 w-5 animate-spin text-slate-400" />
                </div>
                <p className="mt-3 text-sm text-slate-500">Carregando histórico...</p>
              </div>
            ) : error ? (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            ) : (
              <PetTimeline
                events={events}
                packageMap={packageMap}
                onPrint={handlePrint}
                onEditAppointment={id => setEditApptId(id)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Novo Agendamento */}
      {showSchedule && (
        <NewAppointmentModal
          onClose={() => setShowSchedule(false)}
          onSuccess={() => { setShowSchedule(false); loadData() }}
          defaultPet={tutorId ? {
            id:        petId,
            name:      petName,
            species:   petSpecies,
            tutorId:   tutorId,
            tutorName: tutorName,
          } : undefined}
        />
      )}

      {/* Editar Agendamento (clique no card da timeline) */}
      {editApptId && (
        <EditAppointmentModal
          appointmentId={editApptId}
          onClose={() => setEditApptId(null)}
          onSuccess={() => { setEditApptId(null); loadData() }}
        />
      )}
    </>
  )
}
