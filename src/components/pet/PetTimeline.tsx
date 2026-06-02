'use client'

import { useState } from 'react'
import { Filter, X } from 'lucide-react'
import { DatePicker } from '@/components/ui/DatePicker'
import type { TimelineEvent, TimelineEventType } from '@/lib/actions/timeline'
import type { PrintState } from '@/components/vet/DocumentsSection'
import type { ExtractedField } from '@/types'
import type { PackageSessionInfo } from '@/lib/actions/packages'

// ─── Constants ────────────────────────────────────────────────────────────────

const VISIT_REASON_LABELS: Record<string, string> = {
  consultation:  'Consulta',
  follow_up:     'Retorno',
  emergency:     'Emergência',
  vaccination:   'Vacinação',
  exam:          'Exame',
  surgery:       'Cirurgia',
  grooming:      'Banho e Tosa',
  microchipping: 'Microchipagem',
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending:   'Pendente',
  paid:      'Pago',
  courtesy:  'Cortesia',
}

const TEMPLATE_TYPE_LABELS: Record<string, string> = {
  laudo:          'Laudo',
  receita:        'Receita',
  encaminhamento: 'Encaminhamento',
  termo:          'Termo',
  exame:          'Exame',
  outro:          'Outro',
}

const ROUTE_LABELS: Record<string, string> = {
  IV: 'Intravenosa (IV)', IM: 'Intramuscular (IM)',
  SC: 'Subcutânea (SC)', oral: 'Oral', topical: 'Tópica', other: 'Outra',
}

const MUCOUS_LABELS: Record<string, string> = {
  pink:       'Rosada',
  pale:       'Pálida',
  white:      'Branca',
  cyanotic:   'Cianótica',
  icteric:    'Ictérica',
  congested:  'Congesta',
}

const APPOINTMENT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Agendado',  color: 'bg-blue-100 text-blue-700' },
  confirmed: { label: 'Confirmado', color: 'bg-green-100 text-green-700' },
}

const IMPROVEMENT_LABELS: Record<string, { label: string; color: string }> = {
  melhorou: { label: 'Melhorou',      color: 'bg-green-100 text-green-700' },
  estavel:  { label: 'Estável',       color: 'bg-yellow-100 text-yellow-700' },
  piorou:   { label: 'Piorou',        color: 'bg-red-100 text-red-700' },
}

const TRIGGER_LABELS: Record<string, string> = {
  triage_called:             'Chamada para Triagem',
  triage_completed:          'Triagem Concluída',
  documents_sent:            'Documentos Enviados',
  exam_completed:            'Exame Realizado',
  hospitalization_update:    'Evolução da Internação',
  hospitalization_discharge: 'Alta da Internação',
  consultation_finished:     'Alta — Consulta Concluída',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Parseia o JSON de diagnóstico diferencial e retorna texto legível
function formatDiagnosis(raw: string | null): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.differential_diagnoses) && parsed.differential_diagnoses.length > 0) {
      return parsed.differential_diagnoses
        .map((d: any) => {
          const name = d.diagnosis ?? d.name ?? String(d)
          const prob = d.probability ? ` (${d.probability})` : ''
          return `${name}${prob}`
        })
        .join(' · ')
    }
  } catch { /* não é JSON — usar como texto direto */ }
  return raw
}

function groupByDay(events: TimelineEvent[]): [string, TimelineEvent[]][] {
  const map = new Map<string, TimelineEvent[]>()
  for (const e of events) {
    const key = new Date(e.date).toLocaleDateString('pt-BR')
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(e)
  }
  return Array.from(map.entries())
}

// ─── Event Icons ──────────────────────────────────────────────────────────────

function EventDot({ type }: { type: TimelineEvent['type'] }) {
  const cfg = {
    checkin:                  { bg: 'bg-slate-500',   icon: '🏥' },
    triage:                   { bg: 'bg-amber-500',   icon: '🩺' },
    consultation:             { bg: 'bg-blue-600',    icon: '📝' },
    medication:               { bg: 'bg-green-600',   icon: '💉' },
    document:                 { bg: 'bg-purple-600',  icon: '📄' },
    completed:                { bg: 'bg-teal-600',    icon: '✅' },
    appointment:              { bg: 'bg-indigo-500',  icon: '📅' },
    attachment:               { bg: 'bg-rose-500',    icon: '📎' },
    hospitalization_evolution:{ bg: 'bg-orange-500',  icon: '🏥' },
    grooming_evolution:       { bg: 'bg-teal-500',    icon: '✂️' },
    whatsapp_notification:    { bg: 'bg-green-500',   icon: '📱' },
    petlove_event:            { bg: 'bg-purple-500',  icon: '🐾' },
  }[type]
  if (!cfg) return <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm shadow-sm ring-2 ring-white bg-slate-400">❓</div>
  return (
    <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm shadow-sm ring-2 ring-white ${cfg.bg}`}>
      {cfg.icon}
    </div>
  )
}

function PetloveEventCard({ event }: { event: TimelineEvent }) {
  const d = event.petlove_event!
  const labels: Record<string, string> = {
    patient_created: 'Cadastro via Convênio',
    plan_updated:    'Plano atualizado',
    price_updated:   'Preço atualizado',
    entry_created:   'Título financeiro lançado',
  }
  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-bold text-purple-700 uppercase tracking-wide">{labels[d.event_type] ?? 'Convênio'}</p>
        <span className="text-[10px] text-purple-500">{new Date(event.date).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <p className="text-sm text-purple-900 break-words">{d.description}</p>
    </div>
  )
}

// ─── Event Cards ──────────────────────────────────────────────────────────────

function CheckInCard({ event }: { event: TimelineEvent }) {
  const d = event.checkin!
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Check-in na Recepção</p>
          <p className="mt-0.5 text-sm font-medium text-slate-800">
            {VISIT_REASON_LABELS[d.visit_reason] ?? d.visit_reason}
          </p>
          {event.reason && (
            <p className="mt-0.5 text-xs text-slate-600 italic">{event.reason}</p>
          )}
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          d.payment_status === 'paid' ? 'bg-green-100 text-green-700' :
          d.payment_status === 'courtesy' ? 'bg-purple-100 text-purple-700' :
          'bg-yellow-100 text-yellow-700'
        }`}>
          {PAYMENT_STATUS_LABELS[d.payment_status] ?? d.payment_status}
        </span>
      </div>
    </div>
  )
}

function TriageCard({ event }: { event: TimelineEvent }) {
  const vs = event.triage!
  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Triagem — Sinais Vitais</p>
      <div className="grid grid-cols-2 gap-2">
        {vs.weight > 0 && <VitalItem label="Peso" value={`${vs.weight} kg`} />}
        {vs.temperature > 0 && <VitalItem label="Temp. Retal" value={`${vs.temperature} °C`} />}
        {vs.heart_rate > 0 && <VitalItem label="FC" value={`${vs.heart_rate} bpm`} />}
        {vs.respiratory_rate > 0 && <VitalItem label="FR" value={`${vs.respiratory_rate} rpm`} />}
        {vs.mucous_color && <VitalItem label="Mucosas" value={MUCOUS_LABELS[vs.mucous_color] ?? vs.mucous_color} />}
        {vs.crt && <VitalItem label="TPC" value={vs.crt} />}
      </div>
      {vs.chief_complaint && (
        <div className="border-t border-amber-200 pt-2">
          <p className="text-xs text-amber-500 font-medium">Queixa Principal</p>
          <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">{vs.chief_complaint}</p>
        </div>
      )}
    </div>
  )
}

function ConsultationCard({ event }: { event: TimelineEvent }) {
  const c = event.consultation!
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Prontuário Clínico</p>
        {event.vet_name && (
          <p className="text-xs text-blue-500">
            MV {event.vet_name}{event.vet_crmv ? ` · CRMV ${event.vet_crmv}` : ''}
          </p>
        )}
      </div>
      {c.suggested_diagnosis && (() => {
        const diagText = formatDiagnosis(c.suggested_diagnosis)
        return diagText ? (
          <div>
            <p className="text-xs font-medium text-blue-700">Diagnóstico Sugerido</p>
            <p className="text-xs text-blue-800 mt-0.5 leading-relaxed line-clamp-3">{diagText}</p>
          </div>
        ) : null
      })()}
      {c.vet_notes && (
        <div className={c.suggested_diagnosis ? 'border-t border-blue-200 pt-2' : ''}>
          <p className="text-xs font-medium text-blue-700">Notas Clínicas</p>
          <p className="text-xs text-blue-800 mt-0.5 leading-relaxed line-clamp-4">{c.vet_notes}</p>
        </div>
      )}
    </div>
  )
}

function MedicationCard({ event }: { event: TimelineEvent }) {
  const m = event.medication!
  return (
    <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-green-600 mb-1.5">Medicação Aplicada</p>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-green-900">{m.medication_name}</p>
        {m.dosage && (
          <span className="flex-shrink-0 rounded-full bg-green-200 px-2 py-0.5 text-xs font-semibold text-green-800">{m.dosage}</span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        {m.route && (
          <span className="text-xs text-green-600 bg-green-100 rounded px-1.5 py-0.5">
            {ROUTE_LABELS[m.route] ?? m.route}
          </span>
        )}
        {m.notes && <span className="text-xs text-green-700 italic">{m.notes}</span>}
      </div>
    </div>
  )
}

function DocumentCard({
  event,
  onPrint,
}: {
  event: TimelineEvent
  onPrint?: (data: PrintState) => void
}) {
  const d = event.document!
  const typeLabel = d.template_type ? (TEMPLATE_TYPE_LABELS[d.template_type] ?? d.template_type) : null
  const hasFields = d.template_extracted_fields && d.template_extracted_fields.length > 0

  const handlePrint = () => {
    if (!onPrint || !hasFields) return
    onPrint({
      name:             d.document_name,
      type:             d.template_type ?? 'outro',
      fields:           d.content_data,
      extracted_fields: d.template_extracted_fields as ExtractedField[],
    })
  }

  return (
    <div className="rounded-xl border border-purple-100 bg-purple-50 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 mb-1">Documento Emitido</p>
          <p className="text-sm font-semibold text-purple-900">{d.document_name}</p>
          {typeLabel && (
            <span className="mt-1 inline-block rounded-full bg-purple-200 px-2 py-0.5 text-xs font-medium text-purple-700">
              {typeLabel}
            </span>
          )}
        </div>
        {hasFields && onPrint && (
          <button
            onClick={e => { e.stopPropagation(); handlePrint() }}
            className="flex-shrink-0 flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-700 transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
            </svg>
            Reimprimir
          </button>
        )}
      </div>
    </div>
  )
}

function AppointmentCard({ event, packageInfo }: { event: TimelineEvent; packageInfo?: PackageSessionInfo }) {
  const a          = event.appointment!
  const statusCfg  = APPOINTMENT_STATUS_LABELS[a.status] ?? { label: a.status, color: 'bg-slate-100 text-slate-600' }
  const datePart   = a.datetime.split('T')[0]
  const timePart   = a.datetime.split('T')[1]?.substring(0, 5) ?? ''
  const dateLabel  = new Date(datePart + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })

  return (
    <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Próximo Agendamento</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
            {packageInfo && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold border ${
                packageInfo.is_last
                  ? 'bg-amber-100 text-amber-700 border-amber-300'
                  : 'bg-teal-100 text-teal-700 border-teal-300'
              }`}>
                🎁 Visita {packageInfo.session_number}/{packageInfo.total_sessions}
              </span>
            )}
          </div>
          {packageInfo && (
            <p className="text-[10px] text-teal-600 font-medium mb-1 truncate">{packageInfo.package_name}</p>
          )}
          <p className="text-sm font-semibold text-indigo-900 capitalize">{dateLabel}</p>
          {timePart && (
            <p className="text-xs text-indigo-600 mt-0.5">Horário: {timePart}</p>
          )}
          <p className="text-xs text-indigo-700 mt-0.5">
            {VISIT_REASON_LABELS[a.reason] ?? a.reason}
          </p>
          {a.notes && (
            <p className="text-xs text-indigo-500 italic mt-1">{a.notes}</p>
          )}
        </div>
        <div className="flex-shrink-0 text-2xl">📅</div>
      </div>
    </div>
  )
}

function AttachmentCard({ event }: { event: TimelineEvent }) {
  const a = event.attachment!
  const isImage = a.file_type.startsWith('image/')
  return (
    <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-rose-600 mb-2">Arquivo Anexado</p>
      <div className="flex items-center gap-3">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.signed_url}
            alt={a.file_name}
            className="h-12 w-12 rounded-lg object-cover border border-rose-200 flex-shrink-0"
          />
        ) : (
          <div className="h-12 w-12 rounded-lg bg-white border border-rose-200 flex items-center justify-center flex-shrink-0">
            <span className="text-xl">📄</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-rose-900 truncate">{a.file_name}</p>
          <p className="text-xs text-rose-500 mt-0.5">{a.file_type}</p>
        </div>
        {a.signed_url && (
          <a
            href={a.signed_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex-shrink-0 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
          >
            Abrir
          </a>
        )}
      </div>
    </div>
  )
}

function CompletedCard({ event }: { event: TimelineEvent }) {
  return (
    <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-600 text-white">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold text-teal-800">Alta — Consulta Concluída</p>
        {event.vet_name && (
          <p className="text-xs text-teal-600 mt-0.5">MV responsável: {event.vet_name}</p>
        )}
      </div>
    </div>
  )
}

function HospitalizationEvolutionCard({ event }: { event: TimelineEvent }) {
  const ev = event.hospitalization_evolution!
  const statusCfg = IMPROVEMENT_LABELS[ev.improvement_level] ?? { label: ev.improvement_level, color: 'bg-slate-100 text-slate-600' }
  return (
    <div className="rounded-xl border border-orange-100 bg-orange-50 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">📝 Evolução Clínica — Internação</p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCfg.color}`}>
          {statusCfg.label}
        </span>
      </div>
      {ev.notes && (
        <p className="text-xs text-orange-800 leading-relaxed">{ev.notes}</p>
      )}
      {ev.medications.length > 0 && (
        <div className="border-t border-orange-200 pt-2 space-y-1">
          <p className="text-xs font-medium text-orange-600 mb-1">💉 Medicação Internação</p>
          {ev.medications.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs font-semibold text-orange-900">{m.name}</span>
              {m.dosage && <span className="rounded-full bg-orange-200 px-1.5 py-0.5 text-xs text-orange-800">{m.dosage}</span>}
              {m.route && <span className="text-xs text-orange-600">{m.route}</span>}
            </div>
          ))}
        </div>
      )}
      {ev.user_name && (
        <p className="text-xs text-orange-400">Registrado por: {ev.user_name}</p>
      )}
    </div>
  )
}

const BEHAVIOR_LABELS: Record<string, { label: string; color: string }> = {
  tranquilo: { label: 'Tranquilo', color: 'bg-emerald-100 text-emerald-700' },
  ansioso:   { label: 'Ansioso',   color: 'bg-amber-100 text-amber-700' },
  agitado:   { label: 'Agitado',   color: 'bg-orange-100 text-orange-700' },
  agressivo: { label: 'Agressivo', color: 'bg-rose-100 text-rose-700' },
}

function GroomingEvolutionCard({ event }: { event: TimelineEvent }) {
  const gr = event.grooming_evolution!
  const behCfg = gr.behavior ? BEHAVIOR_LABELS[gr.behavior] : null
  return (
    <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-600">✂️ Banho e Tosa</p>
        {behCfg && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${behCfg.color}`}>
            {behCfg.label}
          </span>
        )}
      </div>
      {gr.services_applied.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {gr.services_applied.map((s, i) => (
            <span key={i} className="rounded-full bg-teal-200 px-2 py-0.5 text-xs font-medium text-teal-800">{s}</span>
          ))}
        </div>
      )}
      {gr.products_used.length > 0 && (
        <p className="text-xs text-teal-700">Produtos: {gr.products_used.join(', ')}</p>
      )}
      {gr.observations && (
        <p className="text-xs text-teal-800 leading-relaxed">{gr.observations}</p>
      )}
      {gr.user_name && (
        <p className="text-xs text-teal-400">Registrado por: {gr.user_name}</p>
      )}
    </div>
  )
}

function WhatsAppNotificationCard({ event }: { event: TimelineEvent }) {
  const wa = event.whatsapp_notification!
  const triggerLabel = TRIGGER_LABELS[wa.trigger_type] ?? wa.trigger_type
  return (
    <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-green-600">📱 Mensagem enviada ao Tutor</p>
        <span className="rounded-full bg-green-200 px-2.5 py-0.5 text-xs font-medium text-green-800">
          {triggerLabel}
        </span>
      </div>
      <p className="text-xs text-green-800 leading-relaxed line-clamp-3">{wa.message}</p>
      {wa.tutor_name && (
        <p className="text-xs text-green-500">Destinatário: {wa.tutor_name}</p>
      )}
    </div>
  )
}

function VitalItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/70 px-2 py-1.5">
      <p className="text-xs text-amber-500 font-medium">{label}</p>
      <p className="text-xs font-semibold text-amber-900 mt-0.5">{value}</p>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  events: TimelineEvent[]
  packageMap?: Record<string, PackageSessionInfo>
  onPrint?: (data: PrintState) => void
  onEdit?: (consultationId: string) => void
  onEditAppointment?: (appointmentId: string) => void
}

function isToday(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  checkin: 'Check-in', triage: 'Triagem', consultation: 'Consulta', medication: 'Medicação',
  document: 'Documento', completed: 'Concluída', appointment: 'Agendamento', attachment: 'Anexo',
  hospitalization_evolution: 'Internação', whatsapp_notification: 'WhatsApp',
}

// ─── Event Detail Modal ───────────────────────────────────────────────────────

function EventDetailModal({ event, onClose }: { event: TimelineEvent; onClose: () => void }) {
  const typeLabel = EVENT_TYPE_LABELS[event.type] ?? event.type

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <EventDot type={event.type} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">{typeLabel}</p>
            <p className="text-xs text-slate-400">
              {formatDate(event.date)} às {formatTime(event.date)}
              {(event.performed_by ?? event.vet_name) && (
                <span className="ml-2">· por {event.performed_by ?? event.vet_name}</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-full transition-colors flex-shrink-0"
          >
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-5 space-y-4">

          {event.type === 'checkin' && event.checkin && (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">
                Motivo: <span className="font-semibold">{VISIT_REASON_LABELS[event.checkin.visit_reason] ?? event.checkin.visit_reason}</span>
              </p>
              <p className="text-sm text-slate-700">
                Pagamento:{' '}
                <span className={`font-semibold ${
                  event.checkin.payment_status === 'paid' ? 'text-green-700' :
                  event.checkin.payment_status === 'courtesy' ? 'text-purple-700' : 'text-amber-700'
                }`}>
                  {PAYMENT_STATUS_LABELS[event.checkin.payment_status] ?? event.checkin.payment_status}
                </span>
              </p>
            </div>
          )}

          {event.type === 'triage' && event.triage && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {event.triage.weight > 0 && <VitalItem label="Peso" value={`${event.triage.weight} kg`} />}
                {event.triage.temperature > 0 && <VitalItem label="Temp. Retal" value={`${event.triage.temperature} °C`} />}
                {event.triage.heart_rate > 0 && <VitalItem label="FC" value={`${event.triage.heart_rate} bpm`} />}
                {event.triage.respiratory_rate > 0 && <VitalItem label="FR" value={`${event.triage.respiratory_rate} rpm`} />}
                {event.triage.mucous_color && <VitalItem label="Mucosas" value={MUCOUS_LABELS[event.triage.mucous_color] ?? event.triage.mucous_color} />}
                {event.triage.crt && <VitalItem label="TPC" value={event.triage.crt} />}
              </div>
              {event.triage.chief_complaint && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 mb-1">Queixa Principal</p>
                  <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{event.triage.chief_complaint}</p>
                </div>
              )}
            </div>
          )}

          {event.type === 'consultation' && event.consultation && (() => {
            const c = event.consultation!
            return (
              <div className="space-y-4">
                {event.vet_name && (
                  <p className="text-xs text-blue-600 font-medium">
                    MV {event.vet_name}{event.vet_crmv ? ` · CRMV ${event.vet_crmv}` : ''}
                  </p>
                )}
                {c.suggested_diagnosis && (() => {
                  const diagText = formatDiagnosis(c.suggested_diagnosis)
                  return diagText ? (
                    <div>
                      <p className="text-xs font-semibold text-blue-700 mb-1">Diagnóstico Sugerido</p>
                      <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{diagText}</p>
                    </div>
                  ) : null
                })()}
                {c.vet_notes && (
                  <div>
                    <p className="text-xs font-semibold text-blue-700 mb-1">Notas Clínicas</p>
                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{c.vet_notes}</p>
                  </div>
                )}
              </div>
            )
          })()}

          {event.type === 'medication' && event.medication && (
            <div className="space-y-2">
              <p className="text-base font-bold text-green-900">{event.medication.medication_name}</p>
              {event.medication.dosage && (
                <p className="text-sm text-slate-700">Dose: <span className="font-medium">{event.medication.dosage}</span></p>
              )}
              {event.medication.route && (
                <p className="text-sm text-slate-700">Via: <span className="font-medium">{ROUTE_LABELS[event.medication.route] ?? event.medication.route}</span></p>
              )}
              {event.medication.notes && (
                <div>
                  <p className="text-xs font-semibold text-green-700 mb-1">Observações</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{event.medication.notes}</p>
                </div>
              )}
            </div>
          )}

          {event.type === 'document' && event.document && (
            <div className="space-y-3">
              <p className="text-base font-bold text-purple-900">{event.document.document_name}</p>
              {event.document.template_type && (
                <span className="inline-block rounded-full bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700">
                  {TEMPLATE_TYPE_LABELS[event.document.template_type] ?? event.document.template_type}
                </span>
              )}
            </div>
          )}

          {event.type === 'completed' && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
                <svg className="h-5 w-5 text-teal-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-teal-800">Alta — Consulta Concluída</p>
                {event.vet_name && <p className="text-sm text-teal-600 mt-0.5">MV responsável: {event.vet_name}</p>}
              </div>
            </div>
          )}

          {event.type === 'appointment' && event.appointment && (() => {
            const a = event.appointment
            const datePart = a.datetime.split('T')[0]
            const timePart = a.datetime.split('T')[1]?.substring(0, 5) ?? ''
            const dateLabel = new Date(datePart + 'T12:00:00').toLocaleDateString('pt-BR', {
              weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
            })
            const statusCfg = APPOINTMENT_STATUS_LABELS[a.status] ?? { label: a.status, color: 'bg-slate-100 text-slate-600' }
            return (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-indigo-900 capitalize">{dateLabel}</p>
                {timePart && <p className="text-xs text-indigo-600">Horário: {timePart}</p>}
                <p className="text-xs text-indigo-700">{VISIT_REASON_LABELS[a.reason] ?? a.reason}</p>
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCfg.color}`}>{statusCfg.label}</span>
                {a.notes && <p className="text-sm text-slate-700 italic mt-1">{a.notes}</p>}
              </div>
            )
          })()}

          {event.type === 'attachment' && event.attachment && (() => {
            const a = event.attachment
            const isImage = a.file_type.startsWith('image/')
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  {isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.signed_url} alt={a.file_name} className="h-20 w-20 rounded-xl object-cover border border-rose-200 flex-shrink-0" />
                  ) : (
                    <div className="h-16 w-16 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-3xl flex-shrink-0">📄</div>
                  )}
                  <div>
                    <p className="font-semibold text-rose-900">{a.file_name}</p>
                    <p className="text-xs text-rose-500 mt-0.5">{a.file_type}</p>
                  </div>
                </div>
                {a.signed_url && (
                  <a
                    href={a.signed_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 transition-colors"
                  >
                    Abrir arquivo
                  </a>
                )}
              </div>
            )
          })()}

          {event.type === 'hospitalization_evolution' && event.hospitalization_evolution && (() => {
            const ev = event.hospitalization_evolution!
            const statusCfg = IMPROVEMENT_LABELS[ev.improvement_level] ?? { label: ev.improvement_level, color: 'bg-slate-100 text-slate-600' }
            return (
              <div className="space-y-3">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusCfg.color}`}>
                  {statusCfg.label}
                </span>
                {ev.notes && (
                  <div>
                    <p className="text-xs font-semibold text-orange-700 mb-1">Evolução Clínica</p>
                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{ev.notes}</p>
                  </div>
                )}
                {ev.medications.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-orange-700 mb-2">Medicações</p>
                    <div className="space-y-1.5">
                      {ev.medications.map((m, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-sm font-medium text-orange-900">{m.name}</span>
                          {m.dosage && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">{m.dosage}</span>}
                          {m.route && <span className="text-xs text-orange-600">{m.route}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {ev.user_name && <p className="text-xs text-slate-400 mt-2">Registrado por: {ev.user_name}</p>}
              </div>
            )
          })()}

          {event.type === 'grooming_evolution' && event.grooming_evolution && (() => {
            const gr = event.grooming_evolution!
            const behCfg = gr.behavior ? BEHAVIOR_LABELS[gr.behavior] : null
            return (
              <div className="space-y-3">
                {behCfg && (
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${behCfg.color}`}>
                    {behCfg.label}
                  </span>
                )}
                {gr.services_applied.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-teal-700 mb-1">Serviços</p>
                    <div className="flex flex-wrap gap-1.5">
                      {gr.services_applied.map((s, i) => (
                        <span key={i} className="rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-medium text-teal-800">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
                {gr.products_used.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-teal-700 mb-1">Produtos</p>
                    <p className="text-sm text-slate-700">{gr.products_used.join(', ')}</p>
                  </div>
                )}
                {gr.observations && (
                  <div>
                    <p className="text-xs font-semibold text-teal-700 mb-1">Observações</p>
                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{gr.observations}</p>
                  </div>
                )}
                {gr.user_name && <p className="text-xs text-slate-400">Registrado por: {gr.user_name}</p>}
              </div>
            )
          })()}

          {event.type === 'whatsapp_notification' && event.whatsapp_notification && (
            <div className="space-y-3">
              <span className="inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                {TRIGGER_LABELS[event.whatsapp_notification.trigger_type] ?? event.whatsapp_notification.trigger_type}
              </span>
              <div>
                <p className="text-xs font-semibold text-green-700 mb-1">Mensagem</p>
                <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{event.whatsapp_notification.message}</p>
              </div>
              {event.whatsapp_notification.tutor_name && (
                <p className="text-xs text-slate-400">Destinatário: {event.whatsapp_notification.tutor_name}</p>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default function PetTimeline({ events, packageMap = {}, onPrint, onEdit, onEditAppointment }: Props) {
  const [filterType, setFilterType] = useState<TimelineEventType | 'all'>('all')
  const [filterDate, setFilterDate] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [expandedEvent, setExpandedEvent] = useState<TimelineEvent | null>(null)

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-3 text-4xl">🐾</div>
        <p className="text-sm font-medium text-slate-500">Sem histórico registrado</p>
        <p className="text-xs text-slate-400 mt-1">O feed aparecerá após o primeiro atendimento</p>
      </div>
    )
  }

  // Available event types for filter
  const availableTypes = [...new Set(events.map(e => e.type))]

  // Apply filters
  let filtered = events
  if (filterType !== 'all') filtered = filtered.filter(e => e.type === filterType)
  if (filterDate) filtered = filtered.filter(e => e.date.startsWith(filterDate))

  const groups = groupByDay(filtered)

  return (
    <div className="space-y-6">
      {expandedEvent && (
        <EventDetailModal event={expandedEvent} onClose={() => setExpandedEvent(null)} />
      )}
      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
            (filterType !== 'all' || filterDate) ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Filter className="h-3 w-3" />
          Filtros
        </button>
        {showFilters && (
          <>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value as TimelineEventType | 'all')}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              <option value="all">Todos os tipos</option>
              {availableTypes.map(t => (
                <option key={t} value={t}>{EVENT_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
            <DatePicker
              value={filterDate}
              onChange={setFilterDate}
              className="text-xs"
            />
            {(filterType !== 'all' || filterDate) && (
              <button
                onClick={() => { setFilterType('all'); setFilterDate('') }}
                className="text-[10px] text-red-500 hover:text-red-700 font-medium"
              >
                Limpar
              </button>
            )}
          </>
        )}
      </div>
      {groups.map(([dateLabel, dayEvents]) => (
        <div key={dateLabel}>
          {/* Data header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 bg-white px-2">
              {formatDate(dayEvents[0].date)}
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {/* Events for this day */}
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-3.5 top-4 bottom-4 w-px bg-slate-200" />

            <div className="space-y-4">
              {dayEvents.map(event => (
                <div key={event.id} className="flex gap-4">
                  <div className="relative z-10 mt-0.5">
                    <EventDot type={event.type} />
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    {/* Timestamp + performed_by + Edit button */}
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs text-slate-400">
                        {formatTime(event.date)}
                        {(event.performed_by || event.vet_name) && (
                          <span className="ml-2 text-slate-500 font-medium">
                            por {event.performed_by ?? event.vet_name}
                          </span>
                        )}
                      </p>
                      {onEdit && event.consultation_id && isToday(event.date) &&
                        (event.type === 'checkin' || event.type === 'triage' || event.type === 'consultation' || event.type === 'completed') && (
                        <button
                          onClick={() => onEdit(event.consultation_id!)}
                          className="text-xs font-medium text-blue-600 hover:text-blue-800 underline underline-offset-2"
                        >
                          Editar
                        </button>
                      )}
                    </div>
                    {/* Card — clicável para editar agendamentos ou ver detalhes */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (onEditAppointment && event.type === 'appointment' && event.appointment) {
                          onEditAppointment(event.appointment.id)
                        } else {
                          setExpandedEvent(event)
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          if (onEditAppointment && event.type === 'appointment' && event.appointment) {
                            onEditAppointment(event.appointment.id)
                          } else {
                            setExpandedEvent(event)
                          }
                        }
                      }}
                      className="cursor-pointer rounded-xl hover:ring-2 hover:ring-teal-400/50 hover:ring-offset-1 focus:outline-none focus:ring-2 focus:ring-teal-400/50 transition-all"
                    >
                      {event.type === 'checkin'                   && <CheckInCard event={event} />}
                      {event.type === 'triage'                    && <TriageCard event={event} />}
                      {event.type === 'consultation'              && <ConsultationCard event={event} />}
                      {event.type === 'medication'                && <MedicationCard event={event} />}
                      {event.type === 'document'                  && <DocumentCard event={event} onPrint={onPrint} />}
                      {event.type === 'attachment'                && <AttachmentCard event={event} />}
                      {event.type === 'completed'                 && <CompletedCard event={event} />}
                      {event.type === 'appointment'               && <AppointmentCard event={event} packageInfo={packageMap[event.appointment?.id ?? '']} />}
                      {event.type === 'hospitalization_evolution' && <HospitalizationEvolutionCard event={event} />}
                      {event.type === 'grooming_evolution'        && <GroomingEvolutionCard event={event} />}
                      {event.type === 'whatsapp_notification'     && <WhatsAppNotificationCard event={event} />}
                      {event.type === 'petlove_event'             && <PetloveEventCard event={event} />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
