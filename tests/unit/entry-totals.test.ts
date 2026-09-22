/**
 * Unit — Totalizador do rodapé (A Receber/Pagar). Corrige o descasamento:
 * cancelados fora, valor líquido, separação em aberto × baixado.
 */
import { sumByStatus } from '@/lib/finance/entry-totals'

const ENTRIES = [
  { status: 'pending', amount: 100, discount: 10 },
  { status: 'pending', amount: 50 },
  { status: 'paid',    amount: 200 },
  { status: 'cancelled', amount: 999 },
]

describe('sumByStatus', () => {
  it('soma em aberto (líquido, sem cancelados)', () => {
    expect(sumByStatus(ENTRIES, 'pending')).toBe(140)  // 90 + 50
  })
  it('soma baixados', () => {
    expect(sumByStatus(ENTRIES, 'paid')).toBe(200)
  })
  it('ignora cancelados completamente', () => {
    expect(sumByStatus([{ status: 'cancelled', amount: 999 }], 'pending')).toBe(0)
    expect(sumByStatus([{ status: 'cancelled', amount: 999 }], 'paid')).toBe(0)
  })
  it('aplica desconto no valor', () => {
    expect(sumByStatus([{ status: 'pending', amount: 100, discount: 25 }], 'pending')).toBe(75)
  })
  it('lista vazia → 0', () => {
    expect(sumByStatus([], 'pending')).toBe(0)
  })
})
