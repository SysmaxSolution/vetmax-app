/**
 * Unit — Parsing do ORU real do URIT BH-5100 e montagem do laudo de hemograma.
 *
 * A massa abaixo reproduz a FORMA EXATA dos segmentos capturados do aparelho da
 * Clínica Animais em 25/09/2026 (MSH-3 vazio, PID vazio, nº da amostra no
 * OBR-3, ED em `5190Vet^Image^PNG^Base64^...`). Os payloads base64 estão
 * truncados de propósito — o arquivo real tem ~46 KB e não entra no repositório.
 */
import { parseHL7ORU, parseEncapsulatedData, graphDataUri, sniffImageMime, stripEncapsulatedData } from '@/lib/lab/hl7-parser'
import { buildHemogramReport, splitAnalyteCode, graphTitle } from '@/lib/lab/hemogram-report'

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAASwAAACHCAYAAACs0WTs'

const URIT = [
  'MSH|^~\\&||5190Vet|LIS|PC|20260925190100||ORU^R01|4|P|2.3.1||||||UNICODE',
  'PV1|1||',
  'PID|1||||||0|',
  'OBR|1||226404|^5190Vet|||20260925174600||||||||1|||||2|',
  'OBX|1|NM|WBC||9.04|10^9/L|2.87-17.02||||F|||||administrator|',
  'OBX|2|NM|LYM%||10.64|%|12.00-45.00|L|||F|||||administrator|',
  'OBX|4|NM|NEU%||80.21|%|38.00-80.00|H|||F|||||administrator|',
  'OBX|9|NM|NEU#||7.253|10^9/L|2.320-12.580||||F|||||administrator|',
  'OBX|7|NM|LYM#||0.961|10^9/L|0.730-7.860||||F|||||administrator|',
  'OBX|14|NM|RBC||8.30|10^12/L|4.60-12.00||||F|||||administrator|',
  'OBX|15|NM|HGB||13.4|g/dL|9.0-15.3||||F|||||administrator|',
  'OBX|22|NM|PLT||93|10^9/L|200-800|L|||F|||||administrator|',
  'OBX|23|NM|MPV||17.5|fL|8.1-13.9|H|||F|||||administrator|',
  `OBX|32|ED|WBCHisto||5190Vet^Image^PNG^Base64^${PNG_B64}|||||F|||||administrator|`,
  `OBX|36|ED|S0_S90Scattergram||5190Vet^Image^PNG^Base64^${PNG_B64}|||||F|||||administrator|`,
].join('\r')

describe('parseHL7ORU — massa real do URIT BH-5100', () => {
  const res = parseHL7ORU(URIT)
  if ('error' in res) throw new Error(res.error)

  it('lê o nº da amostra do OBR-3 (e NÃO do PID, que vem vazio)', () => {
    expect(res.sample_id).toBe('226404')
  })

  it('identifica o aparelho mesmo com MSH-3 vazio', () => {
    expect(res.device).toBe('5190Vet')
  })

  it('converte o OBR-7 em data/hora ISO', () => {
    expect(res.observed_at).toBe('2026-09-25T17:46:00')
  })

  it('lê os 9 analitos NM com unidade, faixa e flag do aparelho', () => {
    expect(res.analytes).toHaveLength(9)
    const neu = res.analytes.find(a => a.code === 'NEU%')!
    expect(neu.value).toBe('80.21')
    expect(neu.unit).toBe('%')
    expect(neu.ref_text).toBe('38.00-80.00')
    expect(neu.ref_low).toBe(38)
    expect(neu.ref_high).toBe(80)
    expect(neu.flag).toBe('H')
  })

  it('preserva a unidade com acento circunflexo (10^9/L) sem quebrar no separador de componente', () => {
    expect(res.analytes.find(a => a.code === 'WBC')!.unit).toBe('10^9/L')
  })

  it('extrai as curvas ED como image/png prontas para <img>', () => {
    expect(res.graphs).toHaveLength(2)
    const wbc = res.graphs.find(g => g.code === 'WBCHisto')!
    expect(wbc.mime).toBe('image/png')
    expect(wbc.encoding).toBe('Base64')
    expect(wbc.source).toBe('5190Vet')
    expect(graphDataUri(wbc)).toBe(`data:image/png;base64,${PNG_B64}`)
  })
})

describe('parseEncapsulatedData', () => {
  it('forma canônica de 5 componentes', () => {
    const g = parseEncapsulatedData('5190Vet^Image^PNG^Base64^AAA', 'X', null)!
    expect(g).toMatchObject({ source: '5190Vet', mime: 'image/png', encoding: 'Base64', data: 'AAA' })
  })
  it('forma curta de 4 componentes (sem sourceApplication)', () => {
    const g = parseEncapsulatedData('Image^BMP^Base64^Qk1234', 'X', null)!
    expect(g).toMatchObject({ mime: 'image/bmp', encoding: 'Base64', data: 'Qk1234' })
  })
  it('devolve null quando não há payload', () => {
    expect(parseEncapsulatedData('5190Vet^Image^PNG^Base64^', 'X', null)).toBeNull()
  })
})

describe('graphDataUri / sniffImageMime', () => {
  it('descobre PNG e BMP pelo começo do base64', () => {
    expect(sniffImageMime('iVBORw0KGgoAAA')).toBe('image/png')
    expect(sniffImageMime('Qk1234')).toBe('image/bmp')
    expect(sniffImageMime('zzz')).toBeNull()
  })
  it('corrige o mime quando o cabeçalho ED mente (diz BMP, payload é PNG)', () => {
    const uri = graphDataUri({ mime: 'application/octet-stream', encoding: 'Base64', data: 'iVBORw0KGgoAAA' })
    expect(uri).toBe('data:image/png;base64,iVBORw0KGgoAAA')
  })
  it('recusa encoding não-base64 — nada de data: URI arbitrária no laudo', () => {
    expect(graphDataUri({ mime: 'image/png', encoding: 'Hex', data: 'ABCD' })).toBeNull()
  })
})

describe('stripEncapsulatedData', () => {
  const lean = stripEncapsulatedData(URIT)
  it('remove os payloads base64 mas mantém todos os segmentos', () => {
    expect(lean).not.toContain(PNG_B64)
    expect(lean.split('\r').filter(Boolean)).toHaveLength(URIT.split('\r').filter(Boolean).length)
    expect(lean).toContain('bytes base64 omitidos')
  })
  it('não toca nos OBX numéricos', () => {
    expect(lean).toContain('OBX|14|NM|RBC||8.30|10^12/L|4.60-12.00')
  })
  it('deixa a mensagem pequena o bastante para caber em raw_hl7', () => {
    expect(lean.length).toBeLessThan(URIT.length)
  })
})

describe('splitAnalyteCode', () => {
  it('separa base e tipo pelo sufixo % / #', () => {
    expect(splitAnalyteCode('NEU%')).toEqual({ base: 'NEU', kind: 'rel' })
    expect(splitAnalyteCode('NEU#')).toEqual({ base: 'NEU', kind: 'abs' })
    expect(splitAnalyteCode('RDW_CV')).toEqual({ base: 'RDW_CV', kind: 'single' })
  })
})

describe('buildHemogramReport', () => {
  const parsed = parseHL7ORU(URIT)
  if ('error' in parsed) throw new Error(parsed.error)
  const rep = buildHemogramReport(parsed.analytes, parsed.graphs)

  it('separa Eritrograma, Leucograma e Plaquetas', () => {
    expect(rep.erythrogram.map(r => r.code)).toEqual(['RBC', 'HGB'])
    expect(rep.leukogram.map(r => r.code)).toEqual(['WBC', 'NEU', 'LYM'])
    expect(rep.platelets.map(r => r.code)).toEqual(['PLT', 'MPV'])
  })

  it('funde o par %/# na MESMA linha, como no laudo da Animais', () => {
    const neu = rep.leukogram.find(r => r.code === 'NEU')!
    expect(neu.label).toBe('Neutrófilos')
    expect(neu.value).toBe('80.21')
    expect(neu.unit).toBe('%')
    expect(neu.flag).toBe('H')
    expect(neu.value_abs).toBe('7.253')
    expect(neu.unit_abs).toBe('10^9/L')
    expect(neu.ref_abs).toBe('2.320-12.580')   // coluna "Vlr Ref. Absoluto"
    expect(neu.ref_rel).toBe('38.00-80.00')    // coluna "Vlr Ref. Relativo"
  })

  it('mantém o valor e a faixa EXATOS do aparelho — sem conversão de unidade', () => {
    const plt = rep.platelets.find(r => r.code === 'PLT')!
    expect(plt.value).toBe('93')
    expect(plt.unit).toBe('10^9/L')
    expect(plt.ref_rel).toBe('200-800')
    expect(plt.flag).toBe('L')
  })

  it('traduz os códigos das curvas em títulos legíveis', () => {
    expect(rep.graphs.map(g => g.title)).toEqual([
      'Histograma de leucócitos (WBC)',
      'Scattergrama S0 × S90',
    ])
    expect(rep.graphs[0].src?.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('não perde analito fora do de-para — cai em "other"/unmapped', () => {
    const r = buildHemogramReport([
      { code: 'XPTO', name: 'Coisa nova', value: '1', unit: 'u', ref_text: null, ref_low: null, ref_high: null, flag: null },
    ], [])
    expect(r.other.map(x => x.label)).toEqual(['Coisa nova'])
    expect(r.unmapped).toHaveLength(1)
  })
})

describe('graphTitle', () => {
  it('cai no próprio código quando a curva é desconhecida', () => {
    expect(graphTitle('FooBar')).toBe('FooBar')
    expect(graphTitle('PLTHisto')).toBe('Histograma de plaquetas (PLT)')
  })
})
