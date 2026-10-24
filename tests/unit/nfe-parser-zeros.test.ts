import { parseNFeXML } from '@/lib/utils/nfe-parser'

/**
 * O XML da NF-e é cheio de campo que PARECE número e não é: CNPJ, NCM, EAN,
 * CFOP, CEP, número da nota. Com a conversão automática do parser ligada,
 * todos perdiam os zeros à esquerda.
 *
 * O caso que expôs isso: o CNPJ 04852370000108 virava 4852370000108, e a
 * conciliação bancária deixava de reconhecer o fornecedor — valor e vencimento
 * batiam, mas o documento não.
 */
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00"><NFe><infNFe Id="NFe35261004852370000108550010002021421121303881" versao="4.00">
<ide><nNF>0202142</nNF><serie>001</serie><dhEmi>2026-10-20T09:00:00-03:00</dhEmi></ide>
<emit>
  <CNPJ>04852370000108</CNPJ>
  <xNome>L.P.S. AGROFARMA LTDA</xNome>
  <IE>0123456789</IE>
  <enderEmit><xLgr>Rua Teste</xLgr><nro>100</nro><xBairro>Centro</xBairro><xMun>Ribeirao Preto</xMun><CEP>01310100</CEP></enderEmit>
</emit>
<dest><CNPJ>23692661000120</CNPJ><xNome>DEVELEY E DIAS</xNome></dest>
<det nItem="1"><prod>
  <cProd>001</cProd><cEAN>07891234567895</cEAN><xProd>VERMIFUGO</xProd>
  <NCM>01012100</NCM><CFOP>5102</CFOP><uCom>UN</uCom>
  <qCom>10.0000</qCom><vUnCom>43.675</vUnCom><vProd>436.75</vProd>
</prod><imposto><ICMS><ICMS00><pICMS>18.00</pICMS></ICMS00></ICMS></imposto></det>
<total><ICMSTot><vNF>1310.25</vNF></ICMSTot></total>
<cobr><dup><nDup>001</nDup><dVenc>2026-11-20</dVenc><vDup>436.75</vDup></dup>
<dup><nDup>002</nDup><dVenc>2026-12-05</dVenc><vDup>436.75</vDup></dup></cobr>
</infNFe></NFe></nfeProc>`

describe('parseNFeXML — zeros à esquerda', () => {
  const r = parseNFeXML(XML)
  if ('error' in r) throw new Error('XML de teste não foi aceito: ' + r.error)

  it('preserva o zero do CNPJ — o caso que quebrou a conciliação', () => {
    expect(r.supplier.cnpj).toBe('04852370000108')
    expect(r.supplier.cnpj).toHaveLength(14)
  })

  it('preserva o zero do NCM', () => {
    expect(r.items[0].ncm).toBe('01012100')
  })

  it('preserva o zero do EAN', () => {
    expect(r.items[0].ean).toBe('07891234567895')
  })

  it('preserva o zero do número da nota', () => {
    expect(r.nfe_number).toBe('0202142')
  })

  it('os campos realmente numéricos continuam número', () => {
    expect(r.items[0].quantity).toBe(10)
    expect(r.items[0].unit_price).toBeCloseTo(43.675)
    expect(r.items[0].total_price).toBe(436.75)
    expect(r.items[0].tax_icms).toBe(18)
  })

  it('as duplicatas saem com valor numérico e vencimento em data', () => {
    expect(r.duplicatas).toHaveLength(2)
    expect(r.duplicatas[0].valor).toBe(436.75)
    expect(r.duplicatas[0].vencimento).toBe('2026-11-20')
    expect(r.duplicatas[0].numero).toBe('001')
  })

  it('a chave de acesso sai inteira, com 44 dígitos', () => {
    expect(r.nfe_key).toHaveLength(44)
    expect(r.nfe_key).toBe('35261004852370000108550010002021421121303881')
  })
})
