import { extrairContraparte, rotuloContraparte } from '@/lib/financial/contraparte'

// Todos os exemplos abaixo são do extrato REAL da clínica, medidos em
// 2026-10-07 (53 de 54 transações traziam o campo). O Sicoob manda isso em
// `descInfComplementar`, que a gente descartava — o operador só via
// "PIX RECEBIDO - OUTRA IF", que não diz de quem é.
//
// A pegadinha: nos Pix a ORDEM varia. Numa linha vem nome e depois documento,
// noutra o contrário. Não dá para pegar por posição; decide pelo formato.

describe('Pix — nome e documento', () => {
  it('nome primeiro, documento depois', () => {
    const c = extrairContraparte('Recebimento Pix|@ROBERTA DE SOUZA PORTERO|@***.430.331-*')
    expect(c.nome).toBe('ROBERTA DE SOUZA PORTERO')
    expect(c.documento).toBe('***.430.331-*')
    expect(c.adquirente).toBeNull()
  })

  it('documento primeiro, nome depois — a ordem invertida que existe no extrato', () => {
    const c = extrairContraparte('Pagamento Pix|@51.097.732 0001-82|@fabio')
    expect(c.nome).toBe('fabio')
    expect(c.documento).toBe('51.097.732 0001-82')
  })

  it('documento mascarado com asteriscos não é confundido com nome', () => {
    const c = extrairContraparte('Pagamento Pix|@***.893.678-**|@cartao omini cc')
    expect(c.documento).toBe('***.893.678-**')
    expect(c.nome).toBe('cartao omini cc')
  })

  it('nome truncado pelo banco ainda serve', () => {
    const c = extrairContraparte('Recebimento Pix|@MARIA TERESA COSTA FELICIANO AMORIM|@**')
    expect(c.nome).toBe('MARIA TERESA COSTA FELICIANO AMORIM')
  })
})

describe('Cartão — adquirente e bandeira', () => {
  it.each([
    ['EVOLUSERVICES _Deb._Maestro', 'EVOLUSERVICES'],
    ['EVOLUSERVICES _Cred._Visa', 'EVOLUSERVICES'],
    ['SIPAG_Cred._Mastercard', 'SIPAG'],
  ])('%s → adquirente %s', (cru, esperado) => {
    const c = extrairContraparte(cru)
    expect(c.adquirente).toBe(esperado)
    expect(c.nome).toBeNull()   // cartão não tem pessoa do outro lado
  })
})

describe('degenerados não quebram', () => {
  it.each([null, undefined, '', '   '])('%p devolve tudo nulo', v => {
    const c = extrairContraparte(v)
    expect(c.nome).toBeNull()
    expect(c.documento).toBeNull()
    expect(c.adquirente).toBeNull()
  })

  it('texto solto é tratado como nome', () => {
    expect(extrairContraparte('TARIFA PACOTE SERVICOS').nome).toBe('TARIFA PACOTE SERVICOS')
  })

  it('o cru é SEMPRE preservado, mesmo quando não extrai nada', () => {
    const cru = 'formato|que|nao|conheco'
    expect(extrairContraparte(cru).cru).toBe(cru)
  })
})

describe('rótulo para a tela', () => {
  it('nome com documento', () => {
    expect(rotuloContraparte(extrairContraparte('Recebimento Pix|@ANA LUIZA|@***.111.222-*')))
      .toBe('ANA LUIZA · ***.111.222-*')
  })
  it('só adquirente quando é cartão', () => {
    expect(rotuloContraparte(extrairContraparte('SIPAG_Cred._Mastercard'))).toBe('SIPAG')
  })
  it('null quando não há nada para mostrar', () => {
    expect(rotuloContraparte(extrairContraparte(''))).toBeNull()
  })
})
