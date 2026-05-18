/**
 * Unit — Module Governance
 * verifyMasterKey, canEnableModule, moduleGovernanceMiddleware, hashMasterKey.
 *
 * Atenção: MASTER_KEY_HASH é calculado no carregamento do módulo.
 * Setamos process.env.SYSMAX_MASTER_KEY antes de importar dinamicamente.
 */

process.env.SYSMAX_MASTER_KEY = 'test-key-fixed-for-tests'

import {
  verifyMasterKey,
  canEnableModule,
  moduleGovernanceMiddleware,
  hashMasterKey,
} from '@/lib/module-governance'

// ─── hashMasterKey ────────────────────────────────────────────────────────────

describe('TC-GOV-001 → hashMasterKey é determinístico', () => {
  test('Mesma entrada → mesmo hash', () => {
    expect(hashMasterKey('abc')).toBe(hashMasterKey('abc'))
  })
})

describe('TC-GOV-002 → hashMasterKey produz SHA-256 hex (64 chars)', () => {
  test('64 caracteres hex', () => {
    const h = hashMasterKey('qualquer-coisa')
    expect(h).toHaveLength(64)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('TC-GOV-003 → hashMasterKey diferente para entradas diferentes', () => {
  test('"a" !== "b"', () => {
    expect(hashMasterKey('a')).not.toBe(hashMasterKey('b'))
  })
})

describe('TC-GOV-004 → hashMasterKey aceita string vazia', () => {
  test('"" produz hash conhecido', () => {
    // SHA-256 do empty string
    expect(hashMasterKey('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })
})

// ─── verifyMasterKey ──────────────────────────────────────────────────────────

describe('TC-GOV-005 → verifyMasterKey true quando bate', () => {
  test('Chave igual à env → true', () => {
    expect(verifyMasterKey('test-key-fixed-for-tests')).toBe(true)
  })
})

describe('TC-GOV-006 → verifyMasterKey false quando errada', () => {
  test('Chave diferente → false', () => {
    expect(verifyMasterKey('chave-errada')).toBe(false)
  })
})

describe('TC-GOV-007 → verifyMasterKey false quando undefined', () => {
  test('Sem chave → false', () => {
    expect(verifyMasterKey(undefined)).toBe(false)
  })

  test('Vazio → false', () => {
    expect(verifyMasterKey('')).toBe(false)
  })
})

describe('TC-GOV-008 → verifyMasterKey usa comparação timing-safe', () => {
  test('Chave parcial não passa (hash diferente)', () => {
    expect(verifyMasterKey('test')).toBe(false)
    expect(verifyMasterKey('test-key')).toBe(false)
    expect(verifyMasterKey('test-key-fixed-for-tests-extra')).toBe(false)
  })
})

// ─── canEnableModule (role) ──────────────────────────────────────────────────

describe('TC-GOV-009 → canEnableModule admin pode habilitar', () => {
  test('admin + reception → allowed', () => {
    const r = canEnableModule('admin', 'reception')
    expect(r.allowed).toBe(true)
  })
})

describe('TC-GOV-010 → canEnableModule owner pode habilitar', () => {
  test('owner + triage → allowed', () => {
    const r = canEnableModule('owner', 'triage')
    expect(r.allowed).toBe(true)
  })
})

describe('TC-GOV-011 → canEnableModule vet rejeitado', () => {
  test('vet → not allowed (role inválido)', () => {
    const r = canEnableModule('vet', 'consultation')
    expect(r.allowed).toBe(false)
    expect(r.reason).toMatch(/admins|donos/i)
  })
})

describe('TC-GOV-012 → canEnableModule receptionist rejeitado', () => {
  test('receptionist → not allowed', () => {
    const r = canEnableModule('receptionist', 'reception')
    expect(r.allowed).toBe(false)
  })
})

describe('TC-GOV-013 → canEnableModule outro role rejeitado', () => {
  test('groomer → not allowed', () => {
    const r = canEnableModule('groomer', 'grooming')
    expect(r.allowed).toBe(false)
  })

  test('string vazia → not allowed', () => {
    const r = canEnableModule('', 'reception')
    expect(r.allowed).toBe(false)
  })
})

// ─── canEnableModule (whitelist) ─────────────────────────────────────────────

describe('TC-GOV-014 → Módulo fora da whitelist default rejeitado', () => {
  test('admin + "modulo-inexistente" → not allowed', () => {
    const r = canEnableModule('admin', 'modulo-inexistente')
    expect(r.allowed).toBe(false)
    expect(r.reason).toMatch(/não permitido/i)
  })
})

describe('TC-GOV-015 → Whitelist default cobre módulos clínicos', () => {
  const modulosDefault = [
    'reception',
    'triage',
    'consultation',
    'exams',
    'pharmacy',
    'billing',
    'grooming',
    'insurance',
    'hospitalization',
  ]

  test.each(modulosDefault)('admin + %s → allowed', (mod) => {
    const r = canEnableModule('admin', mod)
    expect(r.allowed).toBe(true)
  })
})

describe('TC-GOV-016 → Whitelist customizada substitui default', () => {
  test('Apenas "custom-mod" no whitelist', () => {
    const r1 = canEnableModule('admin', 'custom-mod', { allowedModules: ['custom-mod'] })
    expect(r1.allowed).toBe(true)
    const r2 = canEnableModule('admin', 'reception', { allowedModules: ['custom-mod'] })
    expect(r2.allowed).toBe(false)
  })
})

describe('TC-GOV-017 → Whitelist vazia rejeita tudo', () => {
  test('Lista vazia bloqueia qualquer módulo', () => {
    // Atenção: o code-path usa "|| default". Lista vazia [] é falsy? Não — array vazio é truthy.
    // Então whitelist=[] de fato bloqueia tudo
    const r = canEnableModule('admin', 'reception', { allowedModules: [] })
    expect(r.allowed).toBe(false)
  })
})

// ─── canEnableModule (requireVerification) ───────────────────────────────────

describe('TC-GOV-018 → requireVerification sem masterKey rejeita', () => {
  test('Sem chave + verification on → not allowed', () => {
    const r = canEnableModule('admin', 'reception', { requireVerification: true })
    expect(r.allowed).toBe(false)
    expect(r.reason).toMatch(/chave mestra/i)
  })
})

describe('TC-GOV-019 → requireVerification com masterKey errada rejeita', () => {
  test('Chave errada → not allowed', () => {
    const r = canEnableModule('admin', 'reception', {
      requireVerification: true,
      masterKey: 'errada',
    })
    expect(r.allowed).toBe(false)
  })
})

describe('TC-GOV-020 → requireVerification com masterKey correta aceita', () => {
  test('Chave correta → allowed', () => {
    const r = canEnableModule('admin', 'reception', {
      requireVerification: true,
      masterKey: 'test-key-fixed-for-tests',
    })
    expect(r.allowed).toBe(true)
  })
})

describe('TC-GOV-021 → requireVerification false ignora masterKey', () => {
  test('Verificação desligada → masterKey opcional', () => {
    const r = canEnableModule('admin', 'reception', { requireVerification: false })
    expect(r.allowed).toBe(true)
  })
})

// ─── moduleGovernanceMiddleware ───────────────────────────────────────────────

describe('TC-GOV-022 → middleware bloqueia quando role insuficiente', () => {
  test('vet + reception → blocked', () => {
    const req = new Request('https://x/y')
    const r = moduleGovernanceMiddleware(req, 'vet', 'reception')
    expect(r.blocked).toBe(true)
    expect(r.reason).toMatch(/admins|donos/i)
  })
})

describe('TC-GOV-023 → middleware permite quando OK', () => {
  test('admin + reception → not blocked', () => {
    const req = new Request('https://x/y')
    const r = moduleGovernanceMiddleware(req, 'admin', 'reception')
    expect(r.blocked).toBe(false)
  })
})

describe('TC-GOV-024 → middleware bloqueia módulo inválido', () => {
  test('admin + xpto → blocked', () => {
    const req = new Request('https://x/y')
    const r = moduleGovernanceMiddleware(req, 'admin', 'xpto')
    expect(r.blocked).toBe(true)
  })
})

describe('TC-GOV-025 → middleware respeita MODULE_GOVERNANCE_STRICT', () => {
  test('STRICT=true + sem masterKey → blocked', () => {
    const original = process.env.MODULE_GOVERNANCE_STRICT
    process.env.MODULE_GOVERNANCE_STRICT = 'true'
    try {
      const req = new Request('https://x/y')
      const r = moduleGovernanceMiddleware(req, 'admin', 'reception')
      expect(r.blocked).toBe(true)
      expect(r.reason).toMatch(/chave mestra/i)
    } finally {
      if (original === undefined) delete process.env.MODULE_GOVERNANCE_STRICT
      else process.env.MODULE_GOVERNANCE_STRICT = original
    }
  })
})

describe('TC-GOV-026 → middleware STRICT=true + masterKey correta passa', () => {
  test('Chave correta + STRICT → not blocked', () => {
    const original = process.env.MODULE_GOVERNANCE_STRICT
    process.env.MODULE_GOVERNANCE_STRICT = 'true'
    try {
      const req = new Request('https://x/y')
      const r = moduleGovernanceMiddleware(req, 'admin', 'reception', 'test-key-fixed-for-tests')
      expect(r.blocked).toBe(false)
    } finally {
      if (original === undefined) delete process.env.MODULE_GOVERNANCE_STRICT
      else process.env.MODULE_GOVERNANCE_STRICT = original
    }
  })
})

describe('TC-GOV-027 → hash de chave de teste consistente', () => {
  test('hashMasterKey reproduzível', () => {
    const h1 = hashMasterKey('test-key-fixed-for-tests')
    const h2 = hashMasterKey('test-key-fixed-for-tests')
    expect(h1).toBe(h2)
  })
})

describe('TC-GOV-028 → canEnableModule sem options (default whitelist)', () => {
  test('Default whitelist é usada', () => {
    const r = canEnableModule('admin', 'pharmacy')
    expect(r.allowed).toBe(true)
  })
})

describe('TC-GOV-029 → canEnableModule retorno tem campo reason quando blocked', () => {
  test('Reason presente em rejeição', () => {
    const r = canEnableModule('vet', 'reception')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBeDefined()
    expect(typeof r.reason).toBe('string')
  })
})

describe('TC-GOV-030 → canEnableModule retorno sem reason quando OK', () => {
  test('Sem reason em sucesso', () => {
    const r = canEnableModule('admin', 'reception')
    expect(r.allowed).toBe(true)
    expect(r.reason).toBeUndefined()
  })
})
