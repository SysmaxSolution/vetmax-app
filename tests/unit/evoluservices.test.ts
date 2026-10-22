// EvoluServices / FinPet — conversão de valores e tradução de erros.
//
// O teste de valores é o mais importante da integração: a mesma integração usa
// três formatos de valor, e o mesmo campo (`splits[].value`) tem formato
// diferente em cada API. Errar aqui cobra ou repassa 100× o devido.

import {
  valorParaLink,
  valorParaTransacaoRemota,
  lerValorDeles,
  validarSplit,
  comissaoEmValor,
} from '@/lib/integrations/evoluservices-valores'
import {
  traduzirErro,
  BANDEIRAS,
  STATUS_TERMINAL,
} from '@/lib/integrations/evoluservices-erros'

describe('valor para o Link de Pagamento (string de centavos)', () => {
  it('converte reais em centavos, como string sem separador', () => {
    expect(valorParaLink(10)).toBe('1000')
    expect(valorParaLink(0.5)).toBe('50')
    expect(valorParaLink(1234.56)).toBe('123456')
    expect(valorParaLink(10000)).toBe('1000000')   // o exemplo da doc
  })

  it('não tropeça no ponto flutuante do binário', () => {
    // 2.675 * 100 dá 267.49999999999997 em IEEE 754.
    expect(valorParaLink(2.675)).toBe('268')
    expect(valorParaLink(0.07)).toBe('7')
    expect(valorParaLink(1.005)).toBe('101')
  })

  it('recusa valor negativo em vez de mandar lixo para a operadora', () => {
    expect(() => valorParaLink(-1)).toThrow()
  })
})

describe('valor para a Transação Remota (decimal com 2 casas)', () => {
  it('usa ponto e SEMPRE duas casas — a validação deles é \\d+\\.\\d{2}', () => {
    expect(valorParaTransacaoRemota(10)).toBe('10.00')
    expect(valorParaTransacaoRemota(0.5)).toBe('0.50')
    expect(valorParaTransacaoRemota(1234.56)).toBe('1234.56')
    expect(valorParaTransacaoRemota(2)).toBe('2.00')      // o exemplo da doc
  })

  it('valor inteiro não sai como "10" nem "10.0" — seria recusado', () => {
    for (const v of [1, 5, 100, 999]) {
      expect(valorParaTransacaoRemota(v)).toMatch(/^\d+\.\d{2}$/)
    }
  })

  it('zero centavos mantém as duas casas', () => {
    expect(valorParaTransacaoRemota(7)).toBe('7.00')
  })
})

describe('os dois formatos NÃO se confundem — é o erro de 100×', () => {
  it('o mesmo valor sai diferente em cada API', () => {
    const reais = 96
    expect(valorParaLink(reais)).toBe('9600')              // centavos
    expect(valorParaTransacaoRemota(reais)).toBe('96.00')  // decimal
    expect(valorParaLink(reais)).not.toBe(valorParaTransacaoRemota(reais))
  })

  it('o split segue o formato do SEU endpoint, não um formato único', () => {
    // Split de R$ 2,00: "200" no link, "2.00" na maquininha.
    expect(valorParaLink(2)).toBe('200')
    expect(valorParaTransacaoRemota(2)).toBe('2.00')
  })
})

describe('leitura de valor que vem deles', () => {
  it('decimal é tratado como reais', () => {
    expect(lerValorDeles(4.95)).toBe(4.95)
    expect(lerValorDeles('10.00')).toBe(10)
    expect(lerValorDeles('1234,56')).toBe(1234.56)
  })

  it('inteiro sem separador é tratado como centavos', () => {
    expect(lerValorDeles('1000')).toBe(10)
    expect(lerValorDeles('9600')).toBe(96)
  })

  it('vazio e nulo valem zero, não quebram a leitura do callback', () => {
    expect(lerValorDeles(null)).toBe(0)
    expect(lerValorDeles(undefined)).toBe(0)
    expect(lerValorDeles('')).toBe(0)
  })

  it('formato irreconhecível falha em voz alta em vez de virar zero silencioso', () => {
    expect(() => lerValorDeles('dez reais')).toThrow()
  })
})

describe('validação do split antes de enviar', () => {
  it('aceita split que cabe no valor da venda', () => {
    expect(validarSplit(100, [{ valor: 30 }])).toEqual({ ok: true })
    expect(validarSplit(100, [{ valor: 50 }, { valor: 50 }])).toEqual({ ok: true })
  })

  it('recusa soma maior que a venda, com mensagem em português', () => {
    const r = validarSplit(100, [{ valor: 60, nome: 'Dr. A' }, { valor: 50, nome: 'Dr. B' }]) as { erro: string }
    expect(r.erro).toContain('passa do valor da venda')
    expect(r.erro).toContain('R$')
  })

  it('recusa parte com valor zero ou negativo, nomeando o beneficiário', () => {
    const r = validarSplit(100, [{ valor: 0, nome: 'Dr. C' }]) as { erro: string }
    expect(r.erro).toContain('Dr. C')
  })

  it('split exatamente igual ao total é aceito (100% de repasse)', () => {
    expect(validarSplit(85, [{ valor: 85 }])).toEqual({ ok: true })
  })
})

describe('comissão: percentual vira valor absoluto', () => {
  it('converte porque a API não aceita percentual', () => {
    expect(comissaoEmValor(100, 30)).toBe(30)
    expect(comissaoEmValor(85, 20)).toBe(17)
  })

  it('a sobra de arredondamento fica com a clínica, nunca com o beneficiário', () => {
    // 33,33% de R$ 100 = R$ 33,33 (e não 33,34).
    expect(comissaoEmValor(100, 33.33)).toBe(33.33)
    // 1/3 de R$ 10 = 3,33, truncado para baixo.
    expect(comissaoEmValor(10, 33.3333)).toBe(3.33)
  })

  it('percentual zero ou negativo não gera repasse', () => {
    expect(comissaoEmValor(100, 0)).toBe(0)
    expect(comissaoEmValor(100, -5)).toBe(0)
  })

  it('percentual acima de 100 é contido em 100', () => {
    expect(comissaoEmValor(50, 150)).toBe(50)
  })

  it('a comissão nunca passa do total, qualquer que seja o percentual', () => {
    for (const pct of [1, 17, 33.33, 50, 99.99, 100]) {
      expect(comissaoEmValor(1600, pct)).toBeLessThanOrEqual(1600)
    }
  })
})

describe('tradução dos erros — todos chegam em HTTP 500 na transação remota', () => {
  it('o erro do duplo consentimento diz o que fazer, não o código', () => {
    const r = traduzirErro('SUPPLIER_INVALID', 500)
    expect(r.mensagem).toContain('ainda não aceitou o vínculo')
    expect(r.mensagem).toContain('Cobre sem o repasse')
    expect(r.gravidade).toBe('configuracao')
    expect(r.pode_repetir).toBe(false)
  })

  it('terminal não habilitado manda conferir se está ligado, e permite repetir', () => {
    const r = traduzirErro('MERCHANT_TERMINAL_INVALID', 500)
    expect(r.mensagem).toContain('ligada e conectada')
    expect(r.pode_repetir).toBe(true)
  })

  it('token expirado é temporário e repetível — a renovação resolve', () => {
    for (const c of ['INVALID_TOKEN', 'EXPIRED_TOKEN']) {
      const r = traduzirErro(c, 401)
      expect(r.gravidade).toBe('temporario')
      expect(r.pode_repetir).toBe(true)
    }
  })

  it('token revogado NÃO é repetível — é problema de credencial', () => {
    const r = traduzirErro('REVOKED_TOKEN', 401)
    expect(r.pode_repetir).toBe(false)
    expect(r.gravidade).toBe('configuracao')
  })

  it('débito parcelado explica a regra em vez de só recusar', () => {
    expect(traduzirErro('INSTALLMENTS_INVALID_FOR_DEBIT', 500).mensagem)
      .toContain('Débito não pode ser parcelado')
  })

  it('código desconhecido devolve o código cru, sem esconder atrás de "erro inesperado"', () => {
    const r = traduzirErro('ALGUM_CODIGO_NOVO_DELES', 500)
    expect(r.mensagem).toContain('ALGUM_CODIGO_NOVO_DELES')
    expect(r.codigo).toBe('ALGUM_CODIGO_NOVO_DELES')
  })

  it('401 sem código reconhecido ainda é tratado como sessão, e repete uma vez', () => {
    const r = traduzirErro(null, 401)
    expect(r.pode_repetir).toBe(true)
  })

  it('resposta sem código nenhum é temporária, não culpa a configuração', () => {
    const r = traduzirErro(null, 502)
    expect(r.gravidade).toBe('temporario')
    expect(r.pode_repetir).toBe(true)
  })

  it('todo erro documentado da criação de transação tem tradução própria', () => {
    const DOCUMENTADOS = [
      'PAYMENT_BRAND_ID_INVALID', 'INSTALLMENTS_INVALID_FOR_DEBIT', 'INVALID_PAYMENT_BRAND',
      'INVALID_INSTALLMENTS_QUANTITY_OR_VALUE', 'MERCHANT_ID_INVALID', 'TERMINAL_ID_INVALID',
      'MERCHANT_TERMINAL_INVALID', 'VALUE_FIELD_INVALID', 'NAME_CLIENT_INVALID',
      'DOCUMENT_INVALID', 'SPLIT_SUM_GREATER_THAN_TRANSACTION_VALUE', 'SUPPLIER_NOT_FOUND',
      'SUPPLIER_INVALID', 'CLIENT_PHONE_INVALID',
    ]
    for (const c of DOCUMENTADOS) {
      const r = traduzirErro(c, 500)
      // Se não houver tradução, a mensagem cai no genérico e cita o código.
      expect(r.mensagem).not.toContain(c)
    }
  })
})

describe('bandeiras: o Link aceita só crédito', () => {
  it('as quatro do Link estão marcadas como disponíveis nele', () => {
    for (const b of ['VISA_CREDITO', 'MASTERCARD', 'AMEX', 'ELO']) {
      expect(BANDEIRAS[b].no_link).toBe(true)
    }
  })

  it('nenhuma bandeira de débito está disponível no Link', () => {
    for (const [, info] of Object.entries(BANDEIRAS)) {
      if (info.tipo === 'debito') expect(info.no_link).toBe(false)
    }
  })

  it('as três de débito estão declaradas — é o caso que só a maquininha atende', () => {
    const debito = Object.entries(BANDEIRAS).filter(([, i]) => i.tipo === 'debito').map(([k]) => k)
    expect(debito.sort()).toEqual(['ELO_DEBITO', 'MAESTRO', 'VISA_ELECTRON'])
  })

  it('as 16 bandeiras da transação remota estão mapeadas', () => {
    expect(Object.keys(BANDEIRAS)).toHaveLength(16)
  })
})

describe('status do terminal: a recepção precisa entender, não só ser bloqueada', () => {
  it('os quatro status têm explicação e dizem se dá para cobrar', () => {
    for (const s of ['ONLINE', 'ONLINE_DIFFERENT_ACCOUNT', 'OFFLINE', 'UNKNOWN']) {
      expect(STATUS_TERMINAL[s].explicacao.length).toBeGreaterThan(20)
      expect(typeof STATUS_TERMINAL[s].pode_cobrar).toBe('boolean')
    }
  })

  it('terminal em uso por outra empresa PERMITE cobrar — é o caso dos 3 CNPJs', () => {
    expect(STATUS_TERMINAL.ONLINE_DIFFERENT_ACCOUNT.pode_cobrar).toBe(true)
  })

  it('offline explica o caso do pinpad de cabo com o computador desligado', () => {
    expect(STATUS_TERMINAL.OFFLINE.explicacao).toContain('computador')
    expect(STATUS_TERMINAL.OFFLINE.pode_cobrar).toBe(false)
  })
})

describe('o campo `error` vem preenchido NO SUCESSO — medido no sandbox', () => {
  // O cancelamento de link responde {"success":"true","error":"OK_MSG"}.
  // Tratar `error` como falha faria o sistema dizer "não deu" numa operação que
  // deu certo. Quem manda é o `success`.
  //
  // O comportamento está no cliente (`codigoDoErro`), que é interno; o que se
  // garante aqui é que a tradução não inventa falha a partir de um OK.
  it('código de confirmação não é traduzido como recusa', () => {
    const r = traduzirErro('OK_MSG', 200)
    // Cai no genérico, mas o importante: não existe tradução de falha para OK_MSG
    expect(r.codigo).toBe('OK_MSG')
  })

  it('a tradução do genérico preserva o código para o log', () => {
    expect(traduzirErro('QUALQUER_COISA', 500).codigo).toBe('QUALQUER_COISA')
  })
})
