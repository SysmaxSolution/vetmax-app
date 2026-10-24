import { parseNFeXML } from '@/lib/utils/nfe-parser'

// Item com ICMS tributado (CST 00), IPI, PIS e COFINS — o caso comum de
// fornecedor do regime normal. O segundo item é de emitente do Simples
// (CSOSN 102), sem base nem valor de ICMS.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe35261004852370000108550010002021421121303881" versao="4.00">
    <ide><nNF>202142</nNF><serie>1</serie><dhEmi>2026-10-20T10:00:00-03:00</dhEmi></ide>
    <emit><CNPJ>04852370000108</CNPJ><xNome>LPS AGROFARMA LTDA</xNome><enderEmit><xMun>Ribeirao Preto</xMun><UF>SP</UF></enderEmit></emit>
    <det nItem="1">
      <prod><cProd>001</cProd><cEAN>7891234567895</cEAN><xProd>VERMIFUGO 10ML</xProd><NCM>30049099</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>10.0000</qCom><vUnCom>43.6750000000</vUnCom><vProd>436.75</vProd></prod>
      <imposto>
        <ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>436.75</vBC><pICMS>18.00</pICMS><vICMS>78.62</vICMS></ICMS00></ICMS>
        <IPI><cEnq>999</cEnq><IPITrib><CST>50</CST><vBC>436.75</vBC><pIPI>5.00</pIPI><vIPI>21.84</vIPI></IPITrib></IPI>
        <PIS><PISAliq><CST>01</CST><vBC>436.75</vBC><pPIS>1.65</pPIS><vPIS>7.21</vPIS></PISAliq></PIS>
        <COFINS><COFINSAliq><CST>01</CST><vBC>436.75</vBC><pCOFINS>7.60</pCOFINS><vCOFINS>33.19</vCOFINS></COFINSAliq></COFINS>
      </imposto>
    </det>
    <det nItem="2">
      <prod><cProd>002</cProd><cEAN>SEM GTIN</cEAN><xProd>SERINGA 5ML</xProd><NCM>90183119</NCM><CFOP>5405</CFOP><uCom>UN</uCom><qCom>20.0000</qCom><vUnCom>2.5000000000</vUnCom><vProd>50.00</vProd></prod>
      <imposto>
        <ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS>
        <IPI><cEnq>999</cEnq><IPINT><CST>53</CST></IPINT></IPI>
        <PIS><PISNT><CST>07</CST></PISNT></PIS>
        <COFINS><COFINSNT><CST>07</CST></COFINSNT></COFINS>
      </imposto>
    </det>
    <total><ICMSTot><vProd>486.75</vProd><vNF>486.75</vNF></ICMSTot></total>
  </infNFe></NFe>
</nfeProc>`

describe('impostos por item no XML da NF-e', () => {
  const r = parseNFeXML(XML)
  if ('error' in r) throw new Error(r.error)

  it('lê CST, origem, base, alíquota e valor do ICMS do regime normal', () => {
    const i = r.items[0]
    expect(i.cfop).toBe('5102')
    expect(i.cst).toBe('00')
    expect(i.icms_origin).toBe('0')
    expect(i.icms_base).toBe(436.75)
    expect(i.tax_icms).toBe(18)
    expect(i.icms_value).toBe(78.62)
  })

  it('lê IPI, PIS e COFINS em valor', () => {
    const i = r.items[0]
    expect(i.ipi_value).toBe(21.84)
    expect(i.pis_value).toBe(7.21)
    expect(i.cofins_value).toBe(33.19)
  })

  it('emitente do Simples: CSOSN no lugar do CST e sem valores de ICMS', () => {
    const i = r.items[1]
    expect(i.cst).toBe('102')
    expect(i.icms_base).toBeUndefined()
    expect(i.icms_value).toBeUndefined()
    expect(i.ipi_value).toBeUndefined()   // IPINT não tem vIPI
    expect(i.pis_value).toBeUndefined()
  })

  it('o preço e a quantidade não mudam por causa dos impostos', () => {
    expect(r.items[0].quantity).toBe(10)
    expect(r.items[0].unit_price).toBe(43.675)
    expect(r.items[0].total_price).toBe(436.75)
  })
})
