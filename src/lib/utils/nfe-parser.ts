import { XMLParser } from 'fast-xml-parser'

import { mensagemErro } from '@/lib/errors'
export interface ParsedSupplier {
  cnpj:       string
  name:       string
  ie?:        string
  address?:   string
  city?:      string
  state?:     string
  zip_code?:  string
  phone?:     string
  email?:     string
}

export interface ParsedNFeItem {
  description: string
  ncm:         string
  ean?:        string
  cfop?:       string
  quantity:    number
  unit?:       string
  unit_price:  number
  total_price: number
  tax_icms?:   number
  tax_pis?:    number
  tax_cofins?: number
  // Impostos por item (valores, não só alíquotas): é o que o contador pede
  // e o que o operador corrige na conferência da entrada.
  cst?:           string   // CST (regime normal) ou CSOSN (Simples)
  icms_origin?:   string   // campo orig do ICMS
  icms_base?:     number   // vBC
  icms_value?:    number   // vICMS
  icms_st_value?: number   // vICMSST
  ipi_value?:     number   // vIPI
  pis_value?:     number   // vPIS
  cofins_value?:  number   // vCOFINS
}

export interface ParsedDuplicata {
  numero:    string   // nDup
  vencimento: string  // dVenc (AAAA-MM-DD)
  valor:     number   // vDup
}

export interface ParsedNFe {
  nfe_key:     string
  nfe_number:  string
  nfe_series:  string
  issue_date:  string
  total_value: number
  supplier:    ParsedSupplier
  items:       ParsedNFeItem[]
  duplicatas:  ParsedDuplicata[]   // parcelas de cobrança (tag cobr/dup)
  /**
   * Chaves das notas referenciadas (tag ide/NFref/refNFe).
   *
   * É o que liga a remessa de entrega futura ao faturamento que veio antes.
   * Uma nota pode referenciar várias; a primeira costuma ser a que interessa.
   */
  chaves_referenciadas: string[]
}

export function parseNFeXML(xmlContent: string): ParsedNFe | { error: string } {
  try {
    // `parseTagValue: false` NÃO é detalhe de configuração: com a conversão
    // automática ligada, todo campo que parece número vira número — e perde os
    // zeros à esquerda. O CNPJ 04852370000108 era gravado como 4852370000108,
    // e aí a conciliação bancária deixava de reconhecer o fornecedor (medido
    // em produção, 23/10/2026). Vale igual para NCM, EAN, CFOP, CEP e número
    // da nota. Os campos realmente numéricos já são convertidos à mão, logo
    // abaixo, com `parseFloat`.
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false })
    const obj = parser.parse(xmlContent)

    const nfe = obj?.nfeProc?.NFe ?? obj?.NFe
    if (!nfe) return { error: 'Arquivo XML não reconhecido como NF-e válida.' }

    const inf = nfe.infNFe
    if (!inf) return { error: 'Estrutura infNFe não encontrada no XML.' }

    const emit  = inf.emit ?? {}
    const total = inf.total?.ICMSTot ?? {}
    const ide   = inf.ide ?? {}

    const key: string   = inf['@_Id']?.replace('NFe', '') ?? ''
    // NFref: o fornecedor aponta aqui a nota que esta está complementando.
    const refRaw = ide.NFref ?? []
    const refArr = Array.isArray(refRaw) ? refRaw : [refRaw]
    const chaves_referenciadas = refArr
      .map((r: Record<string, unknown>) => String(r?.refNFe ?? '').replace(/\D/g, ''))
      .filter((c: string) => c.length === 44)

    const nfe_number    = String(ide.nNF ?? '')
    const nfe_series    = String(ide.serie ?? '')
    const dh_emi        = String(ide.dhEmi ?? ide.dEmi ?? '')
    const issue_date    = dh_emi.substring(0, 10)

    const supplier: ParsedSupplier = {
      cnpj:     String(emit.CNPJ ?? emit.CPF ?? '').replace(/\D/g, ''),
      name:     String(emit.xNome ?? ''),
      ie:       emit.IE ? String(emit.IE) : undefined,
      city:     emit.enderEmit?.xMun ? String(emit.enderEmit.xMun) : undefined,
      state:    emit.enderEmit?.UF   ? String(emit.enderEmit.UF)   : undefined,
      zip_code: emit.enderEmit?.CEP  ? String(emit.enderEmit.CEP)  : undefined,
      address: emit.enderEmit
        ? [emit.enderEmit.xLgr, emit.enderEmit.nro, emit.enderEmit.xBairro]
            .filter(Boolean).join(', ')
        : undefined,
    }

    const detRaw = inf.det ?? []
    const detArr = Array.isArray(detRaw) ? detRaw : [detRaw]

    const items: ParsedNFeItem[] = detArr.map((det: any) => {
      const prod    = det.prod ?? {}
      const imposto = det.imposto ?? {}

      const icmsEntry   = imposto.ICMS   ? Object.values(imposto.ICMS   as Record<string, any>)[0] : null
      const pisEntry    = imposto.PIS    ? Object.values(imposto.PIS    as Record<string, any>)[0] : null
      const cofinsEntry = imposto.COFINS ? Object.values(imposto.COFINS as Record<string, any>)[0] : null
      // IPI vem como <IPI><IPITrib>…</IPITrib></IPI> (tributado) ou <IPINT> (não tributado).
      const ipiEntry    = imposto.IPI?.IPITrib ?? null
      const num = (v: unknown): number | undefined => {
        if (v === undefined || v === null || v === '') return undefined
        const n = parseFloat(String(v))
        return Number.isFinite(n) ? n : undefined
      }
      const texto = (v: unknown): string | undefined => {
        const t = v === undefined || v === null ? '' : String(v).trim()
        return t ? t : undefined
      }

      const ean = String(prod.cEAN ?? '').replace(/\D/g, '').length >= 8
        ? String(prod.cEAN ?? '')
        : undefined

      return {
        description: String(prod.xProd ?? ''),
        ncm:         String(prod.NCM ?? ''),
        ean,
        cfop:        String(prod.CFOP ?? ''),
        quantity:    parseFloat(String(prod.qCom ?? prod.qTrib ?? 1)),
        unit:        String(prod.uCom ?? prod.uTrib ?? 'un'),
        unit_price:  parseFloat(String(prod.vUnCom ?? prod.vUnTrib ?? 0)),
        total_price: parseFloat(String(prod.vProd ?? 0)),
        tax_icms:    icmsEntry?.pICMS     ? parseFloat(String(icmsEntry.pICMS))     : undefined,
        tax_pis:     pisEntry?.pPIS       ? parseFloat(String(pisEntry.pPIS))       : undefined,
        tax_cofins:  cofinsEntry?.pCOFINS ? parseFloat(String(cofinsEntry.pCOFINS)) : undefined,
        cst:           texto(icmsEntry?.CSOSN ?? icmsEntry?.CST),
        icms_origin:   texto(icmsEntry?.orig),
        icms_base:     num(icmsEntry?.vBC),
        icms_value:    num(icmsEntry?.vICMS),
        icms_st_value: num(icmsEntry?.vICMSST),
        ipi_value:     num(ipiEntry?.vIPI),
        pis_value:     num(pisEntry?.vPIS),
        cofins_value:  num(cofinsEntry?.vCOFINS),
      }
    })

    // Cobrança / duplicatas (parcelas) — tag <cobr><dup>
    const dupRaw = inf.cobr?.dup ?? []
    const dupArr = Array.isArray(dupRaw) ? dupRaw : [dupRaw]
    const duplicatas: ParsedDuplicata[] = dupArr
      .filter((d: any) => d && (d.vDup !== undefined || d.dVenc !== undefined))
      .map((d: any, i: number) => ({
        numero:     String(d.nDup ?? (i + 1)),
        vencimento: String(d.dVenc ?? '').substring(0, 10),
        valor:      parseFloat(String(d.vDup ?? 0)),
      }))

    return {
      nfe_key:     key,
      nfe_number,
      nfe_series,
      issue_date,
      total_value: parseFloat(String(total.vNF ?? total.vTotTrib ?? 0)),
      supplier,
      items,
      duplicatas,
      chaves_referenciadas,
    }
  } catch (e: any) {
    return { error: `Erro ao processar XML: ${mensagemErro(e, 'lib/utils/nfe-parser.ts')}` }
  }
}
