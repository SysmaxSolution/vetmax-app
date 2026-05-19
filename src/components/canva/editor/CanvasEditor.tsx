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

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from 'react'
import { Eye, EyeOff, Loader2, Paintbrush, Redo2, Save, Sparkles, Undo2, X, Eraser, Combine } from 'lucide-react'
import {
  defaultCanvasState, hydrateCanvasState, type CanvasState, type PageConfig,
} from '@/lib/canva/canvas-state'
import type { CanvasElement, DynamicTagElement, CompositeTagPart } from '@/lib/canva/elements'
import { makeBrushStrokeElement, makeCompositeTagElement } from '@/lib/canva/elements'
import { findTag } from '@/lib/canva/dynamic-tags'
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
  | { type: 'add'; element: CanvasElement; autoPosition?: boolean }
  | { type: 'add_many'; elements: CanvasElement[] }
  | { type: 'patch'; id: string; patch: Partial<CanvasElement> }
  | { type: 'delete'; id: string }
  | { type: 'delete_many'; ids: string[] }
  | { type: 'move_z'; id: string; dir: 'front' | 'back' | 'forward' | 'backward' }
  | { type: 'merge_tags'; ids: string[]; composite: CanvasElement }

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

    case 'add': {
      // Auto-cascade: novos elementos (que não são brush stroke / não foram
      // posicionados explicitamente) descem em escada para não se empilharem.
      const el = action.element
      const shouldAutoPosition = action.autoPosition !== false && el.kind !== 'brush_stroke'
      if (shouldAutoPosition) {
        const others = state.elements.filter(e => e.kind !== 'brush_stroke')
        if (others.length > 0) {
          const lastY = Math.max(...others.map(e => e.box.y + e.box.h))
          const nextY = Math.min(85, Math.max(2, lastY + 1))
          el.box = { ...el.box, y: nextY }
        }
      }
      const maxZ = state.elements.reduce((acc, e) => Math.max(acc, e.zIndex ?? 1), 0)
      el.zIndex = maxZ + 1
      return { ...state, elements: [...state.elements, el] }
    }

    case 'add_many': {
      // Macros: respeitam coordenadas explícitas, mas garantem zIndex acima
      // dos existentes (cada elemento entra crescendo no stack).
      const baseZ = state.elements.reduce((acc, e) => Math.max(acc, e.zIndex ?? 1), 0)
      const stamped = action.elements.map((el, i) => ({ ...el, zIndex: baseZ + i + 1 }))
      return { ...state, elements: [...state.elements, ...stamped] }
    }

    case 'patch':
      return {
        ...state,
        elements: state.elements.map(el =>
          el.id === action.id ? ({ ...el, ...action.patch } as CanvasElement) : el,
        ),
      }

    case 'delete':
      return { ...state, elements: state.elements.filter(el => el.id !== action.id) }

    case 'delete_many': {
      const set = new Set(action.ids)
      return { ...state, elements: state.elements.filter(el => !set.has(el.id)) }
    }

    case 'merge_tags': {
      // Remove os elementos originais e insere a composite na posição do primeiro
      const set = new Set(action.ids)
      const remaining = state.elements.filter(el => !set.has(el.id))
      return { ...state, elements: [...remaining, action.composite] }
    }

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

  // selectedIds[0] = primary (mostrado no PropertiesPanel singular)
  // selectedIds[1+] = extras (multi-select via Ctrl/Cmd/Shift+Click)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedId = selectedIds[0] ?? null
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [isSaving, startSave] = useTransition()
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const stageWrapper = useRef<HTMLDivElement>(null)

  // Modo Pincel — quando ativo, cliques no canvas pintam traços em vez de
  // selecionar/arrastar elementos. ESC ou botão "Encerrar" sai.
  const [brushMode, setBrushMode] = useState<{ color: string; size: number; opacity: number } | null>(null)

  // Modal de mescla de tags
  const [showMergeModal, setShowMergeModal] = useState(false)

  // Visualização limpa — esconde guides do editor (outlines de seleção,
  // bordas dashed dos elementos, margem violeta). Mostra como vai imprimir.
  const [cleanPreview, setCleanPreview] = useState(false)

  const handleSelect = useCallback((id: string | null, opts?: { append?: boolean }) => {
    if (id === null) {
      setSelectedIds([])
      return
    }
    setSelectedIds(prev => {
      if (opts?.append) {
        if (prev.includes(id)) return prev.filter(x => x !== id)
        return [...prev, id]
      }
      return [id]
    })
  }, [])

  // Elementos selecionados que são dynamic_tag (candidatos a mescla)
  const selectedDynamicTags = useMemo(() => {
    return selectedIds
      .map(id => state.elements.find(e => e.id === id))
      .filter((e): e is DynamicTagElement => !!e && e.kind === 'dynamic_tag')
  }, [selectedIds, state.elements])

  const canMerge = selectedDynamicTags.length >= 2

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
    if (selectedIds.length === 0) return
    if (selectedIds.length === 1) dispatch({ type: 'delete', id: selectedIds[0] })
    else dispatch({ type: 'delete_many', ids: selectedIds })
    setSelectedIds([])
  }, [selectedIds])

  /** Confirma a mescla: cria composite_tag a partir das dynamic_tags selecionadas
   *  (na ordem definida no modal), remove as originais. */
  const handleConfirmMerge = useCallback((
    parts: CompositeTagPart[],
    separator: string,
  ) => {
    if (parts.length < 2) return
    // Posiciona o composite onde estava o primeiro elemento (mais alto/esquerdo)
    const firstTag = selectedDynamicTags.find(t => t.id === parts[0].tagId)
      ?? selectedDynamicTags[0]
    const composite = makeCompositeTagElement(parts, {
      box: { ...firstTag.box },
      separator,
      typography: { ...firstTag.typography },
      zIndex: firstTag.zIndex,
    })
    dispatch({ type: 'merge_tags', ids: selectedDynamicTags.map(t => t.id), composite })
    setSelectedIds([composite.id])
    setShowMergeModal(false)
  }, [selectedDynamicTags])

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

  /** Abre a pré-visualização em nova aba. Salva o snapshot atual primeiro
   *  (síncrono para garantir que o canvas_state remoto está atualizado),
   *  depois window.open — não fecha o modal de edição. */
  async function handlePreview() {
    setError(null)
    if (isDirty) {
      try { await persist(state, currentJson) }
      catch (e: any) { setError(`Salvar antes de pré-visualizar falhou: ${e?.message ?? e}`); return }
    }
    window.open(`/dashboard/laudos/preview/${templateId}`, '_blank', 'noopener,noreferrer')
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

            {canMerge && (
              <button
                onClick={() => setShowMergeModal(true)}
                title={`Mesclar ${selectedDynamicTags.length} tags em uma única`}
                className="flex items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
              >
                <Combine className="w-3.5 h-3.5" />
                Mesclar ({selectedDynamicTags.length})
              </button>
            )}

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
              onClick={() => setCleanPreview(v => !v)}
              title={cleanPreview ? 'Mostrar guias do editor' : 'Esconder guias — ver como vai imprimir'}
              className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                cleanPreview
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700'
              }`}
            >
              {cleanPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {cleanPreview ? 'Ver guias' : 'Visualização limpa'}
            </button>

            <button
              onClick={handlePreview}
              disabled={isSaving}
              title="Abrir pré-visualização em nova aba (com dados de exemplo)"
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50"
            >
              <Eye className="w-3.5 h-3.5" />
              Pré-visualizar
            </button>

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
            onAdd={(element) => { dispatch({ type: 'add', element }); setSelectedIds([element.id]) }}
            onAddMany={(elements) => { dispatch({ type: 'add_many', elements }); setSelectedIds([]) }}
            onUploadImage={handleUploadImage}
            computeStartY={() => {
              const others = state.elements.filter(e => e.kind !== 'brush_stroke')
              if (others.length === 0) return 5
              const lastY = Math.max(...others.map(e => e.box.y + e.box.h))
              return Math.min(85, Math.max(2, lastY + 1))
            }}
          />

          <main
            ref={stageWrapper}
            className="flex justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.06),transparent_60%)] p-6"
            onMouseDown={e => { if (e.target === e.currentTarget) setSelectedIds([]) }}
          >
            <div
              className="w-full"
              style={{ maxWidth: state.page.orientation === 'portrait' ? 720 : 980 }}
            >
              <CanvasStage
                state={state}
                selectedId={selectedId}
                selectedIds={selectedIds}
                cleanPreview={cleanPreview}
                brush={brushMode}
                onSelect={handleSelect}
                onElementChange={handleElementChange}
                onBrushStrokeComplete={handleBrushStrokeComplete}
              />
              <p className="mt-3 text-center text-[11px] text-slate-500">
                {state.elements.length} elemento{state.elements.length === 1 ? '' : 's'}
                {selectedIds.length > 1 && (
                  <span className="ml-1 text-violet-600 font-medium">
                    · {selectedIds.length} selecionados (Ctrl+Click)
                  </span>
                )}
                {' · '}auto-save a cada 1 min
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

        {showMergeModal && (
          <MergeTagsModal
            tags={selectedDynamicTags}
            onClose={() => setShowMergeModal(false)}
            onConfirm={handleConfirmMerge}
          />
        )}
      </div>
    </div>
  )
}

// ── MergeTagsModal ───────────────────────────────────────────────────────────

interface MergeDraftPart {
  tagId: string
  label: string
  prefix: string
  suffix: string
}

function MergeTagsModal({
  tags, onClose, onConfirm,
}: {
  tags: DynamicTagElement[]
  onClose: () => void
  onConfirm: (parts: CompositeTagPart[], separator: string) => void
}) {
  const [parts, setParts] = useState<MergeDraftPart[]>(() =>
    tags.map(t => ({
      tagId: t.tagId,
      label: findTag(t.tagId)?.label ?? t.tagId,
      prefix: t.prefix ?? '',
      suffix: t.suffix ?? '',
    }))
  )
  const [separator, setSeparator] = useState(' · ')

  function move(idx: number, dir: -1 | 1) {
    const target = idx + dir
    if (target < 0 || target >= parts.length) return
    const next = [...parts]
    const [removed] = next.splice(idx, 1)
    next.splice(target, 0, removed)
    setParts(next)
  }
  function update(idx: number, patch: Partial<MergeDraftPart>) {
    setParts(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p))
  }
  function removeAt(idx: number) {
    if (parts.length <= 2) return
    setParts(prev => prev.filter((_, i) => i !== idx))
  }

  const preview = parts
    .map(p => `${p.prefix}<${p.label}>${p.suffix}`)
    .join(separator)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="flex w-full max-w-xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden" style={{ maxHeight: '85vh' }}>
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Combine className="w-4 h-4 text-violet-600" />
              Mesclar Tags
            </h2>
            <p className="text-[11px] text-slate-500">
              {parts.length} tags serão combinadas em um único elemento
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="overflow-y-auto p-4 space-y-3">
          {/* Preview */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Pré-visualização
            </div>
            <div className="font-mono text-xs text-slate-700 break-all">{preview || '(vazio)'}</div>
          </div>

          {/* Partes */}
          <ol className="space-y-2">
            {parts.map((p, i) => (
              <li key={`${p.tagId}-${i}`} className="rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold text-violet-700">
                    {i + 1}. {p.label} <code className="ml-1 text-[10px] text-slate-400 font-mono">{`{{${p.tagId}}}`}</code>
                  </span>
                  <div className="flex gap-0.5">
                    <button onClick={() => move(i, -1)} disabled={i === 0}
                      className="rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Subir">↑</button>
                    <button onClick={() => move(i, +1)} disabled={i === parts.length - 1}
                      className="rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" title="Descer">↓</button>
                    <button onClick={() => removeAt(i)} disabled={parts.length <= 2}
                      className="rounded px-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30" title="Remover">×</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[10px] text-slate-600">Texto antes</span>
                    <input
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                      value={p.prefix}
                      placeholder='ex: "Tutor: "'
                      onChange={e => update(i, { prefix: e.target.value })}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-slate-600">Texto depois</span>
                    <input
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                      value={p.suffix}
                      placeholder='ex: " kg"'
                      onChange={e => update(i, { suffix: e.target.value })}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ol>

          <label className="block">
            <span className="text-[10px] text-slate-600">Separador entre as partes</span>
            <input
              className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
              value={separator}
              onChange={e => setSeparator(e.target.value)}
              placeholder=" · "
            />
            <span className="text-[10px] text-slate-400">
              Comum: <code>{' · '}</code>, <code>{' — '}</code>, <code>{', '}</code>, <code>{' / '}</code>
            </span>
          </label>
        </div>

        <footer className="border-t border-slate-200 px-4 py-3 flex items-center justify-end gap-2 flex-shrink-0">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(
              parts.map(p => ({ tagId: p.tagId, prefix: p.prefix, suffix: p.suffix })),
              separator,
            )}
            disabled={parts.length < 2}
            className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            Mesclar {parts.length} tags
          </button>
        </footer>
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
