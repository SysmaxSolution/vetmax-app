/**
 * Unit — Validação EAN/UPC
 * isEAN aceita strings com 8 a 14 dígitos numéricos (após trim).
 */

import { isEAN } from '@/lib/utils/ean'

describe('TC-EAN-001 → 8 dígitos válido (EAN-8)', () => {
  test('40170725 → true', () => {
    expect(isEAN('40170725')).toBe(true)
  })
})

describe('TC-EAN-002 → 12 dígitos válido (UPC-A)', () => {
  test('012345678905 → true', () => {
    expect(isEAN('012345678905')).toBe(true)
  })
})

describe('TC-EAN-003 → 13 dígitos válido (EAN-13)', () => {
  test('7891000100103 → true', () => {
    expect(isEAN('7891000100103')).toBe(true)
  })
})

describe('TC-EAN-004 → 14 dígitos válido (ITF-14 / DUN-14)', () => {
  test('17891000100100 → true', () => {
    expect(isEAN('17891000100100')).toBe(true)
  })
})

describe('TC-EAN-005 → 7 dígitos inválido (curto demais)', () => {
  test('1234567 → false', () => {
    expect(isEAN('1234567')).toBe(false)
  })
})

describe('TC-EAN-006 → 15 dígitos inválido (longo demais)', () => {
  test('123456789012345 → false', () => {
    expect(isEAN('123456789012345')).toBe(false)
  })
})

describe('TC-EAN-007 → string com espaços (trim aplicado)', () => {
  test('"  7891000100103  " → true', () => {
    expect(isEAN('  7891000100103  ')).toBe(true)
  })

  test('"7891 000100103" → false (espaço no meio)', () => {
    expect(isEAN('7891 000100103')).toBe(false)
  })
})

describe('TC-EAN-008 → string com letras inválida', () => {
  test('789ABC0100103 → false', () => {
    expect(isEAN('789ABC0100103')).toBe(false)
  })

  test('apenas letras → false', () => {
    expect(isEAN('abcdefghij')).toBe(false)
  })
})

describe('TC-EAN-009 → string vazia → false', () => {
  test('vazio → false', () => {
    expect(isEAN('')).toBe(false)
  })

  test('apenas espaços → false', () => {
    expect(isEAN('     ')).toBe(false)
  })
})

describe('TC-EAN-010 → padding com zeros à esquerda válido', () => {
  test('00000001 (8 dígitos) → true', () => {
    expect(isEAN('00000001')).toBe(true)
  })

  test('0000000000000 (13 dígitos) → true', () => {
    expect(isEAN('0000000000000')).toBe(true)
  })
})

describe('TC-EAN-011 → caracteres especiais inválidos', () => {
  test('789-1000-1001-03 (hífen) → false', () => {
    expect(isEAN('789-1000-1001-03')).toBe(false)
  })

  test('7.891.000.100.103 (pontos) → false', () => {
    expect(isEAN('7.891.000.100.103')).toBe(false)
  })
})

describe('TC-EAN-012 → fronteira de 9, 10, 11 dígitos válidos', () => {
  test('9 dígitos → true', () => {
    expect(isEAN('123456789')).toBe(true)
  })

  test('10 dígitos → true', () => {
    expect(isEAN('1234567890')).toBe(true)
  })

  test('11 dígitos → true', () => {
    expect(isEAN('12345678901')).toBe(true)
  })
})

describe('TC-EAN-013 → número como string com tab/newline (trim cobre)', () => {
  test('"7891000100103\\n" → true', () => {
    expect(isEAN('7891000100103\n')).toBe(true)
  })

  test('"\\t7891000100103" → true', () => {
    expect(isEAN('\t7891000100103')).toBe(true)
  })
})

describe('TC-EAN-014 → unicode/emoji inválido', () => {
  test('"789100010010😀" → false', () => {
    expect(isEAN('789100010010😀')).toBe(false)
  })
})

describe('TC-EAN-015 → 13 dígitos exato (limite inferior comum no Brasil)', () => {
  test('7898357410015 → true', () => {
    expect(isEAN('7898357410015')).toBe(true)
  })
})
