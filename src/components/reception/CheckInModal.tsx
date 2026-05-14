'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { checkInPatientWithContacts, updateConsultation } from '@/lib/actions/consultations'
import type { VisitReason, PaymentStatus } from '@/types'
import { DateInput } from '@/components/ui/DatePicker'
import ActivePackagesBanner from './ActivePackagesBanner'

const VISIT_REASON_OPTIONS: { value: VisitReason; label: string; emoji: string; color: string }[] = [
  { value: 'consultation', label: 'Consulta', emoji: '👨‍⚕️', color: 'bg-slate-100 text-slate-700' },
  { value: 'follow_up', label: 'Retorno', emoji: '📋', color: 'bg-slate-100 text-slate-700' },
  { value: 'emergency', label: 'Emergência', emoji: '🚨', color: 'bg-red-100 text-red-700' },
  { value: 'vaccination', label: 'Vacinação', emoji: '💉', color: 'bg-green-100 text-green-700' },
  { value: 'exam', label: 'Exame', emoji: '🔬', color: 'bg-purple-100 text-purple-700' },
  { value: 'surgery', label: 'Cirurgia', emoji: '🏥', color: 'bg-orange-100 text-orange-700' },
]

const PAYMENT_STATUS_OPTIONS: { value: PaymentStatus; label: string }[] = [
  { value: 'pending', label: 'Pendente' },
  { value: 'paid', label: 'Pago' },
  { value: 'courtesy', label: 'Cortesia' },
]

interface Props {
  patientId?: string
  patientName?: string
  tutorId?: string
  tutorName?: string
  tutorAddress?: string | null
  tutorEmergencyContact?: string | null
  mode: 'new_checkin' | 'scheduled_checkin' | 'edit_existing'
  existingConsultation?: {
    id: string
    visit_reason: VisitReason
    payment_status: PaymentStatus
    scheduled_date: string | null
  }
  clinicChecklist?: string[]
  checkinRequiredFields?: string[]
  onClose: () => void
  onSuccess: (data: { consultationId: string; patientName: string; tutorName: string }) => void
}

export function CheckInModal({
  patientId,
  patientName = '—',
  tutorId,
  tutorName = '—',
  tutorAddress = '',
  tutorEmergencyContact = '',
  mode,
  existingConsultation,
  clinicChecklist = ['Assinar termo de responsabilidade clínica'],
  checkinRequiredFields = ['address', 'emergency_contact'],
  onClose,
  onSuccess,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  // Form state
  const [visitReason, setVisitReason] = useState<VisitReason>(existingConsultation?.visit_reason ?? 'consultation')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(existingConsultation?.payment_status ?? 'pending')
  const [scheduledDate, setScheduledDate] = useState<string>(existingConsultation?.scheduled_date?.split('T')[0] ?? '')
  const [weight, setWeight] = useState<string>('')

  // Contatos obrigatórios
  const [address, setAddress] = useState<string>(tutorAddress ?? '')
  const [emergencyContact, setEmergencyContact] = useState<string>(tutorEmergencyContact ?? '')

  // Checklist procedimento
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set())

  const isEdit = mode === 'edit_existing'
  const isScheduled = mode === 'scheduled_checkin'
  const isNewCheckIn = mode === 'new_checkin'

  // Validações de obrigatoriedade — configuráveis por clínica
  const addressRequired = checkinRequiredFields.includes('address')
  const emergencyRequired = checkinRequiredFields.includes('emergency_contact')
  const hasAddress = !addressRequired || address.trim().length > 0
  const hasEmergencyContact = !emergencyRequired || emergencyContact.trim().length > 0
  const checklistRequired = clinicChecklist.length > 0
  const allChecklistChecked = checklistRequired ? checkedItems.size === clinicChecklist.length : true

  const canSubmit = isEdit
    ? !isPending
    : (hasAddress && hasEmergencyContact && !isPending)

  // Enter → confirmar (quando formulário está válido)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return
      if (!canSubmit) return
      e.preventDefault()
      formRef.current?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [canSubmit])

  function toggleChecklistItem(index: number) {
    setCheckedItems(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Validações — condicionais conforme configuração da clínica
    if (addressRequired && !address.trim()) {
      setError('Endereço completo é obrigatório.')
      return
    }
    if (emergencyRequired && !emergencyContact.trim()) {
      setError('Contato de emergência é obrigatório.')
      return
    }

    startTransition(async () => {
      let result: { id: string } | { success: boolean } | { error: string }

      if (isEdit && existingConsultation && tutorId) {
        // Editar: atualiza consultation E tutor
        result = await updateConsultation(existingConsultation.id, {
          visit_reason: visitReason,
          payment_status: paymentStatus,
          scheduled_date: isScheduled ? scheduledDate : undefined,
          tutorId: tutorId,
          address: address.trim(),
          emergency_contact: emergencyContact.trim(),
        })
      } else if (patientId && tutorId) {
        // Novo check-in: cria consultation e atualiza tutor
        result = await checkInPatientWithContacts({
          patient_id: patientId,
          tutor_id: tutorId,
          visit_reason: visitReason,
          payment_status: paymentStatus,
          scheduled_date: isScheduled ? scheduledDate : undefined,
          weight: weight ? parseFloat(weight) : undefined,
          address: address.trim(),
          emergency_contact: emergencyContact.trim(),
        })
      } else {
        setError('Erro: Dados do paciente ou tutor não informados.')
        return
      }

      if ('error' in result) {
        setError(result.error)
      } else {
        const consultationId = isEdit ? existingConsultation!.id : (result as any).id
        onSuccess({
          consultationId,
          patientName,
          tutorName,
        })
      }
    })
  }

  const reasonOption = VISIT_REASON_OPTIONS.find(r => r.value === visitReason)
  const isEmergency = visitReason === 'emergency'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">

        {/* Header — FIXO */}
        <div className={`px-4 sm:px-6 py-4 sm:py-5 flex-shrink-0 ${isEmergency ? 'bg-gradient-to-r from-red-600 to-red-700' : 'bg-gradient-to-r from-teal-600 to-teal-700'}`}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {isEdit ? 'Editar Check-in' : isScheduled ? 'Agendar Atendimento' : 'Novo Check-in'}
              </h2>
              <p className={`text-sm mt-0.5 ${isEmergency ? 'text-red-100' : 'text-teal-100'}`}>
                {patientName} · {tutorName}
              </p>
            </div>
            <button onClick={onClose} className={`rounded-full p-1.5 transition-colors ${
              isEmergency ? 'text-red-100 hover:bg-red-500' : 'text-teal-100 hover:bg-teal-500'
            }`}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body — SCROLL INTERNO */}
        <div className="flex-1 overflow-y-auto">
          <form ref={formRef} onSubmit={handleSubmit} className="px-4 sm:px-6 pt-5 pb-6 space-y-5">

            {/* ── Banner de Pacotes Ativos ── */}
            {patientId && (
              <ActivePackagesBanner petId={patientId} petName={patientName} />
            )}

            {/* ── Motivo da Visita ── */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-3">Motivo da Visita *</label>
              <div className="grid grid-cols-2 gap-2">
                {VISIT_REASON_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setVisitReason(option.value)}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all ${
                      visitReason === option.value
                        ? `border-${option.value === 'emergency' ? 'red' : 'teal'}-600 ${option.color} shadow-sm`
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className="text-2xl">{option.emoji}</span>
                    <span className="text-xs font-medium text-center">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Status de Pagamento ── */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Status de Pagamento *</label>
              <select
                value={paymentStatus}
                onChange={e => setPaymentStatus(e.target.value as PaymentStatus)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {PAYMENT_STATUS_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* ── Peso Atual (opcional) ── */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Peso Atual (kg) <span className="text-slate-400 font-normal">opcional</span></label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                placeholder="Ex: 12.5"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <p className="text-xs text-slate-500 mt-1">Se preenchido, será registrado no atendimento.</p>
            </div>

            {/* ── Data de Agendamento (se for agendado) ── */}
            {isScheduled && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Data de Agendamento *</label>
                <DateInput
                  value={scheduledDate}
                  onChange={setScheduledDate}
                  required={isScheduled}
                  min={new Date().toISOString().split('T')[0]}
                  placeholder="DD/MM/AAAA"
                />
              </div>
            )}

            {/* ── Informações do Tutor — visível apenas se houver campos obrigatórios configurados ── */}
            {(addressRequired || emergencyRequired) && (
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <p className="text-sm font-semibold text-teal-700">Informações do Tutor</p>
                </div>

                {addressRequired && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Endereço Completo *</label>
                    <input
                      type="text"
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      placeholder="Rua, número, complemento, cidade"
                      className={`w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                        !hasAddress ? 'border-red-300 bg-red-50' : 'border-slate-300'
                      }`}
                    />
                    {!hasAddress && <p className="text-xs text-red-600 mt-1">Obrigatório para confirmar</p>}
                  </div>
                )}

                {emergencyRequired && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Contato de Emergência *</label>
                    <input
                      type="text"
                      value={emergencyContact}
                      onChange={e => setEmergencyContact(e.target.value)}
                      placeholder="Nome e Telefone (ex: Maria - 11 99999-0000)"
                      className={`w-full rounded-lg border px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                        !hasEmergencyContact ? 'border-red-300 bg-red-50' : 'border-slate-300'
                      }`}
                    />
                    {!hasEmergencyContact && <p className="text-xs text-red-600 mt-1">Obrigatório para confirmar</p>}
                  </div>
                )}
              </div>
            )}

            {/* ── Checklist Procedimentos — só exibe se houver campos obrigatórios configurados ── */}
            {clinicChecklist.length > 0 && checkinRequiredFields.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <svg className="h-5 w-5 text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <p className="text-sm font-semibold text-slate-700">Procedimentos de Recepção</p>
                </div>
                <div className="space-y-2">
                  {clinicChecklist.map((item, idx) => (
                    <label key={idx} className="flex items-center gap-3 rounded-lg p-2 hover:bg-white transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checkedItems.has(idx)}
                        onChange={() => toggleChecklistItem(idx)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700">{item}</span>
                    </label>
                  ))}
                </div>
                {!allChecklistChecked && (
                  <p className="mt-2 text-xs text-slate-400 italic">Marque os itens conforme realizado.</p>
                )}
              </div>
            )}

            {/* ── Error message ── */}
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">{error}</div>
            )}
          </form>
        </div>

        {/* Footer — FIXO */}
        <div className="border-t border-slate-200 bg-white px-4 sm:px-6 py-4 flex-shrink-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => formRef.current?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))}
            disabled={!canSubmit}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              isEmergency
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500 disabled:opacity-60'
                : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 disabled:opacity-60'
            }`}
          >
            {isPending ? 'Processando...' : isEdit ? 'Atualizar' : 'Confirmar Check-in'}
          </button>
        </div>
      </div>
    </div>
  )
}
