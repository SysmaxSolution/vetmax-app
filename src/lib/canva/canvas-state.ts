/**
 * canvas_state — fonte da verdade do layout do template.
 *
 * Persistido em document_templates.canvas_state (JSONB, migration 0170).
 * Mesmo schema consumido pelo editor (modo edit) e pelo LaudoPrintable
 * (modo print) — garante paridade pixel-a-pixel.
 */

import type { CanvasElement } from './elements'

/** Tamanhos suportados. 'custom' usa PageConfig.customMm (largura × altura em mm
 *  no sentido RETRATO; a orientação inverte). Etiqueta = 100×50 mm. */
export type PageSize = 'A4' | 'A5' | 'A6' | 'Letter' | 'Etiqueta' | 'custom'
export type PageOrientation = 'portrait' | 'landscape'

/** Presets em mm (retrato). Fonte da verdade para editor, print e jsPDF. */
export const PAGE_PRESETS: Record<Exclude<PageSize, 'custom'>, { label: string; wMm: number; hMm: number }> = {
  A4:       { label: 'A4',       wMm: 210, hMm: 297 },
  A5:       { label: 'A5',       wMm: 148, hMm: 210 },
  A6:       { label: 'A6',       wMm: 105, hMm: 148 },
  Letter:   { label: 'Carta',    wMm: 216, hMm: 279 },
  Etiqueta: { label: 'Etiqueta', wMm: 100, hMm: 50 },
}

export const PAGE_SIZES: PageSize[] = ['A4', 'A5', 'A6', 'Letter', 'Etiqueta', 'custom']

/** Limites do tamanho custom (mm) — evita folhas absurdas no @page/jsPDF. */
export const CUSTOM_PAGE_MM = { min: 30, max: 1200 } as const

export interface PageConfig {
  size: PageSize
  orientation: PageOrientation
  /** Dimensões em mm quando size === 'custom' (no sentido retrato). */
  customMm?: { w: number; h: number } | null
  /** Margens em cm — área segura (guia no editor e ancoragem de cabeçalho/
   *  rodapé da identidade). Não viram margem do @page: a folha é full-bleed
   *  para o papel timbrado cobrir a página inteira. */
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
    customMm: cs.page.customMm ? { ...cs.page.customMm } : null,
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

type PageDims = Pick<PageConfig, 'size' | 'orientation'> & { customMm?: PageConfig['customMm'] }

function clampMm(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(CUSTOM_PAGE_MM.max, Math.max(CUSTOM_PAGE_MM.min, n))
}

/** Dimensões físicas em mm (já com a orientação aplicada). */
export function pageDimensionsMm(page: PageDims): { w: number; h: number } {
  let base: { w: number; h: number }
  if (page.size === 'custom') {
    base = {
      w: clampMm(page.customMm?.w, PAGE_PRESETS.A4.wMm),
      h: clampMm(page.customMm?.h, PAGE_PRESETS.A4.hMm),
    }
  } else {
    const preset = PAGE_PRESETS[page.size] ?? PAGE_PRESETS.A4
    base = { w: preset.wMm, h: preset.hMm }
  }
  return page.orientation === 'landscape' ? { w: base.h, h: base.w } : base
}

/** Dimensões físicas em cm para cada combinação size × orientation. */
export function pageDimensionsCm(page: PageDims): { w: number; h: number } {
  const { w, h } = pageDimensionsMm(page)
  // Arredonda para 2 casas — evita 29.700000000000003 em estilos inline
  return { w: Math.round(w * 10) / 100, h: Math.round(h * 10) / 100 }
}

/** Dimensões em px CSS a 96 dpi — base do html2canvas (A4 = 794 × 1123). */
export function pageDimensionsPx(page: PageDims): { w: number; h: number } {
  const { w, h } = pageDimensionsMm(page)
  return { w: Math.round((w / 25.4) * 96), h: Math.round((h / 25.4) * 96) }
}

export function pageAspect(page: PageDims): number {
  const { w, h } = pageDimensionsMm(page)
  return w / h
}

/** Rótulo humano ("A4 retrato", "Custom 100×150 mm paisagem"). */
export function pageLabel(page: PageDims): string {
  const orient = page.orientation === 'landscape' ? 'paisagem' : 'retrato'
  if (page.size === 'custom') {
    const { w, h } = pageDimensionsMm({ ...page, orientation: 'portrait' })
    return `Personalizado ${w}×${h} mm ${orient}`
  }
  return `${PAGE_PRESETS[page.size]?.label ?? page.size} ${orient}`
}

// ── Validators ───────────────────────────────────────────────────────────────

function isValidPageConfig(p: unknown): boolean {
  if (!p || typeof p !== 'object') return false
  const page = p as Record<string, unknown>
  if (!PAGE_SIZES.includes(page.size as PageSize)) return false
  if (!['portrait', 'landscape'].includes(page.orientation as string)) return false
  if (!page.margins || typeof page.margins !== 'object') return false
  if (page.size === 'custom') {
    const c = page.customMm as Record<string, unknown> | null | undefined
    if (!c || typeof c !== 'object') return false
    if (typeof c.w !== 'number' || typeof c.h !== 'number') return false
  }
  return true
}

export function isCanvasState(v: unknown): v is CanvasState {
  if (!v || typeof v !== 'object') return false
  const obj = v as Record<string, unknown>
  if (obj.version !== 1) return false
  if (!Array.isArray(obj.elements)) return false
  if (!isValidPageConfig(obj.page)) return false
  // extraPages opcional — valida estrutura quando presente
  if (obj.extraPages !== undefined) {
    if (!Array.isArray(obj.extraPages)) return false
    for (const ep of obj.extraPages as unknown[]) {
      if (!ep || typeof ep !== 'object') return false
      const e = ep as Record<string, unknown>
      if (!Array.isArray(e.elements)) return false
      if (!isValidPageConfig(e.page)) return false
    }
  }
  return true
}

/** Hidrata um PageConfig parcial/legado: size desconhecido → A4, margens
 *  faltando → 2 cm, customMm inválido → A4. Nunca lança. */
export function hydratePageConfig(raw: unknown): PageConfig {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const size: PageSize = PAGE_SIZES.includes(p.size as PageSize) ? (p.size as PageSize) : 'A4'
  const orientation: PageOrientation = p.orientation === 'landscape' ? 'landscape' : 'portrait'
  const m = (p.margins && typeof p.margins === 'object' ? p.margins : {}) as Record<string, unknown>
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  const margins = {
    top:    num(m.top,    DEFAULT_PAGE_CONFIG.margins.top),
    bottom: num(m.bottom, DEFAULT_PAGE_CONFIG.margins.bottom),
    left:   num(m.left,   DEFAULT_PAGE_CONFIG.margins.left),
    right:  num(m.right,  DEFAULT_PAGE_CONFIG.margins.right),
  }
  const c = p.customMm as Record<string, unknown> | null | undefined
  const customMm = c && typeof c === 'object' && typeof c.w === 'number' && typeof c.h === 'number'
    ? { w: clampMm(c.w, PAGE_PRESETS.A4.wMm), h: clampMm(c.h, PAGE_PRESETS.A4.hMm) }
    : null
  return {
    size: size === 'custom' && !customMm ? 'A4' : size,
    orientation,
    customMm,
    margins,
    backgroundImageUrl: typeof p.backgroundImageUrl === 'string' ? p.backgroundImageUrl : null,
    backgroundColor: typeof p.backgroundColor === 'string' ? p.backgroundColor : null,
  }
}

/** Sanitiza canvas_state vindo do banco: aplica defaults onde faltar.
 *  Retrocompatível com version 1 sem customMm/size novo. Quando o objeto
 *  tem `elements` (array) mas a page é parcial, hidrata a page em vez de
 *  descartar o layout inteiro. */
export function hydrateCanvasState(raw: unknown): CanvasState {
  if (isCanvasState(raw)) return raw
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    if (Array.isArray(obj.elements)) {
      const extras = Array.isArray(obj.extraPages)
        ? (obj.extraPages as unknown[])
            .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object' && Array.isArray((e as Record<string, unknown>).elements))
            .map(e => ({ page: hydratePageConfig(e.page), elements: e.elements as CanvasElement[] }))
        : undefined
      return {
        version: 1,
        page: hydratePageConfig(obj.page),
        elements: obj.elements as CanvasElement[],
        ...(extras && extras.length > 0 ? { extraPages: extras } : {}),
      }
    }
  }
  // raw pode ser null/undefined/legacy — devolve default vazio
  return defaultCanvasState()
}
