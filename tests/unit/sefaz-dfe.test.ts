import { gzipSync } from 'node:zlib'
import { lerResposta, lerDadosDaNota } from '@/lib/fiscal/sefaz-dfe'

/** Monta um docZip como a SEFAZ manda: XML em gzip, depois base64. */
function docZip(nsu: string, xml: string): string {
  return `<docZip NSU="${nsu}" schema="x_v1.00">${gzipSync(Buffer.from(xml, 'utf8')).toString('base64')}</docZip>`
}

function soap(cStat: string, ultNSU: string, maxNSU: string, docs: string[] = []): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>
<nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
<nfeDistDFeInteresseResult>
<retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
<tpAmb>1</tpAmb><verAplic>1.0</verAplic>
<cStat>${cStat}</cStat><xMotivo>teste</xMotivo>
<dhResp>2026-10-23T12:00:00-03:00</dhResp>
<ultNSU>${ultNSU}</ultNSU><maxNSU>${maxNSU}</maxNSU>
${docs.length ? `<loteDistDFeInt>${docs.join('')}</loteDistDFeInt>` : ''}
</retDistDFeInt>
</nfeDistDFeInteresseResult></nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>`
}

const CHAVE = '35260112345678000199550010000012341000012345'.padEnd(44, '7')

const RESUMO = `<resNFe versao="1.01"><chNFe>${CHAVE}</chNFe><CNPJ>12345678000199</CNPJ>`
  + '<xNome>FORNECEDOR TESTE LTDA</xNome><vNF>1500.00</vNF>'
  + '<dhEmi>2026-10-20T09:00:00-03:00</dhEmi><tpNF>1</tpNF><cSitNFe>1</cSitNFe></resNFe>'

const COMPLETA = `<nfeProc versao="4.00"><NFe><infNFe Id="NFe${CHAVE}" versao="4.00">`
  + '<ide><nNF>1234</nNF></ide></infNFe></NFe><protNFe/></nfeProc>'

const EVENTO = `<procEventoNFe versao="1.00"><evento><infEvento><chNFe>${CHAVE}</chNFe>`
  + '<tpEvento>210210</tpEvento></infEvento></evento></procEventoNFe>'

describe('lerResposta', () => {
  it('lê status e ponteiros mesmo sem documentos (cStat 137)', () => {
    const r = lerResposta(soap('137', '000000000000250', '000000000000250'))
    expect(r.cStat).toBe('137')
    expect(r.ultNSU).toBe(250)
    expect(r.maxNSU).toBe(250)
    expect(r.documentos).toEqual([])
  })

  it('descompacta o docZip e devolve o XML de verdade', () => {
    const r = lerResposta(soap('138', '000000000000101', '000000000000300', [docZip('000000000000101', RESUMO)]))
    expect(r.documentos).toHaveLength(1)
    expect(r.documentos[0].xml).toContain('FORNECEDOR TESTE LTDA')
    expect(r.documentos[0].nsu).toBe('000000000000101')
  })

  it('distingue resumo de nota completa — é o que diz se já dá para dar entrada', () => {
    const r = lerResposta(soap('138', '000000000000102', '000000000000300', [
      docZip('000000000000101', RESUMO),
      docZip('000000000000102', COMPLETA),
    ]))
    expect(r.documentos.map(d => d.tipo)).toEqual(['resumo', 'completo'])
  })

  it('reconhece evento de manifestação', () => {
    const r = lerResposta(soap('138', '000000000000103', '000000000000300', [docZip('000000000000103', EVENTO)]))
    expect(r.documentos[0].tipo).toBe('evento')
  })

  it('extrai a chave tanto do resumo quanto do Id da nota completa', () => {
    const r = lerResposta(soap('138', '000000000000102', '000000000000300', [
      docZip('000000000000101', RESUMO),
      docZip('000000000000102', COMPLETA),
    ]))
    expect(r.documentos[0].chave).toBe(CHAVE)
    expect(r.documentos[1].chave).toBe(CHAVE)
  })

  it('um documento corrompido não derruba o lote inteiro', () => {
    const quebrado = '<docZip NSU="000000000000104" schema="x">naoEhGzipValido==</docZip>'
    const r = lerResposta(soap('138', '000000000000105', '000000000000300', [
      quebrado,
      docZip('000000000000105', RESUMO),
    ]))
    expect(r.documentos).toHaveLength(1)
    expect(r.documentos[0].nsu).toBe('000000000000105')
  })

  it('lote com um único documento (sem array) é lido igual', () => {
    const r = lerResposta(soap('138', '000000000000101', '000000000000101', [docZip('000000000000101', RESUMO)]))
    expect(r.documentos).toHaveLength(1)
  })

  it('resposta fora do formato esperado falha dizendo isso', () => {
    expect(() => lerResposta('<html><body>erro do gateway</body></html>'))
      .toThrow(/formato inesperado/)
  })

  it('cStat 656 é lido normalmente — quem decide o que fazer é o chamador', () => {
    const r = lerResposta(soap('656', '000000000000000', '000000000000500'))
    expect(r.cStat).toBe('656')
    expect(r.maxNSU).toBe(500)
  })
})

describe('lerDadosDaNota', () => {
  it('lê o resumo, que é tudo que vem antes da manifestação', () => {
    const d = lerDadosDaNota(RESUMO)!
    expect(d.chave).toBe(CHAVE)
    expect(d.emitenteNome).toBe('FORNECEDOR TESTE LTDA')
    expect(d.emitenteCnpj).toBe('12345678000199')
    expect(d.valor).toBe(1500)
    expect(d.emitidaEm).toBe('2026-10-20T09:00:00-03:00')
    expect(d.situacao).toBe('1')
  })

  it('lê a nota completa, onde os campos moram em outro lugar', () => {
    const completa = `<nfeProc versao="4.00"><NFe><infNFe Id="NFe${CHAVE}">`
      + '<ide><nNF>1234</nNF><serie>1</serie><dhEmi>2026-10-20T09:00:00-03:00</dhEmi></ide>'
      + '<emit><CNPJ>12345678000199</CNPJ><xNome>FORNECEDOR TESTE LTDA</xNome></emit>'
      + '<dest><CNPJ>99999999000199</CNPJ><xNome>CLINICA</xNome></dest>'
      + '<total><ICMSTot><vNF>1500.00</vNF></ICMSTot></total>'
      + '</infNFe></NFe></nfeProc>'
    const d = lerDadosDaNota(completa)!
    expect(d.chave).toBe(CHAVE)
    expect(d.numero).toBe('1234')
    expect(d.serie).toBe('1')
    expect(d.valor).toBe(1500)
    // O emitente, não o destinatário — os dois têm CNPJ e xNome no XML.
    expect(d.emitenteCnpj).toBe('12345678000199')
    expect(d.emitenteNome).toBe('FORNECEDOR TESTE LTDA')
  })

  it('sem chave no XML, usa a que já conhecemos', () => {
    const d = lerDadosDaNota('<resNFe><xNome>SEM CHAVE</xNome></resNFe>', CHAVE)!
    expect(d.chave).toBe(CHAVE)
    expect(d.emitenteNome).toBe('SEM CHAVE')
  })

  it('sem chave alguma, devolve nulo em vez de linha fantasma', () => {
    expect(lerDadosDaNota('<resNFe><xNome>X</xNome></resNFe>')).toBeNull()
  })

  it('valor ausente não vira zero — zero seria mentira', () => {
    const d = lerDadosDaNota(`<resNFe><chNFe>${CHAVE}</chNFe></resNFe>`)!
    expect(d.valor).toBeNull()
  })
})
