import { dividirEmJanelas } from '@/lib/financial/dda-varredura'

describe('dividirEmJanelas — o banco só aceita 60 dias por consulta', () => {
  it('período de 90 dias vira duas janelas, sem buraco nem sobreposição', () => {
    const j = dividirEmJanelas('2026-09-27', '2026-12-26')   // D-30 a D+60 de 27/10
    expect(j).toEqual([
      { dataInicial: '2026-09-27', dataFinal: '2026-11-25' },   // 60 dias contando as pontas
      { dataInicial: '2026-11-26', dataFinal: '2026-12-26' },
    ])
  })

  it('período de até 60 dias fica numa janela só', () => {
    expect(dividirEmJanelas('2026-10-01', '2026-11-29')).toHaveLength(1)   // exatamente 60 dias
    expect(dividirEmJanelas('2026-10-01', '2026-11-30')).toHaveLength(2)   // 61 dias
  })

  it('um dia só é uma janela de um dia', () => {
    expect(dividirEmJanelas('2026-10-27', '2026-10-27')).toEqual([{ dataInicial: '2026-10-27', dataFinal: '2026-10-27' }])
  })

  it('período invertido ou inválido não gera consulta', () => {
    expect(dividirEmJanelas('2026-10-27', '2026-10-01')).toEqual([])
    expect(dividirEmJanelas('', '2026-10-01')).toEqual([])
  })
})
