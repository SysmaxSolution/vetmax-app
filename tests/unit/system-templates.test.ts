/**
 * Unit — System templates (Sysmax built-in receita/encaminhamento)
 */

import {
  SYSMAX_TEMPLATE_IDS,
  isSystemTemplate,
  SYSTEM_TEMPLATES,
} from '@/lib/system-templates'

describe('TC-SYS-001 → isSystemTemplate detecta __sysmax_receita__', () => {
  test('Receita ID padrão → true', () => {
    expect(isSystemTemplate('__sysmax_receita__')).toBe(true)
  })
})

describe('TC-SYS-002 → isSystemTemplate detecta __sysmax_encaminhamento__', () => {
  test('Encaminhamento ID padrão → true', () => {
    expect(isSystemTemplate('__sysmax_encaminhamento__')).toBe(true)
  })
})

describe('TC-SYS-003 → isSystemTemplate rejeita IDs de usuário', () => {
  test('uuid normal → false', () => {
    expect(isSystemTemplate('user-template-uuid')).toBe(false)
  })

  test('"" → false', () => {
    expect(isSystemTemplate('')).toBe(false)
  })

  test('"_sysmax_" sem dois sublinhados → false', () => {
    expect(isSystemTemplate('_sysmax_receita_')).toBe(false)
  })
})

describe('TC-SYS-004 → SYSMAX_TEMPLATE_IDS expõe receita e encaminhamento', () => {
  test('receita ID', () => {
    expect(SYSMAX_TEMPLATE_IDS.receita).toBe('__sysmax_receita__')
  })

  test('encaminhamento ID', () => {
    expect(SYSMAX_TEMPLATE_IDS.encaminhamento).toBe('__sysmax_encaminhamento__')
  })
})

describe('TC-SYS-005 → SYSTEM_TEMPLATES tem exatamente 2 itens', () => {
  test('2 templates registrados', () => {
    expect(SYSTEM_TEMPLATES).toHaveLength(2)
  })
})

describe('TC-SYS-006 → Cada template tem id/clinic_id/name/type', () => {
  test.each(SYSTEM_TEMPLATES)('Template %s tem campos base', (t) => {
    expect(t.id).toBeDefined()
    expect(t.clinic_id).toBe('__sysmax__')
    expect(t.name).toBeDefined()
    expect(t.type).toBeDefined()
  })
})

describe('TC-SYS-007 → Cada template tem extracted_fields array', () => {
  test.each(SYSTEM_TEMPLATES)('Template %s tem extracted_fields array', (t) => {
    expect(Array.isArray(t.extracted_fields)).toBe(true)
    expect(t.extracted_fields.length).toBeGreaterThan(0)
  })
})

describe('TC-SYS-008 → Template receita tem field "medicamento" required', () => {
  test('medicamento field existe e é required', () => {
    const receita = SYSTEM_TEMPLATES.find(t => t.id === SYSMAX_TEMPLATE_IDS.receita)!
    const med = receita.extracted_fields.find(f => f.field_name === 'medicamento')
    expect(med).toBeDefined()
    expect(med?.required).toBe(true)
  })
})

describe('TC-SYS-009 → Template receita tem field "posologia" required', () => {
  test('posologia field existe e é required', () => {
    const receita = SYSTEM_TEMPLATES.find(t => t.id === SYSMAX_TEMPLATE_IDS.receita)!
    const pos = receita.extracted_fields.find(f => f.field_name === 'posologia')
    expect(pos).toBeDefined()
    expect(pos?.required).toBe(true)
  })
})

describe('TC-SYS-010 → Template receita tem fields opcionais (indicacao, observacoes)', () => {
  test('indicacao não-required', () => {
    const receita = SYSTEM_TEMPLATES.find(t => t.id === SYSMAX_TEMPLATE_IDS.receita)!
    const ind = receita.extracted_fields.find(f => f.field_name === 'indicacao')
    expect(ind?.required).toBe(false)
  })

  test('observacoes não-required', () => {
    const receita = SYSTEM_TEMPLATES.find(t => t.id === SYSMAX_TEMPLATE_IDS.receita)!
    const obs = receita.extracted_fields.find(f => f.field_name === 'observacoes')
    expect(obs?.required).toBe(false)
  })
})

describe('TC-SYS-011 → Template encaminhamento tem "especialidade" e "motivo" required', () => {
  test('Ambos required', () => {
    const enc = SYSTEM_TEMPLATES.find(t => t.id === SYSMAX_TEMPLATE_IDS.encaminhamento)!
    const esp = enc.extracted_fields.find(f => f.field_name === 'especialidade')
    const mot = enc.extracted_fields.find(f => f.field_name === 'motivo')
    expect(esp?.required).toBe(true)
    expect(mot?.required).toBe(true)
  })
})

describe('TC-SYS-012 → Template encaminhamento tem "historico" opcional', () => {
  test('Histórico não obrigatório', () => {
    const enc = SYSTEM_TEMPLATES.find(t => t.id === SYSMAX_TEMPLATE_IDS.encaminhamento)!
    const hist = enc.extracted_fields.find(f => f.field_name === 'historico')
    expect(hist).toBeDefined()
    expect(hist?.required).toBe(false)
  })
})

describe('TC-SYS-013 → Templates têm tipos corretos', () => {
  test('Receita tem type=receita', () => {
    const receita = SYSTEM_TEMPLATES.find(t => t.id === SYSMAX_TEMPLATE_IDS.receita)!
    expect(receita.type).toBe('receita')
  })

  test('Encaminhamento tem type=encaminhamento', () => {
    const enc = SYSTEM_TEMPLATES.find(t => t.id === SYSMAX_TEMPLATE_IDS.encaminhamento)!
    expect(enc.type).toBe('encaminhamento')
  })
})

describe('TC-SYS-014 → file_url é null para templates do sistema', () => {
  test.each(SYSTEM_TEMPLATES)('%s tem file_url null', (t) => {
    expect(t.file_url).toBeNull()
  })
})

describe('TC-SYS-015 → Todos os IDs do sistema passam por isSystemTemplate', () => {
  test.each(SYSTEM_TEMPLATES)('%s.id começa com __sysmax_', (t) => {
    expect(isSystemTemplate(t.id)).toBe(true)
  })
})
