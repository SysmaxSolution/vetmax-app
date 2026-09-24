// Tema do Portal do Tutor por clínica (white-label). Lógica PURA, sem I/O —
// testável isoladamente e reutilizável no servidor, no cliente e nos scripts.
//
// Princípio: NENHUMA cor do portal nasce fixa no JSX. Tudo sai daqui como
// variável CSS (`--pt-*`). O padrão é exatamente a paleta que o portal já usava
// (verde-pinho + dourado + Fraunces), para que clínica nenhuma fique feia por
// não ter configurado nada.

// ── Fontes de título permitidas (conjunto seguro) ────────────────────────────
// Lista fechada de propósito: a fonte é carregada por `next/font` em tempo de
// build, então um valor livre digitado pelo admin não teria como ser servido.
export const PORTAL_HEADING_FONTS = [
  { id: 'fraunces', label: 'Fraunces (padrão)', stack: 'var(--font-pt-fraunces), Georgia, serif' },
  { id: 'playfair', label: 'Playfair Display',  stack: 'var(--font-pt-playfair), Georgia, serif' },
  { id: 'lora',     label: 'Lora',              stack: 'var(--font-pt-lora), Georgia, serif' },
  { id: 'dm-serif', label: 'DM Serif Display',  stack: 'var(--font-pt-dmserif), Georgia, serif' },
  { id: 'inter',    label: 'Inter (sem serifa)', stack: 'var(--font-pt-inter), system-ui, sans-serif' },
] as const

export type PortalHeadingFontId = (typeof PORTAL_HEADING_FONTS)[number]['id']

export function isHeadingFontId(v: unknown): v is PortalHeadingFontId {
  return typeof v === 'string' && PORTAL_HEADING_FONTS.some(f => f.id === v)
}

export function headingFontStack(id: PortalHeadingFontId): string {
  return (PORTAL_HEADING_FONTS.find(f => f.id === id) ?? PORTAL_HEADING_FONTS[0]).stack
}

// ── Tema ─────────────────────────────────────────────────────────────────────
export interface PortalTheme {
  /** Fundo da página. */
  bgColor: string
  /** Cartões/superfícies. */
  surfaceColor: string
  /** Cor primária da marca (títulos de seção, links, ícones). */
  primaryColor: string
  /** Tom escuro da primária — base do herói e dos blocos sólidos. */
  primaryDarkColor: string
  /** Acento (dourado no padrão): filetes, anéis, botão de ação. */
  accentColor: string
  /** Texto principal. */
  textColor: string
  /** Texto secundário. */
  mutedColor: string
  /** Traços/bordas. */
  borderColor: string
  /** Fonte dos títulos. */
  headingFont: PortalHeadingFontId
  /** Imagem de capa opcional do herói (URL pública). */
  coverImageUrl: string | null
  /** Frase curta acima do título do herói ("Portal do Tutor" por padrão). */
  tagline: string | null
}

export const DEFAULT_PORTAL_THEME: PortalTheme = {
  bgColor:          '#F6F5F1',
  surfaceColor:     '#FFFFFF',
  primaryColor:     '#17624A',
  primaryDarkColor: '#0E3B2E',
  accentColor:      '#C9A96A',
  textColor:        '#16221C',
  mutedColor:       '#6A7A72',
  borderColor:      '#EDE9E0',
  headingFont:      'fraunces',
  coverImageUrl:    null,
  tagline:          null,
}

/** Linha crua vinda de `clinic_portal_themes` (snake_case, tudo opcional). */
export interface PortalThemeRow {
  bg_color?: string | null
  surface_color?: string | null
  primary_color?: string | null
  primary_dark_color?: string | null
  accent_color?: string | null
  text_color?: string | null
  muted_color?: string | null
  border_color?: string | null
  heading_font?: string | null
  cover_image_url?: string | null
  tagline?: string | null
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && HEX_RE.test(v.trim())
}

/** Normaliza para #RRGGBB maiúsculo; devolve `fallback` se não for hex válido. */
export function sanitizeHex(v: unknown, fallback: string): string {
  if (!isHexColor(v)) return fallback
  let h = (v as string).trim().toUpperCase()
  if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]
  return h
}

/** Só aceita http(s) — bloqueia `javascript:`/`data:` vindos do formulário. */
export function sanitizeImageUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  if (!/^https?:\/\//i.test(s)) return null
  return s.slice(0, 2000)
}

/**
 * Resolve o tema efetivo: campo a campo, o que a clínica configurou; o resto,
 * o padrão. Uma linha ausente (clínica que nunca abriu a tela) resulta no tema
 * padrão inteiro — é o que garante que ninguém fica sem identidade.
 */
export function resolvePortalTheme(row: PortalThemeRow | null | undefined): PortalTheme {
  const d = DEFAULT_PORTAL_THEME
  if (!row) return { ...d }
  const tagline = typeof row.tagline === 'string' && row.tagline.trim() ? row.tagline.trim().slice(0, 60) : null
  return {
    bgColor:          sanitizeHex(row.bg_color, d.bgColor),
    surfaceColor:     sanitizeHex(row.surface_color, d.surfaceColor),
    primaryColor:     sanitizeHex(row.primary_color, d.primaryColor),
    primaryDarkColor: sanitizeHex(row.primary_dark_color, d.primaryDarkColor),
    accentColor:      sanitizeHex(row.accent_color, d.accentColor),
    textColor:        sanitizeHex(row.text_color, d.textColor),
    mutedColor:       sanitizeHex(row.muted_color, d.mutedColor),
    borderColor:      sanitizeHex(row.border_color, d.borderColor),
    headingFont:      isHeadingFontId(row.heading_font) ? row.heading_font : d.headingFont,
    coverImageUrl:    sanitizeImageUrl(row.cover_image_url),
    tagline,
  }
}

// ── Derivações de cor (puras) ────────────────────────────────────────────────
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = sanitizeHex(hex, '#000000').slice(1)
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/** Mistura `a` com `b`; `weight` = quanto de `b` entra (0..1). */
export function mixHex(a: string, b: string, weight: number): string {
  const w = Math.min(1, Math.max(0, weight))
  const A = hexToRgb(a), B = hexToRgb(b)
  const ch = (x: number, y: number) => Math.round(x + (y - x) * w).toString(16).padStart(2, '0').toUpperCase()
  return `#${ch(A.r, B.r)}${ch(A.g, B.g)}${ch(A.b, B.b)}`
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${Math.min(1, Math.max(0, alpha))})`
}

/** Luminância relativa — decide se o texto sobre a cor é claro ou escuro. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const f = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function readableOn(hex: string): string {
  return relativeLuminance(hex) > 0.45 ? '#16221C' : '#FFFFFF'
}

/**
 * Converte o tema no conjunto de variáveis CSS que o portal consome.
 *
 * As variantes com alfa são calculadas AQUI (e não com o modificador `/50` do
 * Tailwind) porque o valor da cor vem de uma variável em tempo de execução —
 * pré-calcular o rgba deixa o resultado determinístico em qualquer navegador.
 */
export function portalThemeCssVars(theme: PortalTheme): Record<string, string> {
  const t = theme
  const primaryMid = mixHex(t.primaryDarkColor, t.primaryColor, 0.5)
  return {
    '--pt-bg':            t.bgColor,
    '--pt-surface':       t.surfaceColor,
    '--pt-primary':       t.primaryColor,
    '--pt-primary-dark':  t.primaryDarkColor,
    '--pt-primary-mid':   primaryMid,
    '--pt-on-primary':    readableOn(t.primaryDarkColor),
    '--pt-accent':        t.accentColor,
    '--pt-accent-light':  mixHex(t.accentColor, '#FFFFFF', 0.25),
    '--pt-accent-strong': mixHex(t.accentColor, '#000000', 0.35),
    '--pt-on-accent':     readableOn(t.accentColor),
    '--pt-accent-ring':   rgba(t.accentColor, 0.6),
    '--pt-accent-soft':   rgba(t.accentColor, 0.5),
    '--pt-accent-line':   rgba(t.accentColor, 0.4),
    '--pt-accent-faint':  rgba(t.accentColor, 0.15),
    '--pt-text':          t.textColor,
    '--pt-text-soft':     mixHex(t.textColor, t.mutedColor, 0.55),
    '--pt-muted':         t.mutedColor,
    '--pt-muted-soft':    mixHex(t.mutedColor, t.bgColor, 0.45),
    '--pt-faint':         mixHex(t.mutedColor, t.bgColor, 0.7),
    '--pt-border':        t.borderColor,
    '--pt-border-soft':   mixHex(t.borderColor, t.surfaceColor, 0.5),
    '--pt-tint':          mixHex(t.bgColor, t.surfaceColor, 0.5),
    '--pt-heading-font':  headingFontStack(t.headingFont),
  }
}

// ── Slug da clínica (contexto na URL) ────────────────────────────────────────
const SLUG_MAX = 40

/** Nome da clínica → slug de URL. Sem acento, sem símbolo, sem hífen duplo. */
export function slugifyClinicName(name: string | null | undefined): string {
  const base = (name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '')
  return base || 'clinica'
}

/** Aceita apenas slugs já no formato canônico (validação de entrada de URL). */
export function isValidClinicSlug(v: unknown): v is string {
  return typeof v === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length >= 2 && v.length <= SLUG_MAX
}

/**
 * Resolve colisão: `animais`, `animais-2`, `animais-3`… O sufixo respeita o
 * limite de tamanho, então o corte acontece na base, nunca no número.
 */
export function uniqueClinicSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken))
  const root = slugifyClinicName(base)
  if (!used.has(root)) return root
  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`
    const cand = root.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, '') + suffix
    if (!used.has(cand)) return cand
  }
  return `${root.slice(0, SLUG_MAX - 7)}-${Date.now().toString(36).slice(-5)}`
}
