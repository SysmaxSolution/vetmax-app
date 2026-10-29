// Certificado e-CNPJ A1 (mTLS) da clínica: lê, normaliza, cifra e decifra.
// Server-only — nunca importar de componente de cliente.
//
// Duas decisões que valem o comentário:
//
// 1. O arquivo é NORMALIZADO na entrada. As certificadoras brasileiras
//    (AC SOLUTI, Serasa, Certisign…) entregam o .pfx num container PKCS#12
//    cifrado com RC2-40, e o OpenSSL 3 do Node recusa carregar isso
//    (ERR_CRYPTO_UNSUPPORTED_OPERATION / "Unsupported PKCS12 PFX data"). Não é
//    exceção de um certificado — é o padrão do mercado. Em vez de exigir que
//    cada clínica reexporte o arquivo na mão, lemos com node-forge (que
//    implementa RC2) e reempacotamos em AES-256. A chave e os certificados são
//    os mesmos; só o invólucro muda.
//
// 2. O conteúdo fica cifrado em repouso (AES-256-GCM com chave do servidor) e
//    nunca volta para o navegador: é a credencial que autentica a empresa no
//    banco.

// (a cifra mora em @/lib/crypto/segredo — ver reexport abaixo)
import forge from 'node-forge'

// A cifra saiu daqui para `@/lib/crypto/segredo`: este arquivo importa
// node-forge no topo, e quem precisava apenas cifrar um segredo arrastava o
// forge inteiro junto. Reexportado para não quebrar nada que já importava daqui.
export { encryptSecret, decryptSecret } from '@/lib/crypto/segredo'

export interface CertificadoLido {
  ok: true
  /** Container reempacotado em AES-256 — este é o que vai para o banco de dados. */
  pfx: Buffer
  subject_cn: string | null
  /** CNPJ extraído do CN ("RAZAO SOCIAL:00000000000100"). */
  cnpj: string | null
  not_before: string | null
  not_after: string | null
}

export type LeituraPfx = CertificadoLido | { ok: false; erro: string }

const formatarCnpj = (d: string) =>
  d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d

/**
 * Lê o .pfx como a certificadora entregou e devolve um container que o Node
 * aceita, junto com os dados do titular. O CNPJ e o vencimento saem daqui —
 * ninguém precisa digitar.
 */
export function lerPfx(arquivo: Buffer, senha: string): LeituraPfx {
  if (!arquivo || arquivo.length < 500) {
    return { ok: false, erro: 'Arquivo vazio ou pequeno demais para ser um certificado.' }
  }

  let p12: ReturnType<typeof forge.pkcs12.pkcs12FromAsn1>
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(arquivo.toString('binary')))
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha)
  } catch (e) {
    const m = String((e as Error).message ?? '')
    if (/mac|password|invalid password/i.test(m)) {
      return { ok: false, erro: 'Senha do certificado incorreta.' }
    }
    return { ok: false, erro: 'Não foi possível ler o arquivo. Confira se é mesmo o certificado A1 (.pfx ou .p12).' }
  }

  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map((b: forge.pkcs12.Bag) => b.cert).filter(Boolean) as forge.pki.Certificate[]
  const chaves = ((p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [])
    .concat(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []))
  const chave = chaves[0]?.key

  if (!chave) return { ok: false, erro: 'O arquivo não contém a chave privada — peça à certificadora o certificado completo.' }
  if (!certs.length) return { ok: false, erro: 'O arquivo não contém certificado.' }

  // O certificado do titular é o que traz CNPJ no CN ("RAZAO:00000000000100");
  // os outros são a cadeia da AC.
  const titular = certs.find(c => /:\d{11,14}$/.test(String(c.subject.getField('CN')?.value ?? ''))) ?? certs[0]
  const cn = String(titular.subject.getField('CN')?.value ?? '') || null
  const doc = cn?.match(/:(\d{11,14})$/)?.[1] ?? null

  let pfx: Buffer
  try {
    const asn1 = forge.pkcs12.toPkcs12Asn1(chave, certs, senha, { algorithm: 'aes256', generateLocalKeyId: true })
    pfx = Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary')
  } catch {
    return { ok: false, erro: 'Não foi possível preparar o certificado para uso no servidor.' }
  }

  return {
    ok: true,
    pfx,
    subject_cn: cn,
    cnpj: doc && doc.length === 14 ? formatarCnpj(doc) : doc,
    not_before: titular.validity.notBefore?.toISOString().slice(0, 10) ?? null,
    not_after:  titular.validity.notAfter?.toISOString().slice(0, 10) ?? null,
  }
}
