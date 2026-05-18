'use client'

/**
 * CanvasEditor — orquestrador do Editor Visual de Modelos.
 *
 *   ┌─────────────────────────────────────────────────────┐
 *   │ Header (nome do template + Salvar)                  │
 *   ├─────────────────────────────────────────────────────┤
 *   │ PageSettingsPanel (size/orientation/margens/bg)     │
 *   ├──────┬──────────────────────────────┬───────────────┤
 *   │ Tool │ CanvasStage (preview live)   │ PropertiesPnl │
 *   │ bar  │                              │ (contextual)  │
 *   └──────┴──────────────────────────────┴───────────────┘
 *
 * Estado central via useReducer — actions ergonômicas (add, patch,
 * delete, select, moveZ). Salva canvas_state JSONB ao clicar em Salvar.
 */

import { useCallback, useReducer, useRef, useState, useTransition } from 'react'
import { Loader2, Save, Sparkles, X } from 'lucide-react'
import {
  defaultCanvasState, hydrateCanvasState, type CanvasState, type PageConfig,
} from '@/lib/canva/canvas-state'
import type { CanvasElement } from '@/lib/canva/elements'
import {
  getBackgroundUploadUrl, getCanvasImageUploadUrl,
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

// ── Reducer ──────────────────────────────────────────────────────────────────

type Action =
  | { type: 'set_page'; page: PageConfig }
  | { type: 'add'; element: CanvasElement }
  | { type: 'patch'; id: string; patch: Partial<CanvasElement> }
  | { type: 'delete'; id: string }
  | { type: 'move_z'; id: string; dir: 'front' | 'back' | 'forward' | 'backward' }
  | { type: 'replace_state'; state: CanvasState }

function reducer(state: CanvasState, action: Action): CanvasState {
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

    case 'replace_state':
      return action.state
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CanvasEditor({
  templateId, templateName, initialState, onClose, onSaved,
}: Props) {
  const [state, dispatch] = useReducer(
    reducer,
    initialState ?? defaultCanvasState(),
    hydrateCanvasState,
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()
  const stageWrapper = useRef<HTMLDivElement>(null)

  const selected = state.elements.find(e => e.id === selectedId) ?? null

  // ── Handlers de drag/resize do stage ───────────────────────────────────────

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

  // ── Upload helpers ─────────────────────────────────────────────────────────

  async function handleUploadBackground(file: File): Promise<{ url: string }> {
    const { upload_url, signed_read_url } = await getBackgroundUploadUrl(file.name)
    const put = await fetch(upload_url, { method: 'PUT', body: file })
    if (!put.ok) throw new Error(`upload bg falhou (${put.status})`)
    return { url: signed_read_url }
  }

  async function handleUploadImage(file: File): Promise<{ url: string; storagePath: string }> {
    const { upload_url, signed_read_url, storage_path } = await getCanvasImageUploadUrl(file.name)
    const put = await fetch(upload_url, { method: 'PUT', body: file })
    if (!put.ok) throw new Error(`upload imagem falhou (${put.status})`)
    return { url: signed_read_url, storagePath: storage_path }
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  function handleSave() {
    setError(null)
    startSave(async () => {
      try {
        await updateTemplateCanvasState({ template_id: templateId, canvas_state: state })
        setSavedAt(new Date().toLocaleTimeString('pt-BR'))
        onSaved?.()
      } catch (e: any) {
        setError(e?.message ?? 'falha ao salvar')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch bg-slate-900/40 backdrop-blur-sm">
      <div className="m-auto flex h-[96vh] w-[min(1480px,98vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-violet-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Editor Canvas Visual</h2>
              <p className="text-xs text-slate-500">{templateName} · motor Canvas Visual (drag&drop)</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {savedAt && <span className="text-xs text-emerald-600">Salvo às {savedAt}</span>}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
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
        <div className="grid flex-1 grid-cols-[88px_1fr_320px] overflow-hidden">
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
                {state.elements.length} elemento{state.elements.length === 1 ? '' : 's'} · drag para mover, alças para redimensionar
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
