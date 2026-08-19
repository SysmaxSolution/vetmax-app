'use client'

import { useState, useTransition } from 'react'
import {
  Shield, CheckCircle2, AlertTriangle, Ban, ChevronDown, ChevronUp,
  Copy, Check, X, Loader2, FileText,
} from 'lucide-react'
import { acknowledgeInsuranceAudit, type AuditResult, type AuditSuggestion } from '@/lib/actions/insurance-audit'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  auditResult:    AuditResult
  consultationId: string
  onDismiss:      () => void
}

// ─── Suggestion Row ───────────────────────────────────────────────────────────

function SuggestionRow({ s, onCopyTemplate }: { s: AuditSuggestion; onCopyTemplate: (t: string) => void }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    onCopyTemplate(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const severityBadge =
    s.severity === 'blocking'
      ? 'bg-red-100 text-red-700 border-red-200'
      : s.severity === 'warning'
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : 'bg-sky-100 text-sky-700 border-sky-200'

  const SevIcon = s.severity === 'blocking' ? Ban : s.severity === 'warning' ? AlertTriangle : Shield

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${severityBadge}`}>
          <SevIcon className="h-3 w-3" />
          {s.severity === 'blocking' ? 'Bloqueante' : s.severity === 'warning' ? 'Aviso' : 'Info'}
        </span>
        <p className="text-sm font-bold text-slate-800">{s.procedure}</p>
      </div>
      <p className="text-xs text-slate-600 ml-1">{s.issue}</p>
      <p className="text-xs text-teal-700 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2 ml-1">
        <span className="font-bold">Sugestão: </span>{s.suggestion}
      </p>
      {s.template && (
        <button
          onClick={() => handleCopy(s.template!)}
          className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-teal-600 ml-1 transition-colors"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-teal-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copiado!' : 'Copiar template de justificativa'}
        </button>
      )}
    </div>
  )
}

// ─── Override Modal ───────────────────────────────────────────────────────────

function OverrideModal({
  consultationId,
  onConfirm,
  onClose,
}: {
  consultationId: string
  onConfirm: () => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleConfirm = () => {
    startTransition(async () => {
      await acknowledgeInsuranceAudit({
        consultationId,
        overrideReason: reason.trim() || undefined,
      })
      onConfirm()
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-red-500" />
            <h3 className="font-bold text-slate-800 text-sm">Salvar com Justificativa</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600">
            Há inconsistências bloqueantes de convênio. Ao prosseguir, você confirma estar ciente do risco de glosa.
          </p>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1.5 tracking-wider">
              Justificativa Clínica (opcional mas recomendada)
            </label>
            <textarea
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:border-teal-500 outline-none resize-none"
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Ex: Exame realizado por urgência clínica — aguardar autorização colocaria o animal em risco."
            />
          </div>
        </div>
        <div className="px-6 pb-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-600">Cancelar</button>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-6 py-2 rounded-xl text-sm font-black flex items-center gap-2"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {isPending ? 'Confirmando...' : 'Confirmar Ciente do Risco'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Banner ──────────────────────────────────────────────────────────────

export default function InsuranceAuditBanner({ auditResult, consultationId, onDismiss }: Props) {
  const [expanded, setExpanded]         = useState(auditResult.result !== 'approved')
  const [showOverride, setShowOverride] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)
  const [isPending, startTransition]    = useTransition()

  if (acknowledged) return null

  const hasBlockers = auditResult.suggestions.some(s => s.severity === 'blocking')

  const config = {
    approved: {
      bg:    'bg-emerald-50 border-emerald-200',
      icon:  <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />,
      title: `Convênio validado — ${auditResult.providerName}`,
      text:  'text-emerald-700',
      badge: null,
    },
    warnings: {
      bg:    'bg-amber-50 border-amber-200',
      icon:  <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />,
      title: `Avisos de convênio — ${auditResult.providerName}`,
      text:  'text-amber-700',
      badge: <span className="text-[10px] font-bold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">{auditResult.suggestions.length} aviso(s)</span>,
    },
    issues_found: {
      bg:    'bg-red-50 border-red-200',
      icon:  <Ban className="h-4 w-4 text-red-500 flex-shrink-0" />,
      title: `Risco de glosa — ${auditResult.providerName}`,
      text:  'text-red-700',
      badge: <span className="text-[10px] font-bold bg-red-200 text-red-800 px-2 py-0.5 rounded-full">{auditResult.suggestions.length} problema(s)</span>,
    },
  }[auditResult.result]

  const handleAcknowledge = () => {
    startTransition(async () => {
      await acknowledgeInsuranceAudit({ consultationId })
      setAcknowledged(true)
      onDismiss()
    })
  }

  return (
    <>
      <div className={`rounded-xl border ${config.bg} overflow-hidden`}>
        {/* Header */}
        <div
          className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none"
          onClick={() => auditResult.result !== 'approved' && setExpanded(e => !e)}
        >
          {config.icon}
          <Shield className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <p className={`text-xs font-bold flex-1 ${config.text}`}>{config.title}</p>
          {config.badge}
          {auditResult.result !== 'approved' && (
            expanded
              ? <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
              : <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
          )}
          <button
            onClick={e => { e.stopPropagation(); setAcknowledged(true); onDismiss() }}
            className="p-0.5 hover:bg-black/10 rounded ml-1 flex-shrink-0"
          >
            <X className="h-3.5 w-3.5 text-slate-400" />
          </button>
        </div>

        {/* Suggestions */}
        {expanded && auditResult.suggestions.length > 0 && (
          <div className="px-4 pb-4 space-y-2">
            {auditResult.suggestions.map((s, i) => (
              <SuggestionRow
                key={i}
                s={s}
                onCopyTemplate={() => {}}
              />
            ))}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              {hasBlockers ? (
                <button
                  onClick={() => setShowOverride(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-black"
                >
                  <Ban className="h-3.5 w-3.5" />
                  Salvar mesmo assim (ciente do risco)
                </button>
              ) : (
                <button
                  onClick={handleAcknowledge}
                  disabled={isPending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black disabled:opacity-50"
                >
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Ciente dos avisos
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {showOverride && (
        <OverrideModal
          consultationId={consultationId}
          onConfirm={() => { setShowOverride(false); setAcknowledged(true); onDismiss() }}
          onClose={() => setShowOverride(false)}
        />
      )}
    </>
  )
}
