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
  /** Cor de fundo da folha. Renderizada ANTES do papel timbrado — funciona
   *  como base sólida quando não há imagem, ou como tinta translúcida quando
   *  há (depende da opacidade da cor escolhida). */
  backgroundColor?: string | null
}

/** Página adicional do template (página 2, 3, ...). A página 1 fica em
 *  CanvasState.page + CanvasState.elements para preservar backwards-compat
 *  com canvas_state legados (sem multi-page). */
export interface ExtraPage {
  page: PageConfig
  elements: CanvasElement[]
}

export interface CanvasState {
  /** Versão do schema. Permite migrações futuras sem quebrar templates antigos. */
  version: 1
  page: PageConfig
  elements: CanvasElement[]
  /** Páginas 2..N. Quando ausente/vazio, template é single-page (legado). */
  extraPages?: ExtraPage[]
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

/** Total de páginas (página 1 + extras). Sempre ≥ 1. */
export function pageCount(cs: CanvasState): number {
  return 1 + (cs.extraPages?.length ?? 0)
}

/** Retorna page+elements de uma página por index (0 = página 1). */
export function getPage(cs: CanvasState, index: number): { page: PageConfig; elements: CanvasElement[] } {
  if (index === 0) return { page: cs.page, elements: cs.elements }
  const extra = cs.extraPages?.[index - 1]
  if (!extra) throw new Error(`Página ${index + 1} não existe (total: ${pageCount(cs)})`)
  return { page: extra.page, elements: extra.elements }
}

/** Itera todas as páginas em ordem (0..N-1). Usado por LaudoPrintable. */
export function getAllPages(cs: CanvasState): Array<{ page: PageConfig; elements: CanvasElement[]; index: number }> {
  const result: Array<{ page: PageConfig; elements: CanvasElement[]; index: number }> = [
    { page: cs.page, elements: cs.elements, index: 0 },
  ]
  for (let i = 0; i < (cs.extraPages?.length ?? 0); i++) {
    const e = cs.extraPages![i]
    result.push({ page: e.page, elements: e.elements, index: i + 1 })
  }
  return result
}

/** Substitui page+elements de uma página (immutable). Index 0 = página 1. */
export function setPage(
  cs: CanvasState,
  index: number,
  next: { page: PageConfig; elements: CanvasElement[] },
): CanvasState {
  if (index === 0) {
    return { ...cs, page: next.page, elements: next.elements }
  }
  const extras = [...(cs.extraPages ?? [])]
  if (!extras[index - 1]) throw new Error(`Página ${index + 1} não existe`)
  extras[index - 1] = { page: next.page, elements: next.elements }
  return { ...cs, extraPages: extras }
}

/** Adiciona uma página em branco no final. Retorna [novo state, index da nova]. */
export function addPage(
  cs: CanvasState,
  pageConfig?: Partial<PageConfig>,
): [CanvasState, number] {
  // Herda size/orientation da página 1 — coerente para documento multi-folha
  const base: PageConfig = {
    ...DEFAULT_PAGE_CONFIG,
    size: cs.page.size,
    orientation: cs.page.orientation,
    margins: { ...cs.page.margins },
    backgroundImageUrl: null,
    ...pageConfig,
  }
  const extras = [...(cs.extraPages ?? []), { page: base, elements: [] as CanvasElement[] }]
  return [{ ...cs, extraPages: extras }, extras.length]
}

/** Remove a página por index. Não permite excluir a página 1 (precisa ter ≥ 1). */
export function removePage(cs: CanvasState, index: number): CanvasState {
  if (index === 0) throw new Error('A página 1 não pode ser excluída')
  const extras = [...(cs.extraPages ?? [])]
  if (!extras[index - 1]) throw new Error(`Página ${index + 1} não existe`)
  extras.splice(index - 1, 1)
  return { ...cs, extraPages: extras.length > 0 ? extras : undefined }
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
  // extraPages opcional — valida estrutura quando presente
  if (obj.extraPages !== undefined) {
    if (!Array.isArray(obj.extraPages)) return false
    for (const ep of obj.extraPages as unknown[]) {
      if (!ep || typeof ep !== 'object') return false
      const e = ep as Record<string, unknown>
      if (!e.page || typeof e.page !== 'object' || !Array.isArray(e.elements)) return false
      const ep_p = e.page as Record<string, unknown>
      if (!['A4', 'A5'].includes(ep_p.size as string)) return false
      if (!['portrait', 'landscape'].includes(ep_p.orientation as string)) return false
    }
  }
  return true
}

/** Sanitiza canvas_state vindo do banco: aplica defaults onde faltar. */
export function hydrateCanvasState(raw: unknown): CanvasState {
  if (isCanvasState(raw)) return raw
  // raw pode ser null/undefined/legacy — devolve default vazio
  return defaultCanvasState()
}
