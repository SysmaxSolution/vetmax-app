/**
 * Unit — Stock constants (SERVICE_CATEGORIES, PRODUCT_CATEGORIES, REASON_SERVICE_CATEGORIES)
 */

import {
  SERVICE_CATEGORIES,
  PRODUCT_CATEGORIES,
  REASON_SERVICE_CATEGORIES,
  type StockCategory,
} from '@/lib/stock-constants'

describe('TC-STK-001 → SERVICE_CATEGORIES contém vet_service', () => {
  test('vet_service presente', () => {
    expect(SERVICE_CATEGORIES).toContain('vet_service')
  })
})

describe('TC-STK-002 → SERVICE_CATEGORIES contém exam', () => {
  test('exam presente', () => {
    expect(SERVICE_CATEGORIES).toContain('exam')
  })
})

describe('TC-STK-003 → SERVICE_CATEGORIES contém surgery', () => {
  test('surgery presente', () => {
    expect(SERVICE_CATEGORIES).toContain('surgery')
  })
})

describe('TC-STK-004 → SERVICE_CATEGORIES contém service genérico', () => {
  test('service presente', () => {
    expect(SERVICE_CATEGORIES).toContain('service')
  })
})

describe('TC-STK-005 → SERVICE_CATEGORIES contém grooming_service e aesthetics_service', () => {
  test('grooming_service presente', () => {
    expect(SERVICE_CATEGORIES).toContain('grooming_service')
  })
  test('aesthetics_service presente', () => {
    expect(SERVICE_CATEGORIES).toContain('aesthetics_service')
  })
})

describe('TC-STK-006 → PRODUCT_CATEGORIES contém medication', () => {
  test('medication presente', () => {
    expect(PRODUCT_CATEGORIES).toContain('medication')
  })
})

describe('TC-STK-007 → PRODUCT_CATEGORIES contém petshop', () => {
  test('petshop presente', () => {
    expect(PRODUCT_CATEGORIES).toContain('petshop')
  })
})

describe('TC-STK-008 → PRODUCT_CATEGORIES contém controlled_medication (Receituário Azul)', () => {
  test('controlled_medication presente', () => {
    expect(PRODUCT_CATEGORIES).toContain('controlled_medication')
  })
})

describe('TC-STK-009 → PRODUCT_CATEGORIES contém clinic_product', () => {
  test('clinic_product presente', () => {
    expect(PRODUCT_CATEGORIES).toContain('clinic_product')
  })
})

describe('TC-STK-010 → PRODUCT_CATEGORIES contém grooming_supply', () => {
  test('grooming_supply presente', () => {
    expect(PRODUCT_CATEGORIES).toContain('grooming_supply')
  })
})

describe('TC-STK-011 → PRODUCT_CATEGORIES contém aesthetics e other', () => {
  test('aesthetics presente', () => {
    expect(PRODUCT_CATEGORIES).toContain('aesthetics')
  })
  test('other presente', () => {
    expect(PRODUCT_CATEGORIES).toContain('other')
  })
})

describe('TC-STK-012 → Sem overlap entre SERVICE e PRODUCT', () => {
  test('Nenhuma categoria está nas duas listas', () => {
    for (const s of SERVICE_CATEGORIES) {
      expect(PRODUCT_CATEGORIES).not.toContain(s)
    }
    for (const p of PRODUCT_CATEGORIES) {
      expect(SERVICE_CATEGORIES).not.toContain(p)
    }
  })
})

describe('TC-STK-013 → REASON_SERVICE_CATEGORIES tem chaves esperadas', () => {
  test('consultation presente', () => {
    expect(REASON_SERVICE_CATEGORIES.consultation).toBeDefined()
  })
  test('follow_up presente', () => {
    expect(REASON_SERVICE_CATEGORIES.follow_up).toBeDefined()
  })
  test('emergency presente', () => {
    expect(REASON_SERVICE_CATEGORIES.emergency).toBeDefined()
  })
  test('vaccination presente', () => {
    expect(REASON_SERVICE_CATEGORIES.vaccination).toBeDefined()
  })
  test('exam presente', () => {
    expect(REASON_SERVICE_CATEGORIES.exam).toBeDefined()
  })
  test('surgery presente', () => {
    expect(REASON_SERVICE_CATEGORIES.surgery).toBeDefined()
  })
  test('grooming presente', () => {
    expect(REASON_SERVICE_CATEGORIES.grooming).toBeDefined()
  })
})

describe('TC-STK-014 → consultation usa vet_service + service', () => {
  test('Contém vet_service e service', () => {
    const arr = REASON_SERVICE_CATEGORIES.consultation!
    expect(arr).toContain('vet_service')
    expect(arr).toContain('service')
  })
})

describe('TC-STK-015 → surgery inclui vet_service', () => {
  test('surgery → contém vet_service', () => {
    expect(REASON_SERVICE_CATEGORIES.surgery).toContain('vet_service')
  })

  test('surgery → contém surgery', () => {
    expect(REASON_SERVICE_CATEGORIES.surgery).toContain('surgery')
  })
})

describe('TC-STK-016 → grooming NÃO tem service puro', () => {
  test('grooming categorias não incluem "service" genérico', () => {
    const arr = REASON_SERVICE_CATEGORIES.grooming!
    expect(arr).not.toContain('service')
  })

  test('grooming inclui grooming_service e aesthetics_service', () => {
    const arr = REASON_SERVICE_CATEGORIES.grooming!
    expect(arr).toContain('grooming_service')
    expect(arr).toContain('aesthetics_service')
  })
})

describe('TC-STK-017 → emergency inclui surgery', () => {
  test('Emergência permite cirurgia', () => {
    expect(REASON_SERVICE_CATEGORIES.emergency).toContain('surgery')
  })
})

describe('TC-STK-018 → exam reason inclui categoria exam', () => {
  test('exam → exam + service', () => {
    const arr = REASON_SERVICE_CATEGORIES.exam!
    expect(arr).toContain('exam')
    expect(arr).toContain('service')
  })
})

describe('TC-STK-019 → Categorias são strings', () => {
  test('SERVICE_CATEGORIES é array de strings', () => {
    for (const c of SERVICE_CATEGORIES) {
      expect(typeof c).toBe('string')
    }
  })
  test('PRODUCT_CATEGORIES é array de strings', () => {
    for (const c of PRODUCT_CATEGORIES) {
      expect(typeof c).toBe('string')
    }
  })
})

describe('TC-STK-020 → Counts esperados', () => {
  test('SERVICE_CATEGORIES tem 6 itens', () => {
    expect(SERVICE_CATEGORIES).toHaveLength(6)
  })
  test('PRODUCT_CATEGORIES tem 7 itens', () => {
    expect(PRODUCT_CATEGORIES).toHaveLength(7)
  })

  test('REASON_SERVICE_CATEGORIES tem 7 chaves', () => {
    expect(Object.keys(REASON_SERVICE_CATEGORIES)).toHaveLength(7)
  })
})
