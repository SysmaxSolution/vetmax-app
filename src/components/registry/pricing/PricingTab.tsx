'use client'

import { useState, useEffect } from 'react'
import { Loader2, Plus, Pencil, Tag, Check, X, Save, Settings2 } from 'lucide-react'
import {
  listPriceTables, upsertPriceTable, getPricingSettings, savePricingSettings,
  type PriceTable, type PricingPrecedence, type CompositionMode, type MarginCalcType,
} from '@/lib/actions/pricing'
import { Toast } from '@/components/ui/toast'

interface Props { userRole?: string }

interface Draft { id?: string; slot: number; name: string; is_active: boolean }

export default function PricingTab({ userRole = 'admin' }: Props) {
  const canManage = ['admin', 'owner', 'manager'].includes(userRole)

  const [tables, setTables]   = useState<PriceTable[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState(false)
  const [draft, setDraft]     = useState<Draft | null>(null)
  const [toast, setToast]     = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Configurações
  const [defaultB2c, setDefaultB2c] = useState<string>('')
  const [precedence, setPrecedence] = useState<PricingPrecedence>('client')
  const [compositionMode, setCompositionMode] = useState<CompositionMode>('simple')
  const [marginCalcType, setMarginCalcType]   = useState<MarginCalcType>('margin')
  const [settingsDirty, setSettingsDirty] = useState(false)

  async function reload() {
    try {
      const [t, s] = await Promise.all([listPriceTables(), getPricingSettings()])
      if (Array.isArray(t)) setTables(t)
      if (!('error' in s)) {
        setDefaultB2c(s.default_b2c_price_table_id ?? '')
        setPrecedence(s.precedence)
        setCompositionMode(s.composition_mode)
        setMarginCalcType(s.margin_calc_type)
      }
    } catch (e) {
      setToast({ type: 'error', message: 'Erro ao carregar precificação.' })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void reload() }, [])

  const usedSlots = new Set(tables.map(t => t.slot))
  const nextSlot = [1, 2, 3, 4, 5].find(s => !usedSlots.has(s))

  function newDraft() {
    if (nextSlot == null) return
    setDraft({ slot: nextSlot, name: '', is_active: true })
  }
  function editDraft(t: PriceTable) {
    setDraft({ id: t.id, slot: t.slot, name: t.name, is_active: t.is_active })
  }

  async function saveDraft() {
    if (!draft) return
    setBusy(true)
    const res = await upsertPriceTable(draft)
    setBusy(false)
    if ('error' in res) { setToast({ type: 'error', message: res.error }); return }
    setToast({ type: 'success', message: 'Tabela de preço salva!' })
    setDraft(null)
    void reload()
  }

  async function saveSettings() {
    setBusy(true)
    const res = await savePricingSettings({
      default_b2c_price_table_id: defaultB2c || null,
      precedence,
      composition_mode: compositionMode,
      margin_calc_type: marginCalcType,
    })
    setBusy(false)
    if ('error' in res) { setToast({ type: 'error', message: res.error }); return }
    setToast({ type: 'success', message: 'Configurações salvas!' })
    setSettingsDirty(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <>
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}

      {/* ── TABELAS DE PREÇO ── */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Tabelas de preço</p>
          <p className="text-xs text-slate-500">Até 5 tabelas nomeadas — o mesmo item pode ter até 5 preços de venda</p>
        </div>
        {canManage && nextSlot != null && (
          <button
            type="button"
            onClick={newDraft}
            className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 transition-colors shadow-sm flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
            Nova Tabela
          </button>
        )}
      </div>

      <div className="space-y-2 mb-8">
        {tables.length === 0 && !draft && (
          <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl border border-dashed border-slate-300 bg-white">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
              <Tag className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-500">Nenhuma tabela de preço criada</p>
            <p className="mt-1 text-xs text-slate-400">Crie a primeira (ex.: "Balcão", "Parceiro Ouro")</p>
          </div>
        )}

        {tables.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-4 rounded-xl border bg-white px-4 sm:px-5 py-4 transition-all ${
              t.is_active ? 'border-slate-200 hover:border-slate-300' : 'border-slate-200 bg-slate-50/50 opacity-70'
            }`}
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-sm font-bold">
              {t.slot}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-slate-900 truncate">{t.name}</p>
                {defaultB2c === t.id && (
                  <span className="text-xs font-medium rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700">Padrão B2C</span>
                )}
                {!t.is_active && (
                  <span className="text-xs rounded-full bg-slate-200 text-slate-600 px-2 py-0.5 font-medium">Inativa</span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-400">Slot {t.slot} de 5</p>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => editDraft(t)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>
            )}
          </div>
        ))}

        {/* Draft inline (criar/editar tabela) */}
        {draft && (
          <div className="flex items-center gap-3 rounded-xl border-2 border-teal-300 bg-teal-50/40 px-4 sm:px-5 py-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700 text-sm font-bold">
              {draft.slot}
            </div>
            <input
              type="text"
              autoFocus
              value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value })}
              placeholder='Nome da tabela (ex.: "Balcão")'
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            />
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={e => setDraft({ ...draft, is_active: e.target.checked })}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              Ativa
            </label>
            <button
              type="button"
              onClick={saveDraft}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── CONFIGURAÇÕES DE PREÇO ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-slate-500" />
          <p className="text-sm font-semibold text-slate-800">Configurações de preço</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Tabela padrão B2C */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Tabela padrão para clientes diretos (B2C)</label>
            <select
              value={defaultB2c}
              onChange={e => { setDefaultB2c(e.target.value); setSettingsDirty(true) }}
              disabled={!canManage}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 bg-white disabled:bg-slate-50"
            >
              <option value="">— Preço padrão do item (unit_price) —</option>
              {tables.filter(t => t.is_active).map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Aplicada ao tutor que chega direto, sem parceira.</p>
          </div>

          {/* Precedência */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Precedência ao lançar o serviço</label>
            <div className="space-y-2">
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="precedence"
                  checked={precedence === 'client'}
                  onChange={() => { setPrecedence('client'); setSettingsDirty(true) }}
                  disabled={!canManage}
                  className="mt-0.5 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-700">
                  <strong>Seguir a tabela do cliente/parceira</strong> — a origem do atendimento define o preço.
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="precedence"
                  checked={precedence === 'product'}
                  onChange={() => { setPrecedence('product'); setSettingsDirty(true) }}
                  disabled={!canManage}
                  className="mt-0.5 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-700">
                  <strong>Seguir a tabela do produto</strong> — o preço padrão do item prevalece.
                </span>
              </label>
            </div>
          </div>

          {/* Modo de composição de custo */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Composição de custo no cadastro do item</label>
            <div className="space-y-2">
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="composition_mode"
                  checked={compositionMode === 'simple'}
                  onChange={() => { setCompositionMode('simple'); setSettingsDirty(true) }}
                  disabled={!canManage}
                  className="mt-0.5 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-700">
                  <strong>Simples</strong> — custo, imposto de entrada e margem.
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="composition_mode"
                  checked={compositionMode === 'complete'}
                  onChange={() => { setCompositionMode('complete'); setSettingsDirty(true) }}
                  disabled={!canManage}
                  className="mt-0.5 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-700">
                  <strong>Completa</strong> — preço de compra, desconto, impostos de entrada (ICMS/ST/IPI/Frete/IBS-CBS) e impostos de venda.
                </span>
              </label>
            </div>
          </div>

          {/* Tipo de cálculo: margem x markup */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Cálculo do preço de venda</label>
            <div className="space-y-2">
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="margin_calc_type"
                  checked={marginCalcType === 'margin'}
                  onChange={() => { setMarginCalcType('margin'); setSettingsDirty(true) }}
                  disabled={!canManage}
                  className="mt-0.5 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-700">
                  <strong>Margem</strong> — a margem é % sobre o preço de venda. Venda = custo ÷ (1 − margem%).
                </span>
              </label>
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 cursor-pointer hover:bg-slate-50">
                <input
                  type="radio"
                  name="margin_calc_type"
                  checked={marginCalcType === 'markup'}
                  onChange={() => { setMarginCalcType('markup'); setSettingsDirty(true) }}
                  disabled={!canManage}
                  className="mt-0.5 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-700">
                  <strong>Markup</strong> — a margem é % sobre o custo. Venda = custo × (1 + markup%).
                </span>
              </label>
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Hierarquia de resolução: preço fixo do pet &gt; tabela do cliente/parceira &gt; preço padrão do item.
        </p>

        {canManage && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={saveSettings}
              disabled={busy || !settingsDirty}
              className="flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 transition-colors disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar configurações
            </button>
          </div>
        )}
      </div>
    </>
  )
}
