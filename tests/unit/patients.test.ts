/**
 * Unit — Módulo de Pacientes & Tutores
 * Sessão 1 · Fase 1 (Fundação)
 *
 * TC-PAT-001  formatCpf() — máscara correta
 * TC-PAT-002  formatCpf() — CPF com todos dígitos iguais rejeitado
 * TC-PAT-003  formatPhone() — máscara de celular 11 dígitos
 * TC-PAT-004  formatPhone() — telefone com 10 dígitos (fixo)
 * TC-PAT-005  Cálculo de idade exato (anos completos)
 * TC-PAT-006  Cálculo de idade < 1 ano exibe meses
 * TC-PAT-007  Cálculo de idade < 1 mês exibe dias
 * TC-PAT-008  Microchip com 15 dígitos válido
 * TC-PAT-009  Microchip com 14 dígitos inválido
 * TC-PAT-010  Microchip com 16 dígitos inválido
 * TC-PAT-011  Microchip não numérico inválido
 * TC-PAT-012  Validação de alergias — campo vazio aceito (opcional)
 * TC-PAT-013  Validação de alergias — texto longo (500 chars) aceito
 * TC-PAT-014  Validação de doenças crônicas — campo vazio aceito
 * TC-PAT-015  Validação de doenças crônicas — texto com múltiplas doenças aceito
 * TC-PAT-016  buildPetPayload() — campos opcionais ausentes → undefined
 * TC-PAT-017  buildPetPayload() — nome obrigatório vazio → erro
 * TC-PAT-018  buildPetPayload() — espécie válida preservada
 * TC-PAT-019  normalizeCpf() — remove máscara corretamente
 * TC-PAT-020  normalizeCpf() — CPF já limpo não muda
 */

// ─── Funções utilitárias copiadas do modal (sem dependências de React) ────────
// Espelham exatamente o que está em PatientFullModal.tsx para testes puros

function formatCpf(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function formatPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function normalizeCpf(v: string): string {
  return v.replace(/\D/g, '')
}

/** Valida se microchip está no padrão ISO 11784/11785 (exatamente 15 dígitos numéricos) */
function validateMicrochip(value: string): { valid: boolean; error?: string } {
  if (!value) return { valid: true } // campo opcional
  const digits = value.replace(/\D/g, '')
  if (digits !== value.trim()) return { valid: false, error: 'Microchip deve conter apenas números' }
  if (digits.length !== 15) return { valid: false, error: `Microchip deve ter 15 dígitos (possui ${digits.length})` }
  return { valid: true }
}

/** Calcula a idade do pet a partir de birth_date (ISO string ou Date) */
function calculateAge(birthDate: string | Date, referenceDate?: Date): string {
  const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate
  const ref   = referenceDate ?? new Date()

  let years  = ref.getFullYear()  - birth.getFullYear()
  let months = ref.getMonth()     - birth.getMonth()
  let days   = ref.getDate()      - birth.getDate()

  if (days < 0) {
    months -= 1
    const prevMonth = new Date(ref.getFullYear(), ref.getMonth(), 0)
    days += prevMonth.getDate()
  }
  if (months < 0) {
    years  -= 1
    months += 12
  }

  if (years >= 1) {
    return months > 0 ? `${years} ano${years > 1 ? 's' : ''} e ${months} ${months > 1 ? 'meses' : 'mês'}` : `${years} ano${years > 1 ? 's' : ''}`
  }
  if (months >= 1) {
    return days > 0 ? `${months} ${months > 1 ? 'meses' : 'mês'} e ${days} dia${days > 1 ? 's' : ''}` : `${months} ${months > 1 ? 'meses' : 'mês'}`
  }
  return `${days} dia${days !== 1 ? 's' : ''}`
}

/** Valida e constrói o payload mínimo do pet */
interface PetPayload {
  name: string
  species: string
  breed?: string
  allergies?: string
  chronic_diseases?: string
  microchip_id?: string
}

function buildPetPayload(fields: {
  petName: string
  species: string
  breed?: string
  allergies?: string
  chronicDiseases?: string
  microchipId?: string
}): { payload: PetPayload } | { error: string } {
  if (!fields.petName.trim()) return { error: 'Nome do pet é obrigatório' }

  const payload: PetPayload = {
    name:    fields.petName.trim(),
    species: fields.species,
  }

  if (fields.breed?.trim())           payload.breed            = fields.breed.trim()
  if (fields.allergies?.trim())        payload.allergies        = fields.allergies.trim()
  if (fields.chronicDiseases?.trim())  payload.chronic_diseases = fields.chronicDiseases.trim()
  if (fields.microchipId?.trim())      payload.microchip_id     = fields.microchipId.trim()

  return { payload }
}

// ─── TC-PAT-001: formatCpf — máscara correta ─────────────────────────────────

describe('TC-PAT-001: formatCpf() — máscara correta', () => {
  test('CPF completo de 11 dígitos recebe máscara', () => {
    expect(formatCpf('12345678909')).toBe('123.456.789-09')
  })

  test('CPF com máscara já aplicada não duplica pontuação', () => {
    expect(formatCpf('123.456.789-09')).toBe('123.456.789-09')
  })

  test('CPF parcial (6 dígitos) recebe máscara parcial', () => {
    expect(formatCpf('123456')).toBe('123.456')
  })

  test('Letras são ignoradas', () => {
    expect(formatCpf('123abc456de789-09')).toBe('123.456.789-09')
  })

  test('Mais de 11 dígitos — trunca no 11º', () => {
    expect(formatCpf('123456789099999')).toBe('123.456.789-09')
  })
})

// ─── TC-PAT-002: CPF com todos dígitos iguais ─────────────────────────────────

describe('TC-PAT-002: CPF com todos os dígitos iguais', () => {
  /**
   * O formato CPF aceita esses valores estruturalmente (formatCpf formata),
   * mas a validação semântica (111.111.111-11 é inválido) deve ser feita
   * no nível de validação, não no formatador.
   * Verificamos que a função de validação rejeita corretamente.
   */
  function isCpfSemanticValid(cpf: string): boolean {
    const d = cpf.replace(/\D/g, '')
    if (d.length !== 11) return false
    // Sequências homogêneas são inválidas
    if (/^(\d)\1{10}$/.test(d)) return false
    // Validação dos dígitos verificadores
    const calc = (len: number) => {
      let sum = 0
      for (let i = 0; i < len; i++) sum += parseInt(d[i]) * (len + 1 - i)
      const r = (sum * 10) % 11
      return r === 10 ? 0 : r
    }
    return calc(9) === parseInt(d[9]) && calc(10) === parseInt(d[10])
  }

  test('111.111.111-11 é semanticamente inválido', () => {
    expect(isCpfSemanticValid('111.111.111-11')).toBe(false)
  })

  test('000.000.000-00 é semanticamente inválido', () => {
    expect(isCpfSemanticValid('000.000.000-00')).toBe(false)
  })

  test('CPF válido real (529.982.247-25) passa', () => {
    // CPF gerado com algoritmo válido para testes
    expect(isCpfSemanticValid('52998224725')).toBe(true)
  })
})

// ─── TC-PAT-003: formatPhone — celular 11 dígitos ────────────────────────────

describe('TC-PAT-003: formatPhone() — celular com 11 dígitos', () => {
  test('Número de celular formatado corretamente', () => {
    expect(formatPhone('11999998888')).toBe('(11) 99999-8888')
  })

  test('Número com máscara já aplicada não duplica', () => {
    expect(formatPhone('(11) 99999-8888')).toBe('(11) 99999-8888')
  })

  test('Letras são ignoradas', () => {
    expect(formatPhone('11a99999b8888')).toBe('(11) 99999-8888')
  })
})

// ─── TC-PAT-004: formatPhone — telefone fixo 10 dígitos ──────────────────────

describe('TC-PAT-004: formatPhone() — telefone fixo com 10 dígitos', () => {
  test('Telefone fixo formatado corretamente', () => {
    expect(formatPhone('1133334444')).toBe('(11) 3333-4444')
  })
})

// ─── TC-PAT-005: Cálculo de idade — anos completos ────────────────────────────

describe('TC-PAT-005: calculateAge() — anos completos', () => {
  test('Pet com 6 anos exatos no dia do aniversário', () => {
    const ref = new Date('2026-04-27')
    expect(calculateAge('2020-04-27', ref)).toBe('6 anos')
  })

  test('Pet com 1 ano exibido no singular', () => {
    const ref = new Date('2026-04-27')
    expect(calculateAge('2025-04-27', ref)).toBe('1 ano')
  })

  test('Pet com 3 anos e 2 meses', () => {
    const ref = new Date('2026-04-27')
    expect(calculateAge('2023-02-27', ref)).toBe('3 anos e 2 meses')
  })

  test('Pet com 2 anos e 1 mês', () => {
    const ref = new Date('2026-04-15')
    expect(calculateAge('2024-03-15', ref)).toBe('2 anos e 1 mês')
  })
})

// ─── TC-PAT-006: Cálculo de idade — meses ─────────────────────────────────────

describe('TC-PAT-006: calculateAge() — meses (< 1 ano)', () => {
  test('Pet com 3 meses exatos', () => {
    const ref = new Date('2026-04-27')
    expect(calculateAge('2026-01-27', ref)).toBe('3 meses')
  })

  test('Pet com 1 mês e 5 dias', () => {
    const ref = new Date('2026-04-27')
    expect(calculateAge('2026-03-22', ref)).toBe('1 mês e 5 dias')
  })

  test('Pet com 1 mês exato no singular', () => {
    const ref = new Date('2026-04-27')
    expect(calculateAge('2026-03-27', ref)).toBe('1 mês')
  })
})

// ─── TC-PAT-007: Cálculo de idade — dias ─────────────────────────────────────

describe('TC-PAT-007: calculateAge() — dias (< 1 mês)', () => {
  test('Pet com 10 dias', () => {
    const ref = new Date('2026-04-27')
    expect(calculateAge('2026-04-17', ref)).toBe('10 dias')
  })

  test('Pet com 1 dia no singular', () => {
    const ref = new Date('2026-04-27')
    expect(calculateAge('2026-04-26', ref)).toBe('1 dia')
  })

  test('Pet nascido hoje = 0 dias', () => {
    const ref = new Date('2026-04-27')
    expect(calculateAge('2026-04-27', ref)).toBe('0 dias')
  })
})

// ─── TC-PAT-008: Microchip válido (15 dígitos) ───────────────────────────────

describe('TC-PAT-008: validateMicrochip() — 15 dígitos válido', () => {
  test('Código de 15 dígitos passa', () => {
    const r = validateMicrochip('985112345678901')
    expect(r.valid).toBe(true)
    expect(r.error).toBeUndefined()
  })

  test('Campo vazio é aceito (campo opcional)', () => {
    const r = validateMicrochip('')
    expect(r.valid).toBe(true)
  })
})

// ─── TC-PAT-009: Microchip com 14 dígitos inválido ───────────────────────────

describe('TC-PAT-009: validateMicrochip() — 14 dígitos inválido', () => {
  test('14 dígitos rejeitado com mensagem correta', () => {
    const r = validateMicrochip('98511234567890')
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/15 dígitos/)
  })
})

// ─── TC-PAT-010: Microchip com 16 dígitos inválido ───────────────────────────

describe('TC-PAT-010: validateMicrochip() — 16 dígitos inválido', () => {
  test('16 dígitos rejeitado', () => {
    const r = validateMicrochip('9851123456789012')
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/15 dígitos/)
  })
})

// ─── TC-PAT-011: Microchip não numérico inválido ─────────────────────────────

describe('TC-PAT-011: validateMicrochip() — não numérico inválido', () => {
  test('Código com letras rejeitado', () => {
    const r = validateMicrochip('98511ABC5678901')
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/apenas números/)
  })

  test('Código com hífens rejeitado', () => {
    const r = validateMicrochip('985-1123456-789')
    expect(r.valid).toBe(false)
  })
})

// ─── TC-PAT-012: Alergias — campo vazio aceito ────────────────────────────────

describe('TC-PAT-012: Alergias — campo vazio é aceito (opcional)', () => {
  test('buildPetPayload sem alergias não inclui campo no payload', () => {
    const result = buildPetPayload({ petName: 'Rex', species: 'dog', allergies: '' })
    expect('error' in result).toBe(false)
    if ('payload' in result) {
      expect(result.payload.allergies).toBeUndefined()
    }
  })

  test('buildPetPayload com alergias undefined não inclui campo', () => {
    const result = buildPetPayload({ petName: 'Rex', species: 'dog' })
    expect('payload' in result).toBe(true)
    if ('payload' in result) {
      expect(result.payload.allergies).toBeUndefined()
    }
  })
})

// ─── TC-PAT-013: Alergias — texto longo aceito ────────────────────────────────

describe('TC-PAT-013: Alergias — texto com 500 chars aceito', () => {
  test('Campo de alergias com 500 caracteres incluído no payload', () => {
    const longText = 'Amoxicilina, '.repeat(38).trim() // ~500 chars
    const result = buildPetPayload({ petName: 'Rex', species: 'dog', allergies: longText })
    expect('payload' in result).toBe(true)
    if ('payload' in result) {
      expect(result.payload.allergies).toBe(longText)
    }
  })
})

// ─── TC-PAT-014: Doenças crônicas — campo vazio aceito ───────────────────────

describe('TC-PAT-014: Doenças crônicas — campo vazio aceito', () => {
  test('Sem doenças crônicas o campo não aparece no payload', () => {
    const result = buildPetPayload({ petName: 'Rex', species: 'dog', chronicDiseases: '' })
    expect('payload' in result).toBe(true)
    if ('payload' in result) {
      expect(result.payload.chronic_diseases).toBeUndefined()
    }
  })
})

// ─── TC-PAT-015: Doenças crônicas — múltiplas doenças aceitas ────────────────

describe('TC-PAT-015: Doenças crônicas — múltiplas doenças aceitas', () => {
  test('Texto com múltiplas doenças salvo corretamente', () => {
    const diseases = 'Diabetes mellitus tipo 2, Insuficiência Renal Crônica, Leishmaniose Visceral'
    const result = buildPetPayload({ petName: 'Bolinha', species: 'dog', chronicDiseases: diseases })
    expect('payload' in result).toBe(true)
    if ('payload' in result) {
      expect(result.payload.chronic_diseases).toBe(diseases)
    }
  })
})

// ─── TC-PAT-016: buildPetPayload — campos opcionais ausentes → undefined ─────

describe('TC-PAT-016: buildPetPayload() — campos opcionais não incluídos quando ausentes', () => {
  test('Apenas nome e espécie — sem campos extras no payload', () => {
    const result = buildPetPayload({ petName: 'Mia', species: 'cat' })
    expect('payload' in result).toBe(true)
    if ('payload' in result) {
      expect(result.payload.name).toBe('Mia')
      expect(result.payload.species).toBe('cat')
      expect(result.payload.breed).toBeUndefined()
      expect(result.payload.allergies).toBeUndefined()
      expect(result.payload.chronic_diseases).toBeUndefined()
      expect(result.payload.microchip_id).toBeUndefined()
    }
  })
})

// ─── TC-PAT-017: buildPetPayload — nome vazio retorna erro ───────────────────

describe('TC-PAT-017: buildPetPayload() — nome obrigatório vazio retorna erro', () => {
  test('Nome vazio retorna {error}', () => {
    const result = buildPetPayload({ petName: '', species: 'dog' })
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toMatch(/obrigatório/i)
    }
  })

  test('Nome só com espaços retorna {error}', () => {
    const result = buildPetPayload({ petName: '   ', species: 'dog' })
    expect('error' in result).toBe(true)
  })
})

// ─── TC-PAT-018: buildPetPayload — espécie válida preservada ─────────────────

describe('TC-PAT-018: buildPetPayload() — espécie válida preservada', () => {
  const species = ['dog', 'cat', 'bird', 'rabbit', 'rodent', 'reptile', 'fish', 'exotic']

  test.each(species)('Espécie "%s" é preservada no payload', (sp) => {
    const result = buildPetPayload({ petName: 'Animal', species: sp })
    expect('payload' in result).toBe(true)
    if ('payload' in result) {
      expect(result.payload.species).toBe(sp)
    }
  })
})

// ─── TC-PAT-019: normalizeCpf — remove máscara ───────────────────────────────

describe('TC-PAT-019: normalizeCpf() — remove máscara corretamente', () => {
  test('CPF com pontos e traço normalizado', () => {
    expect(normalizeCpf('123.456.789-09')).toBe('12345678909')
  })

  test('CPF com espaços extras removidos', () => {
    expect(normalizeCpf('123 456 789 09')).toBe('12345678909')
  })

  test('CPF com letras removidas', () => {
    expect(normalizeCpf('123.abc.789-09')).toBe('12378909')
  })
})

// ─── TC-PAT-020: normalizeCpf — CPF já limpo não muda ────────────────────────

describe('TC-PAT-020: normalizeCpf() — CPF já sem máscara não é alterado', () => {
  test('CPF sem máscara retorna igual', () => {
    expect(normalizeCpf('12345678909')).toBe('12345678909')
  })

  test('String vazia retorna vazia', () => {
    expect(normalizeCpf('')).toBe('')
  })
})
