import { tituloCombina, donoCombina } from '@/lib/financial/busca-titulo'

const PAGAR = { description: 'NF 202142 ração', beneficiary: 'L.P.S. AGROFARMA LTDA', tutor_name: null, patient_name: null, tutor_document: null, supplier_document: '04.852.370/0001-08' }
const RECEBER = { description: 'Consulta', beneficiary: null, tutor_name: 'José Antônio da Silva', patient_name: 'Thor', tutor_document: '123.456.789-09', supplier_document: null }

describe('tituloCombina', () => {
  it('vazio casa com tudo', () => {
    expect(tituloCombina(PAGAR, '')).toBe(true)
    expect(tituloCombina(RECEBER, '   ')).toBe(true)
  })

  it('nome sem acento e em qualquer caixa', () => {
    expect(tituloCombina(RECEBER, 'jose antonio')).toBe(true)
    expect(tituloCombina(RECEBER, 'JOSÉ')).toBe(true)
    expect(tituloCombina(PAGAR, 'agrofarma')).toBe(true)
  })

  it('CNPJ do fornecedor, inteiro, parcial, com ou sem pontuação', () => {
    expect(tituloCombina(PAGAR, '04852370000108')).toBe(true)
    expect(tituloCombina(PAGAR, '04.852.370')).toBe(true)
    expect(tituloCombina(PAGAR, '0001-08')).toBe(true)
    expect(tituloCombina(PAGAR, '99.999')).toBe(false)
  })

  it('CPF do tutor no contas a receber', () => {
    expect(tituloCombina(RECEBER, '123.456.789-09')).toBe(true)
    expect(tituloCombina(RECEBER, '456789')).toBe(true)
    expect(tituloCombina(RECEBER, '04852')).toBe(false)
  })

  it('pet e descrição continuam valendo', () => {
    expect(tituloCombina(RECEBER, 'thor')).toBe(true)
    expect(tituloCombina(PAGAR, 'racao')).toBe(true)   // "ração" sem acento
    expect(tituloCombina(PAGAR, '202142')).toBe(true)  // número dentro da descrição
  })

  it('dois dígitos não valem como documento (bateriam com quase tudo)', () => {
    expect(tituloCombina(PAGAR, '08')).toBe(false)
  })
})

describe('donoCombina (filtro Cliente/Fornecedor)', () => {
  it('ignora a descrição, aceita nome, pet e documento', () => {
    expect(donoCombina(PAGAR, '202142')).toBe(false)
    expect(donoCombina(PAGAR, 'agrofarma')).toBe(true)
    expect(donoCombina(PAGAR, '04.852.370/0001-08')).toBe(true)
    expect(donoCombina(RECEBER, 'thor')).toBe(true)
    expect(donoCombina(RECEBER, '789-09')).toBe(true)
  })
})
