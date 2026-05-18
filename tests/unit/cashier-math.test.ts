/**
 * Unit — Cashier Math (utilities financeiras)
 * Implementações inline de funções comumente usadas no Caixa Central VetMax.
 *
 * TC-CSH-001..025 → floating-point safety, BRL formatting, parcelas, NaN/Infinity.
 */

// ─── Implementações ──────────────────────────────────────────────────────────

function roundToCents(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.round(v * 100) / 100
}

function sumEntries(entries: number[]): number {
  const total = entries.reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0)
  return roundToCents(total)
}

function applyDiscount(amount: number, discount: number): number {
  if (!Number.isFinite(amount)) return 0
  const d = Number.isFinite(discount) ? discount : 0
  const result = amount - d
  return result < 0 ? 0 : roundToCents(result)
}

function splitInstallments(total: number, count: number): number[] {
  if (count <= 0 || !Number.isFinite(total)) return []
  const base = Math.floor((total * 100) / count) / 100
  const parts = new Array(count).fill(base)
  const sumBase = roundToCents(base * count)
  const remainder = roundToCents(total - sumBase)
  parts[parts.length - 1] = roundToCents(parts[parts.length - 1] + remainder)
  return parts
}

function formatBRL(value: number): string {
  if (!Number.isFinite(value)) return 'R$ 0,00'
  const v = roundToCents(value)
  const negative = v < 0
  const abs = Math.abs(v)
  const [int, frac = '00'] = abs.toFixed(2).split('.')
  const intWithThousands = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negative ? '-' : ''}R$ ${intWithThousands},${frac.padEnd(2, '0')}`
}

// ─── TC-CSH-001..006: roundToCents ───────────────────────────────────────────

describe('cashier — roundToCents', () => {
  test('TC-CSH-001 → 0.1 + 0.2 arredondado → 0.3 (floating-point safe)', () => {
    expect(roundToCents(0.1 + 0.2)).toBe(0.3)
  })

  test('TC-CSH-002 → 1.005 arredonda half-up → 1.01 (ou 1.00 dependendo da implementação)', () => {
    // Math.round() em JS: half-even-like para alguns floats por causa de binary representation.
    // 1.005 em binário = 1.00499..., Math.round(100.499...) = 100. Aceitamos qualquer um dos dois.
    const r = roundToCents(1.005)
    expect([1.0, 1.01]).toContain(r)
  })

  test('TC-CSH-003 → valor inteiro mantém 2 casas internas (100 → 100)', () => {
    expect(roundToCents(100)).toBe(100)
  })

  test('TC-CSH-004 → NaN → 0 (safe)', () => {
    expect(roundToCents(NaN)).toBe(0)
  })

  test('TC-CSH-005 → Infinity → 0 (safe)', () => {
    expect(roundToCents(Infinity)).toBe(0)
  })

  test('TC-CSH-006 → negativo -1.236 → -1.24', () => {
    expect(roundToCents(-1.236)).toBe(-1.24)
  })
})

// ─── TC-CSH-007..010: sumEntries ─────────────────────────────────────────────

describe('cashier — sumEntries', () => {
  test('TC-CSH-007 → soma simples [10, 20, 30] = 60', () => {
    expect(sumEntries([10, 20, 30])).toBe(60)
  })

  test('TC-CSH-008 → floating-point [0.1, 0.2] = 0.3', () => {
    expect(sumEntries([0.1, 0.2])).toBe(0.3)
  })

  test('TC-CSH-009 → array vazio → 0', () => {
    expect(sumEntries([])).toBe(0)
  })

  test('TC-CSH-010 → NaN intercalado é ignorado [10, NaN, 20] = 30', () => {
    expect(sumEntries([10, NaN, 20])).toBe(30)
  })
})

// ─── TC-CSH-011..014: applyDiscount ──────────────────────────────────────────

describe('cashier — applyDiscount (clamp)', () => {
  test('TC-CSH-011 → 100 - 20 = 80', () => {
    expect(applyDiscount(100, 20)).toBe(80)
  })

  test('TC-CSH-012 → discount > amount → clamp em 0', () => {
    expect(applyDiscount(50, 100)).toBe(0)
  })

  test('TC-CSH-013 → discount = amount → 0', () => {
    expect(applyDiscount(50, 50)).toBe(0)
  })

  test('TC-CSH-014 → NaN amount → 0', () => {
    expect(applyDiscount(NaN, 10)).toBe(0)
  })
})

// ─── TC-CSH-015..018: splitInstallments ─────────────────────────────────────

describe('cashier — splitInstallments', () => {
  test('TC-CSH-015 → 100 em 3 = [33.33, 33.33, 33.34]', () => {
    expect(splitInstallments(100, 3)).toEqual([33.33, 33.33, 33.34])
  })

  test('TC-CSH-016 → 100 em 4 = [25, 25, 25, 25]', () => {
    expect(splitInstallments(100, 4)).toEqual([25, 25, 25, 25])
  })

  test('TC-CSH-017 → 0 parcelas → array vazio', () => {
    expect(splitInstallments(100, 0)).toEqual([])
  })

  test('TC-CSH-018 → soma das parcelas = total (sempre)', () => {
    const total = 1234.56
    const parts = splitInstallments(total, 7)
    expect(roundToCents(parts.reduce((a, b) => a + b, 0))).toBe(total)
  })
})

// ─── TC-CSH-019..025: formatBRL ──────────────────────────────────────────────

describe('cashier — formatBRL', () => {
  test('TC-CSH-019 → 1234.56 → "R$ 1.234,56"', () => {
    expect(formatBRL(1234.56)).toBe('R$ 1.234,56')
  })

  test('TC-CSH-020 → 0 → "R$ 0,00"', () => {
    expect(formatBRL(0)).toBe('R$ 0,00')
  })

  test('TC-CSH-021 → 0.5 → "R$ 0,50"', () => {
    expect(formatBRL(0.5)).toBe('R$ 0,50')
  })

  test('TC-CSH-022 → 1000000 → "R$ 1.000.000,00"', () => {
    expect(formatBRL(1000000)).toBe('R$ 1.000.000,00')
  })

  test('TC-CSH-023 → valor negativo -50 → "-R$ 50,00"', () => {
    expect(formatBRL(-50)).toBe('-R$ 50,00')
  })

  test('TC-CSH-024 → NaN → "R$ 0,00" (safe)', () => {
    expect(formatBRL(NaN)).toBe('R$ 0,00')
  })

  test('TC-CSH-025 → 99.9 → "R$ 99,90" (pad zero)', () => {
    expect(formatBRL(99.9)).toBe('R$ 99,90')
  })
})
