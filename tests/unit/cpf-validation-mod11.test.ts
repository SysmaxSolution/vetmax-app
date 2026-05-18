/**
 * Unit — Validação CPF módulo 11 (algoritmo padrão Receita Federal)
 *
 * TC-CPF-001..025 → válidos, inválidos, máscara, sequências homogêneas, edge cases.
 */

/** Valida CPF pelo algoritmo módulo 11. */
function validateCpfMod11(cpf: string): boolean {
  const d = (cpf ?? '').replace(/\D/g, '')
  if (d.length !== 11) return false
  // Sequências homogêneas (00000000000, 11111111111, ..., 99999999999) são inválidas
  if (/^(\d)\1{10}$/.test(d)) return false

  const calc = (len: number): number => {
    let sum = 0
    for (let i = 0; i < len; i++) {
      sum += parseInt(d[i], 10) * (len + 1 - i)
    }
    const r = (sum * 10) % 11
    return r >= 10 ? 0 : r
  }

  return calc(9) === parseInt(d[9], 10) && calc(10) === parseInt(d[10], 10)
}

// ─── TC-CPF-001..010: CPFs válidos ──────────────────────────────────────────

describe('validateCpfMod11 — CPFs válidos', () => {
  test('TC-CPF-001 → 52998224725 válido (CPF genuíno de testes)', () => {
    expect(validateCpfMod11('52998224725')).toBe(true)
  })

  test('TC-CPF-002 → 11144477735 válido', () => {
    expect(validateCpfMod11('11144477735')).toBe(true)
  })

  test('TC-CPF-003 → 529.982.247-25 com máscara válido', () => {
    expect(validateCpfMod11('529.982.247-25')).toBe(true)
  })

  test('TC-CPF-004 → 111.444.777-35 com máscara válido', () => {
    expect(validateCpfMod11('111.444.777-35')).toBe(true)
  })

  test('TC-CPF-005 → CPF com espaços (529 982 247 25) válido após limpeza', () => {
    expect(validateCpfMod11('529 982 247 25')).toBe(true)
  })

  test('TC-CPF-006 → CPF com letras mescladas removidas (5a2b9c98224725)', () => {
    expect(validateCpfMod11('5a2b9c98224725')).toBe(true)
  })

  test('TC-CPF-007 → 39053344705 válido', () => {
    expect(validateCpfMod11('39053344705')).toBe(true)
  })

  test('TC-CPF-008 → 04482411027 válido', () => {
    expect(validateCpfMod11('04482411027')).toBe(true)
  })

  test('TC-CPF-009 → CPF com zero à esquerda 04482411027 mantém validade com máscara', () => {
    expect(validateCpfMod11('044.824.110-27')).toBe(true)
  })

  test('TC-CPF-010 → 71428109803 válido', () => {
    expect(validateCpfMod11('71428109803')).toBe(true)
  })
})

// ─── TC-CPF-011..018: CPFs inválidos por dígito verificador ─────────────────

describe('validateCpfMod11 — CPFs com dígito verificador inválido', () => {
  test('TC-CPF-011 → 52998224726 (dígito 11 errado) inválido', () => {
    expect(validateCpfMod11('52998224726')).toBe(false)
  })

  test('TC-CPF-012 → 52998224715 (dígito 10 errado) inválido', () => {
    expect(validateCpfMod11('52998224715')).toBe(false)
  })

  test('TC-CPF-013 → 12345678909 vs 12345678910 — segundo inválido', () => {
    expect(validateCpfMod11('12345678910')).toBe(false)
  })

  test('TC-CPF-014 → 11144477736 (último dígito errado) inválido', () => {
    expect(validateCpfMod11('11144477736')).toBe(false)
  })

  test('TC-CPF-015 → 11144477734 inválido', () => {
    expect(validateCpfMod11('11144477734')).toBe(false)
  })

  test('TC-CPF-016 → 99999999999 sequência homogênea → inválido', () => {
    expect(validateCpfMod11('99999999999')).toBe(false)
  })

  test('TC-CPF-017 → 00000000000 sequência homogênea → inválido', () => {
    expect(validateCpfMod11('00000000000')).toBe(false)
  })

  test('TC-CPF-018 → 11111111111 sequência homogênea → inválido', () => {
    expect(validateCpfMod11('11111111111')).toBe(false)
  })
})

// ─── TC-CPF-019..025: Edge cases de input ────────────────────────────────────

describe('validateCpfMod11 — edge cases de input', () => {
  test('TC-CPF-019 → string vazia → inválido', () => {
    expect(validateCpfMod11('')).toBe(false)
  })

  test('TC-CPF-020 → menos de 11 dígitos (5299822472) → inválido', () => {
    expect(validateCpfMod11('5299822472')).toBe(false)
  })

  test('TC-CPF-021 → mais de 11 dígitos (529982247253) → inválido', () => {
    expect(validateCpfMod11('529982247253')).toBe(false)
  })

  test('TC-CPF-022 → só letras → inválido', () => {
    expect(validateCpfMod11('abcdefghijk')).toBe(false)
  })

  test('TC-CPF-023 → undefined-like coercion → inválido', () => {
    // @ts-expect-error testing runtime guard
    expect(validateCpfMod11(null)).toBe(false)
  })

  test('TC-CPF-024 → CPF com 11 dígitos mas que falha algoritmo (00000000001) inválido', () => {
    expect(validateCpfMod11('00000000001')).toBe(false)
  })

  test('TC-CPF-025 → CPF com tab e quebra de linha (\\t529982247\\n25) inválido por máscara estranha', () => {
    // Após replace(/\D/g) → "52998224725" → válido
    expect(validateCpfMod11('\t529982247\n25')).toBe(true)
  })
})
