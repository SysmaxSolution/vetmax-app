'use client'

import { useEffect, useState, useTransition } from 'react'
import { Plus, X, Tag, Loader2, Receipt, AlertTriangle, Shield, Check } from 'lucide-react'
import {
  listConsultationServices,
  addServiceToConsultation,
  cancelConsultationService,
  type ConsultationServiceLine,
} from '@/lib/actions/services'
import { updateConsultationServicePricingSplit } from '@/lib/actions/insurance-pricing'
import ServiceSelectionModal from './ServiceSelectionModal'

/**
 * Painel "Serviços lançados" no ConsultationDetail.
 *
 * - Lista linhas ativas (cancelled_at IS NULL) com nome+preço snapshot.
 * - Adiciona via ServiceSelectionModal (added_at_stage='vet').
 * - Remove via soft cancel.
 * - Split convênio (Item 5, 2026-06-02): quando pet tem convênio, cada linha
 *   ganha inputs de Coparticipação e Repasse editáveis. Salvar atualiza:
 *   (a) snapshot na consulta atual e (b) patient_custom_prices para próximas
 *   consultas — automático, sem confirmação.
 *
 * Cada operação dispara audit_log automático no servidor.
 */

interface Props {
  consultationId: string
  isFinalized:    boolean
  /** True quando pet tem pet_insurance ativo. Habilita inputs de split. */
  petHasInsurance?: boolean
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

interface SplitDraft {
  copay:  string
  repass: string
  saving: boolean
  error:  string | null
  saved:  boolean
}

export default function ConsultationServicesPanel({
  consultationId, isFinalized, petHasInsurance = false, onChange,
}: Props) {
  const [lines, setLines] = useState<ConsultationServiceLine[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Draft de split por linha (id → copay/repass em edição)
  const [splitDrafts, setSplitDrafts] = useState<Record<string, SplitDraft>>({})

  async function refresh() {
    const res = await listConsultationServices(consultationId)
    setLoading(false)
    if (Array.isArray(res)) {
      setLines(res)
      // Inicializa drafts a partir dos snapshots já gravados
      const drafts: Record<string, SplitDraft> = {}
      for (const l of res) {
        if (l.copay_snapshot !== null || l.repass_snapshot !== null) {
          drafts[l.id] = {
            copay:  (l.copay_snapshot ?? 0).toFixed(2).replace('.', ','),
            repass: (l.repass_snapshot ?? 0).toFixed(2).replace('.', ','),
            saving: false, error: null, saved: false,
          }
        }
      }
      setSplitDrafts(drafts)
    }
  }

  useEffect(() => { void refresh() }, [consultationId])

  const activeLines = lines.filter(l => l.cancelled_at === null)
  const total       = activeLines.reduce((s, l) => s + l.price_snapshot * l.quantity, 0)
  const activeStockIds = activeLines.map(l => l.stock_item_id)

  // Totalizadores split convênio
  const tutorDue = activeLines.reduce((s, l) => {
    const qty = l.quantity
    if (l.copay_snapshot !== null) return s + l.copay_snapshot * qty
    return s + l.price_snapshot * qty
  }, 0)
  const repassPetlove = activeLines.reduce((s, l) => {
    if (l.repass_snapshot !== null) return s + l.repass_snapshot * l.quantity
    return s
  }, 0)

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

  function updateDraft(lineId: string, patch: Partial<SplitDraft>) {
    setSplitDrafts(prev => {
      const base: SplitDraft = prev[lineId] ?? {
        copay: '', repass: '', saving: false, error: null, saved: false,
      }
      return {
        ...prev,
        [lineId]: { ...base, ...patch },
      }
    })
  }

  async function handleSaveSplit(line: ConsultationServiceLine) {
    const draft = splitDrafts[line.id]
    if (!draft) return
    const copay  = parseFloat(draft.copay.replace(',', '.'))
    const repass = parseFloat(draft.repass.replace(',', '.'))
    if (!Number.isFinite(copay)  || copay  < 0) { updateDraft(line.id, { error: 'Coparticipação inválida.' }); return }
    if (!Number.isFinite(repass) || repass < 0) { updateDraft(line.id, { error: 'Repasse inválido.' });        return }
    updateDraft(line.id, { saving: true, error: null, saved: false })
    const r = await updateConsultationServicePricingSplit({
      consultation_service_id: line.id,
      copay, repass,
    })
    if ('error' in r) {
      updateDraft(line.id, { saving: false, error: r.error })
    } else {
      updateDraft(line.id, { saving: false, saved: true, error: null })
      await refresh()
      onChange?.()
      // limpa o "saved" depois de 2s
      setTimeout(() => updateDraft(line.id, { saved: false }), 2000)
    }
  }

  function startSplitEditor(line: ConsultationServiceLine) {
    // Pré-popula com 30% copay / 70% repass de price_snapshot como sugestão
    const total = line.price_snapshot * line.quantity
    const suggestedCopay  = (total * 0.3).toFixed(2)
    const suggestedRepass = (total * 0.7).toFixed(2)
    setSplitDrafts(prev => ({
      ...prev,
      [line.id]: {
        copay:  suggestedCopay.replace('.', ','),
        repass: suggestedRepass.replace('.', ','),
        saving: false, error: null, saved: false,
      },
    }))
  }

  // Auto-derivação: ao digitar copay, calcula repass = total - copay (e vice-versa).
  // Vet pode sobrescrever os 2 valores manualmente (sem amarrar à constraint local —
  // a coerência final é validada pelo banco e por handleSaveSplit).
  function handleCopayChange(line: ConsultationServiceLine, raw: string) {
    const clean = raw.replace(/[^0-9.,]/g, '')
    const total = line.price_snapshot * line.quantity
    const c = parseFloat(clean.replace(',', '.'))
    if (Number.isFinite(c) && c >= 0 && c <= total) {
      const newRepass = Math.max(0, Number((total - c).toFixed(2)))
      updateDraft(line.id, { copay: clean, repass: newRepass.toFixed(2).replace('.', ','), error: null })
    } else {
      updateDraft(line.id, { copay: clean })
    }
  }

  function handleRepassChange(line: ConsultationServiceLine, raw: string) {
    const clean = raw.replace(/[^0-9.,]/g, '')
    const total = line.price_snapshot * line.quantity
    const r = parseFloat(clean.replace(',', '.'))
    if (Number.isFinite(r) && r >= 0 && r <= total) {
      const newCopay = Math.max(0, Number((total - r).toFixed(2)))
      updateDraft(line.id, { repass: clean, copay: newCopay.toFixed(2).replace('.', ','), error: null })
    } else {
      updateDraft(line.id, { repass: clean })
    }
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
          {petHasInsurance && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5">
              <Shield className="h-3 w-3" /> Convênio
            </span>
          )}
        </h3>
        <span className="text-sm font-bold text-blue-700">{formatBRL(total)}</span>
      </div>

      {/* Totalizadores split (visível só com convênio + algum copay/repass cadastrado) */}
      {petHasInsurance && (tutorDue !== total || repassPetlove > 0) && (
        <div className="px-4 py-2.5 border-b border-slate-100 bg-indigo-50/40 grid grid-cols-2 gap-2 text-[11px]">
          <div className="flex justify-between">
            <span className="text-slate-600">Tutor pagará (Coparticipação):</span>
            <span className="font-bold text-emerald-700">{formatBRL(tutorDue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Repasse Petlove:</span>
            <span className="font-bold text-indigo-700">{formatBRL(repassPetlove)}</span>
          </div>
        </div>
      )}

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
            const hasSplit = line.copay_snapshot !== null || line.repass_snapshot !== null
            const draft    = splitDrafts[line.id]
            const showSplitEditor = petHasInsurance && (hasSplit || !!draft)
            return (
              <li key={line.id} className="px-4 py-2.5">
                <div className="flex items-center gap-3">
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
                </div>

                {/* Editor de split convênio (Item 5) */}
                {!isFinalized && petHasInsurance && !showSplitEditor && (
                  <button
                    type="button"
                    onClick={() => startSplitEditor(line)}
                    className="mt-2 text-[10px] font-semibold text-indigo-700 hover:text-indigo-900 hover:underline"
                  >
                    + Definir coparticipação e repasse Petlove
                  </button>
                )}

                {!isFinalized && showSplitEditor && draft && (
                  <div className="mt-2 ml-5 rounded-lg border border-indigo-200 bg-indigo-50/40 p-2.5 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                          Coparticipação (Tutor)
                        </label>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-500">R$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={draft.copay}
                            onChange={e => handleCopayChange(line, e.target.value)}
                            placeholder="0,00"
                            disabled={draft.saving}
                            className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                          Repasse (Petlove)
                        </label>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-slate-500">R$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={draft.repass}
                            onChange={e => handleRepassChange(line, e.target.value)}
                            placeholder="0,00"
                            disabled={draft.saving}
                            className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                    {(() => {
                      const c = parseFloat(draft.copay.replace(',', '.')) || 0
                      const r = parseFloat(draft.repass.replace(',', '.')) || 0
                      const totalSplit = c + r
                      const lineTotal  = line.price_snapshot * line.quantity
                      const diff       = Math.abs(totalSplit - lineTotal)
                      const ok         = diff < 0.01
                      return (
                        <>
                          <p className="text-[10px] text-slate-500">
                            Total convênio: <strong className={ok ? 'text-emerald-700' : 'text-amber-700'}>{formatBRL(totalSplit)}</strong>
                            {' = '}
                            {formatBRL(c)} (tutor) + {formatBRL(r)} (Petlove)
                            {' · '}
                            preço da linha: <strong className="text-slate-800">{formatBRL(lineTotal)}</strong>
                          </p>
                          <p className="text-[10px] text-indigo-500 italic">
                            Digite a coparticipação e o repasse será calculado automaticamente (e vice-versa).
                          </p>
                        </>
                      )
                    })()}
                    {draft.error && <p className="text-[10px] text-red-600">{draft.error}</p>}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={draft.saving}
                        onClick={() => handleSaveSplit(line)}
                        className="flex items-center gap-1 rounded-md bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                      >
                        {draft.saving
                          ? <><Loader2 className="h-3 w-3 animate-spin" /> Salvando…</>
                          : draft.saved
                            ? <><Check className="h-3 w-3" /> Salvo!</>
                            : 'Salvar split'}
                      </button>
                      <p className="text-[9px] text-slate-400 italic">
                        Vale para esta consulta e fica salvo no cadastro do pet para as próximas.
                      </p>
                    </div>
                  </div>
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
