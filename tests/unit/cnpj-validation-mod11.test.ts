/**
 * Unit — Validação CNPJ módulo 11 (algoritmo padrão Receita Federal)
 *
 * Pesos:
 *   DV1 = [5,4,3,2,9,8,7,6,5,4,3,2]  sobre os 12 primeiros dígitos
 *   DV2 = [6,5,4,3,2,9,8,7,6,5,4,3,2] sobre os 13 primeiros dígitos
 *   Resto < 2 → DV = 0; senão DV = 11 - resto
 *
 * TC-CNPJ-001..025 → válidos, inválidos, máscara, sequências homogêneas, edge cases.
 */

function validateCnpjMod11(cnpj: string): boolean {
  const d = (cnpj ?? '').replace(/\D/g, '')
  if (d.length !== 14) return false
  if (/^(\d)\1{13}$/.test(d)) return false

  const calcDv = (slice: string, weights: number[]): number => {
    let sum = 0
    for (let i = 0; i < weights.length; i++) {
      sum += parseInt(slice[i], 10) * weights[i]
    }
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

  const dv1 = calcDv(d.slice(0, 12), w1)
  if (dv1 !== parseInt(d[12], 10)) return false
  const dv2 = calcDv(d.slice(0, 13), w2)
  return dv2 === parseInt(d[13], 10)
}

// ─── TC-CNPJ-001..010: CNPJs válidos ────────────────────────────────────────

describe('validateCnpjMod11 — CNPJs válidos', () => {
  test('TC-CNPJ-001 → 11444777000161 válido (CNPJ teste padrão)', () => {
    expect(validateCnpjMod11('11444777000161')).toBe(true)
  })

  test('TC-CNPJ-002 → 11.444.777/0001-61 com máscara válido', () => {
    expect(validateCnpjMod11('11.444.777/0001-61')).toBe(true)
  })

  test('TC-CNPJ-003 → 60746948000112 válido', () => {
    expect(validateCnpjMod11('60746948000112')).toBe(true)
  })

  test('TC-CNPJ-004 → 60.746.948/0001-12 com máscara válido', () => {
    expect(validateCnpjMod11('60.746.948/0001-12')).toBe(true)
  })

  test('TC-CNPJ-005 → 33333333000191 válido (matriz de teste)', () => {
    expect(validateCnpjMod11('33333333000191')).toBe(true)
  })

  test('TC-CNPJ-006 → 22343735000150 válido (gerado pelo algoritmo)', () => {
    expect(validateCnpjMod11('22343735000150')).toBe(true)
  })

  test('TC-CNPJ-007 → CNPJ com espaços removidos válido', () => {
    expect(validateCnpjMod11('11 444 777 0001 61')).toBe(true)
  })

  test('TC-CNPJ-008 → CNPJ com letras intercaladas removidas válido', () => {
    expect(validateCnpjMod11('11a444b777c0001d61')).toBe(true)
  })

  test('TC-CNPJ-009 → CNPJ com prefixo "CNPJ:" removido', () => {
    expect(validateCnpjMod11('CNPJ:11444777000161')).toBe(true)
  })

  test('TC-CNPJ-010 → filial 0002 válida — 11444777000242', () => {
    // 114447770002 → DV1 calc → 2, depois DV2 → ?
    // Gerar dinamicamente
    expect(validateCnpjMod11('11444777000242')).toBe(true)
  })
})

// ─── TC-CNPJ-011..018: CNPJs inválidos ──────────────────────────────────────

describe('validateCnpjMod11 — CNPJs inválidos', () => {
  test('TC-CNPJ-011 → 11444777000162 (DV2 errado) inválido', () => {
    expect(validateCnpjMod11('11444777000162')).toBe(false)
  })

  test('TC-CNPJ-012 → 11444777000171 (DV1 errado) inválido', () => {
    expect(validateCnpjMod11('11444777000171')).toBe(false)
  })

  test('TC-CNPJ-013 → 00000000000000 sequência homogênea inválido', () => {
    expect(validateCnpjMod11('00000000000000')).toBe(false)
  })

  test('TC-CNPJ-014 → 99999999999999 sequência homogênea inválido', () => {
    expect(validateCnpjMod11('99999999999999')).toBe(false)
  })

  test('TC-CNPJ-015 → 11111111111111 sequência homogênea inválido', () => {
    expect(validateCnpjMod11('11111111111111')).toBe(false)
  })

  test('TC-CNPJ-016 → 12345678901234 (random) inválido', () => {
    expect(validateCnpjMod11('12345678901234')).toBe(false)
  })

  test('TC-CNPJ-017 → 22343735000180 (DV2 errado) inválido', () => {
    expect(validateCnpjMod11('22343735000180')).toBe(false)
  })

  test('TC-CNPJ-018 → 11444777000160 (DV2 off-by-one) inválido', () => {
    expect(validateCnpjMod11('11444777000160')).toBe(false)
  })
})

// ─── TC-CNPJ-019..025: Edge cases de input ──────────────────────────────────

describe('validateCnpjMod11 — edge cases', () => {
  test('TC-CNPJ-019 → string vazia inválido', () => {
    expect(validateCnpjMod11('')).toBe(false)
  })

  test('TC-CNPJ-020 → menos de 14 dígitos (1144477700016) inválido', () => {
    expect(validateCnpjMod11('1144477700016')).toBe(false)
  })

  test('TC-CNPJ-021 → mais de 14 dígitos (114447770001611) inválido', () => {
    expect(validateCnpjMod11('114447770001611')).toBe(false)
  })

  test('TC-CNPJ-022 → só letras inválido', () => {
    expect(validateCnpjMod11('abcdefghijklmn')).toBe(false)
  })

  test('TC-CNPJ-023 → null-like coercion inválido', () => {
    // @ts-expect-error testing runtime guard
    expect(validateCnpjMod11(null)).toBe(false)
  })

  test('TC-CNPJ-024 → tab e newline mesclados com dígitos válidos passam', () => {
    expect(validateCnpjMod11('11\t444\n777/0001-61')).toBe(true)
  })

  test('TC-CNPJ-025 → CNPJ raiz 11.444.777 sem filial/DV (apenas 8 dígitos) inválido', () => {
    expect(validateCnpjMod11('11444777')).toBe(false)
  })
})
