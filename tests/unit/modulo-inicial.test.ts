/**
 * Unit — pouso em /dashboard (escolherModuloInicial) e rota por módulo.
 * Cobre o loop de 29/10/2026: admin com módulo bloqueado em user_module_access
 * não pode ser mandado para o próprio módulo bloqueado.
 */

import { escolherModuloInicial } from '@/lib/dashboard/modulo-inicial'
import { pathForModule, moduleKeyFromPath } from '@/config/path-modules'

const CLINICA = ['reception', 'patients', 'consultation', 'exams', 'financial', 'reports']

describe('escolherModuloInicial', () => {
  it('admin sem linhas pousa na recepção', () => {
    expect(escolherModuloInicial({ role: 'admin', clinicModules: CLINICA, acessos: [] })).toBe('reception')
  })

  it('admin com recepção/consultório/exames desmarcados (caso Aline) pousa no próximo da preferência', () => {
    const acessos = ['reception', 'consultation', 'exams'].map(m => ({ module_name: m, enabled: false }))
    expect(escolherModuloInicial({ role: 'admin', clinicModules: CLINICA, acessos })).toBe('patients')
  })

  it('admin com TODOS os módulos desmarcados (caso Bruna) ainda entra', () => {
    const acessos = CLINICA.map(m => ({ module_name: m, enabled: false }))
    expect(escolherModuloInicial({ role: 'admin', clinicModules: CLINICA, acessos })).toBe('reception')
  })

  it('recepcionista só pousa em módulo liberado', () => {
    const acessos = [{ module_name: 'reception', enabled: false }, { module_name: 'patients', enabled: true }]
    expect(escolherModuloInicial({ role: 'receptionist', clinicModules: CLINICA, acessos })).toBe('patients')
  })

  it('recepcionista sem nada liberado → null (página de orientação, não redirect)', () => {
    expect(escolherModuloInicial({ role: 'receptionist', clinicModules: CLINICA, acessos: [] })).toBeNull()
  })

  it('nunca devolve módulo que a clínica não tem ativo', () => {
    const acessos = [{ module_name: 'pharmacy', enabled: true }]
    expect(escolherModuloInicial({ role: 'pharmacist', clinicModules: ['reception', 'patients'], acessos })).toBeNull()
    expect(escolherModuloInicial({ role: 'vet', clinicModules: ['patients'], acessos: [{ module_name: 'patients', enabled: true }] })).toBe('patients')
  })

  it('SysMax é tratado como admin', () => {
    expect(escolherModuloInicial({ role: 'vet', isSysmax: true, clinicModules: ['financial'], acessos: [] })).toBe('financial')
  })

  it('clínica sem módulos → null', () => {
    expect(escolherModuloInicial({ role: 'admin', clinicModules: [], acessos: [] })).toBeNull()
  })
})

describe('pathForModule', () => {
  it('usa o segmento canônico (não o alias) e fecha o ciclo com moduleKeyFromPath', () => {
    expect(pathForModule('reception')).toBe('/dashboard/reception')
    expect(pathForModule('consultation')).toBe('/dashboard/vet')
    expect(pathForModule('exams')).toBe('/dashboard/exams')
    expect(pathForModule('whatsapp_intelligent')).toBe('/dashboard/whatsapp')
    expect(pathForModule('internal_chat')).toBe('/dashboard/internal-chat')
    for (const m of ['reception', 'consultation', 'financial', 'internal_chat', 'purchases']) {
      expect(moduleKeyFromPath(pathForModule(m))).toBe(m)
    }
  })
})
