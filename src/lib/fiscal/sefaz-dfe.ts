// Cliente da Distribuição DF-e do Ambiente Nacional (NT 2014.002).
//
// Dois caminhos, com naturezas MUITO diferentes:
//
//   distNSU   — varre a sequência do CNPJ. É o caminho que entrega tudo, e é
//               o que entra em conflito com outro software no mesmo CNPJ: a
//               SEFAZ entrega cada documento uma única vez por CNPJ, e quem
//               baixou primeiro fica com ele.
//   consChNFe — pergunta por UMA chave. Não toca na sequência, não conflita
//               com ninguém, e tem limite próprio de 20 consultas por hora.
//
// ⚠️ Nos DOIS casos o destinatário só recebe o XML COMPLETO (`procNFe`) depois
// de manifestar Ciência (210210). Sem manifestação vem apenas o resumo
// (`resNFe`): chave, emitente, valor, data. Isso não é limitação do código —
// é a regra do serviço, e vale também para a consulta por chave.
//
// Transporte: TLS mútuo com o e-CNPJ A1 da empresa, igual ao do Sicoob. Usa
// `node:https` com `pfx` direto porque o `dispatcher` do fetch não existe aqui.
//
// Server-only.

import https from 'node:https'
import { gunzipSync } from 'node:zlib'
import { XMLParser } from 'fast-xml-parser'

export type AmbienteSefaz = 'producao' | 'homologacao'

/**
 * O serviço é do Ambiente Nacional, não da SEFAZ estadual: a distribuição é
 * nacional por natureza, já que a nota pode vir de qualquer estado.
 */
const URLS: Record<AmbienteSefaz, string> = {
  producao:    'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
  homologacao: 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
}

/** `tpAmb` do XML: 1 produção, 2 homologação. */
const TP_AMB: Record<AmbienteSefaz, '1' | '2'> = { producao: '1', homologacao: '2' }

export interface CredencialSefaz {
  ambiente:   AmbienteSefaz
  /** e-CNPJ A1 da empresa, já decifrado. */
  pfx:        Buffer
  passphrase: string | null
  /** CNPJ do interessado, só dígitos. */
  cnpj:       string
  /**
   * UF do autor da consulta — sigla ('SP') ou código IBGE ('35').
   *
   * ⚠️ NÃO é 91. O 91 identifica o Ambiente Nacional e vale para o `cOrgao`
   * do EVENTO de manifestação; na consulta de distribuição, `cUFAutor` é o
   * código IBGE do estado de quem consulta. Mandar 91 aqui fez a primeira
   * consulta real voltar vazia, com cStat 137 e maxNSU=0 — o que parecia
   * "CNPJ sem notas" e na verdade era requisição malformada.
   */
  cUF?:       string
}

/** Código IBGE por sigla de UF — é o que `cUFAutor` espera. */
export const UF_IBGE: Record<string, string> = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
  MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27',
  SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41',
  SC: '42', RS: '43', MS: '50', MT: '51', GO: '52', DF: '53',
}

/** Aceita 'SP' ou '35' e devolve sempre o código. Sem UF, não dá para montar. */
export function codigoDaUf(uf: string | null | undefined): string | null {
  const v = String(uf ?? '').trim().toUpperCase()
  if (/^\d{2}$/.test(v)) return Object.values(UF_IBGE).includes(v) ? v : null
  return UF_IBGE[v] ?? null
}

/** Um documento do lote, já descompactado e identificado. */
export interface DocumentoDfe {
  nsu:    string
  /** 'resumo' = só os dados básicos; 'completo' = o XML da nota. */
  tipo:   'resumo' | 'completo' | 'evento' | 'resumo_evento' | 'desconhecido'
  /** XML cru, descompactado. É o que guardamos. */
  xml:    string
  chave:  string | null
}

export interface RespostaDfe {
  cStat:   string
  xMotivo: string
  ultNSU:  number
  maxNSU:  number
  documentos: DocumentoDfe[]
}

// ─── Transporte ──────────────────────────────────────────────────────────────

function envelope(conteudo: string): string {
  // SOAP 1.2. O Ambiente Nacional recusa 1.1 neste serviço.
  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">'
    + '<soap12:Body>'
    + '<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">'
    + '<nfeDadosMsg>' + conteudo + '</nfeDadosMsg>'
    + '</nfeDistDFeInteresse>'
    + '</soap12:Body></soap12:Envelope>'
}

async function chamar(cred: CredencialSefaz, corpoXml: string): Promise<string> {
  if (!cred.pfx || cred.pfx.length < 500) {
    throw new Error('Certificado e-CNPJ A1 não cadastrado para esta empresa.')
  }
  const u = new URL(URLS[cred.ambiente])
  const body = envelope(corpoXml)

  return new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        host: u.hostname,
        port: 443,
        path: u.pathname,
        method: 'POST',
        headers: {
          // charset no Content-Type é exigido pelo serviço; sem ele vem 415.
          'Content-Type': 'application/soap+xml; charset=utf-8',
          'Content-Length': Buffer.byteLength(body),
        },
        pfx: cred.pfx,
        passphrase: cred.passphrase || undefined,
        rejectUnauthorized: true,
      },
      res => {
        let txt = ''
        res.setEncoding('utf8')
        res.on('data', ch => { txt += ch })
        res.on('end', () => {
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`SEFAZ respondeu HTTP ${res.statusCode}`))
            return
          }
          resolve(txt)
        })
      },
    )
    req.on('error', e => {
      const code = (e as NodeJS.ErrnoException).code
      reject(new Error(code === 'ERR_OSSL_UNSUPPORTED'
        ? 'o Node recusou o certificado (algoritmo legado) — reexporte o .pfx'
        : e.message))
    })
    req.write(body)
    req.end()
  })
}

// ─── Leitura da resposta ─────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // Os nomes vêm com prefixo de namespace conforme o ambiente; tirar o
  // prefixo deixa a leitura estável.
  transformTagName: (t: string) => t.includes(':') ? t.split(':').pop() as string : t,
})

/** Nome da raiz do XML descompactado diz o que o documento é. */
function classificar(xml: string): DocumentoDfe['tipo'] {
  if (/<resNFe[\s>]/.test(xml))         return 'resumo'
  if (/<nfeProc[\s>]|<NFe[\s>]/.test(xml)) return 'completo'
  if (/<procEventoNFe[\s>]/.test(xml))  return 'evento'
  if (/<resEvento[\s>]/.test(xml))      return 'resumo_evento'
  return 'desconhecido'
}

/** A chave de 44 dígitos, de onde quer que ela esteja no documento. */
function extrairChave(xml: string): string | null {
  const m = xml.match(/<chNFe>(\d{44})<\/chNFe>/)
    ?? xml.match(/\bId="NFe(\d{44})"/)
  return m ? m[1] : null
}

export function lerResposta(soap: string): RespostaDfe {
  const arvore = parser.parse(soap) as Record<string, unknown>

  // Desce até retDistDFeInt sem depender da forma exata do envelope.
  const achar = (no: unknown): Record<string, unknown> | null => {
    if (!no || typeof no !== 'object') return null
    const obj = no as Record<string, unknown>
    if (obj.retDistDFeInt) return obj.retDistDFeInt as Record<string, unknown>
    for (const v of Object.values(obj)) {
      const r = achar(v)
      if (r) return r
    }
    return null
  }

  const ret = achar(arvore)
  if (!ret) throw new Error('resposta da SEFAZ em formato inesperado')

  const lote = ret.loteDistDFeInt as Record<string, unknown> | undefined
  const brutos = lote?.docZip
  const lista = Array.isArray(brutos) ? brutos : brutos ? [brutos] : []

  const documentos: DocumentoDfe[] = []
  for (const d of lista) {
    const item = d as Record<string, unknown>
    // `docZip` é o XML em gzip + base64. Sem descompactar não há documento.
    const conteudo = typeof item === 'object' ? String(item['#text'] ?? '') : String(item)
    if (!conteudo) continue
    let xml: string
    try { xml = gunzipSync(Buffer.from(conteudo, 'base64')).toString('utf8') }
    catch { continue }   // documento corrompido não derruba o lote inteiro
    documentos.push({
      nsu:   String(item['@NSU'] ?? ''),
      tipo:  classificar(xml),
      xml,
      chave: extrairChave(xml),
    })
  }

  return {
    cStat:   String(ret.cStat ?? ''),
    xMotivo: String(ret.xMotivo ?? ''),
    ultNSU:  Number(ret.ultNSU ?? 0) || 0,
    maxNSU:  Number(ret.maxNSU ?? 0) || 0,
    documentos,
  }
}

/** Os dados da nota que a tela mostra, venham do resumo ou do XML completo. */
export interface DadosDaNota {
  chave:         string
  emitenteCnpj:  string | null
  emitenteNome:  string | null
  numero:        string | null
  serie:         string | null
  valor:         number | null
  emitidaEm:     string | null
  situacao:      string | null
}

const texto = (xml: string, tag: string): string | null => {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
  return m ? m[1].trim() || null : null
}

/**
 * Lê os dados da nota de QUALQUER um dos dois formatos.
 *
 * O resumo (`resNFe`) e a nota completa (`nfeProc`) usam nomes de campo
 * diferentes para a mesma informação — `xNome` contra `emit/xNome`, `vNF` no
 * resumo contra `total/ICMSTot/vNF` na nota. Ler os dois aqui evita que a tela
 * mostre linha vazia só porque o documento veio no outro formato.
 */
export function lerDadosDaNota(xml: string, chaveConhecida?: string | null): DadosDaNota | null {
  const chave = extrairChave(xml) ?? chaveConhecida ?? null
  if (!chave) return null

  // No resumo os campos são rasos; na nota completa estão dentro de <emit>.
  const bloco = xml.match(/<emit>([\s\S]*?)<\/emit>/)?.[1] ?? xml

  const valorBruto = texto(xml, 'vNF')
  const emissao = texto(xml, 'dhEmi') ?? texto(xml, 'dEmi')

  return {
    chave,
    emitenteCnpj: (texto(bloco, 'CNPJ') ?? texto(xml, 'CNPJ'))?.replace(/\D/g, '') ?? null,
    emitenteNome: texto(bloco, 'xNome') ?? texto(xml, 'xNome'),
    numero:       texto(xml, 'nNF'),
    serie:        texto(xml, 'serie'),
    valor:        valorBruto ? Number(valorBruto) || null : null,
    emitidaEm:    emissao,
    // cSitNFe: 1 autorizada, 2 denegada, 3 cancelada. Guardamos o codigo cru;
    // traduzir e problema de quem exibe.
    situacao:     texto(xml, 'cSitNFe'),
  }
}

// ─── As duas consultas ───────────────────────────────────────────────────────

function corpo(cred: CredencialSefaz, miolo: string): string {
  const uf = codigoDaUf(cred.cUF)
  if (!uf) {
    throw new Error('UF do autor da consulta não definida — confira o estado no cadastro da clínica.')
  }
  return '<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">'
    + `<tpAmb>${TP_AMB[cred.ambiente]}</tpAmb>`
    + `<cUFAutor>${uf}</cUFAutor>`
    + `<CNPJ>${cred.cnpj.replace(/\D/g, '')}</CNPJ>`
    + miolo
    + '</distDFeInt>'
}

/**
 * Varre a sequência do CNPJ a partir do último NSU conhecido.
 *
 * ⚠️ Só chamar depois de `decidirConsulta` autorizar: pedir fora de sequência,
 * ou pedir quando não há nada novo, custa uma hora de bloqueio para o CNPJ —
 * e quem insiste antes do prazo tem o relógio zerado.
 */
export async function consultarPorNsu(
  cred: CredencialSefaz, ultNSU: number,
): Promise<RespostaDfe> {
  // 15 dígitos com zeros à esquerda, como o schema exige.
  const nsu = String(Math.max(0, Math.floor(ultNSU))).padStart(15, '0')
  return lerResposta(await chamar(cred, corpo(cred, `<distNSU><ultNSU>${nsu}</ultNSU></distNSU>`)))
}

/**
 * Pergunta por UMA chave. Não toca na sequência de NSU — por isso não
 * conflita com outro software consultando o mesmo CNPJ.
 *
 * Devolve o XML completo apenas se já houver manifestação do destinatário;
 * sem ela, vem o resumo.
 */
export async function consultarPorChave(
  cred: CredencialSefaz, chave: string,
): Promise<RespostaDfe> {
  const ch = chave.replace(/\D/g, '')
  if (ch.length !== 44) throw new Error('chave fora do padrão (44 dígitos)')
  return lerResposta(await chamar(cred, corpo(cred, `<consChNFe><chNFe>${ch}</chNFe></consChNFe>`)))
}
