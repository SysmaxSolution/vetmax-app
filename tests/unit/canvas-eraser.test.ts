/**
 * Operacao Zero-Touch — Canvas Eraser.
 *
 * Testa apenas a matematica pura (rectPctToPixelsClamped). O eraseRegions em si
 * depende de HTMLCanvasElement DOM e nao e testado no jsdom — sera coberto
 * pelos testes E2E (laudo gerado visual).
 */

import { rectPctToPixelsClamped } from '../../src/lib/pdf/canvas-eraser'

describe('rectPctToPixelsClamped', () => {
  it('converte % em pixels com bleed de 1px', () => {
    const r = rectPctToPixelsClamped(
      { x_pct: 10, y_pct: 20, w_pct: 30, h_pct: 5 },
      1000, 800,
    )
    expect(r).not.toBeNull()
    // x_px = 100, bleed -1
    expect(r!.x).toBe(99)
    // y_px = 160, bleed -1
    expect(r!.y).toBe(159)
    // w_px = 300, bleed +2
    expect(r!.w).toBe(302)
    // h_px = 40, bleed +2
    expect(r!.h).toBe(42)
  })

  it('clampa contra a borda esquerda (x_pct = 0)', () => {
    const r = rectPctToPixelsClamped(
      { x_pct: 0, y_pct: 0, w_pct: 50, h_pct: 50 },
      1000, 800,
    )
    expect(r).not.toBeNull()
    expect(r!.x).toBe(0)
    expect(r!.y).toBe(0)
  })

  it('clampa contra a borda direita (x + w nao excede canvas)', () => {
    const r = rectPctToPixelsClamped(
      { x_pct: 95, y_pct: 95, w_pct: 10, h_pct: 10 },
      1000, 800,
    )
    expect(r).not.toBeNull()
    expect(r!.x + r!.w).toBeLessThanOrEqual(1000)
    expect(r!.y + r!.h).toBeLessThanOrEqual(800)
  })

  it('regiao degenerada (w<=0 ou h<=0) retorna null', () => {
    expect(rectPctToPixelsClamped({ x_pct: 10, y_pct: 10, w_pct: 0, h_pct: 5 }, 100, 100)).toBeNull()
    expect(rectPctToPixelsClamped({ x_pct: 10, y_pct: 10, w_pct: 5, h_pct: 0 }, 100, 100)).toBeNull()
    expect(rectPctToPixelsClamped({ x_pct: 10, y_pct: 10, w_pct: -1, h_pct: 5 }, 100, 100)).toBeNull()
  })

  it('regiao 100x100 em canvas 100x100: cobre tudo (clampado)', () => {
    const r = rectPctToPixelsClamped(
      { x_pct: 0, y_pct: 0, w_pct: 100, h_pct: 100 },
      100, 100,
    )
    expect(r).not.toBeNull()
    expect(r!.x).toBe(0)
    expect(r!.y).toBe(0)
    expect(r!.w).toBe(100)
    expect(r!.h).toBe(100)
  })
})
