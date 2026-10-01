import { examKeyOf, summarizeExams } from '@/lib/lab/exam-key'

const r = (code: string, status = 'draft', released_at: string | null = null) =>
  ({ analyte_code: code, analyte_name: code, status, released_at })

describe('a que exame cada analito pertence', () => {
  it('tudo que o hematológico mede é UM exame só', () => {
    for (const c of ['RBC', 'HGB', 'WBC', 'NEU%', 'NEU#', 'PLT', 'MCV']) {
      expect(examKeyOf(c).key).toBe('hemograma')
    }
  })

  it('cada analito de bioquímica é um exame próprio — como na tabela de preços deles', () => {
    // 33 Creatinina, 47 Ureia, 46 Alt (T.G.P.) … são itens vendidos à parte.
    expect(examKeyOf('CREAT').key).toBe('bio:CREA')
    expect(examKeyOf('UREIA-EB').key).toBe('bio:UREIA')
    expect(examKeyOf('TGP-EB').key).toBe('bio:ALT')
    expect(examKeyOf('ALBUMINA').key).toBe('bio:ALB')
    expect(new Set(['CREAT', 'UREIA-EB', 'TGP-EB', 'ALBUMINA'].map(c => examKeyOf(c).key)).size).toBe(4)
  })

  it('as três bilirrubinas são UM exame (é como o laudo deles imprime)', () => {
    expect(examKeyOf('BILT').key).toBe('bio:BIL')
    expect(examKeyOf('BILD').key).toBe('bio:BIL')
    expect(examKeyOf('BILI').key).toBe('bio:BIL')
  })

  it('analito desconhecido não se mistura ao exame de ninguém', () => {
    expect(examKeyOf('XPTO').key).toBe('outros')
  })
})

describe('estado de cada exame na OS', () => {
  it('separa hemograma e bioquímica em exames distintos', () => {
    const exames = summarizeExams([r('RBC'), r('HGB'), r('CREAT'), r('UREIA-EB')])
    expect(exames.map(e => e.title)).toEqual(['HEMOGRAMA', 'CREATININA', 'UREIA'])
    expect(exames.find(e => e.key === 'hemograma')!.total).toBe(2)
  })

  it('liberar o hemograma NÃO libera a bioquímica', () => {
    const exames = summarizeExams([
      r('RBC', 'released', '2026-10-01T12:00:00Z'),
      r('HGB', 'released', '2026-10-01T12:00:00Z'),
      r('CREAT'),
    ])
    expect(exames.find(e => e.key === 'hemograma')!.status).toBe('released')
    expect(exames.find(e => e.key === 'bio:CREA')!.status).toBe('draft')
  })

  it('exame com um analito em rascunho ainda NÃO está liberado — meio assinado não existe', () => {
    const [hemo] = summarizeExams([r('RBC', 'released', '2026-10-01T12:00:00Z'), r('HGB')])
    expect(hemo.status).toBe('draft')
    expect(hemo.released_at).toBeNull()
    expect(hemo.released).toBe(1)
    expect(hemo.draft).toBe(1)
  })

  it('guarda a liberação mais recente do exame', () => {
    const [hemo] = summarizeExams([
      r('RBC', 'released', '2026-10-01T12:00:00Z'),
      r('HGB', 'released', '2026-10-01T13:30:00Z'),
    ])
    expect(hemo.released_at).toBe('2026-10-01T13:30:00Z')
  })

  it('hemograma vem primeiro, depois a bioquímica em ordem alfabética', () => {
    const exames = summarizeExams([r('TRIG'), r('CREAT'), r('RBC'), r('ALBUMINA')])
    expect(exames.map(e => e.title)).toEqual(['HEMOGRAMA', 'ALBUMINA', 'CREATININA', 'TRIGLICERIDES'])
  })

  it('OS sem resultado nenhum devolve lista vazia', () => {
    expect(summarizeExams([])).toEqual([])
  })
})

describe('OS real da Mel no ambiente de testes (URIT + Sérium na mesma consulta)', () => {
  // Exatamente os códigos que os dois aparelhos gravaram nessa consulta.
  const CODIGOS = [
    'ALBUMINA', 'ALY#', 'ALY%', 'BASO#', 'BASO%', 'CREAT', 'EOS#', 'EOS%',
    'HCT', 'HGB', 'LIC#', 'LIC%', 'LYM#', 'LYM%', 'MCH', 'MCHC', 'MCV',
    'MON#', 'MON%', 'MPV', 'NEU#', 'NEU%', 'NRBC#', 'NRBC%', 'PLT', 'RBC',
    'RDW_CV', 'TGP-EB', 'UREIA-EB', 'WBC',
  ]

  it('vira 5 laudos distintos, não um documento misturado', () => {
    const exames = summarizeExams(CODIGOS.map(c => r(c)))
    expect(exames.map(e => e.title)).toEqual([
      'HEMOGRAMA', 'ALBUMINA', 'ALT (T.G.P.)', 'CREATININA', 'UREIA',
    ])
  })

  it('o hemograma leva os 26 parâmetros do aparelho; cada bioquímico leva o seu', () => {
    const exames = summarizeExams(CODIGOS.map(c => r(c)))
    expect(exames.find(e => e.key === 'hemograma')!.total).toBe(26)
    for (const k of ['bio:ALB', 'bio:ALT', 'bio:CREA', 'bio:UREIA']) {
      expect(exames.find(e => e.key === k)!.total).toBe(1)
    }
  })

  it('liberar só o hemograma deixa os quatro bioquímicos em rascunho', () => {
    const exames = summarizeExams(CODIGOS.map(c => {
      const bio = ['ALBUMINA', 'CREAT', 'TGP-EB', 'UREIA-EB'].includes(c)
      return r(c, bio ? 'draft' : 'released', bio ? null : '2026-10-01T15:00:00Z')
    }))
    expect(exames.find(e => e.key === 'hemograma')!.status).toBe('released')
    expect(exames.filter(e => e.group === 'bioquimico').every(e => e.status === 'draft')).toBe(true)
  })
})
