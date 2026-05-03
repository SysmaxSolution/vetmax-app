'use client'

/**
 * SMSConsentToggle
 *
 * Toggle de consentimento granular para notificações WhatsApp/SMS.
 * LGPD Art. 7, I: consentimento livre, específico, informado e inequívoco.
 *
 * Uso:
 *   - Na aba Recepção do PatientFullModal (modo edição de tutor existente)
 *   - No painel de detalhes do tutor
 */

import { useState } from 'react'
import { MessageCircle, Info } from 'lucide-react'
import { updateWhatsAppConsent } from '@/lib/actions/compliance'

interface Props {
  tutorId:          string
  initialConsent:   boolean
  onToast?:         (msg: string, type: 'success' | 'error') => void
  readOnly?:        boolean
}

export default function SMSConsentToggle({ tutorId, initialConsent, onToast, readOnly }: Props) {
  const [consent,  setConsent]  = useState(initialConsent)
  const [saving,   setSaving]   = useState(false)
  const [showInfo, setShowInfo] = useState(false)

  const handleToggle = async () => {
    if (readOnly || saving) return
    const next = !consent
    setSaving(true)
    const res = await updateWhatsAppConsent(tutorId, next)
    setSaving(false)
    if ('error' in res) {
      onToast?.(res.error, 'error')
      return
    }
    setConsent(next)
    onToast?.(
      next
        ? 'Consentimento WhatsApp habilitado.'
        : 'Consentimento WhatsApp removido. Notificações não serão enviadas.',
      'success'
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
            consent ? 'bg-teal-100' : 'bg-slate-100'
          }`}>
            <MessageCircle className={`h-4 w-4 ${consent ? 'text-teal-600' : 'text-slate-400'}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-bold text-slate-700">Notificações WhatsApp</p>
              <button
                type="button"
                onClick={() => setShowInfo(v => !v)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Informações sobre consentimento"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              {consent ? 'Tutor receberá notificações automáticas' : 'Notificações desabilitadas'}
            </p>
          </div>
        </div>

        {/* Toggle */}
        {!readOnly && (
          <button
            type="button"
            data-testid="btn-whatsapp-consent-toggle"
            onClick={handleToggle}
            disabled={saving}
            aria-checked={consent}
            role="switch"
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-60 ${
              consent ? 'bg-teal-500' : 'bg-slate-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                consent ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        )}

        {readOnly && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            consent ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {consent ? 'Habilitado' : 'Desabilitado'}
          </span>
        )}
      </div>

      {/* Info tooltip */}
      {showInfo && (
        <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5 text-[11px] text-blue-800 leading-relaxed">
          <p className="font-semibold mb-1">Base Legal: LGPD Art. 7, Inciso I</p>
          <p>
            Este consentimento é específico para o envio de notificações automáticas
            via WhatsApp (lembretes de consulta, resultados de exames, alta de internação).
          </p>
          <p className="mt-1.5">
            O tutor pode revogar a qualquer momento. A revogação não afeta outros serviços.
          </p>
          <button
            type="button"
            onClick={() => setShowInfo(false)}
            className="mt-2 text-blue-600 hover:text-blue-700 underline text-[10px]"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  )
}
