/**
 * Canva Nativo — tipos do motor HTML-to-PDF (ROTA A).
 *
 * Não mistura com Pixel Perfect overlay (LayoutOverlay) nem com docx-native:
 * o renderizador escolhe o motor pelo presença de background_image_url.
 */

export type CanvaBlockStyle = 'solid' | 'transparent'

export interface CanvaDynamicField {
  key: string
  value: string
}

export interface CanvaStaticFields {
  medicamentos?: string
  posologia?: string
  observacoes?: string
  [k: string]: string | undefined
}

export interface CanvaContentJson {
  static_fields: CanvaStaticFields
  dynamic_fields: CanvaDynamicField[]
}

export interface CanvaMargins {
  top: number     // cm
  bottom: number  // cm
  left: number    // cm
  right: number   // cm
}

export interface CanvaTemplateConfig {
  background_image_url: string | null
  margins: CanvaMargins
  block_style: CanvaBlockStyle
}

export const CANVA_DEFAULT_MARGINS: CanvaMargins = {
  top: 2.0, bottom: 2.0, left: 2.0, right: 2.0,
}

export const CANVA_MIN_MARGIN_CM = 0
export const CANVA_MAX_MARGIN_CM = 5
export const CANVA_MARGIN_STEP_CM = 0.1

/** A4 em centímetros (paisagem padrão veterinário usa vertical). */
export const A4_CM = { width: 21.0, height: 29.7 }
export const A4_ASPECT = A4_CM.width / A4_CM.height  // ≈ 0.7071 (1/√2)

export function emptyContent(): CanvaContentJson {
  return { static_fields: {}, dynamic_fields: [] }
}

export function isCanvaTemplate(t: { background_image_url?: string | null }): boolean {
  return !!t.background_image_url
}

export function validateContent(c: unknown): c is CanvaContentJson {
  if (!c || typeof c !== 'object') return false
  const obj = c as Record<string, unknown>
  if (!obj.static_fields || typeof obj.static_fields !== 'object') return false
  if (!Array.isArray(obj.dynamic_fields)) return false
  return obj.dynamic_fields.every(
    f => f && typeof f === 'object'
      && typeof (f as CanvaDynamicField).key === 'string'
      && typeof (f as CanvaDynamicField).value === 'string',
  )
}
