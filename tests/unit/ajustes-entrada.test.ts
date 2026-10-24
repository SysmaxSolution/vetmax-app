import { aplicarAjustes, resumirAjustes } from '@/lib/financial/ajustes-entrada'
import type { ParsedNFe } from '@/lib/utils/nfe-parser'

const NOTA: ParsedNFe = {
  nfe_key: '3'.repeat(44),
  nfe_number: '202142',
  nfe_series: '1',
  issue_date: '2026-10-20',
  total_value: 1310.25,
  supplier: { cnpj: '04852370000108', name: 'L.P.S. AGROFARMA LTDA' },
  items: [
    { description: 'VERMIFUGO 10ML', ncm: '01012100', ean: '07891234567895', quantity: 10, unit: 'UN', unit_price: 43.675, total_price: 436.75, cfop: '5102', cst: '000', tax_icms: 18, icms_base: 436.75, icms_value: 78.62 },
    { description: 'SERINGA 5ML',    ncm: '90183119', ean: undefined,        quantity: 20, unit: 'UN', unit_price: 2.50,   total_price: 50.00 },
    { description: 'LUVA NITRILICA', ncm: '40151900', ean: undefined,        quantity: 5,  unit: 'CX', unit_price: 164.70, total_price: 823.50 },
  ],
  duplicatas: [
    { numero: '001', vencimento: '2026-11-20', valor: 436.75 },
    { numero: '002', vencimento: '2026-12-05', valor: 873.50 },
  ],
} as ParsedNFe

describe('aplicarAjustes', () => {
  it('sem ajuste, nada muda', () => {
    expect(aplicarAjustes(NOTA)).toEqual(NOTA)
    expect(aplicarAjustes(NOTA, {})).toMatchObject({ items: NOTA.items })
  })

  it('reembalagem: mudar só a quantidade mantém o total e recalcula o unitário', () => {
    // 5 caixas de R$164,70 eram, na verdade, 10 unidades: o fornecedor cobrou
    // os mesmos R$823,50 — o que muda é quanto custa cada unidade.
    const r = aplicarAjustes(NOTA, { itens: [{ indice: 2, quantity: 10 }] })
    expect(r.items[2].quantity).toBe(10)
    expect(r.items[2].unit_price).toBe(82.35)
    expect(r.items[2].total_price).toBe(823.5)
    expect(r.total_value).toBe(NOTA.total_value)   // a nota não encolhe nem cresce
  })

  it('50 caixas com 2 viram 100 unidades pela metade do preço', () => {
    const nota = { ...NOTA, items: [{ ...NOTA.items[1], quantity: 50, unit_price: 10, total_price: 500 }] } as ParsedNFe
    const r = aplicarAjustes(nota, { itens: [{ indice: 0, quantity: 100 }] })
    expect(r.items[0].unit_price).toBe(5)
    expect(r.items[0].total_price).toBe(500)
  })

  it('recebeu menos: informar o unitário junto da quantidade recalcula o total', () => {
    // Chegaram 8 das 10 unidades, ao mesmo preço unitário.
    const r = aplicarAjustes(NOTA, { itens: [{ indice: 0, quantity: 8, unit_price: 43.675 }] })
    expect(r.items[0].quantity).toBe(8)
    expect(r.items[0].total_price).toBe(349.4)   // 8 × 43,675
    expect(r.total_value).toBe(Number((349.4 + 50 + 823.5).toFixed(2)))
  })

  it('informar o total recalcula o unitário', () => {
    const r = aplicarAjustes(NOTA, { itens: [{ indice: 1, total_price: 40 }] })
    expect(r.items[1].total_price).toBe(40)
    expect(r.items[1].unit_price).toBe(2)          // 40 / 20
  })

  it('respeita o total informado à mão junto do unitário, sem recalcular por cima', () => {
    const r = aplicarAjustes(NOTA, { itens: [{ indice: 0, quantity: 8, unit_price: 43.675, total_price: 350 }] })
    expect(r.items[0].total_price).toBe(350)
  })

  it('remove o item que não chegou', () => {
    const r = aplicarAjustes(NOTA, { itens: [{ indice: 1, excluir: true }] })
    expect(r.items).toHaveLength(2)
    expect(r.items.map(i => i.description)).not.toContain('SERINGA 5ML')
    expect(r.total_value).toBe(Number((436.75 + 823.5).toFixed(2)))
  })

  it('corrige a descrição que veio ruim do fornecedor', () => {
    const r = aplicarAjustes(NOTA, { itens: [{ indice: 0, description: 'Vermífugo 10ml — cães' }] })
    expect(r.items[0].description).toBe('Vermífugo 10ml — cães')
    expect(r.items[0].ncm).toBe('01012100')   // o resto fica como estava
  })

  it('corrige os impostos do item sem mexer no preço', () => {
    const r = aplicarAjustes(NOTA, { itens: [{ indice: 0, cfop: '1102', cst: '060', tax_icms: 0, icms_value: 0 }] })
    expect(r.items[0].cfop).toBe('1102')
    expect(r.items[0].cst).toBe('060')
    expect(r.items[0].tax_icms).toBe(0)
    expect(r.items[0].icms_value).toBe(0)
    expect(r.items[0].icms_base).toBe(436.75)   // o que não foi tocado permanece
    expect(r.items[0].total_price).toBe(436.75)
  })

  it('ajusta o vencimento combinado por fora', () => {
    const r = aplicarAjustes(NOTA, { duplicatas: [{ indice: 0, vencimento: '2026-11-30' }] })
    expect(r.duplicatas[0].vencimento).toBe('2026-11-30')
    expect(r.duplicatas[0].valor).toBe(436.75)
  })

  it('remove uma parcela', () => {
    const r = aplicarAjustes(NOTA, { duplicatas: [{ indice: 1, excluir: true }] })
    expect(r.duplicatas).toHaveLength(1)
  })
})

describe('valor inválido é ignorado, não vira zero', () => {
  it('quantidade vazia mantém a original', () => {
    const r = aplicarAjustes(NOTA, { itens: [{ indice: 0, quantity: undefined }] })
    expect(r.items[0].quantity).toBe(10)
    expect(r.items[0].unit_price).toBe(43.675)
  })

  it('valor negativo não passa', () => {
    const r = aplicarAjustes(NOTA, { itens: [{ indice: 0, unit_price: -5 }] })
    expect(r.items[0].unit_price).toBe(43.675)
  })

  it('texto em branco não apaga a descrição', () => {
    const r = aplicarAjustes(NOTA, { itens: [{ indice: 0, description: '   ' }] })
    expect(r.items[0].description).toBe('VERMIFUGO 10ML')
  })

  it('zero é um valor legítimo — brinde entra com preço zero', () => {
    const r = aplicarAjustes(NOTA, { itens: [{ indice: 0, unit_price: 0 }] })
    expect(r.items[0].unit_price).toBe(0)
    expect(r.items[0].total_price).toBe(0)
  })
})

describe('resumirAjustes', () => {
  it('nada mudou, nada a dizer', () => {
    expect(resumirAjustes(NOTA, aplicarAjustes(NOTA))).toBeNull()
  })

  it('conta o que mudou, para o histórico da compra', () => {
    const r = aplicarAjustes(NOTA, {
      itens: [{ indice: 0, quantity: 8, unit_price: 43.675 }, { indice: 1, excluir: true }],
    })
    const texto = resumirAjustes(NOTA, r)!
    expect(texto).toMatch(/1 item\(ns\) removido/)
    expect(texto).toMatch(/total/)
  })
})
