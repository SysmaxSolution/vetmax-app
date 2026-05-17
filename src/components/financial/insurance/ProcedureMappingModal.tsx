'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { X, Search, Save, Loader2, CheckCircle2, AlertCircle, Box, Wrench } from 'lucide-react'
import {
  upsertProcedureMappings,
  listStockItemsForMapping,
  type ProcedureMappingRow,
  type StockItemOption,
  type SaveMappingsInput,
  type SaveMappingsResult,
} from '@/lib/actions/petlove-mapping'
import { Sparkles } from 'lucide-react'

export default function ProcedureMappingModal({
  open,
  remittanceId,
  initialRows,
  onClose,
  onSaved,
}: {
  open: boolean
  remittanceId: string
  initialRows: ProcedureMappingRow[]
  onClose: () => void
  onSaved: () => void
}) {
  const [stockItems, setStockItems] = useState<StockItemOption[]>([])
  const [loadingStock, setLoadingStock] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({}) // external_name → stock_item_id (or '' for skip)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()
  const [saveResult, setSaveResult] = useState<SaveMappingsResult | null>(null)

  // Seed draft with existing mappings
  useEffect(() => {
    if (!open) return
    const seed: Record<string, string> = {}
    for (const r of initialRows) {
      if (r.internal_stock_item_id) seed[r.external_procedure_name] = r.internal_stock_item_id
    }
    setDraft(seed)
    setSaveResult(null)
    setErrorMsg(null)
  }, [open, initialRows])

  // Load stock items once when modal opens
  useEffect(() => {
    if (!open || stockItems.length > 0) return
    setLoadingStock(true)
    listStockItemsForMapping().then(res => {
      setLoadingStock(false)
      if (Array.isArray(res)) setStockItems(res)
      else setErrorMsg(res.error)
    })
  }, [open, stockItems.length])

  const unmappedRows = useMemo(
    () => initialRows.filter(r => !r.mapping_id),
    [initialRows],
  )

  const mappedRows = useMemo(
    () => initialRows.filter(r => r.mapping_id),
    [initialRows],
  )

  function handleSave() {
    setErrorMsg(null)
    // Inclui TODOS os procedimentos da remessa:
    //   - Se draft tem stock_item_id  → vincula ao item existente
    //   - Se draft está vazio         → server cria stock_item novo automaticamente
    const payload: SaveMappingsInput[] = initialRows.map(r => ({
      external_procedure_name: r.external_procedure_name,
      internal_stock_item_id:  draft[r.external_procedure_name] || null,
    }))

    if (payload.length === 0) {
      setErrorMsg('Nenhum procedimento para mapear.')
      return
    }

    startSaving(async () => {
      const res = await upsertProcedureMappings(payload, remittanceId)
      if ('error' in res) {
        setErrorMsg(res.error)
        return
      }
      setSaveResult(res)
      setTimeout(() => { onSaved(); onClose() }, 1800)
    })
  }

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Wrench className="h-5 w-5 text-purple-600" />
              Mapeamento de Procedimentos Petlove
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Vincule aos serviços/produtos do seu estoque. <strong className="text-purple-700">Itens deixados em branco serão criados automaticamente como serviço novo</strong> com o nome da Petlove e o valor médio observado.
              <kbd className="ml-2 text-[10px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">Ctrl+Enter</kbd>
              <span className="text-slate-400"> salva</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {saveResult && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
              <div className="text-sm text-emerald-800 flex-1">
                <p>
                  <strong>{saveResult.saved}</strong> mapeamento{saveResult.saved !== 1 ? 's' : ''} salvo{saveResult.saved !== 1 ? 's' : ''}.
                  {saveResult.created_stock_items > 0 && (
                    <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-xs font-medium">
                      <Sparkles className="h-3 w-3" />
                      {saveResult.created_stock_items} serviço{saveResult.created_stock_items !== 1 ? 's' : ''} novo{saveResult.created_stock_items !== 1 ? 's' : ''} criado{saveResult.created_stock_items !== 1 ? 's' : ''}
                    </span>
                  )}
                </p>
                {saveResult.errors.length > 0 && (
                  <p className="text-rose-700 text-xs mt-1">⚠ {saveResult.errors.length} erro(s): {saveResult.errors.slice(0, 2).join('; ')}</p>
                )}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 mt-0.5" />
              <p className="text-sm text-rose-700">{errorMsg}</p>
            </div>
          )}

          {/* Não mapeados */}
          {unmappedRows.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-2">
                ⚠ Não mapeados ({unmappedRows.length})
              </h3>
              <div className="space-y-2">
                {unmappedRows.map(r => (
                  <MappingRow
                    key={r.external_procedure_name}
                    row={r}
                    stockItems={stockItems}
                    loadingStock={loadingStock}
                    value={draft[r.external_procedure_name] ?? ''}
                    onChange={(v) => setDraft(prev => ({ ...prev, [r.external_procedure_name]: v }))}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Já mapeados */}
          {mappedRows.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-2">
                ✓ Já mapeados ({mappedRows.length})
              </h3>
              <div className="space-y-2">
                {mappedRows.map(r => (
                  <MappingRow
                    key={r.external_procedure_name}
                    row={r}
                    stockItems={stockItems}
                    loadingStock={loadingStock}
                    value={draft[r.external_procedure_name] ?? ''}
                    onChange={(v) => setDraft(prev => ({ ...prev, [r.external_procedure_name]: v }))}
                  />
                ))}
              </div>
            </section>
          )}

          {initialRows.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-400">
              Nenhum procedimento encontrado na remessa.
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {(() => {
              const filled = Object.values(draft).filter(v => v).length
              const toCreate = initialRows.length - filled
              return (
                <>
                  <strong>{filled}</strong> vinculado{filled !== 1 ? 's' : ''}
                  {toCreate > 0 && (
                    <> · <span className="text-purple-700"><strong>{toCreate}</strong> serão criados como novo serviço</span></>
                  )}
                </>
              )
            })()}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-white border border-transparent hover:border-slate-200"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold px-4 py-1.5 rounded-lg text-sm disabled:opacity-50 disabled:cursor-wait"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Mapeamentos
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

// ─── MappingRow ───────────────────────────────────────────────────────────────

function MappingRow({
  row, stockItems, loadingStock, value, onChange,
}: {
  row:          ProcedureMappingRow
  stockItems:   StockItemOption[]
  loadingStock: boolean
  value:        string
  onChange:     (v: string) => void
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-xl border border-slate-200 bg-white">
      {/* Esquerda: nome Petlove */}
      <div className="min-w-0">
        <p className="font-medium text-slate-900 truncate">{row.external_procedure_name}</p>
        <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
          {row.occurrence_count} ocorrência{row.occurrence_count !== 1 ? 's' : ''}
          {' · '}
          média {row.average_repass_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        </p>
      </div>

      {/* Direita: combobox */}
      <SearchableCombobox
        options={stockItems}
        loading={loadingStock}
        value={value}
        onChange={onChange}
      />
    </div>
  )
}

// ─── SearchableCombobox ───────────────────────────────────────────────────────

function SearchableCombobox({
  options, loading, value, onChange,
}: {
  options: StockItemOption[]
  loading: boolean
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = options.find(o => o.id === value) ?? null

  const filtered = useMemo(() => {
    const q = query.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    if (!q) return options.slice(0, 50)
    return options
      .filter(o => o.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q))
      .slice(0, 50)
  }, [query, options])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        type="button"
        className={`
          w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm text-left
          ${selected ? 'bg-purple-50 border-purple-300 text-purple-900' : 'bg-white border-slate-200 text-slate-500'}
          hover:border-purple-400
        `}
      >
        <span className="truncate flex items-center gap-2 min-w-0">
          {selected
            ? <>
                {selected.is_service
                  ? <Wrench className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />
                  : <Box className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />}
                <span className="truncate font-medium">{selected.name}</span>
              </>
            : <>
                <Search className="h-3.5 w-3.5 flex-shrink-0" />
                <span>Pesquisar serviço/produto…</span>
              </>}
        </span>
        {selected && (
          <span className="text-xs tabular-nums text-purple-600 flex-shrink-0">
            {selected.unit_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrar por nome…"
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-purple-400"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin inline mr-1.5" />
                Carregando estoque…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-400">
                Nenhum item encontrado.
              </div>
            ) : (
              <ul>
                {filtered.map(o => (
                  <li key={o.id}>
                    <button
                      onClick={() => { onChange(o.id); setOpen(false); setQuery('') }}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-purple-50 flex items-center justify-between gap-2"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {o.is_service
                          ? <Wrench className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />
                          : <Box className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />}
                        <span className="truncate">{o.name}</span>
                      </span>
                      <span className="text-xs tabular-nums text-slate-500 flex-shrink-0">
                        {o.unit_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {value && (
              <button
                onClick={() => { onChange(''); setOpen(false); setQuery('') }}
                type="button"
                className="w-full px-3 py-2 text-left text-xs text-slate-400 hover:bg-slate-50 border-t border-slate-100"
              >
                ✕ Limpar seleção
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
