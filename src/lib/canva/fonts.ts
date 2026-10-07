/**
 * Catálogo de fontes do motor de layouts (módulo PURO — sem next/font).
 *
 * Duas origens:
 *   1. Padrão do sistema — Google Fonts embutidas via next/font (CanvaFontsScope
 *      define `--canva-font-<slug>`) + fontes de sistema (Arial, Times…).
 *   2. Da clínica — arquivos TTF/OTF/WOFF2 no bucket `clinic-fonts`,
 *      registrados em `clinic_fonts` e injetados como @font-face.
 *
 * `fontFamilyCss()` monta o valor de `font-family` com fallback stack. Para
 * as Google Fonts usa `var(--canva-font-x, "Nome")` — se o scope não estiver
 * montado (ex.: preview fora do editor) cai no nome puro sem invalidar a
 * declaração.
 */

export type StandardFontKind = 'google' | 'system'

export interface StandardFontDef {
  family: string
  kind: StandardFontKind
  /** Slug da CSS var (`--canva-font-<slug>`) — só para kind='google'. */
  slug?: string
  generic: 'sans-serif' | 'serif' | 'monospace'
}

export const STANDARD_FONTS: StandardFontDef[] = [
  { family: 'Inter',           kind: 'google', slug: 'inter',        generic: 'sans-serif' },
  { family: 'Roboto',          kind: 'google', slug: 'roboto',       generic: 'sans-serif' },
  { family: 'Open Sans',       kind: 'google', slug: 'open-sans',    generic: 'sans-serif' },
  { family: 'Lato',            kind: 'google', slug: 'lato',         generic: 'sans-serif' },
  { family: 'Montserrat',      kind: 'google', slug: 'montserrat',   generic: 'sans-serif' },
  { family: 'Merriweather',    kind: 'google', slug: 'merriweather', generic: 'serif' },
  { family: 'Arial',           kind: 'system', generic: 'sans-serif' },
  { family: 'Helvetica',       kind: 'system', generic: 'sans-serif' },
  { family: 'Times New Roman', kind: 'system', generic: 'serif' },
  { family: 'Georgia',         kind: 'system', generic: 'serif' },
  { family: 'Courier New',     kind: 'system', generic: 'monospace' },
]

export const DEFAULT_FONT_FAMILY = 'Inter'

/** Fonte enviada pela clínica (shape que o cliente recebe da action). */
export interface ClinicFontFace {
  id: string
  family_name: string
  /** Signed URL de leitura (1 ano). */
  url: string
  format: 'truetype' | 'opentype' | 'woff' | 'woff2'
  font_weight: number
  font_style: 'normal' | 'italic'
}

export function findStandardFont(family: string | undefined): StandardFontDef | undefined {
  if (!family) return undefined
  const f = family.trim().toLowerCase()
  return STANDARD_FONTS.find(s => s.family.toLowerCase() === f)
}

/** Valor CSS de font-family com fallback stack. */
export function fontFamilyCss(family: string | undefined, clinicFonts?: ReadonlyArray<Pick<ClinicFontFace, 'family_name'>>): string {
  const name = (family ?? DEFAULT_FONT_FAMILY).trim() || DEFAULT_FONT_FAMILY
  const std = findStandardFont(name)
  const quoted = `"${name.replace(/"/g, '')}"`
  if (std?.kind === 'google' && std.slug) {
    return `var(--canva-font-${std.slug}, ${quoted}), ${quoted}, system-ui, ${std.generic}`
  }
  if (std) return `${quoted}, ${std.generic}`
  const isClinic = clinicFonts?.some(f => f.family_name.toLowerCase() === name.toLowerCase())
  // Fonte da clínica (ou desconhecida): confia no @font-face injetado.
  return `${quoted}, ${isClinic ? 'system-ui, ' : ''}sans-serif`
}

/** Lista unificada para selects (padrão + clínica, sem duplicar nomes). */
export function fontOptions(clinicFonts?: ReadonlyArray<Pick<ClinicFontFace, 'family_name'>>): Array<{ family: string; source: 'padrao' | 'clinica' }> {
  const seen = new Set<string>()
  const out: Array<{ family: string; source: 'padrao' | 'clinica' }> = []
  for (const f of clinicFonts ?? []) {
    const k = f.family_name.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ family: f.family_name, source: 'clinica' })
  }
  for (const s of STANDARD_FONTS) {
    const k = s.family.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ family: s.family, source: 'padrao' })
  }
  return out
}

/** Regras @font-face para as fontes da clínica (uma por variante). */
export function buildClinicFontFaceCss(fonts: ReadonlyArray<ClinicFontFace>): string {
  return fonts.map(f => {
    const fam = f.family_name.replace(/["\\]/g, '')
    return `@font-face{font-family:"${fam}";src:url("${f.url}") format("${f.format}");font-weight:${f.font_weight};font-style:${f.font_style};font-display:block;}`
  }).join('\n')
}

/** Extensão → formato @font-face. Retorna null se não suportado. */
export function fontFormatFromFilename(filename: string): ClinicFontFace['format'] | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ttf':   return 'truetype'
    case 'otf':   return 'opentype'
    case 'woff':  return 'woff'
    case 'woff2': return 'woff2'
    default:      return null
  }
}

export const CLINIC_FONT_MAX_BYTES = 5 * 1024 * 1024
