/**
 * canvas_state — fonte da verdade do layout do template.
 *
 * Persistido em document_templates.canvas_state (JSONB, migration 0170).
 * Mesmo schema consumido pelo editor (modo edit) e pelo LaudoPrintable
 * (modo print) — garante paridade pixel-a-pixel.
 */

import type { CanvasElement } from './elements'

export type PageSize = 'A4' | 'A5'
export type PageOrientation = 'portrait' | 'landscape'

export interface PageConfig {
  size: PageSize
  orientation: PageOrientation
  /** Margens em cm — distância segura para conteúdo não colidir com o timbrado. */
  margins: { top: number; bottom: number; left: number; right: number }
  /** URL pública/signed do papel timbrado de fundo (opcional). */
  backgroundImageUrl?: string | null
}

export interface CanvasState {
  /** Versão do schema. Permite migrações futuras sem quebrar templates antigos. */
  version: 1
  page: PageConfig
  elements: CanvasElement[]
}

export const DEFAULT_PAGE_CONFIG: PageConfig = {
  size: 'A4',
  orientation: 'portrait',
  margins: { top: 2, bottom: 2, left: 2, right: 2 },
  backgroundImageUrl: null,
}

export function defaultCanvasState(): CanvasState {
  return {
    version: 1,
    page: { ...DEFAULT_PAGE_CONFIG },
    elements: [],
  }
}

/** Dimensões físicas em cm para cada combinação size × orientation. */
export function pageDimensionsCm(page: Pick<PageConfig, 'size' | 'orientation'>): { w: number; h: number } {
  const base = page.size === 'A4'
    ? { w: 21.0, h: 29.7 }
    : { w: 14.8, h: 21.0 }
  return page.orientation === 'portrait' ? base : { w: base.h, h: base.w }
}

export function pageAspect(page: Pick<PageConfig, 'size' | 'orientation'>): number {
  const { w, h } = pageDimensionsCm(page)
  return w / h
}

// ── Validators ───────────────────────────────────────────────────────────────

export function isCanvasState(v: unknown): v is CanvasState {
  if (!v || typeof v !== 'object') return false
  const obj = v as Record<string, unknown>
  if (obj.version !== 1) return false
  if (!obj.page || typeof obj.page !== 'object') return false
  if (!Array.isArray(obj.elements)) return false
  const p = obj.page as Record<string, unknown>
  if (!['A4', 'A5'].includes(p.size as string)) return false
  if (!['portrait', 'landscape'].includes(p.orientation as string)) return false
  if (!p.margins || typeof p.margins !== 'object') return false
  return true
}

/** Sanitiza canvas_state vindo do banco: aplica defaults onde faltar. */
export function hydrateCanvasState(raw: unknown): CanvasState {
  if (isCanvasState(raw)) return raw
  // raw pode ser null/undefined/legacy — devolve default vazio
  return defaultCanvasState()
}
