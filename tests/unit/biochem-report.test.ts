import { buildBiochemReport, isBiochemAnalyte, biochemDef } from '@/lib/lab/biochem-report'
import type { HL7Analyte } from '@/lib/lab/hl7-parser'

const a = (p: Partial<HL7Analyte> & { code: string; value: string }): HL7Analyte => ({
  name: p.code, unit: null, ref_text: null, ref_low: null, ref_high: null, flag: null, ...p,
})

describe('buildBiochemReport', () => {
  it('monta um bloco por exame, na ordem do laudo da Animais', () => {
    const r = buildBiochemReport([
      a({ code: 'TRIG', value: '93' }),
      a({ code: 'CREAT', value: '0.74' }),
      a({ code: 'TGP', value: '46.5' }),
    ])
    expect(r.blocks.map(b => b.title)).toEqual([
      'ALT (T.G.P.)', 'CREATININA', 'TRIGLICERIDES',
    ])
  })

  it('agrupa as três bilirrubinas num bloco só, como no modelo deles', () => {
    const r = buildBiochemReport([
      a({ code: 'BILT', value: '0.7' }),
      a({ code: 'BILD', value: '0.2' }),
      a({ code: 'BILI', value: '0.5' }),
    ])
    expect(r.blocks).toHaveLength(1)
    expect(r.blocks[0].title).toBe('BILIRRUBINAS TOTAL E FRAÇÕES (D + I)')
    expect(r.blocks[0].rows.map(x => x.label)).toEqual([
      'Bilirrubina total', 'Bilirrubina direta', 'Bilirrubina indireta',
    ])
  })

  it('a faixa do APARELHO ganha da faixa do catálogo da clínica', () => {
    const [bloco] = buildBiochemReport([
      a({ code: 'CREAT', value: '0.74', ref_text: '0.5-1.5 mg/dL' }),
    ]).blocks
    expect(bloco.rows[0].ref).toBe('0.5-1.5 mg/dL')
    expect(bloco.rows[0].ref_source).toBe('device')
  })

  it('sem faixa do aparelho, usa a da clínica e diz que foi ela', () => {
    const [bloco] = buildBiochemReport([a({ code: 'CREAT', value: '0.74' })]).blocks
    expect(bloco.rows[0].ref).toBe('0,7 a 1,8 mg/dL')
    expect(bloco.rows[0].ref_source).toBe('clinic')
  })

  it('sem faixa em lugar nenhum, não inventa — devolve null', () => {
    const [bloco] = buildBiochemReport([a({ code: 'UREIA', value: '41.6' })]).blocks
    expect(bloco.rows[0].ref).toBeNull()
    expect(bloco.rows[0].ref_source).toBeNull()
  })

  it('monta a faixa a partir do par low/high quando o OBX-7 vem estruturado', () => {
    const [bloco] = buildBiochemReport([
      a({ code: 'UREIA', value: '41.6', unit: 'mg/dL', ref_low: 21.4, ref_high: 59.9 }),
    ]).blocks
    expect(bloco.rows[0].ref).toBe('21.4 a 59.9 mg/dL')
    expect(bloco.rows[0].ref_source).toBe('device')
  })

  it('ignora o que não é bioquímica — hemograma não entra aqui', () => {
    const r = buildBiochemReport([a({ code: 'WBC', value: '6.06' }), a({ code: 'RBC', value: '9.4' })])
    expect(r.blocks).toEqual([])
  })
})

describe('reconhecimento de analito', () => {
  it('aceita os códigos que o Sérium 200 realmente escreve na tela', () => {
    for (const c of ['CREAT', 'UREIA', 'ALBU', 'TGP-EB']) {
      expect(isBiochemAnalyte(c)).toBe(true)
    }
  })

  it('não confunde analito de hemograma com bioquímica', () => {
    for (const c of ['WBC', 'RBC', 'PLT', 'HGB', 'MCV']) {
      expect(isBiochemAnalyte(c)).toBe(false)
    }
  })

  it('cai no nome quando o código não bate', () => {
    expect(biochemDef(null, 'GGT')?.title).toBe('GAMA-GLUTAMIL TRANSFERASE (GGT)')
  })

  it('normaliza maiúsculas, espaços e sujeira do código', () => {
    expect(biochemDef(' tgp-eb ')?.title).toBe('ALT (T.G.P.)')
  })
})
