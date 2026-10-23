// Manifestação do Destinatário: o evento que destrava o XML.
//
// Enquanto não há manifestação, a SEFAZ entrega apenas o RESUMO da nota — nos
// dois caminhos, inclusive na consulta por chave. É a Ciência da Operação
// (210210) que libera o `procNFe`, que é o arquivo que alimenta a entrada de
// compra.
//
// ⚠️ PRAZO: a Ciência só é aceita até 10 DIAS após a autorização da nota
// (Ajuste SINIEF 44/20). Passado isso a SEFAZ rejeita com cStat 596, e restam
// apenas as manifestações conclusivas — que NÃO automatizamos, porque
// Confirmação (210200) declara que a operação ocorreu como descrita, e isso é
// decisão do negócio, não de rotina.
//
// Duplicidade (cStat 573) NÃO é erro: significa que alguém já manifestou esta
// nota — a contabilidade, por exemplo. O efeito desejado está obtido, e tratar
// como falha encheria a tela de alarme sobre algo que deu certo.
//
// Server-only.

import https from 'node:https'
import forge from 'node-forge'
import { SignedXml } from 'xml-crypto'
import { XMLParser } from 'fast-xml-parser'
import type { AmbienteSefaz, CredencialSefaz } from './sefaz-dfe'

const URLS: Record<AmbienteSefaz, string> = {
  producao:    'https://www1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
  homologacao: 'https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
}
const TP_AMB: Record<AmbienteSefaz, '1' | '2'> = { producao: '1', homologacao: '2' }

/** Os quatro eventos de manifestação, com o que cada um declara. */
export const MANIFESTACOES = {
  '210200': { nome: 'Confirmação da Operação',  descricao: 'A mercadoria chegou como descrito na nota.' },
  '210210': { nome: 'Ciência da Operação',      descricao: 'Sei que esta nota existe. Não confirma recebimento.' },
  '210220': { nome: 'Desconhecimento',          descricao: 'Não reconheço esta operação.' },
  '210240': { nome: 'Operação não Realizada',   descricao: 'A operação estava prevista mas não aconteceu.' },
} as const

export type TipoManifestacao = keyof typeof MANIFESTACOES

/** Descrição exigida no XML, por tipo de evento. */
const DESCRICAO: Record<TipoManifestacao, string> = {
  '210200': 'Confirmacao da Operacao',
  '210210': 'Ciencia da Operacao',
  '210220': 'Desconhecimento da Operacao',
  '210240': 'Operacao nao Realizada',
}

export interface ResultadoEvento {
  ok:       boolean
  cStat:    string
  xMotivo:  string
  /** True quando o evento já existia — efeito obtido, não é falha. */
  duplicado: boolean
  /** True quando passou dos 10 dias e a Ciência não é mais aceita. */
  foraDoPrazo: boolean
  protocolo: string | null
}

// ─── Assinatura ──────────────────────────────────────────────────────────────

interface ChaveECert { chavePem: string; certBase64: string }

/**
 * Tira a chave privada e o certificado do .pfx.
 *
 * O mesmo arquivo serve ao mTLS (onde o Node consome o pfx direto) e à
 * assinatura do XML (que precisa da chave em PEM). Extrair aqui evita guardar
 * a chave em outro lugar.
 */
function abrirPfx(pfx: Buffer, senha: string | null): ChaveECert {
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')))
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha ?? '')

  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map(b => b.cert).filter(Boolean) as forge.pki.Certificate[]
  const chaves = ((p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [])
    .concat(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []))
    .map(b => b.key).filter(Boolean) as forge.pki.PrivateKey[]

  if (!certs.length || !chaves.length) throw new Error('certificado sem chave privada utilizável')

  // O certificado do titular é o que casa com a chave; numa cadeia, é o
  // primeiro. Mandar o da AC no lugar faz a SEFAZ rejeitar a assinatura.
  const cert = certs[0]
  return {
    chavePem:   forge.pki.privateKeyToPem(chaves[0] as forge.pki.rsa.PrivateKey),
    certBase64: forge.util.encode64(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()),
  }
}

/**
 * Assina o `infEvento` no padrão que a SEFAZ exige.
 *
 * Os parâmetros não são escolha: a NF-e exige SHA-1 com RSA, transformação
 * enveloped + C14N exclusiva, e `KeyInfo` com o certificado. Trocar qualquer
 * um resulta em rejeição da assinatura — não em erro de rede, o que torna o
 * diagnóstico demorado.
 */
export function assinarEvento(xmlEvento: string, pfx: Buffer, senha: string | null, idEvento: string): string {
  const { chavePem, certBase64 } = abrirPfx(pfx, senha)

  const sig = new SignedXml({
    privateKey: chavePem,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    getKeyInfoContent: () => `<X509Data><X509Certificate>${certBase64}</X509Certificate></X509Data>`,
  })

  sig.addReference({
    xpath: `//*[local-name(.)='infEvento'][@Id='${idEvento}']`,
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
    ],
    uri: `#${idEvento}`,
  })

  sig.computeSignature(xmlEvento, {
    // A assinatura entra DEPOIS do infEvento, dentro de <evento>.
    location: { reference: `//*[local-name(.)='infEvento']`, action: 'after' },
  })
  return sig.getSignedXml()
}

// ─── Montagem e envio ────────────────────────────────────────────────────────

/** `AAAA-MM-DDThh:mm:ss-03:00`, que é o formato que o schema aceita. */
function agoraSefaz(agora = new Date()): string {
  const d = new Date(agora.getTime() - 3 * 3600000)   // America/Sao_Paulo
  return d.toISOString().replace(/\.\d{3}Z$/, '-03:00')
}

export function montarEvento(
  cred: CredencialSefaz,
  chave: string,
  tipo: TipoManifestacao,
  sequencia = 1,
  agora = new Date(),
): { xml: string; id: string } {
  const ch = chave.replace(/\D/g, '')
  const cnpj = cred.cnpj.replace(/\D/g, '')
  // Id = "ID" + tpEvento + chave + nSeqEvento com 2 dígitos. Formato fixo.
  const id = `ID${tipo}${ch}${String(sequencia).padStart(2, '0')}`

  const inf =
    `<infEvento Id="${id}">`
    + `<cOrgao>91</cOrgao>`               // 91 = Ambiente Nacional
    + `<tpAmb>${TP_AMB[cred.ambiente]}</tpAmb>`
    + `<CNPJ>${cnpj}</CNPJ>`
    + `<chNFe>${ch}</chNFe>`
    + `<dhEvento>${agoraSefaz(agora)}</dhEvento>`
    + `<tpEvento>${tipo}</tpEvento>`
    + `<nSeqEvento>${sequencia}</nSeqEvento>`
    + `<verEvento>1.00</verEvento>`
    + `<detEvento versao="1.00"><descEvento>${DESCRICAO[tipo]}</descEvento></detEvento>`
    + `</infEvento>`

  return { xml: `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">${inf}</evento>`, id }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  transformTagName: (t: string) => t.includes(':') ? t.split(':').pop() as string : t,
})

export function lerRetornoEvento(soap: string): ResultadoEvento {
  const achar = (no: unknown, alvo: string): Record<string, unknown> | null => {
    if (!no || typeof no !== 'object') return null
    const obj = no as Record<string, unknown>
    if (obj[alvo]) return obj[alvo] as Record<string, unknown>
    for (const v of Object.values(obj)) {
      const r = achar(v, alvo)
      if (r) return r
    }
    return null
  }

  const arvore = parser.parse(soap) as Record<string, unknown>
  // O status que importa é o do evento (retEvento), não o do lote.
  const ret = achar(arvore, 'infEvento') ?? achar(arvore, 'retEnvEvento')
  if (!ret) throw new Error('resposta da SEFAZ em formato inesperado')

  const cStat = String(ret.cStat ?? '')
  const xMotivo = String(ret.xMotivo ?? '')

  return {
    // 135 = registrado; 136 = registrado mas vinculação pendente; 573 = já existia.
    ok:          ['135', '136', '573'].includes(cStat),
    cStat,
    xMotivo,
    duplicado:   cStat === '573',
    foraDoPrazo: cStat === '596',
    protocolo:   ret.nProt ? String(ret.nProt) : null,
  }
}

export async function enviarEvento(
  cred: CredencialSefaz,
  chave: string,
  tipo: TipoManifestacao,
  sequencia = 1,
): Promise<ResultadoEvento> {
  const { xml, id } = montarEvento(cred, chave, tipo, sequencia)
  const assinado = assinarEvento(xml, cred.pfx, cred.passphrase, id)

  // idLote é livre; serve só para a SEFAZ correlacionar o envio.
  const lote = '<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">'
    + `<idLote>${Date.now()}</idLote>${assinado}</envEvento>`

  const body = '<?xml version="1.0" encoding="utf-8"?>'
    + '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>'
    + '<nfeRecepcaoEvento xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">'
    + `<nfeDadosMsg>${lote}</nfeDadosMsg>`
    + '</nfeRecepcaoEvento></soap12:Body></soap12:Envelope>'

  const u = new URL(URLS[cred.ambiente])
  const resposta = await new Promise<string>((resolve, reject) => {
    const req = https.request({
      host: u.hostname, port: 443, path: u.pathname, method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      },
      pfx: cred.pfx, passphrase: cred.passphrase || undefined, rejectUnauthorized: true,
    }, res => {
      let txt = ''
      res.setEncoding('utf8')
      res.on('data', c => { txt += c })
      res.on('end', () => (res.statusCode ?? 0) >= 400
        ? reject(new Error(`SEFAZ respondeu HTTP ${res.statusCode}`))
        : resolve(txt))
    })
    req.on('error', e => reject(e))
    req.write(body)
    req.end()
  })

  return lerRetornoEvento(resposta)
}
