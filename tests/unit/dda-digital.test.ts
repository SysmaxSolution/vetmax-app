// Identidade do boleto do DDA — é o que impede a reimportação de duplicar.
//
// O estrago que isto previne foi medido na conciliação bancária: 150 linhas em
// `bank_statements` com 43 grupos duplicados, porque consultar o mesmo período
// duas vezes criava cópias. No PAGFOR o risco é o mesmo e a rotina até convida
// a isso — a Bruna consulta, é interrompida, volta e consulta de novo.

import { digitalDoBoleto, digitaisDoLote } from '@/lib/financial/dda-digital'

const CLINICA = 'cli-1'

const comCip = {
  barcode: '03396161800000835719761576000000047778320101',
  amount: 835.71, due_date: '2026-11-02', document: '477783',
  beneficiary: 'SAPRA LANDAUER', beneficiary_doc: '50429810000136',
  raw: JSON.stringify({ numeroIdentificadorBoletoCip: '3026100506171609600' }),
}

describe('ordem de preferência da chave', () => {
  it('usa o identificador da CIP quando o banco manda — é o único de verdade', () => {
    expect(digitalDoBoleto(CLINICA, comCip)).toBe('cip:3026100506171609600')
  })

  it('cai para o código de barras quando não há CIP', () => {
    const d = digitalDoBoleto(CLINICA, { ...comCip, raw: '{}' })
    expect(d).toBe('cb:03396161800000835719761576000000047778320101')
  })

  it('cai para o hash do conteúdo quando não há CIP nem código de barras', () => {
    const d = digitalDoBoleto(CLINICA, { ...comCip, raw: '{}', barcode: null })
    expect(d).toMatch(/^h:[0-9a-f]{32}$/)
  })
})

describe('estabilidade — reimportar o mesmo período não pode duplicar', () => {
  it('a mesma resposta do banco gera a mesma digital', () => {
    expect(digitalDoBoleto(CLINICA, comCip)).toBe(digitalDoBoleto(CLINICA, { ...comCip }))
  })

  it('CIP manda mesmo que o resto do registro mude', () => {
    // O banco corrige o valor ou a situação entre consultas; continua o mesmo boleto.
    const alterado = { ...comCip, amount: 900.00, beneficiary: 'OUTRO NOME' }
    expect(digitalDoBoleto(CLINICA, alterado)).toBe(digitalDoBoleto(CLINICA, comCip))
  })

  it('código de barras mascarado ou limpo dá a mesma digital', () => {
    const limpo = { ...comCip, raw: '{}' }
    const mascarado = { ...comCip, raw: '{}', barcode: '03396.16180 00008.357197 61576.000000 0 47778320101' }
    expect(digitalDoBoleto(CLINICA, mascarado)).toBe(digitalDoBoleto(CLINICA, limpo))
  })
})

describe('separação', () => {
  it('boletos diferentes têm digitais diferentes', () => {
    const outro = { ...comCip, raw: JSON.stringify({ numeroIdentificadorBoletoCip: '3026100506171609601' }) }
    expect(digitalDoBoleto(CLINICA, outro)).not.toBe(digitalDoBoleto(CLINICA, comCip))
  })

  it('o hash inclui a clínica — não cruza entre bases', () => {
    const semChave = { ...comCip, raw: '{}', barcode: null }
    expect(digitalDoBoleto('cli-1', semChave)).not.toBe(digitalDoBoleto('cli-2', semChave))
  })

  it('CIP e código de barras NÃO dependem da clínica: o índice único já separa', () => {
    expect(digitalDoBoleto('cli-1', comCip)).toBe(digitalDoBoleto('cli-2', comCip))
  })
})

describe('lote', () => {
  it('devolve na mesma ordem, uma digital por boleto', () => {
    const lote = [comCip, { ...comCip, raw: '{}' }, { ...comCip, raw: '{}', barcode: null }]
    const d = digitaisDoLote(CLINICA, lote)
    expect(d).toHaveLength(3)
    expect(d[0]).toMatch(/^cip:/)
    expect(d[1]).toMatch(/^cb:/)
    expect(d[2]).toMatch(/^h:/)
  })

  it('aceita raw como objeto, não só string', () => {
    const d = digitalDoBoleto(CLINICA, { ...comCip, raw: { numeroIdentificadorBoletoCip: '999' } })
    expect(d).toBe('cip:999')
  })

  it('raw inválido não quebra — cai para a chave seguinte', () => {
    const d = digitalDoBoleto(CLINICA, { ...comCip, raw: 'isto não é json' })
    expect(d).toMatch(/^cb:/)
  })
})
