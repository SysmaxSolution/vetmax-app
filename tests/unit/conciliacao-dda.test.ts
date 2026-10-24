import {
  casarBoleto, nomeComparavel, cnpjComparavel,
  type BoletoDoBanco, type TituloNoSistema,
} from '@/lib/financial/conciliacao-dda'

// O caso real que expôs a falha, com os dados exatos de produção.
const BOLETO_LPS: BoletoDoBanco = {
  barcode: '34192163600000436750000000000000000000000000',
  beneficiary: 'LPS AGROFARMA LTDA EPP',
  beneficiary_doc: '04852370000108',
  amount: 436.75,
  due_date: '2026-11-20',
}

const TITULO_LPS: TituloNoSistema = {
  id: 't1',
  amount: 436.75,
  due_date: '2026-11-20',
  beneficiary: 'L.P.S. AGROFARMA LTDA',
  description: 'Compra NF 202142 — L.P.S. AGROFARMA LTDA (1/3)',
  barcode: null,
  supplier_cnpj: '04.852.370/0001-08',
}

describe('o caso que não casava', () => {
  it('casa pelo CNPJ, apesar dos nomes diferentes', () => {
    const r = casarBoleto(BOLETO_LPS, [TITULO_LPS])
    expect(r.titulo?.id).toBe('t1')
    expect(r.por).toBe('cnpj')
  })

  it('casaria pelo nome mesmo sem o CNPJ cadastrado', () => {
    const semCnpj = { ...TITULO_LPS, supplier_cnpj: null }
    const r = casarBoleto(BOLETO_LPS, [semCnpj])
    expect(r.titulo?.id).toBe('t1')
    expect(r.por).toBe('nome')
  })
})

describe('nomeComparavel', () => {
  it('iguala as duas grafias do caso real', () => {
    expect(nomeComparavel('L.P.S. AGROFARMA LTDA'))
      .toBe(nomeComparavel('LPS AGROFARMA LTDA EPP'))
  })

  it('tira acento, pontuação e sufixo societário', () => {
    expect(nomeComparavel('Comércio de Gases Ltda. ME')).toBe('GASES')
    expect(nomeComparavel('SAPRA LANDAUER SERVIÇO')).toBe('SAPRA LANDAUER SERVICO')
  })

  it('nome vazio não vira string estranha', () => {
    expect(nomeComparavel(null)).toBe('')
    expect(nomeComparavel('   ')).toBe('')
    expect(nomeComparavel('...')).toBe('')
  })
})

describe('ordem de prioridade', () => {
  const outro: TituloNoSistema = {
    id: 't2', amount: 436.75, due_date: '2026-11-20',
    beneficiary: 'OUTRO FORNECEDOR', supplier_cnpj: '99999999000199',
    barcode: '34192163600000436750000000000000000000000000',
  }

  it('código de barras vence o CNPJ', () => {
    const r = casarBoleto(BOLETO_LPS, [TITULO_LPS, outro])
    expect(r.titulo?.id).toBe('t2')
    expect(r.por).toBe('codigo_barras')
  })

  it('CNPJ vence o nome', () => {
    // 't3' tem o nome parecido; 't1' tem o CNPJ certo.
    const parecido: TituloNoSistema = {
      id: 't3', amount: 436.75, due_date: '2026-11-20',
      beneficiary: 'LPS AGROFARMA', supplier_cnpj: null,
    }
    const r = casarBoleto(BOLETO_LPS, [parecido, TITULO_LPS])
    expect(r.titulo?.id).toBe('t1')
    expect(r.por).toBe('cnpj')
  })
})

describe('o que NÃO pode casar', () => {
  it('valor diferente não casa, nem com CNPJ igual', () => {
    const r = casarBoleto({ ...BOLETO_LPS, amount: 500, barcode: null }, [TITULO_LPS])
    expect(r.titulo).toBeNull()
  })

  it('vencimento distante não casa', () => {
    const r = casarBoleto({ ...BOLETO_LPS, due_date: '2026-12-20', barcode: null }, [TITULO_LPS])
    expect(r.titulo).toBeNull()
  })

  it('tolera o ajuste para dia útil (até 3 dias)', () => {
    const r = casarBoleto({ ...BOLETO_LPS, due_date: '2026-11-23', barcode: null }, [TITULO_LPS])
    expect(r.titulo?.id).toBe('t1')
  })

  it('sem data dos dois lados, valor sozinho não afirma nada', () => {
    const semData = { ...TITULO_LPS, due_date: null }
    const r = casarBoleto({ ...BOLETO_LPS, due_date: null, barcode: null }, [semData])
    expect(r.titulo).toBeNull()
  })

  it('CNPJ diferente não casa por coincidência de valor e data', () => {
    const outroFornecedor = { ...TITULO_LPS, id: 't9', supplier_cnpj: '11111111000111', beneficiary: 'NADA A VER' }
    const r = casarBoleto({ ...BOLETO_LPS, barcode: null }, [outroFornecedor])
    expect(r.titulo).toBeNull()
  })
})

describe('parcelas iguais do mesmo fornecedor', () => {
  // Três parcelas de mesmo valor: cada boleto tem de pegar a SUA.
  const parcelas: TituloNoSistema[] = [
    { ...TITULO_LPS, id: 'p1', due_date: '2026-11-20' },
    { ...TITULO_LPS, id: 'p2', due_date: '2026-12-05' },
    { ...TITULO_LPS, id: 'p3', due_date: '2026-12-20' },
  ]

  it('cada boleto casa com a parcela do seu vencimento', () => {
    const usados = new Set<string>()
    const a = casarBoleto({ ...BOLETO_LPS, due_date: '2026-11-20', barcode: null }, parcelas, usados)
    usados.add(a.titulo!.id)
    const b = casarBoleto({ ...BOLETO_LPS, due_date: '2026-12-05', barcode: null }, parcelas, usados)

    expect(a.titulo?.id).toBe('p1')
    expect(b.titulo?.id).toBe('p2')
  })

  it('não entrega o mesmo título a dois boletos', () => {
    const usados = new Set<string>(['p1'])
    const r = casarBoleto({ ...BOLETO_LPS, due_date: '2026-11-20', barcode: null }, parcelas, usados)
    // p1 está usado e as outras vencem longe: melhor não casar do que casar errado.
    expect(r.titulo).toBeNull()
  })
})

describe('cnpjComparavel — o zero perdido', () => {
  // Medido em produção: o fornecedor estava gravado com 13 dígitos porque o
  // zero inicial sumiu. O banco manda os 14, e a comparação falhava.
  it('devolve o zero à esquerda', () => {
    expect(cnpjComparavel('4852370000108')).toBe('04852370000108')
  })

  it('iguala o cadastro mutilado e o CNPJ do banco', () => {
    expect(cnpjComparavel('4852370000108')).toBe(cnpjComparavel('04.852.370/0001-08'))
  })

  it('casa por CNPJ mesmo com o zero faltando no cadastro', () => {
    const mutilado: TituloNoSistema = { ...TITULO_LPS, supplier_cnpj: '4852370000108' }
    const r = casarBoleto({ ...BOLETO_LPS, barcode: null }, [mutilado])
    expect(r.por).toBe('cnpj')
  })

  it('não inventa CNPJ a partir de lixo', () => {
    expect(cnpjComparavel('')).toBe('')
    expect(cnpjComparavel(null)).toBe('')
    expect(cnpjComparavel('abc')).toBe('')
    expect(cnpjComparavel('123456789012345')).toBe('')   // 15 dígitos
  })

  it('CPF de 11 dígitos vira 14 com zeros — e só casa com igual', () => {
    expect(cnpjComparavel('12345678901')).toBe('00012345678901')
    expect(cnpjComparavel('12345678901')).not.toBe(cnpjComparavel('04852370000108'))
  })
})
