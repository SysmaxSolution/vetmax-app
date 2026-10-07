import { pendenciasDoPagador, pagadorPronto, avisoDoPagador, pagadorDeTutor } from '@/lib/financial/pagador-boleto'

// O defeito de origem: emitOrReprintBoleto montava
//   { nome: 'Pagador', cpfCnpj: '', endereco: '', bairro: '', cidade: '', cep: '', uf: '' }
// e, mesmo COM tutor, deixava bairro/cidade/cep/uf vazios por código fixo —
// o select buscava só name, cpf, address, email. O `tutors` sempre teve tudo.
//
// Em produção, só 10 de 65 tutores tinham todos os campos do pagador. Sem
// aviso prévio, o usuário descobriria isso no erro do banco.

const completo = {
  nome: 'Maria Souza', cpfCnpj: '529.982.247-25', endereco: 'Rua das Flores, 100',
  bairro: 'Centro', cidade: 'Ribeirão Preto', cep: '14010-100', uf: 'SP',
}

describe('pendenciasDoPagador', () => {
  it('pagador completo não tem pendência', () => {
    expect(pendenciasDoPagador(completo)).toEqual([])
    expect(pagadorPronto(completo)).toBe(true)
  })

  it('pagador vazio acusa os 7 campos obrigatórios', () => {
    const f = pendenciasDoPagador({})
    expect(f.map(x => x.campo)).toEqual(['nome', 'cpfCnpj', 'endereco', 'bairro', 'cidade', 'cep', 'uf'])
  })

  it('o pagador fictício que o código montava é recusado', () => {
    const f = pendenciasDoPagador({ nome: 'Pagador', cpfCnpj: '', endereco: '', bairro: '', cidade: '', cep: '', uf: '' })
    expect(f.length).toBe(6)
    expect(f.some(x => x.campo === 'cpfCnpj')).toBe(true)
  })

  it('distingue "não preenchido" de "inválido" — são correções diferentes', () => {
    expect(pendenciasDoPagador({ ...completo, cpfCnpj: '' })[0].motivo).toBe('não preenchido')
    expect(pendenciasDoPagador({ ...completo, cpfCnpj: '529.982.247-26' })[0].motivo).toMatch(/dígito/)
  })

  it('confere o dígito do CPF/CNPJ', () => {
    expect(pagadorPronto({ ...completo, cpfCnpj: '529.982.247-25' })).toBe(true)
    expect(pagadorPronto({ ...completo, cpfCnpj: '529.982.247-26' })).toBe(false)
    expect(pagadorPronto({ ...completo, cpfCnpj: '67.264.369/0001-82' })).toBe(true)  // CNPJ também
  })

  it('CEP precisa de 8 dígitos; a máscara não importa', () => {
    expect(pagadorPronto({ ...completo, cep: '14010100' })).toBe(true)
    expect(pagadorPronto({ ...completo, cep: '14010-100' })).toBe(true)
    expect(pendenciasDoPagador({ ...completo, cep: '1401' })[0].motivo).toMatch(/8 dígitos/)
  })

  it('UF precisa de 2 letras', () => {
    expect(pagadorPronto({ ...completo, uf: 'SP' })).toBe(true)
    expect(pendenciasDoPagador({ ...completo, uf: 'São Paulo' })[0].motivo).toMatch(/2 letras/)
  })

  it('espaço em branco conta como não preenchido', () => {
    expect(pendenciasDoPagador({ ...completo, cidade: '   ' })[0].campo).toBe('cidade')
  })

  it('a ordem segue o preenchimento da tela, de cima para baixo', () => {
    const f = pendenciasDoPagador({ nome: 'X', cpfCnpj: '529.982.247-25' })
    expect(f.map(x => x.campo)).toEqual(['endereco', 'bairro', 'cidade', 'cep', 'uf'])
  })
})

describe('avisoDoPagador — informativo, não trava', () => {
  it('não avisa nada quando está pronto', () => {
    expect(avisoDoPagador(completo)).toBeNull()
  })

  it('uma pendência: frase no singular, dizendo onde corrigir', () => {
    const msg = avisoDoPagador({ ...completo, bairro: '' })!
    expect(msg).toContain('Bairro')
    expect(msg).toContain('cadastro do Tutor')
    expect(msg).toMatch(/falta /)
  })

  it('várias pendências: diz quantas e lista', () => {
    const msg = avisoDoPagador({ nome: 'X', cpfCnpj: '529.982.247-25' })!
    expect(msg).toMatch(/faltam 5 dados/)
    expect(msg).toContain('Endereço')
    expect(msg).toContain('UF')
  })

  it('aceita outro destino de correção (fornecedor)', () => {
    expect(avisoDoPagador({}, 'no cadastro do Fornecedor')).toContain('Fornecedor')
  })
})

describe('pagadorDeTutor', () => {
  it('junta rua e número no endereço que o banco espera', () => {
    const p = pagadorDeTutor({ name: 'Ana', cpf: '529.982.247-25', address: 'Rua A', address_number: '42',
      neighborhood: 'Centro', city: 'RP', state: 'SP', cep: '14010100' })
    expect(p.endereco).toBe('Rua A, 42')
    expect(pagadorPronto(p)).toBe(true)
  })

  it('sem número, manda só a rua', () => {
    expect(pagadorDeTutor({ address: 'Rua A' }).endereco).toBe('Rua A')
  })

  it('tutor vazio vira pagador com tudo pendente — e não quebra', () => {
    const p = pagadorDeTutor({})
    expect(p.endereco).toBeNull()
    expect(pendenciasDoPagador(p).length).toBe(7)
  })

  it('o caso real: tutor com só nome, cpf e address (o que o select antigo buscava)', () => {
    const p = pagadorDeTutor({ name: 'João', cpf: '529.982.247-25', address: 'Rua B, 10', email: 'j@x.com' })
    const f = pendenciasDoPagador(p)
    // Exatamente os campos que o código antigo mandava vazios ao banco.
    expect(f.map(x => x.campo)).toEqual(['bairro', 'cidade', 'cep', 'uf'])
  })
})
