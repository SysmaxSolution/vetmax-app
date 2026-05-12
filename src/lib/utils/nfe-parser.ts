import { XMLParser } from 'fast-xml-parser'

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
}

export interface ParsedNFe {
  nfe_key:     string
  nfe_number:  string
  nfe_series:  string
  issue_date:  string
  total_value: number
  supplier:    ParsedSupplier
  items:       ParsedNFeItem[]
}

export function parseNFeXML(xmlContent: string): ParsedNFe | { error: string } {
  try {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: true })
    const obj = parser.parse(xmlContent)

    const nfe = obj?.nfeProc?.NFe ?? obj?.NFe
    if (!nfe) return { error: 'Arquivo XML não reconhecido como NF-e válida.' }

    const inf = nfe.infNFe
    if (!inf) return { error: 'Estrutura infNFe não encontrada no XML.' }

    const emit  = inf.emit ?? {}
    const total = inf.total?.ICMSTot ?? {}
    const ide   = inf.ide ?? {}

    const key: string   = inf['@_Id']?.replace('NFe', '') ?? ''
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
      }
    })

    return {
      nfe_key:     key,
      nfe_number,
      nfe_series,
      issue_date,
      total_value: parseFloat(String(total.vNF ?? total.vTotTrib ?? 0)),
      supplier,
      items,
    }
  } catch (e: any) {
    return { error: `Erro ao processar XML: ${e?.message ?? 'desconhecido'}` }
  }
}
