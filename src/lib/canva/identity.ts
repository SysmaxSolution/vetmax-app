/**
 * Identidade documental da clínica (módulo PURO).
 *
 * Configuração única por clínica (tabela clinic_document_identity, 0467)
 * que descreve logo, cabeçalho, rodapé, cores, fonte, página e assinatura
 * padrão. `buildIdentityElements()` transforma a configuração em elementos
 * do Canvas (cabeçalho/rodapé PINADOS — repetem em todas as páginas) e
 * `applyIdentityToState()` os insere/substitui num canvas_state.
 *
 * Elementos gerados têm id com prefixo `el_identity_` — assim "Aplicar
 * identidade" de novo substitui os anteriores sem duplicar.
 */

import type { CanvasState, PageConfig, PageOrientation, PageSize } from './canvas-state'
import { DEFAULT_PAGE_CONFIG, hydratePageConfig, pageDimensionsCm } from './canvas-state'
import type { CanvasElement, TextElement } from './elements'
import {
  makeTextElement, makeLineElement, makeDynamicImageElement, makeDynamicTagElement,
  makeQrValidationElement, DEFAULT_TYPOGRAPHY,
} from './elements'
import { DEFAULT_FONT_FAMILY } from './fonts'

export const IDENTITY_ID_PREFIX = 'el_identity_'

export interface DocumentIdentity {
  version: 1
  colors: { primary: string; secondary: string; text: string }
  defaultFontFamily: string
  defaultPage: {
    size: PageSize
    orientation: PageOrientation
    customMm?: { w: number; h: number } | null
    margins: PageConfig['margins']
  }
  header: {
    enabled: boolean
    showLogo: boolean
    logoPosition: 'left' | 'right'
    /** Linhas de texto — aceitam tokens {{clinica.name}} etc. */
    lines: string[]
    showDivider: boolean
  }
  footer: {
    enabled: boolean
    text: string
    showPageNumber: boolean
    showQr: boolean
    showDivider: boolean
  }
  signature: {
    enabled: boolean
    showImage: boolean
    showCrmv: boolean
  }
}

export const DEFAULT_IDENTITY: DocumentIdentity = {
  version: 1,
  colors: { primary: '#0f172a', secondary: '#64748b', text: '#0f172a' },
  defaultFontFamily: DEFAULT_FONT_FAMILY,
  defaultPage: {
    size: 'A4', orientation: 'portrait', customMm: null,
    margins: { ...DEFAULT_PAGE_CONFIG.margins },
  },
  header: {
    enabled: true,
    showLogo: true,
    logoPosition: 'left',
    lines: [
      '{{clinica.name}}',
      '{{clinica.address}} · {{clinica.city_state}}',
      'CNPJ {{clinica.cnpj}} · Tel. {{clinica.phone}}',
    ],
    showDivider: true,
  },
  footer: {
    enabled: true,
    text: '{{clinica.name}} · {{clinica.phone}} · Documento emitido em {{consulta.datetime}}',
    showPageNumber: true,
    showQr: true,
    showDivider: true,
  },
  signature: { enabled: true, showImage: true, showCrmv: true },
}

const HEX = /^#[0-9a-f]{3,8}$/i

/** Hidrata um JSON arbitrário para DocumentIdentity (nunca lança). */
export function hydrateIdentity(raw: unknown): DocumentIdentity {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const d = DEFAULT_IDENTITY
  const color = (v: unknown, fb: string) => (typeof v === 'string' && HEX.test(v) ? v : fb)
  const bool = (v: unknown, fb: boolean) => (typeof v === 'boolean' ? v : fb)
  const str = (v: unknown, fb: string) => (typeof v === 'string' ? v : fb)
  const page = hydratePageConfig({ ...d.defaultPage, ...(r.defaultPage ?? {}) })
  const lines = Array.isArray(r.header?.lines)
    ? (r.header.lines as unknown[]).filter((l): l is string => typeof l === 'string').slice(0, 5)
    : d.header.lines
  return {
    version: 1,
    colors: {
      primary:   color(r.colors?.primary,   d.colors.primary),
      secondary: color(r.colors?.secondary, d.colors.secondary),
      text:      color(r.colors?.text,      d.colors.text),
    },
    defaultFontFamily: str(r.defaultFontFamily, d.defaultFontFamily) || d.defaultFontFamily,
    defaultPage: {
      size: page.size, orientation: page.orientation, customMm: page.customMm ?? null, margins: page.margins,
    },
    header: {
      enabled:      bool(r.header?.enabled, d.header.enabled),
      showLogo:     bool(r.header?.showLogo, d.header.showLogo),
      logoPosition: r.header?.logoPosition === 'right' ? 'right' : 'left',
      lines,
      showDivider:  bool(r.header?.showDivider, d.header.showDivider),
    },
    footer: {
      enabled:        bool(r.footer?.enabled, d.footer.enabled),
      text:           str(r.footer?.text, d.footer.text),
      showPageNumber: bool(r.footer?.showPageNumber, d.footer.showPageNumber),
      showQr:         bool(r.footer?.showQr, d.footer.showQr),
      showDivider:    bool(r.footer?.showDivider, d.footer.showDivider),
    },
    signature: {
      enabled:   bool(r.signature?.enabled, d.signature.enabled),
      showImage: bool(r.signature?.showImage, d.signature.showImage),
      showCrmv:  bool(r.signature?.showCrmv, d.signature.showCrmv),
    },
  }
}

export function isIdentityElement(el: CanvasElement): boolean {
  return el.id.startsWith(IDENTITY_ID_PREFIX)
}

let seq = 0
function idFor(part: string): string {
  seq += 1
  return `${IDENTITY_ID_PREFIX}${part}_${Date.now().toString(36)}_${seq}`
}

/** PageConfig derivado da identidade (para modelos novos). */
export function identityPageConfig(identity: DocumentIdentity): PageConfig {
  return hydratePageConfig({
    size: identity.defaultPage.size,
    orientation: identity.defaultPage.orientation,
    customMm: identity.defaultPage.customMm ?? null,
    margins: { ...identity.defaultPage.margins },
    backgroundImageUrl: null,
  })
}

/**
 * Gera os elementos da identidade posicionados em % da folha informada
 * (as margens em cm viram % de acordo com o tamanho real da página).
 * Cabeçalho/rodapé saem pinados; assinatura fica livre (só página 1).
 */
export function buildIdentityElements(identity: DocumentIdentity, page: PageConfig): CanvasElement[] {
  const { w: pageW, h: pageH } = pageDimensionsCm(page)
  const pct = (cm: number, total: number) => Math.max(0, Math.min(100, (cm / total) * 100))
  const mL = pct(page.margins.left, pageW)
  const mR = pct(page.margins.right, pageW)
  const mT = pct(page.margins.top, pageH)
  const mB = pct(page.margins.bottom, pageH)
  const innerW = Math.max(10, 100 - mL - mR)
  const font = identity.defaultFontFamily
  const base = { ...DEFAULT_TYPOGRAPHY, fontFamily: font, color: identity.colors.text }
  const out: CanvasElement[] = []

  // ── Cabeçalho ────────────────────────────────────────────────────────────
  if (identity.header.enabled) {
    const logoW = pct(2.8, pageW)      // logo ≈ 2,8 cm de largura
    const logoH = pct(2.0, pageH)      // ≈ 2,0 cm de altura
    const hasLogo = identity.header.showLogo
    const textX = hasLogo && identity.header.logoPosition === 'left' ? mL + logoW + 1.5 : mL
    const textW = hasLogo ? innerW - logoW - 1.5 : innerW
    const lineH = pct(0.5, pageH)      // 0,5 cm por linha

    if (hasLogo) {
      const logo = makeDynamicImageElement('clinic.logo')
      out.push({
        ...logo,
        id: idFor('logo'),
        box: { x: identity.header.logoPosition === 'left' ? mL : 100 - mR - logoW, y: mT, w: logoW, h: logoH },
        pin: 'header',
        fallbackText: '',
      })
    }
    identity.header.lines.forEach((line, i) => {
      if (!line.trim()) return
      out.push(makeTextElement({
        id: idFor(`header_${i}`),
        content: line,
        box: { x: textX, y: mT + i * lineH, w: textW, h: lineH },
        pin: 'header',
        typography: {
          ...base,
          fontSize: i === 0 ? 12 : 8,
          fontWeight: i === 0 ? 700 : 400,
          color: i === 0 ? identity.colors.primary : identity.colors.secondary,
          lineHeight: 1.2,
          align: hasLogo && identity.header.logoPosition === 'right' ? 'left' : 'left',
        },
      }))
    })
    if (identity.header.showDivider) {
      const yDiv = mT + Math.max(logoH, identity.header.lines.length * lineH) + 0.6
      out.push(makeLineElement('horizontal', {
        id: idFor('header_line'),
        box: { x: mL, y: yDiv, w: innerW, h: 0.2 },
        thickness: 1, color: identity.colors.primary, pin: 'header',
      }))
    }
  }

  // ── Rodapé ───────────────────────────────────────────────────────────────
  if (identity.footer.enabled) {
    const footH = pct(0.45, pageH)
    const yFoot = 100 - mB - footH
    const qrSide = pct(2.2, pageW)
    const qrH = pct(2.2 + 0.6, pageH)
    const qrX = 100 - mR - qrSide
    const textW = identity.footer.showQr ? innerW - qrSide - 1.5 : innerW
    const pageNumW = 18

    if (identity.footer.showDivider) {
      out.push(makeLineElement('horizontal', {
        id: idFor('footer_line'),
        box: { x: mL, y: yFoot - 0.5, w: identity.footer.showQr ? textW : innerW, h: 0.2 },
        thickness: 0.8, color: identity.colors.secondary, pin: 'footer',
      }))
    }
    if (identity.footer.text.trim()) {
      out.push(makeTextElement({
        id: idFor('footer_text'),
        content: identity.footer.text,
        box: { x: mL, y: yFoot, w: identity.footer.showPageNumber ? textW - pageNumW : textW, h: footH },
        pin: 'footer',
        typography: { ...base, fontSize: 7, color: identity.colors.secondary, lineHeight: 1.2 },
      }))
    }
    if (identity.footer.showPageNumber) {
      out.push(makeTextElement({
        id: idFor('footer_page'),
        content: 'Pág. {{doc.page}} de {{doc.total_pages}}',
        box: { x: mL + textW - pageNumW, y: yFoot, w: pageNumW, h: footH },
        pin: 'footer',
        typography: { ...base, fontSize: 7, color: identity.colors.secondary, align: 'right' },
      }))
    }
    if (identity.footer.showQr) {
      out.push(makeQrValidationElement({
        id: idFor('footer_qr'),
        box: { x: qrX, y: 100 - mB - qrH, w: qrSide, h: qrH },
        pin: 'footer',
        typography: { ...base, fontSize: 5.5, color: identity.colors.secondary, align: 'center' },
      }))
    }
  }

  // ── Assinatura do MV (página 1, acima do rodapé) ─────────────────────────
  if (identity.signature.enabled) {
    const sigW = 46
    const sigX = (100 - sigW) / 2
    const lineY = 100 - mB - pct(2.6, pageH)
    if (identity.signature.showImage) {
      const img = makeDynamicImageElement('vet.signature')
      out.push({ ...img, id: idFor('sig_img'), box: { x: sigX + 8, y: lineY - pct(1.8, pageH), w: sigW - 16, h: pct(1.7, pageH) }, fallbackText: '' })
    }
    out.push(makeLineElement('horizontal', {
      id: idFor('sig_line'), box: { x: sigX, y: lineY, w: sigW, h: 0.2 }, thickness: 0.8, color: identity.colors.text,
    }))
    out.push(makeDynamicTagElement('vet.name', {
      id: idFor('sig_name'), box: { x: sigX, y: lineY + 0.3, w: sigW, h: pct(0.45, pageH) },
      typography: { ...base, fontSize: 9, fontWeight: 600, align: 'center' },
    }))
    if (identity.signature.showCrmv) {
      out.push(makeDynamicTagElement('vet.crmv', {
        id: idFor('sig_crmv'), prefix: 'CRMV ',
        box: { x: sigX, y: lineY + 0.3 + pct(0.45, pageH), w: sigW, h: pct(0.4, pageH) },
        typography: { ...base, fontSize: 8, align: 'center', color: identity.colors.secondary },
      }))
    }
  }

  return out
}

/**
 * Aplica a identidade num canvas_state: remove elementos de identidade
 * anteriores (prefixo) e insere os novos na página 1. Se o state estiver
 * vazio (modelo novo) também adota a página padrão da identidade.
 */
export function applyIdentityToState(cs: CanvasState, identity: DocumentIdentity, opts?: { adoptPage?: boolean }): CanvasState {
  const isEmpty = cs.elements.length === 0 && !(cs.extraPages?.length)
  const page = opts?.adoptPage ?? isEmpty ? identityPageConfig(identity) : cs.page
  const kept = cs.elements.filter(el => !isIdentityElement(el))
  const built = buildIdentityElements(identity, page)
  const maxZ = kept.reduce((acc, e) => Math.max(acc, e.zIndex ?? 1), 0)
  const stamped = built.map((el, i) => ({ ...el, zIndex: maxZ + i + 1 }))
  return { ...cs, page, elements: [...kept, ...stamped] }
}

/** Fonte padrão aplicada a elementos de texto sem fontFamily explícita. */
export function defaultTypographyFor(identity: DocumentIdentity): TextElement['typography'] {
  return { ...DEFAULT_TYPOGRAPHY, fontFamily: identity.defaultFontFamily, color: identity.colors.text }
}
