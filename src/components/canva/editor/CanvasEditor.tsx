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
import {
  Eye, EyeOff, Loader2, Paintbrush, Redo2, Save, Sparkles, Undo2, X, Eraser,
  Combine, ZoomIn, ZoomOut, Maximize2, FileText, FilePlus, Trash2,
} from 'lucide-react'
import {
  defaultCanvasState, hydrateCanvasState, DEFAULT_PAGE_CONFIG,
  type CanvasState, type PageConfig,
} from '@/lib/canva/canvas-state'
import type {
  CanvasElement, DynamicTagElement, TextElement, CompositeTagElement, CompositeTagPart,
} from '@/lib/canva/elements'
import { makeBrushStrokeElement, makeCompositeTagElement, nextElementId } from '@/lib/canva/elements'
import { findTag } from '@/lib/canva/dynamic-tags'

/** Kinds que podem entrar numa mescla (gera um único CompositeTagElement). */
type MergeableElement = TextElement | DynamicTagElement | CompositeTagElement
const MERGEABLE_KINDS: Array<CanvasElement['kind']> = ['text', 'dynamic_tag', 'composite_tag']

function isMergeable(el: CanvasElement | undefined): el is MergeableElement {
  return !!el && MERGEABLE_KINDS.includes(el.kind)
}
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
  // O reducer opera sempre na "página atual" (single-page). Multi-page é
  // coordenado por estado externo no componente (pageBuffer + pageIndex).
  // Inicializamos sempre na página 1 (page + elements de top-level).
  const cs = hydrateCanvasState(state)
  const singlePage: CanvasState = {
    version: 1,
    page: cs.page,
    elements: cs.elements,
  }
  return { past: [], present: singlePage, future: [] }
}

/** Snapshot de uma página (page + elements) — usado no buffer multi-page. */
interface PageSnapshot {
  page: PageConfig
  elements: CanvasElement[]
}

/** Inicializa o buffer com TODAS as páginas (página 1 + extras) já hidratadas. */
function initPageBuffer(initial?: CanvasState | null): PageSnapshot[] {
  const cs = hydrateCanvasState(initial)
  return [
    { page: cs.page, elements: cs.elements },
    ...((cs.extraPages ?? []).map(e => ({ page: e.page, elements: e.elements }))),
  ]
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CanvasEditor({
  templateId, templateName, initialState, onClose, onSaved,
}: Props) {
  const [history, dispatch] = useReducer(historyReducer, initialState, initHistory)
  const state = history.present
  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  // ── Multi-page ────────────────────────────────────────────────────────────
  // pageBuffer guarda snapshots de TODAS as páginas. A página ativa (que
  // o reducer manipula em `state`) também tem um slot aqui, mas o conteúdo
  // do slot só é sincronizado nos momentos críticos (switch, save). Isso
  // permite manter Undo/Redo isolado por página sem comprometer persistência.
  const [pageIndex,  setPageIndex]  = useState(0)
  const [pageBuffer, setPageBuffer] = useState<PageSnapshot[]>(() => initPageBuffer(initialState))
  const pageCountUI = pageBuffer.length

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

  // Clipboard local — Ctrl+C/V copia e cola elementos. Não usa o
  // clipboard do SO (evita problemas de permissão e formato).
  const [clipboard, setClipboard] = useState<CanvasElement[]>([])

  // Zoom do canvas — visual transform: scale(zoom). 1 = 100%.
  const [zoom, setZoom] = useState(1)
  const ZOOM_MIN = 0.25
  const ZOOM_MAX = 3
  const ZOOM_STEP = 0.1

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

  // Elementos selecionados elegíveis a mescla (text, dynamic_tag, composite_tag)
  const selectedMergeable = useMemo<MergeableElement[]>(() => {
    return selectedIds
      .map(id => state.elements.find(e => e.id === id))
      .filter(isMergeable)
  }, [selectedIds, state.elements])

  const canMerge = selectedMergeable.length >= 2

  // Snapshot da última versão persistida — usado para detectar dirty state.
  // Em multi-page, compara o canvas_state COMPLETO (todas as páginas).
  const lastSavedRef = useRef<string>('')

  const selected = state.elements.find(e => e.id === selectedId) ?? null

  /** Constrói o CanvasState completo (página ativa + buffer) pra persistir. */
  const buildFullCanvasState = useCallback((): CanvasState => {
    // O slot da página ativa pode estar defasado — sincroniza com state atual
    const pages = pageBuffer.map((snap, i) =>
      i === pageIndex ? { page: state.page, elements: state.elements } : snap,
    )
    return {
      version: 1,
      page: pages[0].page,
      elements: pages[0].elements,
      extraPages: pages.length > 1
        ? pages.slice(1).map(p => ({ page: p.page, elements: p.elements }))
        : undefined,
    }
  }, [pageBuffer, pageIndex, state])

  const fullCanvasState = useMemo(() => buildFullCanvasState(), [buildFullCanvasState])
  const currentJson = useMemo(() => JSON.stringify(fullCanvasState), [fullCanvasState])
  const isDirty = currentJson !== lastSavedRef.current

  // Inicializa lastSavedRef com o estado inicial completo (apenas uma vez)
  useEffect(() => {
    if (lastSavedRef.current === '') {
      lastSavedRef.current = currentJson
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Page handlers (switch/add/delete) ─────────────────────────────────────
  /** Salva a página atual no buffer, troca pra outra, e dispara replace_state.
   *  Reseta o history (undo/redo é por-página). */
  const switchToPage = useCallback((targetIndex: number) => {
    if (targetIndex === pageIndex) return
    if (targetIndex < 0 || targetIndex >= pageBuffer.length) return
    // Snapshot da página atual no buffer
    setPageBuffer(prev => {
      const next = [...prev]
      next[pageIndex] = { page: state.page, elements: state.elements }
      return next
    })
    setPageIndex(targetIndex)
    const target = pageBuffer[targetIndex]
    dispatch({
      type: 'replace_state',
      state: { version: 1, page: target.page, elements: target.elements },
    })
    setSelectedIds([])
  }, [pageIndex, pageBuffer, state])

  /** Adiciona nova página em branco no final do buffer, herda size/orientation
   *  da página 1, e troca para a nova. */
  const addNewPage = useCallback(() => {
    // Snapshot da atual
    const currentSnap: PageSnapshot = { page: state.page, elements: state.elements }
    setPageBuffer(prev => {
      const updated = [...prev]
      updated[pageIndex] = currentSnap
      const basePage: PageConfig = {
        ...DEFAULT_PAGE_CONFIG,
        size: prev[0].page.size,
        orientation: prev[0].page.orientation,
        margins: { ...prev[0].page.margins },
        backgroundImageUrl: null,
      }
      const next = [...updated, { page: basePage, elements: [] as CanvasElement[] }]
      // Swap pra nova após render
      const newIdx = next.length - 1
      setPageIndex(newIdx)
      dispatch({
        type: 'replace_state',
        state: { version: 1, page: basePage, elements: [] },
      })
      setSelectedIds([])
      return next
    })
  }, [pageIndex, state])

  /** Remove a página por index. Página 1 nunca é removível.
   *  Se a página ativa for removida, volta pra anterior. */
  const deletePageAt = useCallback((index: number) => {
    if (index === 0) return                 // nunca remove a primeira
    if (pageBuffer.length <= 1) return      // garantia (não deveria acontecer)
    setPageBuffer(prev => {
      const next = prev.filter((_, i) => i !== index)
      // Decide nova activeIndex
      let newActive = pageIndex
      if (pageIndex === index) {
        newActive = Math.max(0, index - 1)
      } else if (pageIndex > index) {
        newActive = pageIndex - 1
      }
      setPageIndex(newActive)
      // Atualiza state ativo se mudou
      if (newActive !== pageIndex) {
        const target = next[newActive]
        dispatch({
          type: 'replace_state',
          state: { version: 1, page: target.page, elements: target.elements },
        })
        setSelectedIds([])
      }
      return next
    })
  }, [pageIndex, pageBuffer])

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

  /** Copia os elementos selecionados pro clipboard interno. */
  const handleCopy = useCallback(() => {
    const sel = selectedIds
      .map(id => state.elements.find(el => el.id === id))
      .filter((el): el is CanvasElement => !!el)
    if (sel.length === 0) return
    // Deep clone para isolar do estado vivo
    setClipboard(sel.map(el => JSON.parse(JSON.stringify(el)) as CanvasElement))
  }, [selectedIds, state.elements])

  /** Cola elementos do clipboard com offset visual. */
  const handlePaste = useCallback(() => {
    if (clipboard.length === 0) return
    const cloned: CanvasElement[] = clipboard.map(el => ({
      ...(JSON.parse(JSON.stringify(el)) as CanvasElement),
      id: nextElementId(el.kind),
      // Offset diagonal +2% para que o paste não fique exatamente sobre o original
      box: {
        ...el.box,
        x: Math.min(95, el.box.x + 2),
        y: Math.min(95, el.box.y + 2),
      },
    }))
    dispatch({ type: 'add_many', elements: cloned })
    setSelectedIds(cloned.map(c => c.id))
  }, [clipboard])

  /** Move elementos selecionados em uma direção (dx/dy em %). */
  const handleNudge = useCallback((dx: number, dy: number) => {
    if (selectedIds.length === 0) return
    for (const id of selectedIds) {
      const el = state.elements.find(e => e.id === id)
      if (!el || el.locked) continue
      dispatch({
        type: 'patch', id,
        patch: {
          box: {
            ...el.box,
            x: Math.max(0, Math.min(100 - el.box.w, el.box.x + dx)),
            y: Math.max(0, Math.min(100 - el.box.h, el.box.y + dy)),
          },
        } as Partial<CanvasElement>,
      })
    }
  }, [selectedIds, state.elements])

  const zoomIn  = useCallback(() => setZoom(z => Math.min(ZOOM_MAX, Number((z + ZOOM_STEP).toFixed(2)))), [])
  const zoomOut = useCallback(() => setZoom(z => Math.max(ZOOM_MIN, Number((z - ZOOM_STEP).toFixed(2)))), [])
  const zoomReset = useCallback(() => setZoom(1), [])

  /** Confirma a mescla: cria composite_tag a partir dos elementos selecionados
   *  (text, dynamic_tag, composite_tag, na ordem definida no modal), remove
   *  os originais. */
  const handleConfirmMerge = useCallback((
    parts: CompositeTagPart[],
    separator: string,
  ) => {
    if (parts.length < 2) return
    const first = selectedMergeable[0]
    // Tipografia base: do primeiro elemento mergeable que tem typography
    const baseTypography = ('typography' in first ? first.typography : undefined)
      ?? selectedMergeable.find(el => 'typography' in el && el.typography)?.typography
    const composite = makeCompositeTagElement(parts, {
      box: { ...first.box },
      separator,
      typography: baseTypography ?? undefined,
      zIndex: first.zIndex,
    })
    dispatch({ type: 'merge_tags', ids: selectedMergeable.map(t => t.id), composite })
    setSelectedIds([composite.id])
    setShowMergeModal(false)
  }, [selectedMergeable])

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
    const snapshot = buildFullCanvasState()
    const json = JSON.stringify(snapshot)
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
      const snapshot = buildFullCanvasState()
      try { await persist(snapshot, JSON.stringify(snapshot)) }
      catch (e: any) { setError(`Salvar antes de pré-visualizar falhou: ${e?.message ?? e}`); return }
    }
    window.open(`/dashboard/laudos/preview/${templateId}`, '_blank', 'noopener,noreferrer')
  }

  // ── Auto-save a cada 60s (não dispara se nada mudou) ───────────────────────

  useEffect(() => {
    const id = window.setInterval(async () => {
      // Não executa se já está salvando manualmente ou se nada mudou.
      const snapshot = buildFullCanvasState()
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
  }, [buildFullCanvasState, isSaving, isAutoSaving, persist])

  // ── Atalhos de teclado ─────────────────────────────────────────────────────
  // Globais (ignorados quando foco está em input/textarea/contentEditable
  // exceto Ctrl+S e ESC):
  //   - ESC                  → sai do modo pincel
  //   - DELETE / BACKSPACE   → apaga elementos selecionados
  //   - Ctrl/Cmd+Z           → undo
  //   - Ctrl/Cmd+Shift+Z / Y → redo
  //   - Ctrl/Cmd+S           → salva
  //   - Ctrl/Cmd+C           → copia selecionados
  //   - Ctrl/Cmd+V           → cola clipboard
  //   - Ctrl/Cmd+= / +       → zoom in
  //   - Ctrl/Cmd+-           → zoom out
  //   - Ctrl/Cmd+0           → reset zoom para 100%
  //   - Setas (↑↓←→)         → move selecionados ±1% (5% com Shift)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const inEditable = tag === 'input' || tag === 'textarea' || target?.isContentEditable
      const mod = e.ctrlKey || e.metaKey
      const k = e.key

      // ESC sai do modo Pincel (mesmo em input)
      if (k === 'Escape' && brushMode) {
        e.preventDefault()
        setBrushMode(null)
        return
      }

      // Ctrl+S salva — funciona em qualquer contexto
      if (mod && k.toLowerCase() === 's') {
        e.preventDefault()
        handleSave()
        return
      }

      // Demais atalhos só fora de campos editáveis
      if (inEditable) return

      // DELETE / BACKSPACE
      if ((k === 'Delete' || k === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault()
        handleDeleteSelected()
        return
      }

      // Setas (sem modificador também — comuns em editores gráficos)
      const arrowDeltas: Record<string, [number, number]> = {
        'ArrowUp':    [0, -1],
        'ArrowDown':  [0, +1],
        'ArrowLeft':  [-1, 0],
        'ArrowRight': [+1, 0],
      }
      if (k in arrowDeltas && selectedIds.length > 0) {
        e.preventDefault()
        const [dx, dy] = arrowDeltas[k]
        const step = e.shiftKey ? 5 : 1  // Shift = passos maiores
        handleNudge(dx * step, dy * step)
        return
      }

      // Atalhos com modificador (Ctrl ou Cmd)
      if (!mod) return
      const kLower = k.toLowerCase()

      if (kLower === 'z' && !e.shiftKey)               { e.preventDefault(); dispatch({ type: 'undo' }); return }
      if ((kLower === 'z' && e.shiftKey) || kLower === 'y') { e.preventDefault(); dispatch({ type: 'redo' }); return }
      if (kLower === 'c')                              { e.preventDefault(); handleCopy(); return }
      if (kLower === 'v')                              { e.preventDefault(); handlePaste(); return }
      // Zoom — '=' e '+' (Shift+=) ambos disparam zoom in
      if (k === '=' || k === '+')                      { e.preventDefault(); zoomIn(); return }
      if (k === '-' || k === '_')                      { e.preventDefault(); zoomOut(); return }
      if (k === '0')                                   { e.preventDefault(); zoomReset(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    brushMode, selectedIds, handleSave, handleDeleteSelected,
    handleCopy, handlePaste, handleNudge, zoomIn, zoomOut, zoomReset,
  ])

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
                title={`Mesclar ${selectedMergeable.length} elementos (texto/tags) em um único bloco`}
                className="flex items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
              >
                <Combine className="w-3.5 h-3.5" />
                Mesclar ({selectedMergeable.length})
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

            {/* Zoom controls */}
            <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white">
              <IconHeaderBtn title="Diminuir zoom (Ctrl -)" onClick={zoomOut} disabled={zoom <= ZOOM_MIN}>
                <ZoomOut className="w-3.5 h-3.5" />
              </IconHeaderBtn>
              <button
                onClick={zoomReset}
                title="Reset zoom (Ctrl 0)"
                className="px-2 text-[11px] font-medium text-slate-700 tabular-nums hover:bg-slate-100 h-7 min-w-[44px] border-x border-slate-200"
              >
                {Math.round(zoom * 100)}%
              </button>
              <IconHeaderBtn title="Aumentar zoom (Ctrl +)" onClick={zoomIn} disabled={zoom >= ZOOM_MAX}>
                <ZoomIn className="w-3.5 h-3.5" />
              </IconHeaderBtn>
            </div>

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

        {/* Page settings — afeta APENAS a página ativa (multi-page) */}
        <PageSettingsPanel
          page={state.page}
          onChange={page => dispatch({ type: 'set_page', page })}
          onUploadBackground={handleUploadBackground}
          pageLabel={pageCountUI > 1 ? `Página ${pageIndex + 1} de ${pageCountUI}` : undefined}
        />

        {/* Tab bar de páginas — só aparece se tiver multi-page OU
            quando o admin clica + pra adicionar a primeira página extra */}
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 py-1.5 overflow-x-auto">
          {pageBuffer.map((_, i) => (
            <div key={i} className="flex items-center">
              <button
                onClick={() => switchToPage(i)}
                className={`flex items-center gap-1.5 rounded-l-lg px-3 py-1 text-xs font-medium transition-colors ${
                  i === pageIndex
                    ? 'bg-violet-600 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <FileText className="w-3 h-3" />
                Página {i + 1}
              </button>
              {pageBuffer.length > 1 && i !== 0 && (
                <button
                  onClick={() => deletePageAt(i)}
                  title={`Excluir página ${i + 1}`}
                  className={`rounded-r-lg px-1.5 py-1 text-xs transition-colors ${
                    i === pageIndex
                      ? 'bg-violet-700 text-white hover:bg-red-600'
                      : 'bg-white border border-l-0 border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-600'
                  }`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addNewPage}
            title="Adicionar página em branco"
            className="flex items-center gap-1 rounded-lg border border-dashed border-violet-300 bg-white px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50"
          >
            <FilePlus className="w-3 h-3" />
            Adicionar página
          </button>
        </div>

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
            className="flex justify-center overflow-auto bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.06),transparent_60%)] p-6"
            onMouseDown={e => { if (e.target === e.currentTarget) setSelectedIds([]) }}
          >
            <div
              className="w-full"
              style={{
                maxWidth: state.page.orientation === 'portrait' ? 720 : 980,
                // Espaço extra do zoom para o overflow:auto poder rolar
                paddingBottom: zoom > 1 ? `${(zoom - 1) * 60}%` : undefined,
                paddingRight:  zoom > 1 ? `${(zoom - 1) * 60}%` : undefined,
              }}
            >
              <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                <CanvasStage
                  state={state}
                  selectedId={selectedId}
                  selectedIds={selectedIds}
                  cleanPreview={cleanPreview}
                  brush={brushMode}
                  zoom={zoom}
                  onSelect={handleSelect}
                  onElementChange={handleElementChange}
                  onBrushStrokeComplete={handleBrushStrokeComplete}
                />
              </div>
              <p className="mt-3 text-center text-[11px] text-slate-500">
                {state.elements.length} elemento{state.elements.length === 1 ? '' : 's'}
                {selectedIds.length > 1 && (
                  <span className="ml-1 text-violet-600 font-medium">
                    · {selectedIds.length} selecionados (Ctrl/Shift+Click)
                  </span>
                )}
                {clipboard.length > 0 && (
                  <span className="ml-1 text-emerald-600">· {clipboard.length} no clipboard (Ctrl+V)</span>
                )}
                {' · '}auto-save a cada 1 min · setas movem · Delete apaga
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
            elements={selectedMergeable}
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
  /** Vazio quando é parte estática de texto. */
  tagId: string
  /** Texto literal — usado quando tagId === '' (parte estática). */
  staticText?: string
  /** Label amigável (Nome do Pet, "Texto", etc.) */
  label: string
  prefix: string
  suffix: string
  origin: 'text' | 'tag' | 'composite_part'
}

/** Expande um elemento mergeable em uma ou mais MergeDraftPart. */
function elementToMergeParts(el: MergeableElement): MergeDraftPart[] {
  if (el.kind === 'text') {
    return [{
      tagId: '',
      staticText: el.content,
      label: '(Texto)',
      prefix: '',
      suffix: '',
      origin: 'text',
    }]
  }
  if (el.kind === 'dynamic_tag') {
    return [{
      tagId: el.tagId,
      label: findTag(el.tagId)?.label ?? el.tagId,
      prefix: el.prefix ?? '',
      suffix: el.suffix ?? '',
      origin: 'tag',
    }]
  }
  // composite_tag — expande cada parte interna como parte separada
  return el.parts.map(p => ({
    tagId: p.tagId ?? '',
    staticText: p.staticText,
    label: p.tagId ? (findTag(p.tagId)?.label ?? p.tagId) : '(Texto)',
    prefix: p.prefix ?? '',
    suffix: p.suffix ?? '',
    origin: 'composite_part' as const,
  }))
}

function MergeTagsModal({
  elements, onClose, onConfirm,
}: {
  elements: MergeableElement[]
  onClose: () => void
  onConfirm: (parts: CompositeTagPart[], separator: string) => void
}) {
  const [parts, setParts] = useState<MergeDraftPart[]>(() =>
    elements.flatMap(elementToMergeParts)
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
    .map(p => `${p.prefix}<${p.staticText ?? p.label}>${p.suffix}`)
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
            {parts.map((p, i) => {
              const isStatic = !p.tagId
              return (
                <li key={`${i}-${p.tagId || 'static'}`} className="rounded-lg border border-slate-200 bg-white p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-semibold text-violet-700">
                      {i + 1}. {p.label}
                      {!isStatic && (
                        <code className="ml-1 text-[10px] text-slate-400 font-mono">{`{{${p.tagId}}}`}</code>
                      )}
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
                  {isStatic && (
                    <label className="block mb-1.5">
                      <span className="text-[10px] text-slate-600">Texto</span>
                      <textarea
                        className="w-full resize-y rounded border border-slate-300 px-2 py-1 text-xs"
                        rows={2}
                        value={p.staticText ?? ''}
                        onChange={e => update(i, { staticText: e.target.value })}
                      />
                    </label>
                  )}
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
              )
            })}
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
              parts.map(p => ({
                tagId: p.tagId,
                staticText: p.staticText,
                prefix: p.prefix,
                suffix: p.suffix,
              })),
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
