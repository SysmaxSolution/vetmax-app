import forge from 'node-forge'
import { SignedXml } from 'xml-crypto'
import {
  montarEvento, assinarEvento, lerRetornoEvento, MANIFESTACOES,
} from '@/lib/fiscal/sefaz-evento'
import type { CredencialSefaz } from '@/lib/fiscal/sefaz-dfe'

/**
 * Gera um e-CNPJ A1 de mentira, só para o teste.
 *
 * Assinar de verdade e CONFERIR a assinatura é o único jeito de saber que os
 * parâmetros estão certos: a SEFAZ não devolve "assinatura malformada", ela
 * simplesmente rejeita — e aí o diagnóstico leva dias.
 */
function certificadoDeTeste(): { pfx: Buffer; senha: string; certPem: string } {
  const par = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = par.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date(Date.now() - 86400000)
  cert.validity.notAfter = new Date(Date.now() + 365 * 86400000)
  const nome = [{ name: 'commonName', value: 'EMPRESA TESTE LTDA:12345678000199' }]
  cert.setSubject(nome)
  cert.setIssuer(nome)
  cert.sign(par.privateKey, forge.md.sha256.create())

  const senha = 'teste123'
  const asn1 = forge.pkcs12.toPkcs12Asn1(par.privateKey, [cert], senha, { algorithm: 'aes256' })
  return {
    pfx: Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary'),
    senha,
    certPem: forge.pki.certificateToPem(cert),
  }
}

const CHAVE = '35260112345678000199550010000012341000012345'.padEnd(44, '7')

function cred(pfx: Buffer, senha: string): CredencialSefaz {
  return { ambiente: 'homologacao', pfx, passphrase: senha, cnpj: '99999999000199' }
}

describe('montarEvento', () => {
  const { pfx, senha } = certificadoDeTeste()

  it('monta o Id no formato que a SEFAZ exige', () => {
    const { id } = montarEvento(cred(pfx, senha), CHAVE, '210210', 1)
    expect(id).toBe(`ID210210${CHAVE}01`)
    expect(id).toHaveLength(2 + 6 + 44 + 2)
  })

  it('usa a descrição exata do evento — texto livre é rejeitado', () => {
    const { xml } = montarEvento(cred(pfx, senha), CHAVE, '210210', 1)
    expect(xml).toContain('<descEvento>Ciencia da Operacao</descEvento>')
    expect(xml).toContain('<tpEvento>210210</tpEvento>')
  })

  it('aponta para o Ambiente Nacional e para o ambiente certo', () => {
    const { xml } = montarEvento(cred(pfx, senha), CHAVE, '210210', 1)
    expect(xml).toContain('<cOrgao>91</cOrgao>')
    expect(xml).toContain('<tpAmb>2</tpAmb>')      // homologação
  })

  it('a data sai no formato com fuso, não em UTC com Z', () => {
    const { xml } = montarEvento(cred(pfx, senha), CHAVE, '210210', 1, new Date('2026-10-23T15:00:00.000Z'))
    expect(xml).toMatch(/<dhEvento>2026-10-23T12:00:00-03:00<\/dhEvento>/)
    expect(xml).not.toContain('Z<')
  })

  it('a sequência vai com dois dígitos no Id e sem zero no corpo', () => {
    const { xml, id } = montarEvento(cred(pfx, senha), CHAVE, '210210', 2)
    expect(id.endsWith('02')).toBe(true)
    expect(xml).toContain('<nSeqEvento>2</nSeqEvento>')
  })
})

describe('assinarEvento', () => {
  const { pfx, senha, certPem } = certificadoDeTeste()

  it('produz assinatura que PASSA na verificação', () => {
    const { xml, id } = montarEvento(cred(pfx, senha), CHAVE, '210210', 1)
    const assinado = assinarEvento(xml, pfx, senha, id)

    const v = new SignedXml({ publicCert: certPem })
    const sigNode = assinado.match(/<Signature[\s\S]*<\/Signature>/)![0]
    v.loadSignature(sigNode)
    expect(v.checkSignature(assinado)).toBe(true)
  })

  it('inclui o certificado no KeyInfo — sem ele a SEFAZ não valida', () => {
    const { xml, id } = montarEvento(cred(pfx, senha), CHAVE, '210210', 1)
    const assinado = assinarEvento(xml, pfx, senha, id)
    expect(assinado).toContain('<X509Certificate>')
    expect(assinado).toMatch(/<X509Certificate>[A-Za-z0-9+/=]{100,}<\/X509Certificate>/)
  })

  it('referencia o infEvento pelo Id, não o documento inteiro', () => {
    const { xml, id } = montarEvento(cred(pfx, senha), CHAVE, '210210', 1)
    const assinado = assinarEvento(xml, pfx, senha, id)
    expect(assinado).toContain(`URI="#${id}"`)
  })

  it('a assinatura fica DENTRO de <evento>, depois do infEvento', () => {
    const { xml, id } = montarEvento(cred(pfx, senha), CHAVE, '210210', 1)
    const assinado = assinarEvento(xml, pfx, senha, id)
    expect(assinado.indexOf('</infEvento>')).toBeLessThan(assinado.indexOf('<Signature'))
    expect(assinado.indexOf('<Signature')).toBeLessThan(assinado.indexOf('</evento>'))
  })

  it('adulterar o XML depois de assinado invalida a assinatura', () => {
    const { xml, id } = montarEvento(cred(pfx, senha), CHAVE, '210210', 1)
    const assinado = assinarEvento(xml, pfx, senha, id)
    const adulterado = assinado.replace('<tpEvento>210210</tpEvento>', '<tpEvento>210200</tpEvento>')

    const v = new SignedXml({ publicCert: certPem })
    v.loadSignature(adulterado.match(/<Signature[\s\S]*<\/Signature>/)![0])
    expect(v.checkSignature(adulterado)).toBe(false)
  })
})

describe('lerRetornoEvento', () => {
  const soap = (cStat: string, xMotivo: string, nProt?: string) => `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>
<nfeRecepcaoEventoResult><retEnvEvento versao="1.00"><idLote>1</idLote><tpAmb>2</tpAmb>
<cStat>128</cStat><xMotivo>Lote processado</xMotivo>
<retEvento versao="1.00"><infEvento><tpAmb>2</tpAmb>
<cStat>${cStat}</cStat><xMotivo>${xMotivo}</xMotivo>
${nProt ? `<nProt>${nProt}</nProt>` : ''}
</infEvento></retEvento></retEnvEvento></nfeRecepcaoEventoResult></soap:Body></soap:Envelope>`

  it('135 é registro aceito', () => {
    const r = lerRetornoEvento(soap('135', 'Evento registrado e vinculado a NF-e', '135260000012345'))
    expect(r.ok).toBe(true)
    expect(r.duplicado).toBe(false)
    expect(r.protocolo).toBe('135260000012345')
  })

  it('573 (duplicidade) é SUCESSO — alguém já manifestou, o efeito está obtido', () => {
    const r = lerRetornoEvento(soap('573', 'Rejeicao: Duplicidade de evento'))
    expect(r.ok).toBe(true)
    expect(r.duplicado).toBe(true)
  })

  it('596 marca fora do prazo — passou dos 10 dias da Ciência', () => {
    const r = lerRetornoEvento(soap('596', 'Rejeicao: Evento de Ciencia fora de prazo'))
    expect(r.ok).toBe(false)
    expect(r.foraDoPrazo).toBe(true)
  })

  it('rejeição comum não é sucesso', () => {
    const r = lerRetornoEvento(soap('491', 'Rejeicao: Chave de acesso invalida'))
    expect(r.ok).toBe(false)
    expect(r.duplicado).toBe(false)
    expect(r.foraDoPrazo).toBe(false)
  })

  it('lê o status DO EVENTO, não o do lote', () => {
    // O lote vem 128 (processado) mesmo quando o evento foi rejeitado.
    const r = lerRetornoEvento(soap('596', 'fora de prazo'))
    expect(r.cStat).toBe('596')
  })
})

describe('MANIFESTACOES', () => {
  it('descreve o que cada evento declara — é o que a tela mostra', () => {
    expect(MANIFESTACOES['210210'].descricao).toMatch(/não confirma recebimento/i)
    expect(MANIFESTACOES['210200'].descricao).toMatch(/chegou/i)
  })
})
