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
import { Loader2, Paintbrush, Redo2, Save, Sparkles, Undo2, X, Eraser } from 'lucide-react'
import {
  defaultCanvasState, hydrateCanvasState, type CanvasState, type PageConfig,
} from '@/lib/canva/canvas-state'
import type { CanvasElement } from '@/lib/canva/elements'
import { makeBrushStrokeElement } from '@/lib/canva/elements'
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

  // Modo Pincel — quando ativo, cliques no canvas pintam traços em vez de
  // selecionar/arrastar elementos. ESC ou botão "Encerrar" sai.
  const [brushMode, setBrushMode] = useState<{ color: string; size: number; opacity: number } | null>(null)

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

  /** Pinta apenas o elemento selecionado (kind-aware). Quando nada está
   *  selecionado, o admin usa o modo Pincel (handle separado) para
   *  desenhar traços livres, ou o controle "Cor da página" no PageSettings. */
  const handlePaintSelected = useCallback((color: string) => {
    if (!selected) return
    if (selected.kind === 'line') {
      dispatch({ type: 'patch', id: selected.id, patch: { color } as Partial<CanvasElement> })
    } else {
      dispatch({
        type: 'patch', id: selected.id,
        patch: { block: { ...(selected.block ?? {}), backgroundColor: color } } as Partial<CanvasElement>,
      })
    }
  }, [selected])

  /** Persistir um traço de pincel ao soltar o mouse (vem do CanvasStage). */
  const handleBrushStrokeComplete = useCallback((
    points: Array<{ x: number; y: number }>,
    settings: { color: string; size: number; opacity?: number },
  ) => {
    const stroke = makeBrushStrokeElement(points, settings.color, settings.size)
    if (settings.opacity != null) stroke.opacity = settings.opacity
    dispatch({ type: 'add', element: stroke })
  }, [])

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

  // ── Atalhos de teclado: Ctrl+Z / Ctrl+Shift+Z / Ctrl+S / ESC ───────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // ESC sai do modo Pincel (sem precisar de Ctrl)
      if (e.key === 'Escape' && brushMode) {
        e.preventDefault()
        setBrushMode(null)
        return
      }
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()
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
  }, [state, currentJson, brushMode])

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

            {selected ? (
              <QuickPaint
                currentColor={
                  selected.kind === 'line' ? (selected.color ?? '#0f172a') : (selected.block?.backgroundColor ?? '#ffffff')
                }
                onPick={handlePaintSelected}
              />
            ) : (
              <BrushControl
                active={brushMode}
                onActivate={settings => setBrushMode(settings)}
                onDeactivate={() => setBrushMode(null)}
              />
            )}

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
                brush={brushMode}
                onSelect={setSelectedId}
                onElementChange={handleElementChange}
                onBrushStrokeComplete={handleBrushStrokeComplete}
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
  currentColor, onPick,
}: {
  currentColor: string
  onPick: (color: string) => void
}) {
  return (
    <label
      title="Pinta o elemento selecionado (fundo/cor da linha)."
      className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs cursor-pointer hover:bg-slate-50"
    >
      <Paintbrush className="w-3.5 h-3.5 text-slate-700" />
      <span className="text-slate-700">Pintar elemento</span>
      <input
        type="color"
        value={currentColor.startsWith('#') ? currentColor.slice(0, 7) : '#ffffff'}
        onChange={e => onPick(e.target.value)}
        className="h-4 w-5 cursor-pointer border-0 bg-transparent p-0"
      />
    </label>
  )
}

/** BrushControl — popover com color picker + slider de espessura.
 *  Ao ativar, o cursor do canvas vira crosshair e mouse events
 *  desenham traços livres (handle em CanvasStage). */
function BrushControl({
  active, onActivate, onDeactivate,
}: {
  active: { color: string; size: number; opacity: number } | null
  onActivate: (settings: { color: string; size: number; opacity: number }) => void
  onDeactivate: () => void
}) {
  const [open, setOpen] = useState(false)
  const [color, setColor] = useState(active?.color ?? '#7c3aed')
  const [size, setSize] = useState(active?.size ?? 3)
  const [opacity, setOpacity] = useState(active?.opacity ?? 1)

  function activate() {
    onActivate({ color, size, opacity })
    setOpen(false)
  }

  if (active) {
    // Estado ativo: mostra preview + atalho de desativar
    return (
      <div className="relative flex items-center gap-1 rounded-lg border border-violet-400 bg-violet-50 px-2 py-1 text-xs">
        <Paintbrush className="w-3.5 h-3.5 text-violet-700" />
        <span className="text-violet-700 font-medium">Pintando</span>
        <span
          className="inline-block rounded-full border border-white shadow-sm"
          style={{ background: active.color, width: Math.max(8, Math.min(active.size, 18)), height: Math.max(8, Math.min(active.size, 18)) }}
          aria-hidden
        />
        <button
          onClick={() => setOpen(o => !o)}
          className="ml-1 text-violet-700 hover:underline"
          title="Ajustar pincel"
        >ajustar</button>
        <button
          onClick={onDeactivate}
          className="ml-1 flex items-center gap-0.5 rounded bg-white border border-violet-300 px-1 text-violet-700 hover:bg-violet-100"
          title="Encerrar pincel (ESC)"
        >
          <Eraser className="w-3 h-3" /> sair
        </button>

        {open && (
          <BrushPopover
            color={color} size={size} opacity={opacity}
            onColor={c => { setColor(c); onActivate({ color: c, size, opacity }) }}
            onSize={s => { setSize(s); onActivate({ color, size: s, opacity }) }}
            onOpacity={o => { setOpacity(o); onActivate({ color, size, opacity: o }) }}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    )
  }

  // Estado inativo: botão Pintar com pincel
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="Pintar livre (pincel) — cor + espessura"
        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
      >
        <Paintbrush className="w-3.5 h-3.5" />
        Pintar
      </button>
      {open && (
        <BrushPopover
          color={color} size={size} opacity={opacity}
          onColor={setColor} onSize={setSize} onOpacity={setOpacity}
          onClose={() => setOpen(false)}
          onActivate={activate}
        />
      )}
    </div>
  )
}

function BrushPopover({
  color, size, opacity,
  onColor, onSize, onOpacity, onClose, onActivate,
}: {
  color: string
  size: number
  opacity: number
  onColor: (c: string) => void
  onSize: (s: number) => void
  onOpacity: (o: number) => void
  onClose: () => void
  onActivate?: () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full z-50 mt-1 w-[260px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pincel</h4>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <label className="block mb-2">
          <span className="text-[10px] text-slate-600">Cor</span>
          <div className="flex items-center gap-1 mt-0.5">
            <input
              type="color"
              value={color.startsWith('#') ? color.slice(0, 7) : '#7c3aed'}
              onChange={e => onColor(e.target.value)}
              className="h-7 w-9 cursor-pointer rounded border border-slate-300"
            />
            <input
              type="text"
              value={color}
              onChange={e => onColor(e.target.value)}
              className="flex-1 min-w-0 rounded border border-slate-300 px-2 py-1 text-[10px] font-mono"
            />
          </div>
        </label>

        <label className="block mb-2">
          <span className="flex items-center justify-between text-[10px] text-slate-600">
            <span>Espessura</span>
            <span className="tabular-nums font-semibold text-slate-700">{size}px</span>
          </span>
          <input
            type="range" min={1} max={40} step={1}
            value={size}
            onChange={e => onSize(parseInt(e.target.value, 10))}
            className="canva-slider w-full"
          />
          {/* Preview da espessura */}
          <div className="mt-1 flex items-center justify-center rounded bg-slate-50 py-2">
            <span
              className="rounded-full"
              style={{ background: color, width: size, height: size, opacity }}
            />
          </div>
        </label>

        <label className="block mb-3">
          <span className="flex items-center justify-between text-[10px] text-slate-600">
            <span>Opacidade</span>
            <span className="tabular-nums font-semibold text-slate-700">{Math.round(opacity * 100)}%</span>
          </span>
          <input
            type="range" min={0.1} max={1} step={0.05}
            value={opacity}
            onChange={e => onOpacity(parseFloat(e.target.value))}
            className="canva-slider w-full"
          />
        </label>

        {onActivate && (
          <button
            onClick={onActivate}
            className="w-full rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
          >
            Ativar pincel
          </button>
        )}
        <p className="mt-2 text-[10px] text-slate-400 leading-snug">
          Arraste o mouse no canvas para pintar. ESC encerra o modo.
        </p>
      </div>
    </>
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
