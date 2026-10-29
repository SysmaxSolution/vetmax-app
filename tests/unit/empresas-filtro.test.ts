/**
 * Unit — filtro por empresa faturante (atribuição de título e cláusula PostgREST).
 */

import {
  empresaDoTitulo, tituloNasEmpresas, normalizarSelecao, clausulaOrDeEmpresas,
  contasDasEmpresas, rotuloDaSelecao, type MapaDeEmpresas,
} from '@/lib/financial/empresas-filtro'

const RX = 'c-rx', ANA = 'c-ana', FRA = 'c-fra'
const mapa: MapaDeEmpresas = {
  padraoId: RX,
  contaEmpresa: new Map([
    ['b-rx', RX], ['b-ana', ANA], ['b-fra', FRA], ['b-solta', null],
  ]),
}

describe('empresaDoTitulo', () => {
  it('company_id gravado vence a conta de liquidação', () => {
    expect(empresaDoTitulo({ company_id: ANA, settlement_bank_id: 'b-fra' }, mapa)).toBe(ANA)
  })
  it('sem company_id, herda a empresa da conta', () => {
    expect(empresaDoTitulo({ company_id: null, settlement_bank_id: 'b-fra' }, mapa)).toBe(FRA)
  })
  it('sem company_id e sem conta (ou conta sem empresa), é da padrão', () => {
    expect(empresaDoTitulo({ company_id: null, settlement_bank_id: null }, mapa)).toBe(RX)
    expect(empresaDoTitulo({ company_id: null, settlement_bank_id: 'b-solta' }, mapa)).toBe(RX)
  })
  it('sem empresa padrão, título sem marcação fica sem empresa', () => {
    expect(empresaDoTitulo({}, { ...mapa, padraoId: null })).toBeNull()
  })
})

describe('tituloNasEmpresas / normalizarSelecao', () => {
  it('seleção vazia = todas', () => {
    expect(tituloNasEmpresas({ company_id: FRA }, [], mapa)).toBe(true)
  })
  it('filtra pela atribuição', () => {
    expect(tituloNasEmpresas({ company_id: null, settlement_bank_id: 'b-ana' }, [ANA], mapa)).toBe(true)
    expect(tituloNasEmpresas({ company_id: null, settlement_bank_id: 'b-ana' }, [FRA], mapa)).toBe(false)
    expect(tituloNasEmpresas({ company_id: null }, [RX], mapa)).toBe(true)
  })
  it('normaliza: ids desconhecidos caem, todas = sem filtro', () => {
    expect(normalizarSelecao(['x', ANA], [RX, ANA, FRA])).toEqual([ANA])
    expect(normalizarSelecao([RX, ANA, FRA], [RX, ANA, FRA])).toEqual([])
    expect(normalizarSelecao(undefined, [RX])).toEqual([])
  })
})

describe('clausulaOrDeEmpresas', () => {
  it('sem seleção não há cláusula', () => {
    expect(clausulaOrDeEmpresas([], mapa)).toBeNull()
  })
  it('empresa que não é a padrão: company_id ou conta dela', () => {
    expect(clausulaOrDeEmpresas([ANA], mapa)).toBe(
      'company_id.in.(c-ana),and(company_id.is.null,settlement_bank_id.in.(b-ana))',
    )
  })
  it('com a padrão na seleção, títulos sem marcação e contas soltas entram', () => {
    expect(clausulaOrDeEmpresas([RX, FRA], mapa)).toBe(
      'company_id.in.(c-rx,c-fra)'
      + ',and(company_id.is.null,settlement_bank_id.in.(b-rx,b-fra))'
      + ',and(company_id.is.null,settlement_bank_id.is.null)'
      + ',and(company_id.is.null,settlement_bank_id.in.(b-solta))',
    )
  })
})

describe('contasDasEmpresas / rotuloDaSelecao', () => {
  const contas = [{ id: 'b-rx', company_id: RX }, { id: 'b-ana', company_id: ANA }, { id: 'b-solta', company_id: null }]
  it('conta sem empresa acompanha a padrão', () => {
    expect(contasDasEmpresas(contas, [RX], RX).map(c => c.id)).toEqual(['b-rx', 'b-solta'])
    expect(contasDasEmpresas(contas, [ANA], RX).map(c => c.id)).toEqual(['b-ana'])
    expect(contasDasEmpresas(contas, [], RX)).toHaveLength(3)
  })
  it('rótulo', () => {
    const emp = [{ id: RX, name: 'Develey' }, { id: ANA, name: 'ANA LAB' }, { id: FRA, name: 'Francisco' }]
    expect(rotuloDaSelecao([], emp)).toBe('Todas as empresas')
    expect(rotuloDaSelecao([ANA], emp)).toBe('ANA LAB')
    expect(rotuloDaSelecao([ANA, FRA], emp)).toBe('2 de 3 empresas')
  })
})
