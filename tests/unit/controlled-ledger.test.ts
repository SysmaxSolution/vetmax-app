/**
 * Unit — Livro de Controlados (razão pura). Item 1.7.
 */
import { movementDelta, buildItemLedger } from '@/lib/controlled/ledger'

describe('movementDelta', () => {
  it('CREDIT = entrada positiva', () => {
    expect(movementDelta('CREDIT', 5)).toEqual({ delta: 5, kind: 'entrada' })
  })
  it('DEBIT = saída negativa', () => {
    expect(movementDelta('DEBIT', 3)).toEqual({ delta: -3, kind: 'saida' })
  })
  it('usa before/after quando disponível (ADJUSTMENT negativo = perda)', () => {
    expect(movementDelta('ADJUSTMENT', 0, 10, 8)).toEqual({ delta: -2, kind: 'perda' })
  })
  it('ADJUSTMENT positivo = ajuste', () => {
    expect(movementDelta('ADJUSTMENT', 0, 8, 10)).toEqual({ delta: 2, kind: 'ajuste' })
  })
  it('before/after tem prioridade sobre quantity_change', () => {
    expect(movementDelta('DEBIT', 99, 10, 7).delta).toBe(-3)
  })
})

describe('buildItemLedger', () => {
  const events = [
    { date: '2026-08-01', delta: 10, kind: 'entrada' as const },   // antes de `from` → saldo inicial
    { date: '2026-09-05', delta: -3, kind: 'saida' as const },
    { date: '2026-09-10', delta: -1, kind: 'perda' as const },
    { date: '2026-09-15', delta: 5,  kind: 'entrada' as const },
  ]
  const led = buildItemLedger(events, '2026-09-01')

  it('saldo inicial = eventos antes de `from`', () => {
    expect(led.opening).toBe(10)
  })
  it('só inclui eventos do período na razão', () => {
    expect(led.entries).toHaveLength(3)
  })
  it('saldo corrente acumula corretamente', () => {
    expect(led.entries.map(e => e.balance)).toEqual([7, 6, 11])
  })
  it('totais de entrada/saída/perda separados', () => {
    expect(led.total_in).toBe(5)
    expect(led.total_out).toBe(3)
    expect(led.total_loss).toBe(1)
    expect(led.closing).toBe(11)
  })
  it('ordena por data mesmo se vier fora de ordem', () => {
    const l2 = buildItemLedger([
      { date: '2026-09-15', delta: 5, kind: 'entrada' as const },
      { date: '2026-09-05', delta: -3, kind: 'saida' as const },
    ], '2026-09-01')
    expect(l2.entries.map(e => e.date)).toEqual(['2026-09-05', '2026-09-15'])
  })
})
