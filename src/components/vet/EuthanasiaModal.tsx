'use client'

/**
 * EuthanasiaModal
 *
 * Formulário de registro de eutanásia conforme CFMV Resolução 1.138/2016.
 * Campos obrigatórios: razão, método, consentimento do tutor.
 * Registro imutável — sem UPDATE/DELETE (auditoria CFMV + LGPD Art. 37).
 */

import { useState } from 'react'
import { AlertTriangle, X, ShieldCheck, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  patientId:   string
  patientName: string
  tutorId:     string
  tutorName:   string
  clinicId:    string
  onClose:     () => void
  onSuccess?:  (recordId: string) => void
}

const METHOD_LABELS: Record<string, string> = {
  pentobarbital_sodium: 'Pentobarbital Sódico (IV)',
  t61:                  'T-61 (IV)',
  potassium_chloride_ga:'Cloreto de Potássio com AG',
  inhalation_co2:       'Inalação CO₂ (roedores/aves)',
  other:                'Outro (especificar)',
}

export default function EuthanasiaModal({
  patientId, patientName, tutorId, tutorName, clinicId, onClose, onSuccess,
}: Props) {
  const [reason,         setReason]         = useState('')
  const [method,         setMethod]         = useState<string>('')
  const [methodDetails,  setMethodDetails]  = useState('')
  const [diagnosis,      setDiagnosis]      = useState('')
  const [clinicalNotes,  setClinicalNotes]  = useState('')
  const [tutorConsent,   setTutorConsent]   = useState(false)
  const [consentMethod,  setConsentMethod]  = useState<'digital'|'paper'|'verbal_emergency'>('digital')
  const [witnessName,    setWitnessName]    = useState('')
  const [witnessRole,    setWitnessRole]    = useState('')
  const [notes,          setNotes]          = useState('')
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [confirmed,      setConfirmed]      = useState(false)  // dupla confirmação

  const isValid =
    reason.trim().length >= 10 &&
    method !== '' &&
    (method !== 'other' || methodDetails.trim().length > 0)

  const handleSubmit = async () => {
    if (!isValid || !confirmed) return
    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: rpcError } = await supabase.rpc('rpc_record_euthanasia', {
        p_clinic_id:      clinicId,
        p_patient_id:     patientId,
        p_tutor_id:       tutorId,
        p_reason:         reason.trim(),
        p_method:         method,
        p_method_details: methodDetails.trim() || null,
        p_diagnosis:      diagnosis.trim() || null,
        p_clinical_notes: clinicalNotes.trim() || null,
        p_tutor_consent:  tutorConsent,
        p_consent_method: consentMethod,
        p_witness_name:   witnessName.trim() || null,
        p_witness_role:   witnessRole.trim() || null,
        p_notes:          notes.trim() || null,
      })

      if (rpcError) {
        setError(rpcError.message)
        return
      }

      onSuccess?.(data.id)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="euthanasia-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="euthanasia-modal-title" className="text-base font-bold text-slate-900">
              Registro de Eutanásia — CFMV
            </h2>
            <p className="text-xs text-slate-500">{patientName} · Tutor: {tutorName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {/* Aviso legal */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
            <p className="font-semibold">Resolução CFMV 1.138/2016 — Art. 14</p>
            <p className="mt-0.5">Este registro é permanente e auditável. Preencha todos os campos com precisão clínica.</p>
          </div>

          {/* Razão clínica */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Razão / Indicação Clínica <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Descreva a condição clínica e a indicação (mínimo 10 caracteres)..."
              data-testid="euthanasia-reason"
              className={`w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500 ${
                reason.trim().length > 0 && reason.trim().length < 10
                  ? 'border-red-400' : 'border-slate-300'
              }`}
            />
            {reason.trim().length > 0 && reason.trim().length < 10 && (
              <p className="text-[10px] text-red-500 mt-0.5">Mínimo 10 caracteres ({reason.trim().length}/10)</p>
            )}
          </div>

          {/* Diagnóstico */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Diagnóstico</label>
            <input
              type="text"
              value={diagnosis}
              onChange={e => setDiagnosis(e.target.value)}
              placeholder="CID-V ou descrição diagnóstica"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* Método */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Método <span className="text-red-500">*</span>
            </label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value)}
              data-testid="euthanasia-method"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">Selecione o método...</option>
              {Object.entries(METHOD_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>

          {method === 'other' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Especifique o Método <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={methodDetails}
                onChange={e => setMethodDetails(e.target.value)}
                placeholder="Descreva o método utilizado"
                data-testid="euthanasia-method-details"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          )}

          {/* Notas clínicas */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notas Clínicas</label>
            <textarea
              rows={2}
              value={clinicalNotes}
              onChange={e => setClinicalNotes(e.target.value)}
              placeholder="Condição clínica, exames recentes, prognóstico..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* Consentimento do tutor */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-xs font-bold text-slate-700">Consentimento do Tutor (LGPD Art. 7 + CFMV)</p>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={tutorConsent}
                data-testid="euthanasia-consent-toggle"
                onClick={() => setTutorConsent(v => !v)}
                className={`flex h-4 w-4 items-center justify-center rounded border flex-shrink-0 transition-colors ${
                  tutorConsent ? 'border-green-600 bg-green-600' : 'border-slate-300 bg-white'
                }`}
              >
                {tutorConsent && (
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
              <p className="text-xs text-slate-600">
                Tutor <strong>{tutorName}</strong> consentiu com o procedimento
              </p>
            </div>
            {tutorConsent && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Forma do Consentimento</label>
                <select
                  value={consentMethod}
                  onChange={e => setConsentMethod(e.target.value as typeof consentMethod)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="digital">Digital (sistema)</option>
                  <option value="paper">Físico (assinado em papel)</option>
                  <option value="verbal_emergency">Verbal (emergência)</option>
                </select>
              </div>
            )}
          </div>

          {/* Testemunha */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Testemunha (nome)</label>
              <input
                type="text"
                value={witnessName}
                onChange={e => setWitnessName(e.target.value)}
                placeholder="Nome completo"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cargo / Papel</label>
              <input
                type="text"
                value={witnessRole}
                onChange={e => setWitnessRole(e.target.value)}
                placeholder="Ex: Auxiliar veterinário"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          {/* Dupla confirmação */}
          <div className={`rounded-xl border-2 p-4 transition-colors ${
            confirmed ? 'border-green-400 bg-green-50' : 'border-red-200 bg-red-50'
          }`}>
            <div className="flex items-start gap-2.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={confirmed}
                data-testid="euthanasia-double-confirm"
                onClick={() => setConfirmed(v => !v)}
                className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${
                  confirmed ? 'border-green-600 bg-green-600' : 'border-red-400 bg-white'
                }`}
              >
                {confirmed && (
                  <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
              <p className="text-xs text-slate-700 leading-relaxed">
                <strong>Confirmo</strong> que as informações acima são precisas, que o procedimento é clinicamente indicado, e que estou ciente da irreversibilidade deste registro conforme a CFMV.
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-200 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!isValid || !confirmed || saving}
            onClick={handleSubmit}
            data-testid="euthanasia-submit"
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Registrar Eutanásia
          </button>
        </div>
      </div>
    </div>
  )
}
