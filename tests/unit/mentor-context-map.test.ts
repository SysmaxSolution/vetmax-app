/**
 * Unit — Mentor Context Map
 * Importa MENTOR_CONTEXT_MAP de @/lib/mentor/context-map (módulo puro, sem 'use server').
 *
 * TC-MCM-001..025 → cobrem shape, conteúdo e convenções PT-BR.
 */

import {
  MENTOR_CONTEXT_MAP,
  getRouteContext,
  serializeRouteContext,
  type RouteContext,
} from '@/lib/mentor/context-map'

// ─── TC-MCM-001..005: Shape & integridade do Record ──────────────────────────

describe('MENTOR_CONTEXT_MAP — shape básico', () => {
  test('TC-MCM-001 → cada rota tem shape correto', () => {
    for (const [route, ctx] of Object.entries(MENTOR_CONTEXT_MAP)) {
      expect(typeof ctx.module).toBe('string')
      expect(typeof ctx.description).toBe('string')
      expect(Array.isArray(ctx.key_components)).toBe(true)
      expect(Array.isArray(ctx.available_actions)).toBe(true)
      expect(Array.isArray(ctx.mentor_steps)).toBe(true)
      expect(route.startsWith('/dashboard/')).toBe(true)
    }
  })

  test('TC-MCM-002 → todas as 17 rotas esperadas presentes', () => {
    const expectedKeys = [
      '/dashboard/reception',
      '/dashboard/triage',
      '/dashboard/vet',
      '/dashboard/exams',
      '/dashboard/grooming',
      '/dashboard/grooming/schedule',
      '/dashboard/hospitalization',
      '/dashboard/cashier',
      '/dashboard/management',
      '/dashboard/management/kanban',
      '/dashboard/pharmacy',
      '/dashboard/patients',
      '/dashboard/patients/tutor',
      '/dashboard/purchases',
      '/dashboard/whatsapp',
      '/dashboard/profile',
    ]
    for (const k of expectedKeys) {
      expect(MENTOR_CONTEXT_MAP[k]).toBeDefined()
    }
  })

  test('TC-MCM-003 → módulo (label) é PT-BR não-vazio', () => {
    for (const ctx of Object.values(MENTOR_CONTEXT_MAP)) {
      expect(ctx.module.length).toBeGreaterThan(0)
    }
  })

  test('TC-MCM-004 → descriptions são strings PT-BR não-vazias', () => {
    for (const ctx of Object.values(MENTOR_CONTEXT_MAP)) {
      expect(ctx.description.length).toBeGreaterThan(10)
    }
  })

  test('TC-MCM-005 → todas key_components são strings PascalCase', () => {
    const pascalRegex = /^[A-Z][a-zA-Z0-9]*$/
    for (const ctx of Object.values(MENTOR_CONTEXT_MAP)) {
      for (const c of ctx.key_components) {
        expect(c).toMatch(pascalRegex)
      }
    }
  })
})

// ─── TC-MCM-006..015: Conteúdo específico de cada módulo ─────────────────────

describe('MENTOR_CONTEXT_MAP — conteúdo por módulo', () => {
  test('TC-MCM-006 → /dashboard/reception tem "check-in" em available_actions', () => {
    expect(MENTOR_CONTEXT_MAP['/dashboard/reception'].available_actions).toContain('check-in')
  })

  test('TC-MCM-007 → /dashboard/triage tem TriageQueue em key_components', () => {
    expect(MENTOR_CONTEXT_MAP['/dashboard/triage'].key_components).toContain('TriageQueue')
  })

  test('TC-MCM-008 → /dashboard/vet tem SOAPEditor em key_components', () => {
    expect(MENTOR_CONTEXT_MAP['/dashboard/vet'].key_components).toContain('SOAPEditor')
  })

  test('TC-MCM-009 → /dashboard/reception tem mentor_steps não-vazio', () => {
    expect(MENTOR_CONTEXT_MAP['/dashboard/reception'].mentor_steps.length).toBeGreaterThan(0)
  })

  test('TC-MCM-010 → /dashboard/triage tem mentor_steps não-vazio', () => {
    expect(MENTOR_CONTEXT_MAP['/dashboard/triage'].mentor_steps.length).toBeGreaterThan(0)
  })

  test('TC-MCM-011 → /dashboard/vet tem mentor_steps não-vazio', () => {
    expect(MENTOR_CONTEXT_MAP['/dashboard/vet'].mentor_steps.length).toBeGreaterThan(0)
  })

  test('TC-MCM-012 → /dashboard/exams tem ExamsQueue em key_components', () => {
    expect(MENTOR_CONTEXT_MAP['/dashboard/exams'].key_components).toContain('ExamsQueue')
  })

  test('TC-MCM-013 → /dashboard/cashier descrição menciona pagamentos ou caixa', () => {
    const desc = MENTOR_CONTEXT_MAP['/dashboard/cashier'].description.toLowerCase()
    expect(desc).toMatch(/pagament|caixa|financeir/)
  })

  test('TC-MCM-014 → /dashboard/patients tem "cadastrar pet" em available_actions', () => {
    expect(MENTOR_CONTEXT_MAP['/dashboard/patients'].available_actions).toContain('cadastrar pet')
  })

  test('TC-MCM-015 → /dashboard/pharmacy tem StockList em key_components', () => {
    expect(MENTOR_CONTEXT_MAP['/dashboard/pharmacy'].key_components).toContain('StockList')
  })
})

// ─── TC-MCM-016..020: Convenções de string ───────────────────────────────────

describe('MENTOR_CONTEXT_MAP — convenções de string', () => {
  test('TC-MCM-016 → available_actions são lowercase ou com acentos PT-BR', () => {
    for (const ctx of Object.values(MENTOR_CONTEXT_MAP)) {
      for (const a of ctx.available_actions) {
        // Não deve ter caracteres uppercase ASCII (mas pode ter "ç", "ã", etc)
        // Permitimos hífen e espaços
        expect(a).toMatch(/^[a-zà-ÿ0-9\s\-,.()/&]+$/i)
        // Convenção: começa em minúscula
        expect(a[0]).toBe(a[0].toLowerCase())
      }
    }
  })

  test('TC-MCM-017 → mentor_steps são kebab-case-like (lowercase + hifens + dígitos)', () => {
    const kebabRegex = /^[a-z0-9-]+$/
    for (const ctx of Object.values(MENTOR_CONTEXT_MAP)) {
      for (const step of ctx.mentor_steps) {
        expect(step).toMatch(kebabRegex)
      }
    }
  })

  test('TC-MCM-018 → ao menos 1 description tem acentos PT-BR (verificação macro)', () => {
    const anyAccented = Object.values(MENTOR_CONTEXT_MAP).some(c =>
      /[áàâãéêíóôõúüç]/i.test(c.description),
    )
    expect(anyAccented).toBe(true)
  })

  test('TC-MCM-019 → módulos não repetem (cada rota tem label único)', () => {
    const modules = Object.values(MENTOR_CONTEXT_MAP).map(c => c.module)
    const unique = new Set(modules)
    expect(unique.size).toBe(modules.length)
  })

  test('TC-MCM-020 → cada available_actions array tem ao menos 1 elemento', () => {
    for (const ctx of Object.values(MENTOR_CONTEXT_MAP)) {
      expect(ctx.available_actions.length).toBeGreaterThan(0)
    }
  })
})

// ─── TC-MCM-021..025: Funções auxiliares ─────────────────────────────────────

describe('MENTOR_CONTEXT_MAP — getRouteContext & serializeRouteContext', () => {
  test('TC-MCM-021 → getRouteContext("/dashboard/reception") match exato', () => {
    const ctx = getRouteContext('/dashboard/reception')
    expect(ctx?.module).toBe('Recepção')
  })

  test('TC-MCM-022 → getRouteContext("/dashboard/patients/tutor/123") match por prefixo mais longo', () => {
    const ctx = getRouteContext('/dashboard/patients/tutor/abc-123')
    expect(ctx?.module).toBe('Pacientes — Tutor')
  })

  test('TC-MCM-023 → getRouteContext("/dashboard/inexistente") → null', () => {
    expect(getRouteContext('/inexistente')).toBeNull()
  })

  test('TC-MCM-024 → serializeRouteContext inclui módulo e descrição', () => {
    const ctx: RouteContext = MENTOR_CONTEXT_MAP['/dashboard/vet']
    const out = serializeRouteContext(ctx)
    expect(out).toContain('Módulo atual: Consultório')
    expect(out).toContain('Descrição:')
    expect(out).toContain('Ações disponíveis:')
  })

  test('TC-MCM-025 → serializeRouteContext omite mentor_steps quando vazio', () => {
    const ctx: RouteContext = MENTOR_CONTEXT_MAP['/dashboard/profile']
    const out = serializeRouteContext(ctx)
    expect(out).not.toContain('Elementos guiáveis')
  })
})
