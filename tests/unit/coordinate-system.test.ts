import {
  PDF_PAGE,
  pctRectToCssStyle,
  pctRectToPixelRect,
  pixelRectToPctRect,
  overlayToDrawTextPoint,
  overlayToPdfBox,
  pxToPt,
  ptToPx,
  detectPagePreset,
  ascenderRatio,
  clamp,
} from '../../src/lib/pdf/coordinate-system'

describe('coordinate-system', () => {
  const A4 = PDF_PAGE.A4_PORTRAIT  // 595.28 x 841.89

  describe('clamp', () => {
    it('limita valor inferior e superior', () => {
      expect(clamp(-5, 0, 100)).toBe(0)
      expect(clamp(150, 0, 100)).toBe(100)
      expect(clamp(50, 0, 100)).toBe(50)
    })
  })

  describe('pctRectToCssStyle', () => {
    it('gera estilo CSS com posicionamento absoluto em %', () => {
      const style = pctRectToCssStyle({ x_pct: 10, y_pct: 20, w_pct: 30, h_pct: 5 })
      expect(style).toEqual({
        position: 'absolute',
        left: '10%', top: '20%', width: '30%', height: '5%',
      })
    })
  })

  describe('pctRectToPixelRect / pixelRectToPctRect', () => {
    it('round-trip preserva valores', () => {
      const original = { x_pct: 25, y_pct: 40, w_pct: 30, h_pct: 5 }
      const container = { width: 800, height: 1131 }   // ~A4 ratio
      const px = pctRectToPixelRect(original, container)
      const back = pixelRectToPctRect(px, container)
      expect(back.x_pct).toBeCloseTo(25, 5)
      expect(back.y_pct).toBeCloseTo(40, 5)
      expect(back.w_pct).toBeCloseTo(30, 5)
      expect(back.h_pct).toBeCloseTo(5, 5)
    })

    it('clampa valores de pixel fora do container', () => {
      const back = pixelRectToPctRect(
        { x: -10, y: 1200, width: 1000, height: 100 },
        { width: 800, height: 1131 },
      )
      expect(back.x_pct).toBe(0)
      expect(back.y_pct).toBe(100)
      expect(back.w_pct).toBe(100)
    })
  })

  describe('overlayToDrawTextPoint', () => {
    it('campo no canto superior esquerdo: y invertido com ascender', () => {
      const rect = { x_pct: 0, y_pct: 0, w_pct: 100, h_pct: 5 }
      const font = { size_pt: 12, family: 'Helvetica' as const }
      const p = overlayToDrawTextPoint(rect, A4, font)
      // x: começo da página
      expect(p.x).toBeCloseTo(0, 3)
      // baseline: 0 + 12 * 0.718 = 8.616 do topo
      // y de baixo: 841.89 - 8.616 = 833.274
      expect(p.y).toBeCloseTo(841.89 - 12 * 0.718, 2)
    })

    it('campo no meio: x e y absolutos corretos', () => {
      const rect = { x_pct: 50, y_pct: 50, w_pct: 20, h_pct: 5 }
      const font = { size_pt: 10, family: 'Helvetica' as const }
      const p = overlayToDrawTextPoint(rect, A4, font)
      expect(p.x).toBeCloseTo(297.64, 2)  // 50% de 595.28
      // y de cima: 50% de 841.89 = 420.945, + ascender 7.18
      // y de baixo: 841.89 - 428.125 = 413.765
      expect(p.y).toBeCloseTo(841.89 - 420.945 - 10 * 0.718, 2)
    })

    it('align center: x deslocado pela largura do texto', () => {
      const rect = { x_pct: 0, y_pct: 0, w_pct: 100, h_pct: 5 }
      const font = { size_pt: 12, family: 'Helvetica' as const }
      const textWidth = 100
      const p = overlayToDrawTextPoint(rect, A4, font, 'center', textWidth)
      // overlay full width = 595.28, texto = 100, center → x = (595.28 - 100) / 2
      expect(p.x).toBeCloseTo((595.28 - 100) / 2, 2)
    })

    it('align right: x deslocado para o fim do overlay', () => {
      const rect = { x_pct: 10, y_pct: 0, w_pct: 50, h_pct: 5 }
      const font = { size_pt: 12, family: 'Helvetica' as const }
      const textWidth = 50
      const p = overlayToDrawTextPoint(rect, A4, font, 'right', textWidth)
      // overlay: left=59.528, width=297.64, texto=50
      // right edge = 357.168, x = 357.168 - 50 = 307.168
      expect(p.x).toBeCloseTo((10 / 100) * 595.28 + (50 / 100) * 595.28 - 50, 2)
    })

    it('A4 landscape: dimensões trocadas', () => {
      const land = PDF_PAGE.A4_LANDSCAPE
      const rect = { x_pct: 50, y_pct: 50, w_pct: 20, h_pct: 5 }
      const font = { size_pt: 12, family: 'Helvetica' as const }
      const p = overlayToDrawTextPoint(rect, land, font)
      expect(p.x).toBeCloseTo(land.width_pt * 0.5, 2)
      expect(p.y).toBeCloseTo(land.height_pt - land.height_pt * 0.5 - 12 * 0.718, 2)
    })
  })

  describe('overlayToPdfBox', () => {
    it('caixa do overlay com origem bottom-left', () => {
      const rect = { x_pct: 10, y_pct: 10, w_pct: 30, h_pct: 20 }
      const box = overlayToPdfBox(rect, A4)
      expect(box.x).toBeCloseTo(59.528, 2)
      expect(box.width).toBeCloseTo(178.584, 2)
      expect(box.height).toBeCloseTo(168.378, 2)
      // top da overlay em points = 84.189, height = 168.378
      // y bottom = 841.89 - 84.189 - 168.378 = 589.323
      expect(box.y).toBeCloseTo(841.89 - 84.189 - 168.378, 2)
    })

    it('overlay full page produz box igual ao page', () => {
      const box = overlayToPdfBox({ x_pct: 0, y_pct: 0, w_pct: 100, h_pct: 100 }, A4)
      expect(box.x).toBe(0)
      expect(box.y).toBeCloseTo(0, 3)
      expect(box.width).toBeCloseTo(A4.width_pt, 2)
      expect(box.height).toBeCloseTo(A4.height_pt, 2)
    })
  })

  describe('pxToPt / ptToPx', () => {
    it('round-trip preserva tamanho', () => {
      const px = 14
      const containerW = 800
      const pt = pxToPt(px, containerW, A4)
      const back = ptToPx(pt, containerW, A4)
      expect(back).toBeCloseTo(px, 5)
    })

    it('14px num container de 800 vira ~10.42pt em A4', () => {
      // 14 * (595.28 / 800) = 14 * 0.7441 = 10.4174
      expect(pxToPt(14, 800, A4)).toBeCloseTo(10.4174, 3)
    })
  })

  describe('detectPagePreset', () => {
    it('reconhece A4 retrato', () => {
      expect(detectPagePreset({ width_pt: 595.28, height_pt: 841.89 })).toBe('A4_PORTRAIT')
    })
    it('reconhece A4 paisagem', () => {
      expect(detectPagePreset({ width_pt: 841.89, height_pt: 595.28 })).toBe('A4_LANDSCAPE')
    })
    it('reconhece Letter', () => {
      expect(detectPagePreset({ width_pt: 612, height_pt: 792 })).toBe('LETTER')
    })
    it('CUSTOM para dimensões fora do padrão', () => {
      expect(detectPagePreset({ width_pt: 500, height_pt: 700 })).toBe('CUSTOM')
    })
  })

  describe('ascenderRatio', () => {
    it('Helvetica = 0.718', () => {
      expect(ascenderRatio({ size_pt: 12, family: 'Helvetica' })).toBe(0.718)
    })
    it('Times = 0.683', () => {
      expect(ascenderRatio({ size_pt: 12, family: 'Times' })).toBe(0.683)
    })
    it('Courier = 0.629', () => {
      expect(ascenderRatio({ size_pt: 12, family: 'Courier' })).toBe(0.629)
    })
    it('ratio explícito sobrescreve family', () => {
      expect(ascenderRatio({ size_pt: 12, family: 'Helvetica', ascender_ratio: 0.9 })).toBe(0.9)
    })
    it('fallback default 0.718 quando sem family', () => {
      expect(ascenderRatio({ size_pt: 12 })).toBe(0.718)
    })
  })
})
