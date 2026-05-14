/**
 * Testa o render-overlay (whiteout + drawText) isolado, sem Supabase.
 * Valida que:
 *   1. drawRectangle (whiteout) e emitido nas coordenadas corretas
 *   2. drawText e emitido logo apos
 *   3. overlay.whiteout=false pula o retangulo branco
 *   4. PDF resultante e valido (re-abrir com pdf-lib funciona)
 */

import { PDFDocument, StandardFonts } from 'pdf-lib'
import { applyOverlayToPage, wrapTextToWidth } from '../../src/lib/pdf/render-overlay'
import { PDF_PAGE } from '../../src/lib/pdf/coordinate-system'
import type { LayoutOverlay } from '../../src/types'

const A4 = PDF_PAGE.A4_PORTRAIT

function makeOverlay(over: Partial<LayoutOverlay> = {}): LayoutOverlay {
  return {
    id: 'ov1',
    type: 'field',
    field_name: 'paciente',
    label: 'Paciente',
    page: 0,
    x_pct: 10, y_pct: 10, w_pct: 30, h_pct: 3,
    font_size: 12,
    font_weight: 'normal',
    font_family: 'Helvetica',
    text_align: 'left',
    ...over,
  }
}

describe('render-overlay', () => {
  describe('wrapTextToWidth', () => {
    const fakeFont = {
      // Aproximacao: cada char = 6pt de largura
      widthOfTextAtSize: (s: string, _sz: number) => s.length * 6,
    }

    it('texto pequeno: linha unica', () => {
      const lines = wrapTextToWidth('Snow', fakeFont, 12, 100)
      expect(lines).toEqual(['Snow'])
    })

    it('texto longo: quebra por palavras', () => {
      const lines = wrapTextToWidth(
        'Cardiomiopatia hipertrofica leve compensada',
        fakeFont, 12, 100,
      )
      expect(lines.length).toBeGreaterThan(1)
      // Cada linha deve caber em 100pt (= ~16 chars)
      for (const l of lines) expect(l.length * 6).toBeLessThanOrEqual(100)
    })

    it('palavra unica maior que maxWidth: quebra brutal', () => {
      const lines = wrapTextToWidth('SUPERCALIFRAGILISTIC', fakeFont, 12, 30)
      expect(lines.length).toBeGreaterThan(1)
    })

    it('texto vazio: retorna []', () => {
      expect(wrapTextToWidth('', fakeFont, 12, 100)).toEqual([])
    })
  })

  describe('applyOverlayToPage (whiteout + drawText)', () => {
    let basePdfBytes: Uint8Array

    beforeAll(async () => {
      const doc = await PDFDocument.create()
      doc.addPage([A4.width_pt, A4.height_pt])
      basePdfBytes = await doc.save()
    })

    it('whiteout default ON: emite drawRectangle + drawText', async () => {
      const pdf = await PDFDocument.load(basePdfBytes)
      const helvetica = await pdf.embedFont(StandardFonts.Helvetica)
      const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold)
      const page = pdf.getPage(0)
      const pageDim = { width_pt: page.getWidth(), height_pt: page.getHeight() }

      // Espia chamadas de drawRectangle e drawText
      const rectSpy = jest.spyOn(page, 'drawRectangle')
      const textSpy = jest.spyOn(page, 'drawText')

      applyOverlayToPage(
        page,
        makeOverlay({ x_pct: 10, y_pct: 20, w_pct: 30, h_pct: 5 }),
        'Snow',
        { helvetica, helveticaBold },
        pageDim,
      )

      expect(rectSpy).toHaveBeenCalledTimes(1)
      expect(textSpy).toHaveBeenCalledTimes(1)

      // Retangulo: cobre o bbox do overlay (~10% x 20% de A4)
      const rectArgs = rectSpy.mock.calls[0][0]!
      expect(rectArgs.x).toBeCloseTo(A4.width_pt * 0.10 - 1, 0)   // -1 margem
      expect(rectArgs.width!).toBeCloseTo(A4.width_pt * 0.30 + 2, 0)
      expect(rectArgs.height!).toBeCloseTo(A4.height_pt * 0.05 + 2, 0)
      // Cor branca
      expect(rectArgs.color).toEqual(expect.objectContaining({
        red: 1, green: 1, blue: 1,
      }))
      // Opacidade total
      expect(rectArgs.opacity).toBe(1)

      // Texto desenhado depois
      const textArgs = textSpy.mock.calls[0]
      expect(textArgs[0]).toBe('Snow')
    })

    it('overlay.whiteout=false: NAO emite drawRectangle', async () => {
      const pdf = await PDFDocument.load(basePdfBytes)
      const helvetica = await pdf.embedFont(StandardFonts.Helvetica)
      const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold)
      const page = pdf.getPage(0)
      const pageDim = { width_pt: page.getWidth(), height_pt: page.getHeight() }

      const rectSpy = jest.spyOn(page, 'drawRectangle')
      const textSpy = jest.spyOn(page, 'drawText')

      applyOverlayToPage(
        page,
        makeOverlay({ whiteout: false }),
        'Snow',
        { helvetica, helveticaBold },
        pageDim,
      )

      expect(rectSpy).not.toHaveBeenCalled()
      expect(textSpy).toHaveBeenCalledTimes(1)
    })

    it('text com word-wrap: 1 retangulo, N drawText (1 por linha)', async () => {
      const pdf = await PDFDocument.load(basePdfBytes)
      const helvetica = await pdf.embedFont(StandardFonts.Helvetica)
      const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold)
      const page = pdf.getPage(0)
      const pageDim = { width_pt: page.getWidth(), height_pt: page.getHeight() }

      const rectSpy = jest.spyOn(page, 'drawRectangle')
      const textSpy = jest.spyOn(page, 'drawText')

      applyOverlayToPage(
        page,
        makeOverlay({ w_pct: 10, font_size: 12 }),  // overlay estreito → wrap
        'Cardiomiopatia hipertrofica leve compensada cronica',
        { helvetica, helveticaBold },
        pageDim,
      )

      expect(rectSpy).toHaveBeenCalledTimes(1)  // 1 whiteout cobre tudo
      expect(textSpy.mock.calls.length).toBeGreaterThan(1)  // N linhas
    })

    it('produz PDF valido (re-abrivel)', async () => {
      const pdf = await PDFDocument.load(basePdfBytes)
      const helvetica = await pdf.embedFont(StandardFonts.Helvetica)
      const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold)
      const page = pdf.getPage(0)
      const pageDim = { width_pt: page.getWidth(), height_pt: page.getHeight() }

      applyOverlayToPage(page, makeOverlay(), 'Snow', { helvetica, helveticaBold }, pageDim)

      const bytes = await pdf.save()
      const reopened = await PDFDocument.load(bytes)
      expect(reopened.getPageCount()).toBe(1)
    })

    it('font_weight=bold: usa helveticaBold', async () => {
      const pdf = await PDFDocument.load(basePdfBytes)
      const helvetica = await pdf.embedFont(StandardFonts.Helvetica)
      const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold)
      const page = pdf.getPage(0)
      const pageDim = { width_pt: page.getWidth(), height_pt: page.getHeight() }

      const textSpy = jest.spyOn(page, 'drawText')

      applyOverlayToPage(
        page,
        makeOverlay({ font_weight: 'bold' }),
        'BOLD',
        { helvetica, helveticaBold },
        pageDim,
      )

      const callArgs = textSpy.mock.calls[0][1]
      expect(callArgs?.font).toBe(helveticaBold)
    })

    it('whiteout respeita bounds da pagina (clamp para nao sair)', async () => {
      const pdf = await PDFDocument.load(basePdfBytes)
      const helvetica = await pdf.embedFont(StandardFonts.Helvetica)
      const helveticaBold = await pdf.embedFont(StandardFonts.HelveticaBold)
      const page = pdf.getPage(0)
      const pageDim = { width_pt: page.getWidth(), height_pt: page.getHeight() }

      const rectSpy = jest.spyOn(page, 'drawRectangle')

      // Overlay no canto superior esquerdo (x=0, y=0)
      applyOverlayToPage(
        page,
        makeOverlay({ x_pct: 0, y_pct: 0, w_pct: 100, h_pct: 100 }),
        'fullpage',
        { helvetica, helveticaBold },
        pageDim,
      )

      const args = rectSpy.mock.calls[0][0]!
      expect(args.x!).toBeGreaterThanOrEqual(0)
      expect(args.y!).toBeGreaterThanOrEqual(0)
      expect(args.x! + args.width!).toBeLessThanOrEqual(pageDim.width_pt + 0.01)
      expect(args.y! + args.height!).toBeLessThanOrEqual(pageDim.height_pt + 0.01)
    })
  })
})
