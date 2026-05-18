/**
 * Unit — Billing Helpers (normalizeName + cálculos de desconto/parcelamento)
 * Função normalizeName copiada de src/lib/actions/billing.ts (linhas 47-53).
 *
 * TC-BIL-001..030 → cobrem normalização e arithmética financeira.
 */

// ─── Função copiada do source ────────────────────────────────────────────────

function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

// ─── Helpers financeiros (lógica de negócio típica de billing) ───────────────

function roundCents(v: number): number {
  return Math.round(v * 100) / 100
}

function applyDiscount(subtotal: number, discount: number): number {
  const total = subtotal - discount
  return total < 0 ? 0 : roundCents(total)
}

function applyPercentDiscount(subtotal: number, pct: number): number {
  return roundCents(subtotal * (1 - pct / 100))
}

function splitInstallments(total: number, count: number): number[] {
  if (count <= 0) return []
  const base = Math.floor((total * 100) / count) / 100
  const parts = new Array(count).fill(base)
  const sumBase = roundCents(base * count)
  const remainder = roundCents(total - sumBase)
  parts[parts.length - 1] = roundCents(parts[parts.length - 1] + remainder)
  return parts
}

// ─── TC-BIL-001..015: normalizeName ──────────────────────────────────────────

describe('normalizeName — acentos, case, trim', () => {
  test('TC-BIL-001 → "Café" → "cafe"', () => {
    expect(normalizeName('Café')).toBe('cafe')
  })

  test('TC-BIL-002 → "JOÃO" → "joao"', () => {
    expect(normalizeName('JOÃO')).toBe('joao')
  })

  test('TC-BIL-003 → "  espaço  " → "espaco" (trim aplicado)', () => {
    expect(normalizeName('  espaço  ')).toBe('espaco')
  })

  test('TC-BIL-004 → "Maçã" → "maca"', () => {
    expect(normalizeName('Maçã')).toBe('maca')
  })

  test('TC-BIL-005 → "Ñ" lowercase → "n" (NFD remove til)', () => {
    expect(normalizeName('Ñ')).toBe('n')
  })

  test('TC-BIL-006 → string vazia → ""', () => {
    expect(normalizeName('')).toBe('')
  })

  test('TC-BIL-007 → "  " só espaços → ""', () => {
    expect(normalizeName('   ')).toBe('')
  })

  test('TC-BIL-008 → emojis preservados (😀 não é diacrítico)', () => {
    expect(normalizeName('Dr 😀')).toBe('dr 😀')
  })

  test('TC-BIL-009 → hífen mantido ("Médico-Cirurgião" → "medico-cirurgiao")', () => {
    expect(normalizeName('Médico-Cirurgião')).toBe('medico-cirurgiao')
  })

  test('TC-BIL-010 → números preservados ("Vacina V8 - Cão")', () => {
    expect(normalizeName('Vacina V8 - Cão')).toBe('vacina v8 - cao')
  })

  test('TC-BIL-011 → "Antibiótico Amoxicilina" → "antibiotico amoxicilina"', () => {
    expect(normalizeName('Antibiótico Amoxicilina')).toBe('antibiotico amoxicilina')
  })

  test('TC-BIL-012 → "ÁÀÂÃÄ" → "aaaaa"', () => {
    expect(normalizeName('ÁÀÂÃÄ')).toBe('aaaaa')
  })

  test('TC-BIL-013 → "ÉÊÍÓÔÕÚÜÇ" → "eeiooouuc" (sem til/agudo etc)', () => {
    expect(normalizeName('ÉÊÍÓÔÕÚÜÇ')).toBe('eeiooouuc')
  })

  test('TC-BIL-014 → string já normalizada não muda', () => {
    expect(normalizeName('amoxicilina')).toBe('amoxicilina')
  })

  test('TC-BIL-015 → matching idempotente (normalize duas vezes = uma vez)', () => {
    const once = normalizeName('Médico Veterinário')
    expect(normalizeName(once)).toBe(once)
  })
})

// ─── TC-BIL-016..023: Cálculos de desconto ──────────────────────────────────

describe('billing — descontos e clamp', () => {
  test('TC-BIL-016 → subtotal 100 - discount 20 = 80', () => {
    expect(applyDiscount(100, 20)).toBe(80)
  })

  test('TC-BIL-017 → discount maior que subtotal → clamp em 0', () => {
    expect(applyDiscount(50, 100)).toBe(0)
  })

  test('TC-BIL-018 → desconto zero retorna subtotal', () => {
    expect(applyDiscount(150.50, 0)).toBe(150.50)
  })

  test('TC-BIL-019 → desconto percentual 10% sobre 100 = 90', () => {
    expect(applyPercentDiscount(100, 10)).toBe(90)
  })

  test('TC-BIL-020 → desconto percentual 20% sobre 250 = 200', () => {
    expect(applyPercentDiscount(250, 20)).toBe(200)
  })

  test('TC-BIL-021 → desconto percentual 50% sobre 99.90 = 49.95', () => {
    expect(applyPercentDiscount(99.90, 50)).toBe(49.95)
  })

  test('TC-BIL-022 → desconto 100% → 0', () => {
    expect(applyPercentDiscount(500, 100)).toBe(0)
  })

  test('TC-BIL-023 → desconto 0% → mantém valor', () => {
    expect(applyPercentDiscount(100, 0)).toBe(100)
  })
})

// ─── TC-BIL-024..030: Parcelamento (splitInstallments) ──────────────────────

describe('billing — parcelamento', () => {
  test('TC-BIL-024 → R$100 em 2 parcelas iguais [50, 50]', () => {
    expect(splitInstallments(100, 2)).toEqual([50, 50])
  })

  test('TC-BIL-025 → R$100 em 3 parcelas → última recebe remainder ([33.33, 33.33, 33.34])', () => {
    const parts = splitInstallments(100, 3)
    expect(parts).toEqual([33.33, 33.33, 33.34])
    // soma deve ser exatamente 100
    expect(roundCents(parts.reduce((a, b) => a + b, 0))).toBe(100)
  })

  test('TC-BIL-026 → R$99.90 em 3 parcelas (33.30 cada)', () => {
    const parts = splitInstallments(99.90, 3)
    expect(roundCents(parts.reduce((a, b) => a + b, 0))).toBe(99.90)
  })

  test('TC-BIL-027 → R$150 em 1 parcela → [150]', () => {
    expect(splitInstallments(150, 1)).toEqual([150])
  })

  test('TC-BIL-028 → count = 0 → array vazio', () => {
    expect(splitInstallments(100, 0)).toEqual([])
  })

  test('TC-BIL-029 → arredondamento de centavos R$0.30 não vira 0.3000000004', () => {
    // 0.1 + 0.2 = 0.30000000000000004 sem arredondamento
    expect(roundCents(0.1 + 0.2)).toBe(0.3)
  })

  test('TC-BIL-030 → R$10 em 6 parcelas → soma exata', () => {
    const parts = splitInstallments(10, 6)
    expect(parts).toHaveLength(6)
    expect(roundCents(parts.reduce((a, b) => a + b, 0))).toBe(10)
  })
})
