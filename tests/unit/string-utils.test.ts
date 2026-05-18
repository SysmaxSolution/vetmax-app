/**
 * Unit — String Utilities (form helpers genéricos VetMax)
 *
 * Implementa removeAccents, truncate, slugify, maskPhone, maskCep, maskCnpj, maskCpf.
 *
 * TC-STR-001..025 → cobrem cada utility com input válido/vazio/parcial/excedente.
 */

// ─── Implementações puras ────────────────────────────────────────────────────

function removeAccents(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function truncate(s: string, n: number): string {
  if (s == null) return ''
  if (s.length <= n) return s
  if (n <= 0) return ''
  return s.slice(0, n) + '…'
}

function slugify(s: string): string {
  return removeAccents(s ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function maskPhone(s: string): string {
  const d = (s ?? '').replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function maskCep(s: string): string {
  const d = (s ?? '').replace(/\D/g, '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

function maskCnpj(s: string): string {
  const d = (s ?? '').replace(/\D/g, '').slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

function maskCpf(s: string): string {
  const d = (s ?? '').replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

// ─── TC-STR-001..004: removeAccents ──────────────────────────────────────────

describe('removeAccents', () => {
  test('TC-STR-001 → "café" → "cafe"', () => {
    expect(removeAccents('café')).toBe('cafe')
  })

  test('TC-STR-002 → "JOÃO MARIA" → "JOAO MARIA" (não muda case)', () => {
    expect(removeAccents('JOÃO MARIA')).toBe('JOAO MARIA')
  })

  test('TC-STR-003 → string vazia → ""', () => {
    expect(removeAccents('')).toBe('')
  })

  test('TC-STR-004 → string sem acento → mantém', () => {
    expect(removeAccents('teste simples')).toBe('teste simples')
  })
})

// ─── TC-STR-005..007: truncate ───────────────────────────────────────────────

describe('truncate', () => {
  test('TC-STR-005 → string curta não é truncada', () => {
    expect(truncate('abc', 10)).toBe('abc')
  })

  test('TC-STR-006 → string longa é truncada com "…"', () => {
    expect(truncate('Lorem ipsum dolor sit amet', 10)).toBe('Lorem ipsu…')
  })

  test('TC-STR-007 → n=0 → ""', () => {
    expect(truncate('abc', 0)).toBe('')
  })
})

// ─── TC-STR-008..011: slugify ────────────────────────────────────────────────

describe('slugify', () => {
  test('TC-STR-008 → "Médico Veterinário" → "medico-veterinario"', () => {
    expect(slugify('Médico Veterinário')).toBe('medico-veterinario')
  })

  test('TC-STR-009 → "Pet & Cão!" → "pet-cao"', () => {
    expect(slugify('Pet & Cão!')).toBe('pet-cao')
  })

  test('TC-STR-010 → string vazia → ""', () => {
    expect(slugify('')).toBe('')
  })

  test('TC-STR-011 → múltiplos espaços viram um único hífen', () => {
    expect(slugify('   teste    multiplo  ')).toBe('teste-multiplo')
  })
})

// ─── TC-STR-012..015: maskPhone ──────────────────────────────────────────────

describe('maskPhone', () => {
  test('TC-STR-012 → celular 11 dígitos → "(11) 99999-8888"', () => {
    expect(maskPhone('11999998888')).toBe('(11) 99999-8888')
  })

  test('TC-STR-013 → fixo 10 dígitos → "(11) 3333-4444"', () => {
    expect(maskPhone('1133334444')).toBe('(11) 3333-4444')
  })

  test('TC-STR-014 → input parcial 6 dígitos → "(11) 9999"', () => {
    expect(maskPhone('119999')).toBe('(11) 9999')
  })

  test('TC-STR-015 → input vazio → ""', () => {
    expect(maskPhone('')).toBe('')
  })
})

// ─── TC-STR-016..018: maskCep ────────────────────────────────────────────────

describe('maskCep', () => {
  test('TC-STR-016 → 8 dígitos → "01310-100"', () => {
    expect(maskCep('01310100')).toBe('01310-100')
  })

  test('TC-STR-017 → parcial 5 dígitos → "01310" sem traço', () => {
    expect(maskCep('01310')).toBe('01310')
  })

  test('TC-STR-018 → com excesso (10 dígitos) → trunca em 8', () => {
    expect(maskCep('0131010099')).toBe('01310-100')
  })
})

// ─── TC-STR-019..021: maskCnpj ───────────────────────────────────────────────

describe('maskCnpj', () => {
  test('TC-STR-019 → 14 dígitos → "11.444.777/0001-61"', () => {
    expect(maskCnpj('11444777000161')).toBe('11.444.777/0001-61')
  })

  test('TC-STR-020 → parcial 8 dígitos → "11.444.777"', () => {
    expect(maskCnpj('11444777')).toBe('11.444.777')
  })

  test('TC-STR-021 → vazio → ""', () => {
    expect(maskCnpj('')).toBe('')
  })
})

// ─── TC-STR-022..025: maskCpf ────────────────────────────────────────────────

describe('maskCpf', () => {
  test('TC-STR-022 → 11 dígitos → "529.982.247-25"', () => {
    expect(maskCpf('52998224725')).toBe('529.982.247-25')
  })

  test('TC-STR-023 → parcial 6 dígitos → "123.456"', () => {
    expect(maskCpf('123456')).toBe('123.456')
  })

  test('TC-STR-024 → com letras intercaladas → limpa e formata', () => {
    expect(maskCpf('5a2b9c98224725xyz')).toBe('529.982.247-25')
  })

  test('TC-STR-025 → vazio → ""', () => {
    expect(maskCpf('')).toBe('')
  })
})
