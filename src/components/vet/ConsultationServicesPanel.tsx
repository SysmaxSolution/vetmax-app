'use client'

import { useEffect, useState, useTransition } from 'react'
import { Plus, X, Tag, Loader2, Receipt, AlertTriangle } from 'lucide-react'
import {
  listConsultationServices,
  addServiceToConsultation,
  cancelConsultationService,
  type ConsultationServiceLine,
} from '@/lib/actions/services'
import ServiceSelectionModal from './ServiceSelectionModal'

/**
 * Painel "Serviços lançados" no ConsultationDetail.
 *
 * Permite ao veterinário ajustar o carrinho da consulta a qualquer momento:
 *  - Listar linhas ativas (cancelled_at IS NULL) com nome+preço snapshot.
 *  - Adicionar novos serviços via ServiceComboBox (added_at_stage='vet').
 *  - Remover via soft cancel (cancelled_at preenchido + cancel_reason
 *    opcional) — preserva trilha de auditoria.
 *
 * Cada operação dispara audit_log automático no servidor.
 *
 * Expõe via prop `onChange` que dispara após cada mutação para o pai
 * re-checar guard de finalização (hasActiveService).
 */

interface Props {
  consultationId: string
  isFinalized:    boolean
  onChange?:      () => void
}

function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const STAGE_LABEL: Record<string, string> = {
  reception: 'Recepção',
  triage:    'Triagem',
  vet:       'Consultório',
  checkout:  'Caixa',
}

const STAGE_COLOR: Record<string, string> = {
  reception: 'bg-slate-100 text-slate-600',
  triage:    'bg-yellow-100 text-yellow-700',
  vet:       'bg-blue-100 text-blue-700',
  checkout:  'bg-teal-100 text-teal-700',
}

export default function ConsultationServicesPanel({ consultationId, isFinalized, onChange }: Props) {
  const [lines, setLines] = useState<ConsultationServiceLine[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function refresh() {
    const res = await listConsultationServices(consultationId)
    setLoading(false)
    if (Array.isArray(res)) setLines(res)
  }

  useEffect(() => { void refresh() }, [consultationId])

  const activeLines = lines.filter(l => l.cancelled_at === null)
  const total       = activeLines.reduce((s, l) => s + l.price_snapshot * l.quantity, 0)
  const activeStockIds = activeLines.map(l => l.stock_item_id)

  async function handleModalConfirm(picked: Array<{ item: { id: string; name: string }; quantity: number }>) {
    setError(null)
    const failures: string[] = []
    for (const s of picked) {
      const r = await addServiceToConsultation({
        consultation_id: consultationId,
        stock_item_id:   s.item.id,
        quantity:        s.quantity,
        added_at_stage:  'vet',
      })
      if ('error' in r) failures.push(`${s.item.name}: ${r.error}`)
    }
    if (failures.length > 0) setError(failures.join(' · '))
    setShowModal(false)
    await refresh()
    onChange?.()
  }

  function handleCancel(line: ConsultationServiceLine) {
    const reason = prompt(`Remover "${line.name_snapshot}"? Motivo opcional para auditoria:`)
    if (reason === null) return
    setPendingId(line.id)
    setError(null)
    startTransition(async () => {
      const r = await cancelConsultationService(line.id, reason || undefined)
      setPendingId(null)
      if ('error' in r) { setError(r.error); return }
      await refresh()
      onChange?.()
    })
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-blue-500" />
          Serviços Lançados
          {activeLines.length > 0 && (
            <span className="text-[10px] font-normal text-slate-500">({activeLines.length} ativo{activeLines.length !== 1 ? 's' : ''})</span>
          )}
        </h3>
        <span className="text-sm font-bold text-blue-700">{formatBRL(total)}</span>
      </div>

      {loading ? (
        <div className="px-4 py-6 flex items-center justify-center text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...
        </div>
      ) : activeLines.length === 0 ? (
        <div className="px-4 py-5 text-center">
          <AlertTriangle className="h-6 w-6 text-amber-400 mx-auto mb-1.5" />
          <p className="text-xs font-semibold text-amber-700">Nenhum serviço lançado nesta consulta</p>
          <p className="text-[11px] text-slate-500 mt-1">
            Necessário ao menos um serviço para encerrar o atendimento.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {activeLines.map(line => {
            const isCancelling = pendingId === line.id
            return (
              <li key={line.id} className="px-4 py-2.5 flex items-center gap-3">
                <Tag className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{line.name_snapshot}</p>
                  <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
                    <span className={`rounded-full px-1.5 py-0.5 font-semibold ${STAGE_COLOR[line.added_at_stage]}`}>
                      {STAGE_LABEL[line.added_at_stage] ?? line.added_at_stage}
                    </span>
                    <span>{formatBRL(line.price_snapshot)}</span>
                    {line.quantity !== 1 && <span>× {line.quantity}</span>}
                  </p>
                </div>
                <p className="text-xs font-semibold text-slate-700 flex-shrink-0">
                  {formatBRL(line.price_snapshot * line.quantity)}
                </p>
                {!isFinalized && (
                  <button
                    type="button"
                    disabled={isCancelling || isPending}
                    onClick={() => handleCancel(line)}
                    title="Remover serviço (registra motivo na auditoria)"
                    className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500 disabled:opacity-40"
                  >
                    {isCancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!isFinalized && (
        <div className="px-4 py-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setShowModal(true)}
            disabled={isPending}
            data-mentor-step="vet-insert-service-btn"
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-blue-300 bg-blue-50/40 hover:bg-blue-50 py-2 text-xs font-semibold text-blue-700 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> Inserir serviços / itens
          </button>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {showModal && (
        <ServiceSelectionModal
          alreadyAddedIds={activeStockIds}
          onCancel={() => setShowModal(false)}
          onConfirm={handleModalConfirm}
        />
      )}
    </div>
  )
}
