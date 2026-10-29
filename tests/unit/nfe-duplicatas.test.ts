/**
 * Unit — Parser de duplicatas da NF-e (<cobr>/<dup>), item 1.8.
 * Testa a função REAL parseNFeXML com XMLs de amostra.
 */
import { parseNFeXML } from '@/lib/utils/nfe-parser'

function xml(cobr: string): string {
  return `<?xml version="1.0"?>
<nfeProc><NFe><infNFe Id="NFe12345678901234567890123456789012345678901234">
<ide><nNF>100</nNF><serie>1</serie><dhEmi>2026-09-01T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>12345678000199</CNPJ><xNome>Fornecedor X</xNome></emit>
<det><prod><xProd>Produto A</xProd><NCM>30049099</NCM><qCom>2</qCom><vUnCom>10.00</vUnCom><vProd>20.00</vProd></prod><imposto></imposto></det>
<total><ICMSTot><vNF>300.00</vNF></ICMSTot></total>
${cobr}
</infNFe></NFe></nfeProc>`
}

describe('parseNFeXML — duplicatas', () => {
  it('extrai múltiplas duplicatas (cobr/dup)', () => {
    const res = parseNFeXML(xml(`<cobr>
      <dup><nDup>001</nDup><dVenc>2026-10-01</dVenc><vDup>150.00</vDup></dup>
      <dup><nDup>002</nDup><dVenc>2026-11-01</dVenc><vDup>150.00</vDup></dup>
    </cobr>`))
    expect('error' in res).toBe(false)
    if ('error' in res) return
    expect(res.duplicatas).toHaveLength(2)
    // nDup "001" é normalizado pelo parser numérico → "1" (informativo)
    expect(res.duplicatas[0]).toEqual({ numero: '1', vencimento: '2026-10-01', valor: 150 })
    expect(res.duplicatas[1].valor).toBe(150)
  })

  it('duplicata única (não-array) também é lida', () => {
    const res = parseNFeXML(xml(`<cobr><dup><nDup>1</nDup><dVenc>2026-10-15</dVenc><vDup>300.00</vDup></dup></cobr>`))
    if ('error' in res) throw new Error(res.error)
    expect(res.duplicatas).toHaveLength(1)
    expect(res.duplicatas[0].valor).toBe(300)
  })

  it('sem cobr → duplicatas vazio', () => {
    const res = parseNFeXML(xml(''))
    if ('error' in res) throw new Error(res.error)
    expect(res.duplicatas).toEqual([])
  })

  it('mantém os demais campos (fornecedor, total, itens)', () => {
    const res = parseNFeXML(xml(`<cobr><dup><nDup>1</nDup><dVenc>2026-10-01</dVenc><vDup>300.00</vDup></dup></cobr>`))
    if ('error' in res) throw new Error(res.error)
    expect(res.supplier.cnpj).toBe('12345678000199')
    expect(res.total_value).toBe(300)
    expect(res.items).toHaveLength(1)
  })

  it('vencimento normaliza para AAAA-MM-DD', () => {
    const res = parseNFeXML(xml(`<cobr><dup><nDup>1</nDup><dVenc>2026-12-31</dVenc><vDup>300.00</vDup></dup></cobr>`))
    if ('error' in res) throw new Error(res.error)
    expect(res.duplicatas[0].vencimento).toBe('2026-12-31')
  })

  it('XML inválido retorna erro', () => {
    const res = parseNFeXML('<xml>não é nfe</xml>')
    expect('error' in res).toBe(true)
  })
})
