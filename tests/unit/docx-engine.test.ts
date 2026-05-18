/**
 * Testes do docx-engine.
 *
 * Estrategia: gerar um buffer DOCX minimo em memoria, contendo tags
 * literais (sem delimitadores) e fragmentadas em multiplos runs,
 * e validar que o engine produz DOCX preenchido corretamente.
 */

import PizZip from 'pizzip'
import { renderDocxTemplate } from '@/lib/docx/engine'
import { preprocessDocxBuffer, wrapKnownTags } from '@/lib/docx/preprocess'
import { scanDocxTags } from '@/lib/docx/scan-tags'

/**
 * Cria um DOCX minimo com um document.xml customizado.
 * Apenas o esqueleto necessario para PizZip/docxtemplater funcionarem.
 */
function makeDocx(documentXmlBody: string): Buffer {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${documentXmlBody}
  </w:body>
</w:document>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

  const zip = new PizZip()
  zip.file('[Content_Types].xml', contentTypes)
  zip.file('_rels/.rels', rels)
  zip.file('word/document.xml', documentXml)
  return zip.generate({ type: 'nodebuffer' }) as Buffer
}

function extractText(buffer: Buffer): string {
  const zip = new PizZip(buffer)
  const xml = zip.file('word/document.xml')!.asText()
  return [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((m) => m[1])
    .join('')
}

describe('wrapKnownTags', () => {
  it('envolve tag conhecida com delimitadores', () => {
    const { wrapped, found } = wrapKnownTags('Tutor: Custom_tutor — Pet: Custom_patient')
    expect(found).toBe(true)
    expect(wrapped).toBe('Tutor: {Custom_tutor} — Pet: {Custom_patient}')
  })

  it('deduplica duplicatas consecutivas', () => {
    const { wrapped } = wrapKnownTags('Custom_patientCustom_patient')
    expect(wrapped).toBe('{Custom_patient}')
  })

  it('nao envolve texto desconhecido', () => {
    const { wrapped, found } = wrapKnownTags('texto comum sem tag')
    expect(found).toBe(false)
    expect(wrapped).toBe('texto comum sem tag')
  })

  it('prefere tag mais longa em colisao de prefixo', () => {
    // Medicamento1_posologia e prefixo de... nada na lista, mas testa robustez
    const { wrapped } = wrapKnownTags('Medicamento1_posologia: 1cp/12h')
    expect(wrapped).toContain('{Medicamento1_posologia}')
  })
})

describe('preprocessDocxBuffer', () => {
  it('injeta delimitadores em paragrafo simples', () => {
    const buf = makeDocx(
      `<w:p><w:r><w:t>Pet: Custom_patient</w:t></w:r></w:p>`,
    )
    const out = preprocessDocxBuffer(buf)
    const text = extractText(out)
    expect(text).toBe('Pet: {Custom_patient}')
  })

  it('achata runs fragmentados', () => {
    const buf = makeDocx(
      `<w:p>
        <w:r><w:t xml:space="preserve">CRMV: </w:t></w:r>
        <w:r><w:t>Code_</w:t></w:r>
        <w:r><w:t>crmv</w:t></w:r>
      </w:p>`,
    )
    const out = preprocessDocxBuffer(buf)
    const text = extractText(out)
    expect(text).toBe('CRMV: {Code_crmv}')
  })

  it('preserva paragrafos sem tag', () => {
    const buf = makeDocx(
      `<w:p><w:r><w:t>Texto comum</w:t></w:r></w:p>`,
    )
    const out = preprocessDocxBuffer(buf)
    const text = extractText(out)
    expect(text).toBe('Texto comum')
  })
})

describe('renderDocxTemplate', () => {
  it('preenche tag canônica simples', () => {
    const buf = makeDocx(
      `<w:p><w:r><w:t>Pet: Custom_patient</w:t></w:r></w:p>`,
    )
    const { buffer } = renderDocxTemplate(buf, { patient_name: 'Toby' })
    expect(extractText(buffer)).toBe('Pet: Toby')
  })

  it('preenche multiplas tags em runs fragmentados', () => {
    const buf = makeDocx(
      `<w:p>
        <w:r><w:t xml:space="preserve">Tutor </w:t></w:r>
        <w:r><w:t>Custom_</w:t></w:r>
        <w:r><w:t>tutor</w:t></w:r>
        <w:r><w:t xml:space="preserve"> | Pet </w:t></w:r>
        <w:r><w:t>Custom_patient</w:t></w:r>
      </w:p>`,
    )
    const { buffer } = renderDocxTemplate(buf, {
      tutor_name: 'João',
      patient_name: 'Toby',
    })
    expect(extractText(buffer)).toBe('Tutor João | Pet Toby')
  })

  it('substitui tag duplicada (AlmaVet pattern)', () => {
    const buf = makeDocx(
      `<w:p><w:r><w:t>Custom_patientCustom_patient</w:t></w:r></w:p>`,
    )
    const { buffer } = renderDocxTemplate(buf, { patient_name: 'Toby' })
    // dedup deixa apenas 1 ocorrencia
    expect(extractText(buffer)).toBe('Toby')
  })

  it('valor undefined vira string vazia (default)', () => {
    const buf = makeDocx(
      `<w:p><w:r><w:t>X Custom_patient Y</w:t></w:r></w:p>`,
    )
    const { buffer, tagsMissing } = renderDocxTemplate(buf, {})
    expect(extractText(buffer)).toBe('X  Y')
    expect(tagsMissing).toContain('Custom_patient')
  })

  it('acentos PT-BR sao preservados', () => {
    const buf = makeDocx(
      `<w:p><w:r><w:t>Indicação: Custom_indicações_medicamento1</w:t></w:r></w:p>`,
    )
    const { buffer } = renderDocxTemplate(buf, {
      medicamento_1_indicacoes: 'Administrar após refeição.',
    })
    expect(extractText(buffer)).toBe('Indicação: Administrar após refeição.')
  })

  it('aceita override por literal direto no data', () => {
    const buf = makeDocx(
      `<w:p><w:r><w:t>Custom_patient</w:t></w:r></w:p>`,
    )
    const { buffer } = renderDocxTemplate(buf, { Custom_patient: 'Rex' })
    expect(extractText(buffer)).toBe('Rex')
  })
})

describe('scanDocxTags', () => {
  it('lista tags conhecidas no documento', () => {
    const buf = makeDocx(`
      <w:p><w:r><w:t>Tutor: Custom_tutor</w:t></w:r></w:p>
      <w:p><w:r><w:t>Pet: Custom_patient</w:t></w:r></w:p>
    `)
    const result = scanDocxTags(buf)
    const literals = result.tags.map((t) => t.literal)
    expect(literals).toContain('Custom_tutor')
    expect(literals).toContain('Custom_patient')
  })

  it('detecta tag fragmentada concatenando runs no mesmo paragrafo', () => {
    const buf = makeDocx(`
      <w:p>
        <w:r><w:t>Custom_</w:t></w:r>
        <w:r><w:t>patient</w:t></w:r>
      </w:p>
    `)
    const result = scanDocxTags(buf)
    const literals = result.tags.map((t) => t.literal)
    expect(literals).toContain('Custom_patient')
  })

  it('reporta literais desconhecidos parecidos com placeholder', () => {
    const buf = makeDocx(`
      <w:p><w:r><w:t>Custom_inventado_xyz</w:t></w:r></w:p>
    `)
    const result = scanDocxTags(buf)
    expect(result.unknownLiterals).toContain('Custom_inventado_xyz')
  })
})
