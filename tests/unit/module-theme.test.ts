/**
 * Unit — Module theme (path → key, theme lookup)
 */

import { MODULE_THEME, getModuleFromPath, getTabTheme } from '@/lib/module-theme'

const ALL_PATHS: [string, string][] = [
  ['/dashboard/reception',       'reception'],
  ['/dashboard/patients',        'patients'],
  ['/dashboard/triage',          'triage'],
  ['/dashboard/vet',             'vet'],
  ['/dashboard/exams',           'exams'],
  ['/dashboard/hospitalization', 'hospitalization'],
  ['/dashboard/grooming',        'grooming'],
  ['/dashboard/pharmacy',        'pharmacy'],
  ['/dashboard/sales',           'sales'],
  ['/dashboard/cashier',         'cashier'],
  ['/dashboard/registry',        'registry'],
  ['/dashboard/management',      'management'],
  ['/dashboard/whatsapp',        'whatsapp'],
  ['/dashboard/purchases',       'purchases'],
  ['/dashboard/financial',       'financial'],
  ['/dashboard/reports',         'reports'],
]

describe('TC-THEME-001 → getModuleFromPath retorna key correta para cada prefixo', () => {
  test.each(ALL_PATHS)('%s → %s', (path, expected) => {
    expect(getModuleFromPath(path)).toBe(expected)
  })
})

describe('TC-THEME-002 → Path com sufixo (subrota) ainda casa o prefixo', () => {
  test('/dashboard/reception/123 → reception', () => {
    expect(getModuleFromPath('/dashboard/reception/123')).toBe('reception')
  })

  test('/dashboard/vet/consult/456 → vet', () => {
    expect(getModuleFromPath('/dashboard/vet/consult/456')).toBe('vet')
  })

  test('/dashboard/exams/upload?file=x → exams', () => {
    expect(getModuleFromPath('/dashboard/exams/upload?file=x')).toBe('exams')
  })
})

describe('TC-THEME-003 → Path desconhecido retorna null', () => {
  test('/outro/path → null', () => {
    expect(getModuleFromPath('/outro/path')).toBeNull()
  })

  test('/api/foo → null', () => {
    expect(getModuleFromPath('/api/foo')).toBeNull()
  })

  test('"" → null', () => {
    expect(getModuleFromPath('')).toBeNull()
  })
})

describe('TC-THEME-004 → MODULE_THEME tem todas keys do PATH_TO_MODULE', () => {
  test.each(ALL_PATHS)('MODULE_THEME tem entry "%s"', (_path, key) => {
    expect(MODULE_THEME).toHaveProperty(key)
  })
})

describe('TC-THEME-005 → Cada theme tem campos bg/bgIntense/active/hover', () => {
  test.each(Object.keys(MODULE_THEME))('Theme "%s" tem todos os campos', (k) => {
    const t = MODULE_THEME[k as keyof typeof MODULE_THEME]
    expect(t).toHaveProperty('bg')
    expect(t).toHaveProperty('bgIntense')
    expect(t).toHaveProperty('active')
    expect(t).toHaveProperty('hover')
  })
})

describe('TC-THEME-006 → getTabTheme retorna theme do módulo', () => {
  test('/dashboard/reception → bg-blue-50', () => {
    expect(getTabTheme('/dashboard/reception').bg).toBe('bg-blue-50')
  })

  test('/dashboard/vet → bg-indigo-50', () => {
    expect(getTabTheme('/dashboard/vet').bg).toBe('bg-indigo-50')
  })

  test('/dashboard/pharmacy → bg-orange-50', () => {
    expect(getTabTheme('/dashboard/pharmacy').bg).toBe('bg-orange-50')
  })
})

describe('TC-THEME-007 → getTabTheme retorna fallback para path desconhecido', () => {
  test('/outro → fallback slate', () => {
    const t = getTabTheme('/outro')
    expect(t.bg).toBe('bg-slate-50')
    expect(t.active).toBe('bg-slate-900')
    expect(t.hover).toMatch(/slate/)
  })
})

describe('TC-THEME-008 → MODULE_THEME.reception específico', () => {
  test('Cores blue para reception', () => {
    expect(MODULE_THEME.reception.bg).toBe('bg-blue-50')
    expect(MODULE_THEME.reception.active).toBe('bg-blue-600')
  })
})

describe('TC-THEME-009 → MODULE_THEME.cashier específico', () => {
  test('Cores green para cashier', () => {
    expect(MODULE_THEME.cashier.bg).toBe('bg-green-50')
    expect(MODULE_THEME.cashier.active).toBe('bg-green-600')
  })
})

describe('TC-THEME-010 → MODULE_THEME.triage específico', () => {
  test('Cores amber para triage', () => {
    expect(MODULE_THEME.triage.bg).toBe('bg-amber-50')
    expect(MODULE_THEME.triage.active).toBe('bg-amber-500')
  })
})

describe('TC-THEME-011 → MODULE_THEME.whatsapp específico', () => {
  test('Cores green para whatsapp', () => {
    expect(MODULE_THEME.whatsapp.bg).toBe('bg-green-50')
    expect(MODULE_THEME.whatsapp.active).toBe('bg-green-500')
  })
})

describe('TC-THEME-012 → MODULE_THEME.purchases específico', () => {
  test('Cores purple para purchases', () => {
    expect(MODULE_THEME.purchases.bg).toBe('bg-purple-50')
    expect(MODULE_THEME.purchases.active).toBe('bg-purple-600')
  })
})

describe('TC-THEME-013 → Path sem prefix /dashboard retorna null', () => {
  test('/vet (sem dashboard) → null', () => {
    expect(getModuleFromPath('/vet')).toBeNull()
  })

  test('/triage (sem dashboard) → null', () => {
    expect(getModuleFromPath('/triage')).toBeNull()
  })
})

describe('TC-THEME-014 → Hover sempre contém "hover:"', () => {
  test.each(Object.entries(MODULE_THEME))('Theme "%s" hover usa prefixo Tailwind', (k, t) => {
    expect(t.hover).toMatch(/hover:/)
  })
})

describe('TC-THEME-015 → bg sempre começa com "bg-"', () => {
  test.each(Object.entries(MODULE_THEME))('Theme "%s" bg começa com bg-', (k, t) => {
    expect(t.bg).toMatch(/^bg-/)
    expect(t.bgIntense).toMatch(/^bg-/)
    expect(t.active).toMatch(/^bg-/)
  })
})
