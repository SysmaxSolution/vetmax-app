'use client'

import { useState } from 'react'
import { Syringe, Plus, Trash2, Loader2, Check, ChevronDown, Pencil, AlertTriangle } from 'lucide-react'
import type { AppliedMedication } from '@/types/pharmacy'
import type { StockItemLite } from '@/types/stock-consumption'
import CoverageChipClient from '@/components/pet/CoverageChipClient'
import StockItemSelector from '@/components/stock/StockItemSelector'
import { formatarQuantidade, ROTULO_STATUS_BAIXA } from '@/lib/stock/aplicacao'
import { unidadeDe, explicarConversao } from '@/lib/stock/unidades'

// ─── DCBs Controlados (CFMV — Receita de Controle Especial) ──────────────────
// Lista B1/B2 (psicotrópicos) e Lista A (entorpecentes)

const CONTROLLED_DCBS = [
  'fenobarbital', 'diazepam', 'midazolam', 'clonazepam', 'alprazolam', 'lorazepam',
  'ketamina', 'zolazepam', 'tiletamina', 'telazol',
  'morfina', 'tramadol', 'fentanil', 'meperidina', 'petidina', 'buprenorfina',
  'oxicodona', 'codeina', 'codeína', 'butorfanol', 'nalbufina',
  'propofol', 'tiopental', 'pentobarbital', 'secobarbital',
  'xilazina', 'dexmedetomidina', 'medetomidina', 'detomidina',
  'acepromazina', 'clorpromazina',
  'fluoxetina', 'amitriptilina', 'clomipramina',
]

function isControlledDrug(name: string): boolean {
  const lower = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return CONTROLLED_DCBS.some(dcb =>
    lower.includes(dcb.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  consultationId: string
  patientId?: string
  medications: AppliedMedication[]
  isFinalized: boolean
  pesoKg?: number | null
  onAdd: (data: {
    medication_name: string
    dosage?: string
    route?: string
    notes?: string
    is_controlled?: boolean
    stock_item_id?: string | null
    quantity?: number | null
    prescription_notification?: string | null
    sem_baixa?: boolean
  }) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onUpdate?: (id: string, data: {
    medication_name: string
    dosage?: string
    route?: string
    notes?: string
    is_controlled?: boolean
    prescription_notification?: string | null
  }) => Promise<void>
}

const ROUTE_LABELS: Record<string, string> = {
  IV: 'Intravenosa (IV)', IM: 'Intramuscular (IM)', SC: 'Subcutânea (SC)',
  oral: 'Oral', topical: 'Tópica', other: 'Outra',
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function ClinicalActionsSection({
  patientId, medications, isFinalized, pesoKg, onAdd, onDelete, onUpdate,
}: Props) {
  const [showForm,       setShowForm]       = useState(false)
  const [medName,        setMedName]        = useState('')
  const [medDosage,      setMedDosage]      = useState('')
  const [medRoute,       setMedRoute]       = useState('')
  const [medNotes,       setMedNotes]       = useState('')
  const [isSaving,       setIsSaving]       = useState(false)
  const [deletingId,     setDeletingId]     = useState<string | null>(null)
  const [calcLoading,    setCalcLoading]    = useState(false)
  const [calcSuggestion, setCalcSuggestion] = useState<string | null>(null)

  // Vinculo com o estoque (item 1.7): item escolhido, quanto saiu, notificacao
  // de receita do controlado e a saida que nao deve baixar nada.
  const [medItem,         setMedItem]         = useState<StockItemLite | null>(null)
  const [medQtd,          setMedQtd]          = useState('1')
  const [medNotificacao,  setMedNotificacao]  = useState('')
  const [medSemBaixa,     setMedSemBaixa]     = useState(false)

  // Edit state
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [editName,   setEditName]   = useState('')
  const [editDosage, setEditDosage] = useState('')
  const [editRoute,  setEditRoute]  = useState('')
  const [editNotes,  setEditNotes]  = useState('')
  const [editNotificacao, setEditNotificacao] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  const medIsControlled   = medItem
    ? medItem.is_controlled
    : (medName.trim().length > 2 && isControlledDrug(medName))
  const editIsControlled  = editName.trim().length > 2 && isControlledDrug(editName)

  function startEdit(med: AppliedMedication) {
    setEditingId(med.id)
    setEditName(med.medication_name)
    setEditDosage(med.dosage ?? '')
    setEditRoute(med.route ?? '')
    setEditNotes(med.notes ?? '')
    setEditNotificacao(med.prescription_notification ?? '')
  }

  /** Item escolhido no estoque preenche o nome e a unidade da quantidade. */
  function handlePickStockItem(item: StockItemLite | null) {
    setMedItem(item)
    if (item) {
      setMedName(item.name)
      setCalcSuggestion(null)
    }
  }

  function limparFormulario() {
    setMedName(''); setMedDosage(''); setMedRoute(''); setMedNotes('')
    setMedItem(null); setMedQtd('1'); setMedNotificacao(''); setMedSemBaixa(false)
    setCalcSuggestion(null)
  }

  async function handleUpdate() {
    if (!editingId || !editName.trim() || !onUpdate) return
    setIsUpdating(true)
    await onUpdate(editingId, {
      medication_name: editName.trim(),
      dosage:          editDosage.trim() || undefined,
      route:           editRoute  || undefined,
      notes:           editNotes.trim() || undefined,
      is_controlled:   editIsControlled,
      prescription_notification: editNotificacao.trim() || null,
    })
    setIsUpdating(false)
    setEditingId(null)
  }

  const quantidadeValida = (() => {
    const n = Number(String(medQtd).replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? n : null
  })()

  const handleAdd = async () => {
    if (!medName.trim() || quantidadeValida === null) return
    setIsSaving(true)
    await onAdd({
      medication_name: medName.trim(),
      dosage:          medDosage.trim() || undefined,
      route:           medRoute  || undefined,
      notes:           medNotes.trim() || undefined,
      is_controlled:   medIsControlled,
      stock_item_id:   medItem?.id ?? null,
      quantity:        quantidadeValida,
      prescription_notification: medNotificacao.trim() || null,
      sem_baixa:       medSemBaixa,
    })
    setIsSaving(false)
    limparFormulario()
    setShowForm(false)
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    await onDelete(id)
    setDeletingId(null)
  }

  async function handleCalcDose() {
    if (!medName.trim() || !pesoKg) return
    setCalcLoading(true)
    setCalcSuggestion(null)
    try {
      const res = await fetch('/api/prescription-calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medication: medName.trim(), peso_kg: pesoKg }),
      })
      const json = await res.json()
      if (json.dose) {
        // Preenche cada campo do form separadamente.
        if (!medDosage.trim()) setMedDosage(json.dose)
        if (!medRoute.trim()  && json.route)  setMedRoute(normalizeRoute(json.route))
        if (!medNotes.trim()) {
          const notesParts: string[] = []
          if (json.frequency) notesParts.push(String(json.frequency))
          if (json.duration)  notesParts.push(`por ${json.duration}`)
          if (json.aviso)     notesParts.push(`⚠ ${json.aviso}`)
          if (notesParts.length > 0) setMedNotes(notesParts.join(' · '))
        }
        // Sumário curto na linha de "Sugestão IA"
        const summary = [json.dose, json.route, json.frequency, json.duration]
          .filter(Boolean).join(' · ')
        setCalcSuggestion(summary || json.dose)
      } else {
        setCalcSuggestion(json.aviso || 'Sem referência para este medicamento.')
      }
    } catch {
      setCalcSuggestion('Erro ao calcular dose.')
    }
    setCalcLoading(false)
  }

  /** Mapeia o que a IA retorna ("Oral", "Intravenosa", "IV"...) para um valor
   * aceito pelo select de Via (IV / IM / SC / oral / topical / other). */
  function normalizeRoute(s: string): string {
    const t = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (/intravenos|^iv$|^iv\b/.test(t))          return 'IV'
    if (/intramuscul|^im$|^im\b/.test(t))         return 'IM'
    if (/subcutan|^sc$|^sc\b/.test(t))            return 'SC'
    if (/oral|via oral|po\b|peros/.test(t))       return 'oral'
    if (/topic|cutaneo|topi/.test(t))             return 'topical'
    return 'other'
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
            <Syringe className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Medicações e insumos aplicados</h3>
            <p className="text-xs text-slate-500">Aplicados no animal nesta consulta — saem do estoque</p>
          </div>
        </div>
        {!isFinalized && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            + Aplicação
          </button>
        )}
      </div>

      {/* Formulário Manual */}
      {showForm && (
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 space-y-3">
          {/* Item do estoque: o que foi escolhido aqui e o que sai do estoque e,
              quando a clinica usa cobranca automatica, o que entra na conta. */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Item do estoque</label>
            <StockItemSelector value={medItem?.id ?? null} onChange={handlePickStockItem} />
            <p className="mt-1 text-[11px] text-slate-400">
              {medItem
                ? `Informe em ${unidadeDe(medItem, 'use')}. Saldo atual: ${formatarQuantidade(medItem.quantity, medItem.unit)}${explicarConversao(medItem) ? ` — ${explicarConversao(medItem)}` : ''}.`
                : 'Sem item selecionado, o registro vale como texto livre e a saída fica pendente de conferência no estoque.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Medicamento / insumo *</label>
              <input
                type="text"
                value={medName}
                onChange={e => { setMedName(e.target.value); setCalcSuggestion(null) }}
                placeholder="Ex: Dipirona"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
              />
              {/* Badge Receituário Azul */}
              {medIsControlled && (
                <div className="mt-1.5 flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-1">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  <span className="font-semibold">Receita de Controle Especial</span>
                  <span className="text-blue-500">— exige receituário azul/especial (CFMV)</span>
                </div>
              )}
              {/* Selo de cobertura do convênio (cobre vacinas e medicações mapeadas no catálogo) */}
              {patientId && medName.trim().length > 2 && (
                <div className="mt-1.5">
                  <CoverageChipClient patientId={patientId} procedureName={medName} />
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Dose
                {pesoKg && medName.trim().length > 2 && (
                  <button
                    type="button"
                    onClick={handleCalcDose}
                    disabled={calcLoading}
                    className="ml-2 text-teal-600 hover:underline disabled:opacity-50"
                  >
                    {calcLoading ? 'Calculando…' : '⚡ Calcular (IA)'}
                  </button>
                )}
              </label>
              <input
                type="text"
                value={medDosage}
                onChange={e => setMedDosage(e.target.value)}
                placeholder="Ex: 2ml ou 25mg/kg"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
              />
              {calcSuggestion && (
                <p className="mt-1 text-xs text-teal-600">Sugestão IA: {calcSuggestion}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Via</label>
              <div className="relative">
                <select
                  value={medRoute}
                  onChange={e => setMedRoute(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 appearance-none"
                >
                  <option value="">Selecione...</option>
                  {Object.entries(ROUTE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Observações</label>
              <input
                type="text"
                value={medNotes}
                onChange={e => setMedNotes(e.target.value)}
                placeholder="Opcional"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Quantidade aplicada *
                {medItem && <span className="ml-1 text-slate-400">({unidadeDe(medItem, 'use')})</span>}
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={medQtd}
                onChange={e => setMedQtd(e.target.value)}
                placeholder="Ex: 2"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
              />
              {quantidadeValida === null && medQtd.trim() !== '' && (
                <p className="mt-1 text-xs text-rose-600">Informe um número maior que zero.</p>
              )}
            </div>
            {medIsControlled && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Nº da notificação de receita
                </label>
                <input
                  type="text"
                  value={medNotificacao}
                  onChange={e => setMedNotificacao(e.target.value)}
                  placeholder="Portaria 344/98"
                  className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
                <p className="mt-1 text-[11px] text-slate-400">Vai ao Livro de Controlados como documento da saída.</p>
              </div>
            )}
          </div>

          <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={medSemBaixa}
              onChange={e => setMedSemBaixa(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
            />
            <span>
              Não baixar do estoque
              <span className="text-slate-400"> — medicação trazida pelo responsável ou já debitada em outro setor</span>
            </span>
          </label>

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={isSaving || !medName.trim() || quantidadeValida === null}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-all disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Salvar
            </button>
            <button
              onClick={() => { setShowForm(false); limparFormulario() }}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista agrupada por via de aplicação (C-01) */}
      {medications.length === 0 ? (
        <div className="px-6 py-8 text-center text-slate-400 text-sm">
          Nenhuma medicação registrada.{!isFinalized && <> Use o microfone ou clique em "Adicionar".</>}
        </div>
      ) : (() => {
        // Agrupa por via; sem via vai para 'other'
        const groups: Record<string, typeof medications> = {}
        for (const med of medications) {
          const key = med.route || 'other'
          if (!groups[key]) groups[key] = []
          groups[key].push(med)
        }
        // Ordem de exibição: oral primeiro, depois IV, IM, SC, topical, other
        const ORDER = ['oral', 'IV', 'IM', 'SC', 'topical', 'other']
        const sortedKeys = [...new Set([...ORDER, ...Object.keys(groups)])].filter(k => groups[k])

        return (
        <div className="divide-y divide-slate-100">
          {sortedKeys.map(routeKey => (
            <div key={routeKey}>
              {/* Cabeçalho do grupo */}
              <div className="px-6 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {ROUTE_LABELS[routeKey] ?? routeKey}
                </span>
                {routeKey !== 'oral' && routeKey !== 'topical' && routeKey !== 'other' && (
                  <span className="text-[9px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded uppercase tracking-wide">{routeKey}</span>
                )}
              </div>
              {groups[routeKey].map(med => (
            <div key={med.id}>
              {editingId === med.id ? (
                <div className="px-6 py-4 bg-emerald-50/40 border-l-2 border-emerald-400 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Medicamento *</label>
                      <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400" />
                      {editIsControlled && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-2 py-1">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          <span className="font-semibold">Receita de Controle Especial</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Dose</label>
                      <input type="text" value={editDosage} onChange={e => setEditDosage(e.target.value)}
                        placeholder="Ex: 2ml ou 25mg/kg"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Via</label>
                      <div className="relative">
                        <select value={editRoute} onChange={e => setEditRoute(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 appearance-none">
                          <option value="">Selecione...</option>
                          {Object.entries(ROUTE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Observações</label>
                      <input type="text" value={editNotes} onChange={e => setEditNotes(e.target.value)}
                        placeholder="Opcional"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400" />
                    </div>
                    {editIsControlled && (
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Nº da notificação de receita</label>
                        <input type="text" value={editNotificacao} onChange={e => setEditNotificacao(e.target.value)}
                          placeholder="Portaria 344/98"
                          className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Quantidade e item de estoque não se editam aqui: para corrigir o que saiu do estoque,
                    remova a aplicação (o insumo volta ao lote de origem) e lance de novo.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={handleUpdate} disabled={isUpdating || !editName.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-all disabled:opacity-50">
                      {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Atualizar
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-all">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`px-6 py-3 flex items-center justify-between gap-3 ${med.is_controlled ? 'bg-blue-50/40 border-l-2 border-blue-400' : ''}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${med.is_controlled ? 'bg-blue-100' : 'bg-emerald-50'}`}>
                      <Syringe className={`w-3.5 h-3.5 ${med.is_controlled ? 'text-blue-600' : 'text-emerald-600'}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-800">{med.medication_name}</p>
                        {med.is_controlled && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-300 uppercase tracking-wide">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Controle Especial
                          </span>
                        )}
                        {/* O que aconteceu com o estoque fica na linha: divergencia
                            nao pode depender de o MV ter visto o toast. */}
                        {med.stock_status && (
                          <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wide ${
                            med.stock_status === 'baixado'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : med.stock_status === 'sem_baixa' || med.stock_status === 'devolvido'
                                ? 'bg-slate-100 text-slate-500 border-slate-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {ROTULO_STATUS_BAIXA[med.stock_status]}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {[
                          med.quantity ? formatarQuantidade(med.quantity, med.unit) : null,
                          med.dosage,
                          med.route ? (ROUTE_LABELS[med.route] ?? med.route) : null,
                          med.notes,
                          med.prescription_notification ? `Notificação ${med.prescription_notification}` : null,
                        ].filter(Boolean).join(' · ') || 'Sem detalhes'}
                      </p>
                    </div>
                  </div>
                  {!isFinalized && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {onUpdate && (
                        <button onClick={() => startEdit(med)} title="Editar"
                          className="text-slate-300 hover:text-emerald-600 transition-colors p-1">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => handleDelete(med.id)} disabled={deletingId === med.id}
                        className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50 p-1">
                        {deletingId === med.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
            </div>
          ))}
        </div>
        )
      })()}
    </div>
  )
}
