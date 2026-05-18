'use client'

/**
 * CanvasEditor — orquestrador do Editor Visual de Modelos.
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │ Header (nome + Undo/Redo + status + Salvar)          │
 *   ├─────────────────────────────────────────────────────┤
 *   │ PageSettingsPanel (size/orientation/margens/bg)     │
 *   ├──────┬──────────────────────────────┬───────────────┤
 *   │ Tool │ CanvasStage (preview live)   │ PropertiesPnl │
 *   │ bar  │                              │ (contextual)  │
 *   └──────┴──────────────────────────────┴───────────────┘
 *
 * Recursos:
 * - Undo/Redo (Ctrl+Z, Ctrl+Shift+Z) via history stack (limite 50 frames)
 * - Auto-save a cada 60s quando há mudanças não persistidas
 * - Save manual via botão (debounce não-bloqueante)
 * - Estado via useReducer com history middleware
 */

import { useCallback, useEffect, useReducer, useRef, useState, useTransition } from 'react'
import { Loader2, Paintbrush, Redo2, Save, Sparkles, Undo2, X } from 'lucide-react'
import {
  defaultCanvasState, hydrateCanvasState, type CanvasState, type PageConfig,
} from '@/lib/canva/canvas-state'
import type { CanvasElement } from '@/lib/canva/elements'
import {
  getBackgroundUploadUrl, getBackgroundReadUrl,
  getCanvasImageUploadUrl, getCanvasImageReadUrl,
  updateTemplateCanvasState,
} from '@/lib/actions/canva-templates'
import CanvasStage from './CanvasStage'
import ElementsToolbar from './ElementsToolbar'
import PropertiesPanel from './PropertiesPanel'
import PageSettingsPanel from './PageSettingsPanel'

interface Props {
  templateId: string
  templateName: string
  initialState?: CanvasState | null
  onClose?: () => void
  onSaved?: () => void
}

// ── Reducer com history (undo/redo) ──────────────────────────────────────────

type DocAction =
  | { type: 'set_page'; page: PageConfig }
  | { type: 'add'; element: CanvasElement }
  | { type: 'patch'; id: string; patch: Partial<CanvasElement> }
  | { type: 'delete'; id: string }
  | { type: 'move_z'; id: string; dir: 'front' | 'back' | 'forward' | 'backward' }

type HistoryAction =
  | DocAction
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'replace_state'; state: CanvasState }

interface HistoryState {
  past: CanvasState[]
  present: CanvasState
  future: CanvasState[]
}

const HISTORY_LIMIT = 50

function docReducer(state: CanvasState, action: DocAction): CanvasState {
  switch (action.type) {
    case 'set_page':
      return { ...state, page: action.page }

    case 'add':
      return { ...state, elements: [...state.elements, action.element] }

    case 'patch':
      return {
        ...state,
        elements: state.elements.map(el =>
          el.id === action.id ? ({ ...el, ...action.patch } as CanvasElement) : el,
        ),
      }

    case 'delete':
      return { ...state, elements: state.elements.filter(el => el.id !== action.id) }

    case 'move_z': {
      const all = [...state.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
      const idx = all.findIndex(e => e.id === action.id)
      if (idx === -1) return state
      const target = all[idx]
      const minZ = (all[0]?.zIndex ?? 1) - 1
      const maxZ = (all[all.length - 1]?.zIndex ?? 1) + 1
      let newZ = target.zIndex ?? 1
      if (action.dir === 'front')    newZ = maxZ
      if (action.dir === 'back')     newZ = minZ
      if (action.dir === 'forward')  newZ = (all[idx + 1]?.zIndex ?? newZ) + 0.5
      if (action.dir === 'backward') newZ = (all[idx - 1]?.zIndex ?? newZ) - 0.5
      return {
        ...state,
        elements: state.elements.map(e => e.id === action.id ? { ...e, zIndex: newZ } : e),
      }
    }
  }
}

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'undo': {
      const prev = state.past[state.past.length - 1]
      if (!prev) return state
      return {
        past:    state.past.slice(0, -1),
        present: prev,
        future:  [state.present, ...state.future],
      }
    }

    case 'redo': {
      const next = state.future[0]
      if (!next) return state
      return {
        past:    [...state.past, state.present],
        present: next,
        future:  state.future.slice(1),
      }
    }

    case 'replace_state':
      return {
        past:    [],
        present: action.state,
        future:  [],
      }

    default: {
      const newPresent = docReducer(state.present, action)
      if (newPresent === state.present) return state
      const past = [...state.past, state.present]
      if (past.length > HISTORY_LIMIT) past.shift()
      return { past, present: newPresent, future: [] }
    }
  }
}

function initHistory(state?: CanvasState | null): HistoryState {
  return { past: [], present: hydrateCanvasState(state), future: [] }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CanvasEditor({
  templateId, templateName, initialState, onClose, onSaved,
}: Props) {
  const [history, dispatch] = useReducer(historyReducer, initialState, initHistory)
  const state = history.present
  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [isSaving, startSave] = useTransition()
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const stageWrapper = useRef<HTMLDivElement>(null)

  // Snapshot da última versão persistida — usado para detectar dirty state.
  const lastSavedRef = useRef<string>(JSON.stringify(state))

  const selected = state.elements.find(e => e.id === selectedId) ?? null

  const currentJson = JSON.stringify(state)
  const isDirty = currentJson !== lastSavedRef.current

  // ── Handlers de mutação ────────────────────────────────────────────────────

  const handleElementChange = useCallback((id: string, patch: Partial<CanvasElement>) => {
    dispatch({ type: 'patch', id, patch })
  }, [])

  const handlePatchSelected = useCallback((patch: Partial<CanvasElement>) => {
    if (!selectedId) return
    dispatch({ type: 'patch', id: selectedId, patch })
  }, [selectedId])

  const handleDeleteSelected = useCallback(() => {
    if (!selectedId) return
    dispatch({ type: 'delete', id: selectedId })
    setSelectedId(null)
  }, [selectedId])

  const handleMoveZ = useCallback((dir: 'front' | 'back' | 'forward' | 'backward') => {
    if (!selectedId) return
    dispatch({ type: 'move_z', id: selectedId, dir })
  }, [selectedId])

  /** Pintar rápido dual-mode:
   *  - Elemento selecionado: aplica cor kind-aware (line.color / block.backgroundColor)
   *  - Nada selecionado: pinta a folha inteira (page.backgroundColor),
   *    cobrindo "qualquer parte do documento" mesmo fora de elementos. */
  const handleQuickPaint = useCallback((color: string) => {
    if (selected) {
      if (selected.kind === 'line') {
        dispatch({ type: 'patch', id: selected.id, patch: { color } as Partial<CanvasElement> })
      } else {
        dispatch({
          type: 'patch', id: selected.id,
          patch: { block: { ...(selected.block ?? {}), backgroundColor: color } } as Partial<CanvasElement>,
        })
      }
    } else {
      dispatch({ type: 'set_page', page: { ...state.page, backgroundColor: color } })
    }
  }, [selected, state.page])

  // ── Upload helpers ─────────────────────────────────────────────────────────

  async function handleUploadBackground(file: File): Promise<{ url: string }> {
    const { upload_url, storage_path } = await getBackgroundUploadUrl(file.name)
    const put = await fetch(upload_url, {
      method: 'PUT', body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    })
    if (!put.ok) throw new Error(`upload bg falhou (${put.status})`)
    const { signed_read_url } = await getBackgroundReadUrl(storage_path)
    return { url: signed_read_url }
  }

  async function handleUploadImage(file: File): Promise<{ url: string; storagePath: string }> {
    const { upload_url, storage_path } = await getCanvasImageUploadUrl(file.name)
    const put = await fetch(upload_url, {
      method: 'PUT', body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    })
    if (!put.ok) throw new Error(`upload imagem falhou (${put.status})`)
    const { signed_read_url } = await getCanvasImageReadUrl(storage_path)
    return { url: signed_read_url, storagePath: storage_path }
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  const persist = useCallback(async (snapshot: CanvasState, json: string): Promise<void> => {
    await updateTemplateCanvasState({ template_id: templateId, canvas_state: snapshot })
    lastSavedRef.current = json
    setSavedAt(new Date())
  }, [templateId])

  function handleSave() {
    setError(null)
    const snapshot = state
    const json = currentJson
    startSave(async () => {
      try {
        await persist(snapshot, json)
        onSaved?.()
      } catch (e: any) {
        setError(e?.message ?? 'falha ao salvar')
      }
    })
  }

  // ── Auto-save a cada 60s (não dispara se nada mudou) ───────────────────────

  useEffect(() => {
    const id = window.setInterval(async () => {
      // Não executa se já está salvando manualmente ou se nada mudou.
      const snapshot = state
      const json = JSON.stringify(snapshot)
      if (json === lastSavedRef.current) return
      if (isSaving || isAutoSaving) return
      setIsAutoSaving(true)
      try {
        await persist(snapshot, json)
      } catch (e) {
        // Falha silenciosa no auto-save — não derruba o editor.
        console.warn('[canva] auto-save falhou:', e)
      } finally {
        setIsAutoSaving(false)
      }
    }, 60_000)
    return () => window.clearInterval(id)
  }, [state, isSaving, isAutoSaving, persist])

  // ── Atalhos de teclado: Ctrl+Z / Ctrl+Shift+Z / Ctrl+S ─────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()
      // Ignora atalhos quando foco está num input editável
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
      const inEditable = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement | null)?.isContentEditable
      if (inEditable && k !== 's') return

      if (k === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'undo' }) }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); dispatch({ type: 'redo' }) }
      else if (k === 's') { e.preventDefault(); handleSave() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, currentJson])

  // ── Aviso antes de fechar a aba com mudanças não salvas ────────────────────

  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [isDirty])

  // ── Render ─────────────────────────────────────────────────────────────────

  const status: { label: string; tone: 'idle' | 'saving' | 'dirty' | 'saved' } = isSaving || isAutoSaving
    ? { label: isAutoSaving ? 'Salvando automaticamente…' : 'Salvando…', tone: 'saving' }
    : isDirty
      ? { label: 'Alterações não salvas', tone: 'dirty' }
      : savedAt
        ? { label: `Salvo às ${savedAt.toLocaleTimeString('pt-BR')}`, tone: 'saved' }
        : { label: 'Pronto para editar', tone: 'idle' }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-slate-900/40 backdrop-blur-sm">
      <div className="m-auto flex h-[98vh] w-[min(1600px,99vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header — duas linhas em telas estreitas, uma só em telas largas */}
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-5 h-5 text-violet-600 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 truncate">Editor Canvas Visual</h2>
              <p className="text-[10px] text-slate-500 truncate">{templateName}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Grupo: Undo/Redo */}
            <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white">
              <IconHeaderBtn title="Desfazer (Ctrl+Z)" disabled={!canUndo} onClick={() => dispatch({ type: 'undo' })}>
                <Undo2 className="w-3.5 h-3.5" />
              </IconHeaderBtn>
              <IconHeaderBtn title="Refazer (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => dispatch({ type: 'redo' })}>
                <Redo2 className="w-3.5 h-3.5" />
              </IconHeaderBtn>
            </div>

            <QuickPaint
              currentColor={
                selected
                  ? (selected.kind === 'line' ? (selected.color ?? '#0f172a') : (selected.block?.backgroundColor ?? '#ffffff'))
                  : (state.page.backgroundColor ?? '#ffffff')
              }
              target={selected ? 'element' : 'page'}
              onPick={handleQuickPaint}
            />

            <StatusPill {...status} />

            <button
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              title="Salvar (Ctrl+S)"
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar
            </button>
            {onClose && (
              <button onClick={onClose} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>

        {error && (
          <div className="bg-red-50 px-5 py-2 text-xs text-red-700">{error}</div>
        )}

        {/* Page settings */}
        <PageSettingsPanel
          page={state.page}
          onChange={page => dispatch({ type: 'set_page', page })}
          onUploadBackground={handleUploadBackground}
        />

        {/* Body: toolbar | stage | properties */}
        <div className="grid flex-1 grid-cols-[80px_minmax(0,1fr)_minmax(280px,340px)] overflow-hidden">
          <ElementsToolbar
            onAdd={(element) => { dispatch({ type: 'add', element }); setSelectedId(element.id) }}
            onUploadImage={handleUploadImage}
          />

          <main
            ref={stageWrapper}
            className="flex justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.06),transparent_60%)] p-6"
            onMouseDown={e => { if (e.target === e.currentTarget) setSelectedId(null) }}
          >
            <div
              className="w-full"
              style={{ maxWidth: state.page.orientation === 'portrait' ? 720 : 980 }}
            >
              <CanvasStage
                state={state}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onElementChange={handleElementChange}
              />
              <p className="mt-3 text-center text-[11px] text-slate-500">
                {state.elements.length} elemento{state.elements.length === 1 ? '' : 's'} · drag para mover, alças para redimensionar · auto-save a cada 1 min
              </p>
            </div>
          </main>

          <PropertiesPanel
            element={selected}
            onPatch={handlePatchSelected}
            onDelete={handleDeleteSelected}
            onMoveZ={handleMoveZ}
          />
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function QuickPaint({
  currentColor, target, onPick,
}: {
  currentColor: string
  target: 'element' | 'page'
  onPick: (color: string) => void
}) {
  const label = target === 'element' ? 'Pintar elemento' : 'Pintar página'
  return (
    <label
      title={target === 'element'
        ? 'Pinta o elemento selecionado (fundo/cor da linha).'
        : 'Nada selecionado — pinta a folha inteira. Clique num elemento para pintar apenas ele.'}
      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs cursor-pointer hover:bg-slate-50"
    >
      <Paintbrush className={`w-3.5 h-3.5 ${target === 'page' ? 'text-violet-600' : 'text-slate-700'}`} />
      <span className="text-slate-700">{label}</span>
      <input
        type="color"
        value={currentColor.startsWith('#') ? currentColor.slice(0, 7) : '#ffffff'}
        onChange={e => onPick(e.target.value)}
        className="h-4 w-5 cursor-pointer border-0 bg-transparent p-0"
      />
    </label>
  )
}

function IconHeaderBtn({
  children, title, onClick, disabled,
}: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed first:rounded-l-lg last:rounded-r-lg"
    >
      {children}
    </button>
  )
}

function StatusPill({ label, tone }: { label: string; tone: 'idle' | 'saving' | 'dirty' | 'saved' }) {
  const cls = {
    idle:   'bg-slate-100 text-slate-600',
    saving: 'bg-amber-50 text-amber-700',
    dirty:  'bg-orange-50 text-orange-700',
    saved:  'bg-emerald-50 text-emerald-700',
  }[tone]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {tone === 'saving' && <Loader2 className="w-3 h-3 animate-spin" />}
      {label}
    </span>
  )
}
