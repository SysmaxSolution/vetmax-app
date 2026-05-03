'use client'

import { useState, useEffect } from 'react'
import { Shield, Copy, Check, Loader2, AlertTriangle, CheckCircle2, Ban, FileOutput } from 'lucide-react'
import { getPetInsurance, type PetInsurance } from '@/lib/actions/pet-insurance'
import { getConsultationAuditLog, type AuditSuggestion } from '@/lib/actions/insurance-audit'
import type { InvoiceItem } from '@/lib/actions/billing'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Tabela TUSS simplificada para procedimentos comuns veterinários
// (em produção, a clínica mapeia no catálogo)
const TUSS_MAP: Record<string, string> = {
  consulta:          '10101012',
  'consulta geral':  '10101012',
  vacinação:         '40301360',
  hemograma:         '40302466',
  radiografia:       '40901209',
  ultrassonografia:  '40801079',
  ecocardiograma:    '40801079',
  cirurgia:          '31005047',
  internação:        '10112129',
  medicação:         '00000000',
}

function getTussCode(description: string): string {
  const lower = description.toLowerCase()
  for (const [key, code] of Object.entries(TUSS_MAP)) {
    if (lower.includes(key)) return code
  }
  return '00000000'
}

const RESULT_CONFIG = {
  approved:      { label: 'Aprovado',        color: 'text-emerald-600', Icon: CheckCircle2 },
  warnings:      { label: 'Com Ressalvas',   color: 'text-amber-600',   Icon: AlertTriangle },
  issues_found:  { label: 'Pendências',      color: 'text-red-600',     Icon: Ban },
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  patientId:      string
  consultationId: string
  patientName:    string
  tutorName:      string
  items:          InvoiceItem[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function InsuranceExportPanel({
  patientId,
  consultationId,
  patientName,
  tutorName,
  items,
}: Props) {
  const [insurance, setInsurance]       = useState<PetInsurance | null>(null)
  const [auditLog,  setAuditLog]        = useState<{
    audit_result:     string
    ai_suggestions:   AuditSuggestion[]
    provider_name:    string
    vet_acknowledged: boolean
  } | null>(null)
  const [loading, setLoading]           = useState(true)
  const [copied,  setCopied]            = useState(false)

  useEffect(() => {
    Promise.all([
      getPetInsurance(patientId),
      getConsultationAuditLog(consultationId),
    ]).then(([ins, audit]) => {
      if (ins && !('error' in ins)) setInsurance(ins)
      if (audit) setAuditLog(audit)
      setLoading(false)
    })
  }, [patientId, consultationId])

  // Não renderizar se não há convênio vinculado
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Verificando convênio...</span>
      </div>
    )
  }

  if (!insurance) return null

  // Montar payload de exportação
  const exportPayload = {
    convenio: {
      nome:        insurance.provider?.name ?? '',
      plano:       insurance.plan_type,
      carteirinha: insurance.member_id,
      status:      insurance.coverage_status,
    },
    beneficiario: {
      pet:   patientName,
      tutor: tutorName,
    },
    procedimentos: items.map(item => ({
      descricao:    item.description,
      tipo:         item.item_type,
      codigo_tuss:  getTussCode(item.description),
      quantidade:   item.quantity,
      valor:        item.unit_price,
    })),
    auditoria: auditLog ? {
      resultado:    auditLog.audit_result,
      ciente:       auditLog.vet_acknowledged,
      pendencias:   auditLog.ai_suggestions.length,
    } : null,
    exportado_em: new Date().toISOString(),
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(exportPayload, null, 2)).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const auditCfg = auditLog
    ? RESULT_CONFIG[auditLog.audit_result as keyof typeof RESULT_CONFIG] ?? RESULT_CONFIG.approved
    : null

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-teal-100">
        <Shield className="h-4 w-4 text-teal-600 flex-shrink-0" />
        <p className="text-xs font-black text-teal-800 uppercase tracking-wider flex-1">
          Dados do Convênio
        </p>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-[11px] font-black transition-colors"
        >
          {copied
            ? <><Check className="h-3.5 w-3.5" /> Copiado!</>
            : <><Copy className="h-3.5 w-3.5" /> Copiar para o Portal</>
          }
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Convênio info */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Convênio</p>
            <p className="text-sm font-bold text-slate-800 mt-0.5">{insurance.provider?.name ?? '—'}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Plano</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5">{insurance.plan_type}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Carteirinha</p>
            <p className="text-sm font-mono font-bold text-teal-700 mt-0.5">{insurance.member_id}</p>
          </div>
        </div>

        {/* Procedimentos */}
        {items.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Procedimentos</p>
            <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-50 overflow-hidden">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="text-[10px] font-mono text-slate-400 flex-shrink-0 w-20">
                    {getTussCode(item.description)}
                  </span>
                  <span className="text-xs text-slate-700 flex-1 truncate">{item.description}</span>
                  <span className="text-xs font-bold text-slate-600 flex-shrink-0">
                    {item.quantity}x
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Auditoria */}
        {auditCfg && auditLog && (
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status Auditoria:</p>
            <div className={`flex items-center gap-1 text-xs font-bold ${auditCfg.color}`}>
              <auditCfg.Icon className="h-3.5 w-3.5" />
              {auditCfg.label}
            </div>
            {auditLog.ai_suggestions.length > 0 && (
              <span className="text-[10px] text-slate-400">
                ({auditLog.ai_suggestions.length} item(s) {auditLog.vet_acknowledged ? '— Ciente' : '— Pendente confirmação MV'})
              </span>
            )}
          </div>
        )}

        {/* Dica */}
        <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <FileOutput className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-700">
            Clique em "Copiar para o Portal" e cole no sistema do convênio. Os códigos TUSS são aproximados — verifique com a tabela oficial do plano.
          </p>
        </div>
      </div>
    </div>
  )
}
