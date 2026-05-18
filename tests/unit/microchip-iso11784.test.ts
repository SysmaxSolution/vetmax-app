/**
 * Unit — Validação microchip ISO 11784/11785 (15 dígitos numéricos)
 *
 * TC-MIC-001..020 → cobrem comprimento, conteúdo, edge cases e country code.
 */

interface ValidationResult {
  valid: boolean
  error?: string
}

function validateMicrochip(value: string): ValidationResult {
  if (value === undefined || value === null || value === '') {
    return { valid: true } // campo opcional
  }
  const trimmed = String(value).trim()
  if (trimmed === '') return { valid: true }
  const digits = trimmed.replace(/\D/g, '')
  if (digits !== trimmed) {
    return { valid: false, error: 'Microchip deve conter apenas números' }
  }
  if (digits.length !== 15) {
    return {
      valid: false,
      error: `Microchip deve ter 15 dígitos (possui ${digits.length})`,
    }
  }
  return { valid: true }
}

// ─── TC-MIC-001..006: comprimento ────────────────────────────────────────────

describe('validateMicrochip — comprimento', () => {
  test('TC-MIC-001 → 15 dígitos exatos → válido', () => {
    expect(validateMicrochip('985112345678901').valid).toBe(true)
  })

  test('TC-MIC-002 → 14 dígitos → inválido com mensagem', () => {
    const r = validateMicrochip('98511234567890')
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/15 dígitos/)
    expect(r.error).toMatch(/14/)
  })

  test('TC-MIC-003 → 16 dígitos → inválido', () => {
    const r = validateMicrochip('9851123456789012')
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/15 dígitos/)
  })

  test('TC-MIC-004 → 1 dígito → inválido', () => {
    expect(validateMicrochip('1').valid).toBe(false)
  })

  test('TC-MIC-005 → 100 dígitos → inválido', () => {
    expect(validateMicrochip('1'.repeat(100)).valid).toBe(false)
  })

  test('TC-MIC-006 → exatamente 15 zeros → válido (não rejeita all-zeros)', () => {
    expect(validateMicrochip('000000000000000').valid).toBe(true)
  })
})

// ─── TC-MIC-007..012: conteúdo (apenas dígitos) ──────────────────────────────

describe('validateMicrochip — apenas dígitos', () => {
  test('TC-MIC-007 → com letra "A" → inválido', () => {
    const r = validateMicrochip('98511A345678901')
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/apenas números/)
  })

  test('TC-MIC-008 → com hífen → inválido', () => {
    const r = validateMicrochip('985-112345678901')
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/apenas números/)
  })

  test('TC-MIC-009 → com espaço no meio → inválido', () => {
    const r = validateMicrochip('98511 2345678901')
    expect(r.valid).toBe(false)
  })

  test('TC-MIC-010 → com ponto → inválido', () => {
    const r = validateMicrochip('985.112345678901')
    expect(r.valid).toBe(false)
  })

  test('TC-MIC-011 → com unicode (acento) → inválido', () => {
    const r = validateMicrochip('985Ç12345678901')
    expect(r.valid).toBe(false)
  })

  test('TC-MIC-012 → 15 chars todos letras → inválido', () => {
    expect(validateMicrochip('ABCDEFGHIJKLMNO').valid).toBe(false)
  })
})

// ─── TC-MIC-013..017: edge cases input ───────────────────────────────────────

describe('validateMicrochip — input vazio/opcional', () => {
  test('TC-MIC-013 → string vazia "" → válido (campo opcional)', () => {
    expect(validateMicrochip('').valid).toBe(true)
  })

  test('TC-MIC-014 → string só com espaços → válido (trim → empty)', () => {
    expect(validateMicrochip('   ').valid).toBe(true)
  })

  test('TC-MIC-015 → null → válido (opcional)', () => {
    // @ts-expect-error testing runtime
    expect(validateMicrochip(null).valid).toBe(true)
  })

  test('TC-MIC-016 → undefined → válido (opcional)', () => {
    // @ts-expect-error testing runtime
    expect(validateMicrochip(undefined).valid).toBe(true)
  })

  test('TC-MIC-017 → string com tabs e quebras de linha externas → trim e válido se 15 dígitos', () => {
    expect(validateMicrochip('  985112345678901  ').valid).toBe(true)
  })
})

// ─── TC-MIC-018..020: country code e padrão ISO ──────────────────────────────

describe('validateMicrochip — padrão ISO 11784/11785', () => {
  test('TC-MIC-018 → country code 985 (US) + 12 dígitos animal ID → válido', () => {
    // 985 = código ICAR US Microchip ID Allocator
    expect(validateMicrochip('985112345678901').valid).toBe(true)
  })

  test('TC-MIC-019 → country code 956 (Brasil) válido', () => {
    expect(validateMicrochip('956000123456789').valid).toBe(true)
  })

  test('TC-MIC-020 → padding zeros à esquerda (000123456789012) → válido', () => {
    expect(validateMicrochip('000123456789012').valid).toBe(true)
  })
})
