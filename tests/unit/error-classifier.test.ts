/**
 * Unit — inferModuleFromPath (cópia local — função não exportada)
 * Heurística de fallback que classifica erros por path da URL.
 */

// ─── Cópia fiel de inferModuleFromPath (src/lib/error-classifier.ts:71-89) ────

function inferModuleFromPath(path: string): string | null {
  const p = path.toLowerCase()
  if (p.includes('auth')         || p.includes('login'))       return 'auth'
  if (p.includes('triage')       || p.includes('transcribe'))  return 'triage'
  if (p.includes('mentor')       || p.includes('mentor-chat')) return 'mentor'
  if (p.includes('diagnosis')    || p.includes('vet'))         return 'vet'
  if (p.includes('prescription')) return 'vet'
  if (p.includes('exam'))        return 'exams'
  if (p.includes('grooming'))    return 'grooming'
  if (p.includes('hospitali'))   return 'hospitalization'
  if (p.includes('cashier')      || p.includes('caixa'))       return 'cashier'
  if (p.includes('pharmacy')     || p.includes('farmacia'))    return 'pharmacy'
  if (p.includes('patient')      || p.includes('paciente'))    return 'patients'
  if (p.includes('whatsapp')     || p.includes('wpp'))         return 'whatsapp'
  if (p.includes('reception')    || p.includes('recepcao'))    return 'reception'
  if (p.includes('management')   || p.includes('gestao'))      return 'management'
  if (p.includes('template')     || p.includes('registry'))    return 'registry'
  return null
}

// ─── Test cases por palavra-chave ─────────────────────────────────────────────

describe('TC-ERR-001 → /auth → auth', () => {
  test('/auth/login retorna auth', () => {
    expect(inferModuleFromPath('/auth/login')).toBe('auth')
  })

  test('/api/auth/callback retorna auth', () => {
    expect(inferModuleFromPath('/api/auth/callback')).toBe('auth')
  })
})

describe('TC-ERR-002 → /login → auth', () => {
  test('login isolado', () => {
    expect(inferModuleFromPath('/login')).toBe('auth')
  })
})

describe('TC-ERR-003 → /triage → triage', () => {
  test('Triagem retorna triage', () => {
    expect(inferModuleFromPath('/dashboard/triage')).toBe('triage')
  })
})

describe('TC-ERR-004 → /transcribe → triage', () => {
  test('Transcribe é classificado como triage', () => {
    expect(inferModuleFromPath('/api/transcribe')).toBe('triage')
  })
})

describe('TC-ERR-005 → /mentor → mentor', () => {
  test('Mentor retorna mentor', () => {
    expect(inferModuleFromPath('/api/mentor')).toBe('mentor')
  })
})

describe('TC-ERR-006 → /mentor-chat → mentor', () => {
  test('Mentor chat retorna mentor', () => {
    expect(inferModuleFromPath('/api/mentor-chat/route')).toBe('mentor')
  })
})

describe('TC-ERR-007 → /vet → vet', () => {
  test('Vet retorna vet', () => {
    expect(inferModuleFromPath('/dashboard/vet')).toBe('vet')
  })
})

describe('TC-ERR-008 → /diagnosis → vet', () => {
  test('Diagnosis é classificado como vet', () => {
    expect(inferModuleFromPath('/api/diagnosis')).toBe('vet')
  })
})

describe('TC-ERR-009 → /prescription → vet', () => {
  test('Prescription é classificado como vet', () => {
    expect(inferModuleFromPath('/api/prescription')).toBe('vet')
  })
})

describe('TC-ERR-010 → /exam → exams', () => {
  test('Exam retorna exams', () => {
    expect(inferModuleFromPath('/dashboard/exams')).toBe('exams')
  })

  test('exam singular também casa', () => {
    expect(inferModuleFromPath('/api/exam/123')).toBe('exams')
  })
})

describe('TC-ERR-011 → /grooming → grooming', () => {
  test('Grooming retorna grooming', () => {
    expect(inferModuleFromPath('/dashboard/grooming')).toBe('grooming')
  })
})

describe('TC-ERR-012 → /hospitalization → hospitalization', () => {
  test('Hospitalization → hospitalization (via "hospitali")', () => {
    expect(inferModuleFromPath('/dashboard/hospitalization')).toBe('hospitalization')
  })

  test('hospitalize também casa', () => {
    expect(inferModuleFromPath('/api/hospitalize')).toBe('hospitalization')
  })
})

describe('TC-ERR-013 → /cashier → cashier', () => {
  test('Cashier retorna cashier', () => {
    expect(inferModuleFromPath('/dashboard/cashier')).toBe('cashier')
  })
})

describe('TC-ERR-014 → /caixa → cashier', () => {
  test('Caixa (PT) retorna cashier', () => {
    expect(inferModuleFromPath('/dashboard/caixa')).toBe('cashier')
  })
})

describe('TC-ERR-015 → /pharmacy → pharmacy', () => {
  test('Pharmacy retorna pharmacy', () => {
    expect(inferModuleFromPath('/dashboard/pharmacy')).toBe('pharmacy')
  })
})

describe('TC-ERR-016 → /farmacia → pharmacy', () => {
  test('Farmacia (PT) retorna pharmacy', () => {
    expect(inferModuleFromPath('/dashboard/farmacia')).toBe('pharmacy')
  })
})

describe('TC-ERR-017 → /patient → patients', () => {
  test('Patient retorna patients', () => {
    expect(inferModuleFromPath('/api/patient/edit')).toBe('patients')
  })
})

describe('TC-ERR-018 → /paciente → patients', () => {
  test('Paciente (PT) retorna patients', () => {
    expect(inferModuleFromPath('/dashboard/paciente')).toBe('patients')
  })
})

describe('TC-ERR-019 → /whatsapp → whatsapp', () => {
  test('Whatsapp retorna whatsapp', () => {
    expect(inferModuleFromPath('/dashboard/whatsapp')).toBe('whatsapp')
  })
})

describe('TC-ERR-020 → /wpp → whatsapp', () => {
  test('Wpp curto retorna whatsapp', () => {
    expect(inferModuleFromPath('/api/wpp/send')).toBe('whatsapp')
  })
})

describe('TC-ERR-021 → /reception → reception', () => {
  test('Reception retorna reception', () => {
    expect(inferModuleFromPath('/dashboard/reception')).toBe('reception')
  })
})

describe('TC-ERR-022 → /recepcao → reception', () => {
  test('Recepcao (PT) retorna reception', () => {
    expect(inferModuleFromPath('/dashboard/recepcao')).toBe('reception')
  })
})

describe('TC-ERR-023 → /management → management', () => {
  test('Management retorna management', () => {
    expect(inferModuleFromPath('/dashboard/management')).toBe('management')
  })
})

describe('TC-ERR-024 → /gestao → management', () => {
  test('Gestao (PT) retorna management', () => {
    expect(inferModuleFromPath('/dashboard/gestao')).toBe('management')
  })
})

describe('TC-ERR-025 → /template e /registry → registry', () => {
  test('template → registry', () => {
    expect(inferModuleFromPath('/api/template/upload')).toBe('registry')
  })

  test('registry → registry', () => {
    expect(inferModuleFromPath('/api/registry/list')).toBe('registry')
  })
})

describe('TC-ERR-026 → Path desconhecido → null', () => {
  test('/foo/bar retorna null', () => {
    expect(inferModuleFromPath('/foo/bar')).toBeNull()
  })

  test('/random retorna null', () => {
    expect(inferModuleFromPath('/random/path')).toBeNull()
  })

  test('"" retorna null', () => {
    expect(inferModuleFromPath('')).toBeNull()
  })
})

describe('TC-ERR-027 → Case insensitive (UPPERCASE)', () => {
  test('/AUTH/LOGIN → auth', () => {
    expect(inferModuleFromPath('/AUTH/LOGIN')).toBe('auth')
  })

  test('/Dashboard/TRIAGE → triage', () => {
    expect(inferModuleFromPath('/Dashboard/TRIAGE')).toBe('triage')
  })

  test('/Pharmacy → pharmacy', () => {
    expect(inferModuleFromPath('/Pharmacy')).toBe('pharmacy')
  })
})

describe('TC-ERR-028 → Path com query string', () => {
  test('Query string não interfere', () => {
    expect(inferModuleFromPath('/dashboard/vet?id=123&q=x')).toBe('vet')
  })
})

describe('TC-ERR-029 → Ordem de prioridade (auth > triage > mentor > vet)', () => {
  test('Path com várias keywords retorna a primeira correspondida', () => {
    // "auth" tem prioridade sobre "vet"
    expect(inferModuleFromPath('/auth/vet')).toBe('auth')
    // "triage" tem prioridade sobre "exam"
    expect(inferModuleFromPath('/triage/exam')).toBe('triage')
  })
})
