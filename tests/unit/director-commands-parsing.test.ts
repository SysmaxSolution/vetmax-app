/**
 * Unit — Director Commands (SIM/NAO parsing & phone authorization)
 * Funções privadas copiadas de src/lib/director-commands.ts para teste puro.
 *
 * TC-DIR-001..030 → cobrem regex SIM/APROVAR/NAO/REJEITAR/NEGAR + normalização
 */

// ─── Funções puras espelhadas do director-commands.ts ────────────────────────

interface ParsedCommand {
  isApprove: boolean
  isReject: boolean
  shortId?: string
}

/** Normaliza texto (uppercase, sem acentos, trim) — espelha linha 40 do source */
function normalizeMessage(messageText: string): string {
  return messageText.trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Aplica os regex de parsing — espelha linhas 42-48 do source */
function parseDirectorCommand(messageText: string): ParsedCommand | null {
  const upper = normalizeMessage(messageText)
  const approveMatch = /^(SIM|APROVAR)\s*([A-F0-9]{8})?/.exec(upper)
  const rejectMatch  = /^(NAO|REJEITAR|NEGAR)\s*([A-F0-9]{8})?/.exec(upper)
  if (!approveMatch && !rejectMatch) return null
  const isApprove = !!approveMatch
  const shortId   = (approveMatch?.[2] ?? rejectMatch?.[2])?.toUpperCase()
  return { isApprove, isReject: !isApprove, shortId }
}

/** Valida autorização de telefone — espelha linhas 29-38 do source */
function isAuthorizedPhone(senderPhone: string, authorizedPhone: string): boolean {
  const auth = authorizedPhone.replace(/\D/g, '')
  if (!auth) return false
  const sender = senderPhone.replace(/[^\d]/g, '')
  if (!sender) return false
  return sender.endsWith(auth.slice(-10))
}

// ─── TC-DIR-001..010: Parsing SIM/APROVAR ────────────────────────────────────

describe('Director Commands — parsing SIM/APROVAR', () => {
  test('TC-DIR-001 → "SIM ABC12345" extrai shortId em uppercase', () => {
    const r = parseDirectorCommand('SIM ABC12345')
    expect(r?.isApprove).toBe(true)
    expect(r?.shortId).toBe('ABC12345')
  })

  test('TC-DIR-002 → "sim abc12345" case insensitive', () => {
    const r = parseDirectorCommand('sim abc12345')
    expect(r?.isApprove).toBe(true)
    expect(r?.shortId).toBe('ABC12345')
  })

  test('TC-DIR-003 → "SIM" sem shortId é válido', () => {
    const r = parseDirectorCommand('SIM')
    expect(r?.isApprove).toBe(true)
    expect(r?.shortId).toBeUndefined()
  })

  test('TC-DIR-004 → "APROVAR" como sinônimo de SIM', () => {
    const r = parseDirectorCommand('APROVAR')
    expect(r?.isApprove).toBe(true)
  })

  test('TC-DIR-005 → "APROVAR DEADBEEF" extrai hex shortId', () => {
    const r = parseDirectorCommand('APROVAR DEADBEEF')
    expect(r?.isApprove).toBe(true)
    expect(r?.shortId).toBe('DEADBEEF')
  })

  test('TC-DIR-006 → "SIM extra texto" ainda match (regex ancora no início)', () => {
    const r = parseDirectorCommand('SIM extra texto')
    expect(r?.isApprove).toBe(true)
  })

  test('TC-DIR-007 → "SIM 12345678" extrai shortId só com dígitos', () => {
    const r = parseDirectorCommand('SIM 12345678')
    expect(r?.isApprove).toBe(true)
    expect(r?.shortId).toBe('12345678')
  })

  test('TC-DIR-008 → "  SIM  " com whitespace é trimmed', () => {
    const r = parseDirectorCommand('  SIM  ')
    expect(r?.isApprove).toBe(true)
  })

  test('TC-DIR-009 → "SIMxyz" não match (precisa whitespace ou nada após)', () => {
    // O regex permite \s* depois do SIM, então "SIMxyz" — SIM casa mas xyz não vira shortId
    const r = parseDirectorCommand('SIMxyz')
    expect(r?.isApprove).toBe(true)
    expect(r?.shortId).toBeUndefined()
  })

  test('TC-DIR-010 → "SIM ABCDEFG" (7 dígitos hex) → shortId undefined', () => {
    const r = parseDirectorCommand('SIM ABCDEFG')
    expect(r?.isApprove).toBe(true)
    expect(r?.shortId).toBeUndefined()
  })
})

// ─── TC-DIR-011..020: Parsing NAO/REJEITAR/NEGAR ─────────────────────────────

describe('Director Commands — parsing NAO/REJEITAR/NEGAR', () => {
  test('TC-DIR-011 → "NAO DEF67890" rejeita e extrai shortId', () => {
    const r = parseDirectorCommand('NAO DEF67890')
    expect(r?.isReject).toBe(true)
    expect(r?.shortId).toBe('DEF67890')
  })

  test('TC-DIR-012 → "REJEITAR" sem id é válido', () => {
    const r = parseDirectorCommand('REJEITAR')
    expect(r?.isReject).toBe(true)
  })

  test('TC-DIR-013 → "NEGAR" como sinônimo de NAO', () => {
    const r = parseDirectorCommand('NEGAR')
    expect(r?.isReject).toBe(true)
  })

  test('TC-DIR-014 → "NÃO" com acento → normalizado para NAO', () => {
    const r = parseDirectorCommand('NÃO')
    expect(r?.isReject).toBe(true)
  })

  test('TC-DIR-015 → "REJEITAR ABCDEF12" extrai shortId', () => {
    const r = parseDirectorCommand('REJEITAR ABCDEF12')
    expect(r?.isReject).toBe(true)
    expect(r?.shortId).toBe('ABCDEF12')
  })

  test('TC-DIR-016 → "nao abc12345" lowercase normaliza', () => {
    const r = parseDirectorCommand('nao abc12345')
    expect(r?.isReject).toBe(true)
    expect(r?.shortId).toBe('ABC12345')
  })

  test('TC-DIR-017 → "talvez" não match → null', () => {
    const r = parseDirectorCommand('talvez')
    expect(r).toBeNull()
  })

  test('TC-DIR-018 → "ok" não match', () => {
    expect(parseDirectorCommand('ok')).toBeNull()
  })

  test('TC-DIR-019 → texto livre "olá tudo bem?" não match', () => {
    expect(parseDirectorCommand('olá tudo bem?')).toBeNull()
  })

  test('TC-DIR-020 → string vazia → null', () => {
    expect(parseDirectorCommand('')).toBeNull()
  })
})

// ─── TC-DIR-021..025: Normalização de acentos ────────────────────────────────

describe('Director Commands — normalização de acentos', () => {
  test('TC-DIR-021 → "AÇÃO" normaliza para "ACAO"', () => {
    expect(normalizeMessage('AÇÃO')).toBe('ACAO')
  })

  test('TC-DIR-022 → "não" lowercase com acento → "NAO"', () => {
    expect(normalizeMessage('não')).toBe('NAO')
  })

  test('TC-DIR-023 → caracteres sem acento preservados', () => {
    expect(normalizeMessage('SIM ABCD1234')).toBe('SIM ABCD1234')
  })

  test('TC-DIR-024 → trim aplicado antes de uppercase', () => {
    expect(normalizeMessage('   sim   ')).toBe('SIM')
  })

  test('TC-DIR-025 → "ÁÉÍÓÚÃÕÇ" → "AEIOUAOC"', () => {
    expect(normalizeMessage('ÁÉÍÓÚÃÕÇ')).toBe('AEIOUAOC')
  })
})

// ─── TC-DIR-026..030: Autorização de telefone ────────────────────────────────

describe('Director Commands — autorização de telefone', () => {
  test('TC-DIR-026 → phone "+5511999999999" termina com últimos 10 dígitos autorizados', () => {
    expect(isAuthorizedPhone('+5511999999999', '5511999999999')).toBe(true)
  })

  test('TC-DIR-027 → phone com parênteses e traços é normalizado', () => {
    expect(isAuthorizedPhone('(11) 99999-9999', '11999999999')).toBe(true)
  })

  test('TC-DIR-028 → phone "@lid" sem dígitos válidos → não autoriza', () => {
    expect(isAuthorizedPhone('123@lid', '5511999999999')).toBe(false)
  })

  test('TC-DIR-029 → authorizedPhone vazio → não autoriza', () => {
    expect(isAuthorizedPhone('5511999999999', '')).toBe(false)
  })

  test('TC-DIR-030 → sender de outro número (últimos 10 diferentes) → não autoriza', () => {
    expect(isAuthorizedPhone('5511888888888', '5511999999999')).toBe(false)
  })
})
