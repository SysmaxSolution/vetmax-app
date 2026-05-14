/**
 * Teste isolado do motor pdf-lib SEM dependencia de Supabase.
 * Valida que:
 *   1. Conseguimos abrir um PDF existente, adicionar texto e re-salvar
 *   2. Coordenadas do coordinate-system.ts produzem posicionamentos corretos
 *   3. PDF resultante e valido (re-abrir com pdf-lib funciona)
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import {
  PDF_PAGE, overlayToDrawTextPoint, overlayToPdfBox,
} from '../../src/lib/pdf/coordinate-system'

describe('pdf-lib engine (integracao com coordinate-system)', () => {
  let basePdfBytes: Uint8Array

  beforeAll(async () => {
    // Cria um PDF A4 vazio "template" como base
    const doc = await PDFDocument.create()
    doc.addPage([PDF_PAGE.A4_PORTRAIT.width_pt, PDF_PAGE.A4_PORTRAIT.height_pt])
    basePdfBytes = await doc.save()
  })

  it('abre PDF base, desenha texto e re-salva sem corromper', async () => {
    const pdf = await PDFDocument.load(basePdfBytes)
    const font = await pdf.embedFont(StandardFonts.Helvetica)

    const page = pdf.getPage(0)
    const { width, height } = page.getSize()
    expect(width).toBeCloseTo(PDF_PAGE.A4_PORTRAIT.width_pt, 1)
    expect(height).toBeCloseTo(PDF_PAGE.A4_PORTRAIT.height_pt, 1)

    // Desenha "Paciente" no canto superior esquerdo (10% x, 5% y)
    const point = overlayToDrawTextPoint(
      { x_pct: 10, y_pct: 5, w_pct: 30, h_pct: 3 },
      PDF_PAGE.A4_PORTRAIT,
      { size_pt: 12, family: 'Helvetica' },
    )
    page.drawText('Paciente: Snow', {
      x: point.x, y: point.y, size: 12, font, color: rgb(0, 0, 0),
    })

    const bytes = await pdf.save()
    expect(bytes.length).toBeGreaterThan(basePdfBytes.length)

    // Reabre e confirma que e um PDF valido
    const reopened = await PDFDocument.load(bytes)
    expect(reopened.getPageCount()).toBe(1)
  })

  it('drawText posicao bottom-left de pdf-lib corresponde a coordenadas top-left do overlay', async () => {
    const pdf = await PDFDocument.load(basePdfBytes)
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const page = pdf.getPage(0)
    const pageDim = { width_pt: page.getWidth(), height_pt: page.getHeight() }

    // Overlay no topo absoluto (y=0%) deve ter baseline proximo do topo da pagina
    const topPoint = overlayToDrawTextPoint(
      { x_pct: 0, y_pct: 0, w_pct: 100, h_pct: 5 },
      pageDim,
      { size_pt: 12, family: 'Helvetica' },
    )
    // baseline em pdf-lib = page_height - ascender
    expect(topPoint.y).toBeCloseTo(pageDim.height_pt - 12 * 0.718, 1)

    // Overlay no fim (y=95%) deve ter baseline perto do bottom
    const bottomPoint = overlayToDrawTextPoint(
      { x_pct: 0, y_pct: 95, w_pct: 100, h_pct: 5 },
      pageDim,
      { size_pt: 12, family: 'Helvetica' },
    )
    expect(bottomPoint.y).toBeLessThan(topPoint.y)
    expect(bottomPoint.y).toBeCloseTo(pageDim.height_pt - 0.95 * pageDim.height_pt - 12 * 0.718, 1)

    // Desenha ambos no PDF
    page.drawText('TOP', { x: topPoint.x, y: topPoint.y, size: 12, font })
    page.drawText('BOTTOM', { x: bottomPoint.x, y: bottomPoint.y, size: 12, font })

    const bytes = await pdf.save()
    const reopened = await PDFDocument.load(bytes)
    expect(reopened.getPageCount()).toBe(1)
  })

  it('alinhamento center: x calculado pela largura medida da fonte', async () => {
    const pdf = await PDFDocument.load(basePdfBytes)
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const page = pdf.getPage(0)
    const pageDim = { width_pt: page.getWidth(), height_pt: page.getHeight() }

    const text = 'LAUDO VETERINARIO'
    const size = 18
    const textWidth = font.widthOfTextAtSize(text, size)

    const point = overlayToDrawTextPoint(
      { x_pct: 0, y_pct: 5, w_pct: 100, h_pct: 5 },
      pageDim,
      { size_pt: size, family: 'Helvetica' },
      'center',
      textWidth,
    )

    // x deve estar centralizado na pagina
    expect(point.x).toBeCloseTo((pageDim.width_pt - textWidth) / 2, 1)

    page.drawText(text, { x: point.x, y: point.y, size, font })
    const bytes = await pdf.save()
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('alinhamento right: x = direita do overlay - largura do texto', async () => {
    const pdf = await PDFDocument.load(basePdfBytes)
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const page = pdf.getPage(0)
    const pageDim = { width_pt: page.getWidth(), height_pt: page.getHeight() }

    const text = '20/05/2026'
    const size = 11
    const textWidth = font.widthOfTextAtSize(text, size)

    const point = overlayToDrawTextPoint(
      { x_pct: 60, y_pct: 10, w_pct: 30, h_pct: 3 },
      pageDim,
      { size_pt: size, family: 'Helvetica' },
      'right',
      textWidth,
    )

    // overlay vai de 60% a 90% da largura
    const overlayRightEdge = 0.9 * pageDim.width_pt
    expect(point.x).toBeCloseTo(overlayRightEdge - textWidth, 1)
  })

  it('multi-pagina: drawText em paginas diferentes nao se confundem', async () => {
    // Cria PDF de 2 paginas
    const doc = await PDFDocument.create()
    doc.addPage([PDF_PAGE.A4_PORTRAIT.width_pt, PDF_PAGE.A4_PORTRAIT.height_pt])
    doc.addPage([PDF_PAGE.A4_PORTRAIT.width_pt, PDF_PAGE.A4_PORTRAIT.height_pt])
    const bytes = await doc.save()

    const reload = await PDFDocument.load(bytes)
    const font = await reload.embedFont(StandardFonts.Helvetica)

    expect(reload.getPageCount()).toBe(2)
    const p1 = reload.getPage(0)
    const p2 = reload.getPage(1)

    const point = overlayToDrawTextPoint(
      { x_pct: 50, y_pct: 50, w_pct: 30, h_pct: 5 },
      PDF_PAGE.A4_PORTRAIT,
      { size_pt: 12, family: 'Helvetica' },
    )

    p1.drawText('PAGINA 1', { x: point.x, y: point.y, size: 12, font })
    p2.drawText('PAGINA 2', { x: point.x, y: point.y, size: 12, font })

    const finalBytes = await reload.save()
    const reopened = await PDFDocument.load(finalBytes)
    expect(reopened.getPageCount()).toBe(2)
  })

  it('overlayToPdfBox: drawRectangle no overlay completo cobre a pagina', async () => {
    const pdf = await PDFDocument.load(basePdfBytes)
    const page = pdf.getPage(0)
    const pageDim = { width_pt: page.getWidth(), height_pt: page.getHeight() }

    const box = overlayToPdfBox({ x_pct: 0, y_pct: 0, w_pct: 100, h_pct: 100 }, pageDim)
    expect(box.x).toBe(0)
    expect(box.y).toBeCloseTo(0, 1)
    expect(box.width).toBeCloseTo(pageDim.width_pt, 1)
    expect(box.height).toBeCloseTo(pageDim.height_pt, 1)

    // drawRectangle nao deve falhar
    page.drawRectangle({
      x: box.x, y: box.y, width: box.width, height: box.height,
      color: rgb(1, 1, 0.9), opacity: 0.2,
    })

    const bytes = await pdf.save()
    expect(bytes.length).toBeGreaterThan(basePdfBytes.length)
  })
})
