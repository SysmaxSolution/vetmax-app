/**
 * Unit — Evolution API formatPhone (privado)
 * Função copiada de src/lib/evolution-api-client.ts (linha 18-23) para teste puro.
 *
 * TC-EVO-001..020 → cobrem 8/12/13 dígitos, prefixo 55, JID @lid e @s.whatsapp.net
 */

// ─── Função pura copiada ─────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  if (raw.includes('@')) return raw
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('55') && digits.length >= 12 ? digits : '55' + digits
}

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('Evolution formatPhone — prefixo BR', () => {
  test('TC-EVO-001 → já tem prefixo 55 e 13 dígitos (celular SP) → mantém', () => {
    expect(formatPhone('5511999998888')).toBe('5511999998888')
  })

  test('TC-EVO-002 → já tem 55 e 12 dígitos (fixo SP) → mantém', () => {
    expect(formatPhone('551133334444')).toBe('551133334444')
  })

  test('TC-EVO-003 → sem prefixo 55 (11 dígitos celular) → adiciona 55', () => {
    expect(formatPhone('11999998888')).toBe('5511999998888')
  })

  test('TC-EVO-004 → 10 dígitos fixo sem 55 → adiciona 55', () => {
    expect(formatPhone('1133334444')).toBe('551133334444')
  })

  test('TC-EVO-005 → 8 dígitos puros → 55 + 8 dígitos', () => {
    expect(formatPhone('99998888')).toBe('5599998888')
  })

  test('TC-EVO-006 → com parênteses e traços → limpa e formata', () => {
    expect(formatPhone('(11) 99999-8888')).toBe('5511999998888')
  })

  test('TC-EVO-007 → com espaços → limpa e formata', () => {
    expect(formatPhone('11 99999 8888')).toBe('5511999998888')
  })

  test('TC-EVO-008 → com + na frente → remove e mantém', () => {
    expect(formatPhone('+5511999998888')).toBe('5511999998888')
  })

  test('TC-EVO-009 → "55" puro sem mais nada → "5555" (curto demais → adiciona 55)', () => {
    // length < 12 → prepend 55
    expect(formatPhone('55')).toBe('5555')
  })

  test('TC-EVO-010 → vazio → "55" (só prefixo)', () => {
    expect(formatPhone('')).toBe('55')
  })
})

describe('Evolution formatPhone — JIDs WhatsApp (passthrough)', () => {
  test('TC-EVO-011 → "@lid" suffix → retorna como está', () => {
    expect(formatPhone('12345678901234@lid')).toBe('12345678901234@lid')
  })

  test('TC-EVO-012 → "@s.whatsapp.net" → retorna como está', () => {
    expect(formatPhone('5511999998888@s.whatsapp.net')).toBe('5511999998888@s.whatsapp.net')
  })

  test('TC-EVO-013 → "@g.us" (grupo) → retorna como está', () => {
    expect(formatPhone('120363025@g.us')).toBe('120363025@g.us')
  })

  test('TC-EVO-014 → "@" sozinho → passthrough', () => {
    expect(formatPhone('@')).toBe('@')
  })

  test('TC-EVO-015 → JID com email-like format → passthrough (apenas verifica @)', () => {
    expect(formatPhone('contato@dominio.com')).toBe('contato@dominio.com')
  })
})

describe('Evolution formatPhone — edge cases', () => {
  test('TC-EVO-016 → string só com letras → "55" (digits vazio + 55)', () => {
    expect(formatPhone('abcdef')).toBe('55')
  })

  test('TC-EVO-017 → "551199999" (9 dígitos, começa com 55 mas length < 12) → prepend 55', () => {
    expect(formatPhone('551199999')).toBe('55551199999')
  })

  test('TC-EVO-018 → "55119999988" (11 dígitos, começa com 55 mas < 12) → prepend 55', () => {
    expect(formatPhone('55119999988')).toBe('5555119999988')
  })

  test('TC-EVO-019 → "551199999888" (exatamente 12 dígitos) → mantém', () => {
    expect(formatPhone('551199999888')).toBe('551199999888')
  })

  test('TC-EVO-020 → número internacional não-BR (44 = UK) → trata como BR (prepend 55)', () => {
    // O algoritmo é BR-only — qualquer não-55 é tratado como nacional sem prefix
    expect(formatPhone('441234567890')).toBe('55441234567890')
  })
})
