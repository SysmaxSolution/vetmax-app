// Quem está do outro lado da transação, a partir do que o banco manda.
//
// O Sicoob manda `descInfComplementar`, que a gente descartava. Medido na
// resposta real (53 de 54 transações vinham preenchidas):
//
//   Recebimento Pix|@ROBERTA DE SOUZA PORTERO|@***.430.331-*
//   Pagamento Pix|@51.097.732 0001-82|@fabio
//   Pagamento Pix|@***.893.678-**|@cartao omini cc
//   EVOLUSERVICES _Deb._Maestro
//   SIPAG_Cred._Mastercard
//
// Repare que nos Pix a ORDEM dos campos varia: às vezes nome e depois
// documento, às vezes o contrário. Então não dá para pegar por posição — tem
// de decidir pelo FORMATO de cada parte.
//
// Para cartão não existe pessoa: a contraparte é a adquirente (EVOLUSERVICES,
// SIPAG) com a bandeira. Isso também é útil — é o que amarra o recebível de
// cartão à operadora certa.

const soDigitos = (s: string) => s.replace(/\D+/g, '')

/** Parece documento (CPF/CNPJ), inclusive mascarado com `*`? */
function pareceDocumento(parte: string): boolean {
  const t = parte.trim()
  if (!t) return false
  // Mascarado pelo banco: ***.430.331-* — sobram poucos dígitos e muitos '*'.
  if (t.includes('*')) return true
  const d = soDigitos(t)
  if (!d) return false
  // Só dígitos e separadores, com cara de CPF (11) ou CNPJ (14).
  return /^[\d.\-/ ]+$/.test(t) && d.length >= 8
}

export interface Contraparte {
  /** Texto cru do banco, guardado para poder melhorar a extração depois. */
  cru: string
  /** Nome da pessoa/empresa, quando identificável. */
  nome: string | null
  /** Documento mascarado, quando veio. */
  documento: string | null
  /** Adquirente de cartão (EVOLUSERVICES, SIPAG…), quando é liquidação. */
  adquirente: string | null
}

/**
 * Extrai a contraparte do `descInfComplementar`.
 *
 * Nunca lança e nunca inventa: o que não der para identificar volta `null`, e
 * o texto cru fica guardado de todo jeito.
 */
export function extrairContraparte(bruto: unknown): Contraparte {
  const cru = String(bruto ?? '').trim()
  const vazio: Contraparte = { cru, nome: null, documento: null, adquirente: null }
  if (!cru) return vazio

  // Formato Pix: "<operação>|@<parte>|@<parte>…"
  if (cru.includes('|@')) {
    const partes = cru.split('|@').slice(1).map(p => p.trim()).filter(Boolean)
    let nome: string | null = null
    let documento: string | null = null
    for (const p of partes) {
      if (pareceDocumento(p)) { documento = documento ?? p; continue }
      // Sobra: é nome. Fica o primeiro que aparecer.
      if (!nome) nome = p
    }
    return { cru, nome, documento, adquirente: null }
  }

  // Formato cartão: "ADQUIRENTE_Tipo_Bandeira" (o separador é '_').
  if (cru.includes('_')) {
    const adquirente = cru.split('_')[0].trim()
    return { cru, nome: null, documento: null, adquirente: adquirente || null }
  }

  // Qualquer outra coisa: trata como nome, que é o uso mais provável.
  return { cru, nome: cru, documento: null, adquirente: null }
}

/** O que mostrar na tela como "de quem é" esta linha. */
export function rotuloContraparte(c: Contraparte): string | null {
  if (c.nome) return c.documento ? `${c.nome} · ${c.documento}` : c.nome
  if (c.adquirente) return c.adquirente
  return null
}
