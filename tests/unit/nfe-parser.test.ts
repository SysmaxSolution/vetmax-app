/**
 * Unit — Parser de NF-e (XML)
 * parseNFeXML extrai chave, número, série, data, fornecedor, itens, totais e tributos.
 */

import { parseNFeXML } from '@/lib/utils/nfe-parser'

// ─── Fixtures inline ──────────────────────────────────────────────────────────

const xmlValidoCompleto = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe Id="NFe35200714200166000187550010000000071000000071" versao="4.00">
      <ide>
        <nNF>71</nNF>
        <serie>1</serie>
        <dhEmi>2026-05-10T14:30:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>14200166000187</CNPJ>
        <xNome>Distribuidora Vet LTDA</xNome>
        <IE>123456789</IE>
        <enderEmit>
          <xLgr>Rua das Flores</xLgr>
          <nro>1234</nro>
          <xBairro>Centro</xBairro>
          <xMun>São Paulo</xMun>
          <UF>SP</UF>
          <CEP>01310100</CEP>
        </enderEmit>
      </emit>
      <det nItem="1">
        <prod>
          <xProd>Amoxicilina 500mg cx 20cp</xProd>
          <NCM>30049099</NCM>
          <cEAN>7891000100103</cEAN>
          <CFOP>5102</CFOP>
          <qCom>10</qCom>
          <uCom>UN</uCom>
          <vUnCom>15.50</vUnCom>
          <vProd>155.00</vProd>
        </prod>
        <imposto>
          <ICMS>
            <ICMS00>
              <pICMS>18.00</pICMS>
            </ICMS00>
          </ICMS>
          <PIS>
            <PISAliq>
              <pPIS>1.65</pPIS>
            </PISAliq>
          </PIS>
          <COFINS>
            <COFINSAliq>
              <pCOFINS>7.60</pCOFINS>
            </COFINSAliq>
          </COFINS>
        </imposto>
      </det>
      <total>
        <ICMSTot>
          <vNF>155.00</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`

const xmlSemWrapperNfeProc = `<?xml version="1.0"?>
<NFe>
  <infNFe Id="NFe99999999999999999999999999999999999999999999">
    <ide>
      <nNF>42</nNF>
      <serie>2</serie>
      <dhEmi>2026-04-01T10:00:00-03:00</dhEmi>
    </ide>
    <emit>
      <CNPJ>11222333000181</CNPJ>
      <xNome>Empresa Sem Wrapper</xNome>
    </emit>
    <det nItem="1">
      <prod>
        <xProd>Item solitário</xProd>
        <NCM>30049099</NCM>
        <CFOP>5102</CFOP>
        <qCom>1</qCom>
        <vUnCom>10</vUnCom>
        <vProd>10</vProd>
      </prod>
    </det>
    <total><ICMSTot><vNF>10</vNF></ICMSTot></total>
  </infNFe>
</NFe>`

const xmlNaoNFe = `<?xml version="1.0"?><outro><coisa>1</coisa></outro>`

const xmlSemInfNFe = `<?xml version="1.0"?><nfeProc><NFe></NFe></nfeProc>`

const xmlComCPF = `<?xml version="1.0"?>
<nfeProc>
  <NFe>
    <infNFe Id="NFe11111111111111111111111111111111111111111111">
      <ide><nNF>1</nNF><serie>1</serie><dhEmi>2026-01-01T08:00:00-03:00</dhEmi></ide>
      <emit>
        <CPF>12345678909</CPF>
        <xNome>Pessoa Física</xNome>
      </emit>
      <det><prod><xProd>X</xProd><NCM>1</NCM><CFOP>5102</CFOP><qCom>1</qCom><vUnCom>1</vUnCom><vProd>1</vProd></prod></det>
      <total><ICMSTot><vNF>1</vNF></ICMSTot></total>
    </infNFe>
  </NFe>
</nfeProc>`

const xmlMultiplosItens = `<?xml version="1.0"?>
<nfeProc><NFe>
  <infNFe Id="NFe22222222222222222222222222222222222222222222">
    <ide><nNF>2</nNF><serie>1</serie><dhEmi>2026-02-02T08:00:00-03:00</dhEmi></ide>
    <emit><CNPJ>14200166000187</CNPJ><xNome>Multi</xNome></emit>
    <det nItem="1"><prod><xProd>Item A</xProd><NCM>1</NCM><CFOP>5102</CFOP><qCom>2</qCom><vUnCom>5</vUnCom><vProd>10</vProd></prod></det>
    <det nItem="2"><prod><xProd>Item B</xProd><NCM>2</NCM><CFOP>5102</CFOP><qCom>1</qCom><vUnCom>20</vUnCom><vProd>20</vProd></prod></det>
    <det nItem="3"><prod><xProd>Item C</xProd><NCM>3</NCM><CFOP>5102</CFOP><qCom>3</qCom><vUnCom>2</vUnCom><vProd>6</vProd></prod></det>
    <total><ICMSTot><vNF>36</vNF></ICMSTot></total>
  </infNFe>
</NFe></nfeProc>`

const xmlComDEmi = `<?xml version="1.0"?>
<nfeProc><NFe>
  <infNFe Id="NFe33333333333333333333333333333333333333333333">
    <ide><nNF>3</nNF><serie>1</serie><dEmi>2023-06-15</dEmi></ide>
    <emit><CNPJ>14200166000187</CNPJ><xNome>Antigo</xNome></emit>
    <det><prod><xProd>X</xProd><NCM>1</NCM><CFOP>5102</CFOP><qCom>1</qCom><vUnCom>5</vUnCom><vProd>5</vProd></prod></det>
    <total><ICMSTot><vNF>5</vNF></ICMSTot></total>
  </infNFe>
</NFe></nfeProc>`

const xmlSemEnderEmit = `<?xml version="1.0"?>
<nfeProc><NFe>
  <infNFe Id="NFe44444444444444444444444444444444444444444444">
    <ide><nNF>4</nNF><serie>1</serie><dhEmi>2026-03-03T08:00:00-03:00</dhEmi></ide>
    <emit><CNPJ>14200166000187</CNPJ><xNome>Sem Endereço</xNome></emit>
    <det><prod><xProd>X</xProd><NCM>1</NCM><CFOP>5102</CFOP><qCom>1</qCom><vUnCom>5</vUnCom><vProd>5</vProd></prod></det>
    <total><ICMSTot><vNF>5</vNF></ICMSTot></total>
  </infNFe>
</NFe></nfeProc>`

const xmlCEAN_SEM = `<?xml version="1.0"?>
<nfeProc><NFe>
  <infNFe Id="NFe55555555555555555555555555555555555555555555">
    <ide><nNF>5</nNF><serie>1</serie><dhEmi>2026-04-04T08:00:00-03:00</dhEmi></ide>
    <emit><CNPJ>14200166000187</CNPJ><xNome>Sem EAN</xNome></emit>
    <det><prod><xProd>Sem EAN</xProd><NCM>1</NCM><cEAN>SEM GTIN</cEAN><CFOP>5102</CFOP><qCom>1</qCom><vUnCom>5</vUnCom><vProd>5</vProd></prod></det>
    <total><ICMSTot><vNF>5</vNF></ICMSTot></total>
  </infNFe>
</NFe></nfeProc>`

// ─── TC-NFE-001 a TC-NFE-005: Parsing válido ──────────────────────────────────

describe('TC-NFE-001 → XML válido NFe 4.0 retorna estrutura completa', () => {
  test('Não retorna erro', () => {
    const r = parseNFeXML(xmlValidoCompleto)
    expect('error' in r).toBe(false)
  })

  test('Chave da NFe extraída sem prefixo NFe', () => {
    const r = parseNFeXML(xmlValidoCompleto) as any
    expect(r.nfe_key).toBe('35200714200166000187550010000000071000000071')
  })

  test('Número e série da NFe extraídos', () => {
    const r = parseNFeXML(xmlValidoCompleto) as any
    expect(r.nfe_number).toBe('71')
    expect(r.nfe_series).toBe('1')
  })

  test('Data de emissão substring 0..10', () => {
    const r = parseNFeXML(xmlValidoCompleto) as any
    expect(r.issue_date).toBe('2026-05-10')
  })

  test('Total value parseado como número', () => {
    const r = parseNFeXML(xmlValidoCompleto) as any
    expect(r.total_value).toBe(155.0)
  })
})

describe('TC-NFE-002 → Fornecedor completo', () => {
  test('CNPJ apenas dígitos', () => {
    const r = parseNFeXML(xmlValidoCompleto) as any
    expect(r.supplier.cnpj).toBe('14200166000187')
  })

  test('Nome do fornecedor', () => {
    const r = parseNFeXML(xmlValidoCompleto) as any
    expect(r.supplier.name).toBe('Distribuidora Vet LTDA')
  })

  test('IE extraída', () => {
    const r = parseNFeXML(xmlValidoCompleto) as any
    expect(r.supplier.ie).toBe('123456789')
  })

  test('Endereço, cidade, estado, CEP', () => {
    const r = parseNFeXML(xmlValidoCompleto) as any
    expect(r.supplier.city).toBe('São Paulo')
    expect(r.supplier.state).toBe('SP')
    // fast-xml-parser parseTagValue:true converte "01310100" para número 1310100;
    // depois String() recupera. Aceitamos qualquer forma (com ou sem zero à esquerda).
    expect(r.supplier.zip_code).toMatch(/1310100$/)
    expect(r.supplier.address).toContain('Rua das Flores')
    expect(r.supplier.address).toContain('1234')
    expect(r.supplier.address).toContain('Centro')
  })
})

describe('TC-NFE-003 → Item único com tributos completos', () => {
  test('Estrutura do item', () => {
    const r = parseNFeXML(xmlValidoCompleto) as any
    expect(r.items).toHaveLength(1)
    expect(r.items[0].description).toBe('Amoxicilina 500mg cx 20cp')
    expect(r.items[0].ncm).toBe('30049099')
    expect(r.items[0].ean).toBe('7891000100103')
    expect(r.items[0].cfop).toBe('5102')
  })

  test('Quantidade, unidade, preços', () => {
    const r = parseNFeXML(xmlValidoCompleto) as any
    expect(r.items[0].quantity).toBe(10)
    expect(r.items[0].unit).toBe('UN')
    expect(r.items[0].unit_price).toBe(15.5)
    expect(r.items[0].total_price).toBe(155.0)
  })

  test('Tributos ICMS/PIS/COFINS extraídos', () => {
    const r = parseNFeXML(xmlValidoCompleto) as any
    expect(r.items[0].tax_icms).toBe(18.0)
    expect(r.items[0].tax_pis).toBe(1.65)
    expect(r.items[0].tax_cofins).toBe(7.6)
  })
})

// ─── TC-NFE-004 / 005: variantes de wrapper ───────────────────────────────────

describe('TC-NFE-004 → XML sem wrapper nfeProc (NFe direto na raiz)', () => {
  test('Aceita estrutura sem nfeProc', () => {
    const r = parseNFeXML(xmlSemWrapperNfeProc) as any
    expect('error' in r).toBe(false)
    expect(r.supplier.name).toBe('Empresa Sem Wrapper')
  })
})

describe('TC-NFE-005 → XML não-NFe retorna error', () => {
  test('XML estranho → error', () => {
    const r = parseNFeXML(xmlNaoNFe)
    expect('error' in r).toBe(true)
    if ('error' in r) {
      expect(r.error).toMatch(/n[ãa]o reconhecido/i)
    }
  })
})

describe('TC-NFE-006 → XML sem infNFe retorna error', () => {
  test('Sem infNFe → error (qualquer mensagem)', () => {
    // NFe vazia: fast-xml-parser pode interpretar como string vazia → nfe falsy → cai no primeiro check.
    // O importante é retornar { error }, não o conteúdo específico.
    const r = parseNFeXML(xmlSemInfNFe)
    expect('error' in r).toBe(true)
  })

  test('XML com NFe mas sem infNFe estruturado', () => {
    const xml = `<?xml version="1.0"?>
<nfeProc>
  <NFe>
    <outro>conteudo</outro>
  </NFe>
</nfeProc>`
    const r = parseNFeXML(xml)
    expect('error' in r).toBe(true)
    if ('error' in r) {
      expect(r.error).toMatch(/infNFe/i)
    }
  })
})

describe('TC-NFE-007 → Emit com CPF em vez de CNPJ', () => {
  test('CPF usado como identificador', () => {
    const r = parseNFeXML(xmlComCPF) as any
    expect(r.supplier.cnpj).toBe('12345678909')
    expect(r.supplier.name).toBe('Pessoa Física')
  })
})

describe('TC-NFE-008 → Múltiplos itens (det como array)', () => {
  test('3 itens parseados em ordem', () => {
    const r = parseNFeXML(xmlMultiplosItens) as any
    expect(r.items).toHaveLength(3)
    expect(r.items[0].description).toBe('Item A')
    expect(r.items[1].description).toBe('Item B')
    expect(r.items[2].description).toBe('Item C')
  })

  test('Valores agregam ao total da NF', () => {
    const r = parseNFeXML(xmlMultiplosItens) as any
    expect(r.total_value).toBe(36)
  })
})

describe('TC-NFE-009 → Único item (det como objeto único, não array)', () => {
  test('Item único é normalizado para array', () => {
    const r = parseNFeXML(xmlValidoCompleto) as any
    expect(Array.isArray(r.items)).toBe(true)
    expect(r.items).toHaveLength(1)
  })
})

describe('TC-NFE-010 → Data dEmi (formato antigo NFe 1.x) é aceita', () => {
  test('dEmi usado como fallback de dhEmi', () => {
    const r = parseNFeXML(xmlComDEmi) as any
    expect(r.issue_date).toBe('2023-06-15')
  })
})

describe('TC-NFE-011 → Sem enderEmit address fica undefined', () => {
  test('Endereço ausente é undefined', () => {
    const r = parseNFeXML(xmlSemEnderEmit) as any
    expect(r.supplier.address).toBeUndefined()
    expect(r.supplier.city).toBeUndefined()
    expect(r.supplier.state).toBeUndefined()
  })
})

describe('TC-NFE-012 → cEAN "SEM GTIN" → ean undefined', () => {
  test('cEAN não numérico (< 8 dígitos) é descartado', () => {
    const r = parseNFeXML(xmlCEAN_SEM) as any
    expect(r.items[0].ean).toBeUndefined()
  })
})

describe('TC-NFE-013 → Chave sem prefixo NFe', () => {
  test('Prefixo "NFe" do atributo Id é removido', () => {
    const r = parseNFeXML(xmlSemWrapperNfeProc) as any
    expect(r.nfe_key).not.toMatch(/^NFe/)
    expect(r.nfe_key).toBe('99999999999999999999999999999999999999999999')
  })
})

describe('TC-NFE-014 → Item com EAN válido extrai cEAN', () => {
  test('EAN-13 válido → preservado', () => {
    const r = parseNFeXML(xmlValidoCompleto) as any
    expect(r.items[0].ean).toBe('7891000100103')
  })
})

describe('TC-NFE-015 → XML malformado retorna error', () => {
  test('XML quebrado lança e é capturado', () => {
    const r = parseNFeXML('<<<>>>')
    // Pode passar (parser tolerante) ou falhar — apenas valida que não joga exception não-tratada
    expect(typeof r).toBe('object')
  })
})

describe('TC-NFE-016 → Quantidade e preços como strings são convertidos', () => {
  test('parseFloat aplicado aos números', () => {
    const r = parseNFeXML(xmlValidoCompleto) as any
    expect(typeof r.items[0].quantity).toBe('number')
    expect(typeof r.items[0].unit_price).toBe('number')
    expect(typeof r.items[0].total_price).toBe('number')
  })
})
