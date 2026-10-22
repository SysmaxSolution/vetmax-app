import { ESCOPO_EXTRATO, extrairTransacoes, toNum, normalizarConta } from '@/lib/integrations/sicoob'

// Tudo abaixo foi MEDIDO contra o Sicoob de produção em 2026-10-07, com o
// e-CNPJ A1 da clínica e o client_id de produção — não é suposição.
//
// Dois defeitos reais que este arquivo existe para travar:
//
//  1. O código pedia `openid cco_extrato cco_saldo`. Esses escopos NÃO existem.
//     O Keycloak recusa a requisição INTEIRA com invalid_scope quando um só
//     escopo é inválido, então o sintoma era 400 no token mesmo com
//     certificado e client_id corretos.
//
//  2. O parser lia `j.transacoes`. A produção aninha em `j.resultado`. O
//     resultado era autenticar, receber 52 lançamentos reais e importar ZERO,
//     reclamando "nenhum lançamento no período" — parecia problema do banco.

describe('ESCOPO_EXTRATO', () => {
  it('pede cco_consulta, que é o escopo que existe', () => {
    expect(ESCOPO_EXTRATO).toBe('openid cco_consulta')
  })

  it('NÃO volta a pedir os escopos inexistentes', () => {
    expect(ESCOPO_EXTRATO).not.toMatch(/cco_extrato|cco_saldo/)
  })
})

// Resposta de PRODUÇÃO, com a forma e os campos reais (valores reduzidos).
const PRODUCAO = JSON.stringify({
  mensagens: [],
  resultado: {
    saldoAtual: '94271.40', saldoBloqueado: '0.00', saldoLimite: '0.00',
    saldoAnterior: '114885.32', saldoBloqueioJudicial: '0.00', saldoBloqueioJudicialAnterior: '0.00',
    transacoes: [
      { transactionId: '7D0797-2BD7D9', tipo: 'CREDITO', valor: '1555.05',
        data: '2026-10-01T06:46', dataLote: '2026-10-01',
        descricao: 'CR COMPRAS MAESTRO', numeroDocumento: '1509164849', descInfComplementar: '' },
      { transactionId: 'AA1111-BB2222', tipo: 'DEBITO', valor: '80.00',
        data: '2026-10-02T09:15', dataLote: '2026-10-02',
        descricao: 'TARIFA PACOTE SERVICOS', numeroDocumento: '999', descInfComplementar: '' },
    ],
  },
})

// Resposta do SANDBOX: transacoes no nível de cima. Precisa continuar valendo.
const SANDBOX = JSON.stringify({
  transacoes: [
    { tipo: 'C', valor: 500, data: '2026-10-05', descricao: 'PIX RECEBIDO', numeroDocumento: 'SBX-1' },
  ],
})

describe('extrairTransacoes', () => {
  it('lê a forma da PRODUÇÃO (aninhada em resultado)', () => {
    const txs = extrairTransacoes(PRODUCAO)
    expect(txs).toHaveLength(2)
    expect(txs[0]).toEqual({
      date: '2026-10-01', amount: 1555.05, description: 'CR COMPRAS MAESTRO',
      type: 'credit', external_id: '1509164849', tx_id: '7D0797-2BD7D9',
    })
    expect(txs[1].type).toBe('debit')
    expect(txs[1].amount).toBe(80)
  })

  it('continua lendo a forma do SANDBOX (nível de cima)', () => {
    const txs = extrairTransacoes(SANDBOX)
    expect(txs).toHaveLength(1)
    expect(txs[0].type).toBe('credit')
    expect(txs[0].amount).toBe(500)
  })

  it('a data vem com hora e é truncada para AAAA-MM-DD', () => {
    expect(extrairTransacoes(PRODUCAO)[0].date).toBe('2026-10-01')
  })

  it('CREDITO/DEBITO em maiúsculas são reconhecidos', () => {
    const txs = extrairTransacoes(PRODUCAO)
    expect(txs.map(t => t.type)).toEqual(['credit', 'debit'])
  })

  it('valor vem como string e é convertido', () => {
    expect(typeof extrairTransacoes(PRODUCAO)[0].amount).toBe('number')
  })

  it('não quebra com corpo vazio, inválido ou sem transações', () => {
    for (const corpo of ['', '{}', 'nao e json', JSON.stringify({ resultado: {} }), JSON.stringify({ mensagens: [] })]) {
      expect(extrairTransacoes(corpo)).toEqual([])
    }
  })

  it('descarta item sem data ou com valor não numérico (lixo do sandbox)', () => {
    const lixo = JSON.stringify({ transacoes: [
      { tipo: 'C', valor: 'lorem', data: '2026-10-01', descricao: 'x' },
      { tipo: 'C', valor: 10, data: 'ipsum', descricao: 'y' },
      { tipo: 'C', valor: 10, data: '2026-10-01', descricao: 'bom' },
    ] })
    const txs = extrairTransacoes(lixo)
    expect(txs).toHaveLength(1)
    expect(txs[0].description).toBe('bom')
  })
})

// ── toNum ────────────────────────────────────────────────────────────────────
// O terceiro defeito, e o mais grave: a versão anterior removia TODO ponto
// (correto para "R$ 1.555,05", onde o ponto é milhar) e por isso convertia o
// "1555.05" da API em 155505 — cem vezes maior. Como o sandbox devolve número
// em vez de string, isso nunca aparecia em teste: só entraria em cena na
// primeira conciliação real, inflando cada lançamento do extrato em 100x.

describe('toNum — os dois formatos de valor', () => {
  it('string da API, ponto DECIMAL', () => {
    expect(toNum('1555.05')).toBe(1555.05)
    expect(toNum('80.00')).toBe(80)
    expect(toNum('94271.40')).toBe(94271.4)
    expect(toNum('0.01')).toBe(0.01)
  })

  it('NÃO infla 100x (o defeito que existia)', () => {
    expect(toNum('1555.05')).not.toBe(155505)
    expect(toNum('114885.32')).not.toBe(11488532)
  })

  it('string brasileira, ponto MILHAR e vírgula decimal', () => {
    expect(toNum('R$ 1.555,05')).toBe(1555.05)
    expect(toNum('1.234.567,89')).toBe(1234567.89)
    expect(toNum('80,00')).toBe(80)
    expect(toNum('R$ 94.271,40')).toBe(94271.4)
  })

  it('número passa direto', () => {
    expect(toNum(1555.05)).toBe(1555.05)
    expect(toNum(0)).toBe(0)
    expect(toNum(-42.5)).toBe(-42.5)
  })

  it('entrada inválida vira NaN, não zero silencioso', () => {
    for (const v of ['', '   ', 'lorem', null, undefined, {}, 'R$', NaN, Infinity]) {
      expect(Number.isNaN(toNum(v))).toBe(true)
    }
  })

  it('negativo é preservado (o sinal decide crédito/débito quando falta tipo)', () => {
    expect(toNum('-150.25')).toBe(-150.25)
    expect(toNum('-1.500,25')).toBe(-1500.25)
  })
})

// ── normalizarConta ──────────────────────────────────────────────────────────
// O quarto defeito. O cadastro guarda a conta MASCARADA ("8658-4") e a action
// mandava o valor cru para a URL. Medido contra o Sicoob de produção:
//
//   numeroContaCorrente=8658-4  -> 404 Not Found
//   numeroContaCorrente=86584   -> 200, extrato real
//   numeroContaCorrente=8658    -> 400 "Número da conta corrente é obrigatório"
//
// O 404 parecia conta inexistente no banco, e não formato errado. Escapou da
// primeira verificação fim a fim porque o script de teste normalizava a conta
// por conta própria, em vez de passar o valor cru como a aplicação passa.

describe('normalizarConta', () => {
  it('remove a máscara e PRESERVA o dígito verificador', () => {
    expect(normalizarConta('8658-4')).toBe('86584')
    expect(normalizarConta('8.658-4')).toBe('86584')
    expect(normalizarConta('12345-6')).toBe('123456')
  })

  it('não mexe no que já vem só com dígitos', () => {
    expect(normalizarConta('86584')).toBe('86584')
  })

  it('aceita espaços e formatos variados do cadastro', () => {
    expect(normalizarConta(' 8658 - 4 ')).toBe('86584')
    expect(normalizarConta('C/C 8.658-4')).toBe('86584')
  })

  it('vazio para entrada ausente, para a action poder recusar com mensagem', () => {
    for (const v of [null, undefined, '', '   ', '-', 'sem numero']) {
      expect(normalizarConta(v)).toBe('')
    }
  })

  it('número também funciona', () => {
    expect(normalizarConta(86584)).toBe('86584')
  })
})

// ── transactionId ────────────────────────────────────────────────────────────
// Capturar o transactionId e o que permite a importacao idempotente: o
// `numeroDocumento` nao identifica (para Pix vem a string literal "Pix", e
// producao tinha 51 linhas com external_id = 'Pix'). Ver
// src/lib/financial/extrato-digital.ts.

describe('extrairTransacoes — transactionId', () => {
  it('captura o transactionId de cada transação', () => {
    const txs = extrairTransacoes(PRODUCAO)
    expect(txs.map(t => t.tx_id)).toEqual(['7D0797-2BD7D9', 'AA1111-BB2222'])
  })

  it('o numeroDocumento continua em external_id, para casar com título', () => {
    expect(extrairTransacoes(PRODUCAO)[0].external_id).toBe('1509164849')
  })

  it('tx_id fica indefinido quando o banco não manda (sandbox, CSV)', () => {
    expect(extrairTransacoes(SANDBOX)[0].tx_id).toBeUndefined()
  })

  it('"Pix" como numeroDocumento não impede distinguir as transações', () => {
    const corpo = JSON.stringify({ resultado: { transacoes: [
      { transactionId: 'P1', tipo: 'CREDITO', valor: '50.00', data: '2026-10-03', descricao: 'PIX RECEBIDO', numeroDocumento: 'Pix' },
      { transactionId: 'P2', tipo: 'CREDITO', valor: '50.00', data: '2026-10-03', descricao: 'PIX RECEBIDO', numeroDocumento: 'Pix' },
    ] } })
    const txs = extrairTransacoes(corpo)
    expect(txs).toHaveLength(2)
    expect(txs[0].external_id).toBe('Pix')
    expect(txs[1].external_id).toBe('Pix')
    expect(txs[0].tx_id).not.toBe(txs[1].tx_id)
  })
})
