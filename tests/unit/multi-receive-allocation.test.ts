/**
 * Unit — Épico B/C3 (reunião 04/06/2026): recebimento múltiplo no caixa.
 *
 * Decisão Q3 do PO: um pagamento na maquininha, mas Contas a Receber
 * SEPARADO por fatura — os splits são alocados sequencialmente entre as
 * faturas e cada uma é baixada individualmente.
 *
 * TC-C3-001..007 → allocateSplitsSequentially (src/lib/multi-receive-allocation.ts)
 */

import { allocateSplitsSequentially } from '@/lib/multi-receive-allocation'

const inv = (id: string, due: number) => ({ id, due })
const split = (amount: number, extra: Record<string, unknown> = {}) => ({ amount, payment_method: 'pix', ...extra })

describe('multi-receive — allocateSplitsSequentially', () => {
  test('TC-C3-001 → cenário da reunião: consulta + venda do mesmo tutor, um pagamento único', () => {
    // "fez uma consulta, comprou o petisco e a casinha — deu 140, recebo num pique só"
    const alloc = allocateSplitsSequentially(
      [inv('consulta', 75.75), inv('venda', 64.25)],
      [split(140)],
    )
    expect(alloc.get('consulta')).toEqual([expect.objectContaining({ amount: 75.75 })])
    expect(alloc.get('venda')).toEqual([expect.objectContaining({ amount: 64.25 })])
  })

  test('TC-C3-002 → split que atravessa faturas é dividido (mesmo NSU nas duas)', () => {
    const alloc = allocateSplitsSequentially(
      [inv('a', 100), inv('b', 50)],
      [split(150, { card_nsu: 'NSU123' })],
    )
    expect(alloc.get('a')![0]).toMatchObject({ amount: 100, card_nsu: 'NSU123' })
    expect(alloc.get('b')![0]).toMatchObject({ amount: 50,  card_nsu: 'NSU123' })
  })

  test('TC-C3-003 → múltiplos splits sequenciais (cartão + dinheiro)', () => {
    const alloc = allocateSplitsSequentially(
      [inv('a', 80), inv('b', 70)],
      [split(100, { payment_method: 'credit' }), split(50, { payment_method: 'cash' })],
    )
    // cartão: 80 quita a; 20 vão para b. dinheiro: 50 completam b.
    expect(alloc.get('a')).toEqual([expect.objectContaining({ amount: 80, payment_method: 'credit' })])
    expect(alloc.get('b')).toEqual([
      expect.objectContaining({ amount: 20, payment_method: 'credit' }),
      expect.objectContaining({ amount: 50, payment_method: 'cash' }),
    ])
  })

  test('TC-C3-004 → soma alocada por fatura cobre exatamente o saldo', () => {
    const invoices = [inv('a', 33.33), inv('b', 66.67), inv('c', 12.5)]
    const alloc = allocateSplitsSequentially(invoices, [split(50), split(62.5)])
    for (const i of invoices) {
      const sum = (alloc.get(i.id) ?? []).reduce((s, p) => s + (p.amount as number), 0)
      expect(sum).toBeCloseTo(i.due, 2)
    }
  })

  test('TC-C3-005 → tutores diferentes não muda a mecânica (Q3: permitido com aviso na UI)', () => {
    const alloc = allocateSplitsSequentially(
      [inv('tutor1-consulta', 30), inv('tutor2-banho', 45)],
      [split(75)],
    )
    expect(alloc.get('tutor1-consulta')![0].amount).toBe(30)
    expect(alloc.get('tutor2-banho')![0].amount).toBe(45)
  })

  test('TC-C3-006 → sobra de centavos vai para a última fatura (fecha a conta)', () => {
    const alloc = allocateSplitsSequentially(
      [inv('a', 10), inv('b', 10)],
      [split(20.01)],
    )
    const sumB = (alloc.get('b') ?? []).reduce((s, p) => s + (p.amount as number), 0)
    expect(sumB).toBeCloseTo(10.01, 2)
  })

  test('TC-C3-007 → listas vazias não explodem', () => {
    expect(allocateSplitsSequentially([], [split(10)]).size).toBe(0)
    const alloc = allocateSplitsSequentially([inv('a', 10)], [])
    expect(alloc.get('a')).toEqual([])
  })
})
