// Ciclo de fechamento e valor intermediário do convênio (Fase 1 · item 1.9).
//
// Os dois módulos sob teste decidem DATA DE COMPETÊNCIA e DINHEIRO, que são
// justamente onde erro passa despercebido: um dia a mais na janela leva um
// atendimento para o fechamento errado, e um centavo de arredondamento no lugar
// errado cobra do tutor o que era do convênio.

import {
  janelaDoCiclo,
  janelaAnterior,
  ultimasJanelas,
  somarDias,
  diaDaSemana,
  diasNoMes,
  ROTULO_CICLO,
} from '@/lib/insurance/ciclo'
import {
  calcularSplitDoConvenio,
  descreverRegraCopay,
  ROTULO_MODO_COPAY,
} from '@/lib/insurance/copay'

describe('aritmética de calendário sem fuso', () => {
  it('soma e subtrai dias atravessando mês e ano', () => {
    expect(somarDias('2026-10-17', 1)).toBe('2026-10-18')
    expect(somarDias('2026-10-31', 1)).toBe('2026-11-01')
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31')
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('acerta fevereiro em ano comum e bissexto', () => {
    expect(diasNoMes(2026, 2)).toBe(28)
    expect(diasNoMes(2028, 2)).toBe(29)
    expect(diasNoMes(2000, 2)).toBe(29)
    expect(diasNoMes(1900, 2)).toBe(28)
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('devolve o dia da semana correto (0 = domingo)', () => {
    expect(diaDaSemana('2026-10-17')).toBe(6) // sábado
    expect(diaDaSemana('2026-10-18')).toBe(0) // domingo
    expect(diaDaSemana('2026-10-12')).toBe(1) // segunda
    expect(diaDaSemana('2026-01-01')).toBe(4) // quinta
  })
})

describe('janela do ciclo', () => {
  it('diário fecha o próprio dia', () => {
    const j = janelaDoCiclo('daily', null, '2026-10-17')
    expect(j.inicio).toBe('2026-10-17')
    expect(j.fim).toBe('2026-10-17')
    expect(j.rotulo).toBe('17/10/2026')
  })

  it('semanal começando na segunda cobre segunda a domingo', () => {
    const j = janelaDoCiclo('weekly', 1, '2026-10-17') // sábado
    expect(j.inicio).toBe('2026-10-12') // segunda
    expect(j.fim).toBe('2026-10-18')    // domingo
    expect(j.rotulo).toBe('12/10 a 18/10')
  })

  it('semanal sem dia configurado começa no domingo', () => {
    const j = janelaDoCiclo('weekly', null, '2026-10-17')
    expect(diaDaSemana(j.inicio)).toBe(0)
    expect(somarDias(j.inicio, 6)).toBe(j.fim)
  })

  it('mensal civil cobre o mês inteiro e tem rótulo legível', () => {
    const j = janelaDoCiclo('monthly', 1, '2026-10-17')
    expect(j.inicio).toBe('2026-10-01')
    expect(j.fim).toBe('2026-10-31')
    expect(j.rotulo).toBe('Outubro/2026')
  })

  it('mensal com corte no dia 15 vira o mês: 15/10 a 14/11', () => {
    const j = janelaDoCiclo('monthly', 15, '2026-10-17')
    expect(j.inicio).toBe('2026-10-15')
    expect(j.fim).toBe('2026-11-14')
  })

  it('mensal com corte no 15, antes do corte, pega o ciclo que vem do mês anterior', () => {
    const j = janelaDoCiclo('monthly', 15, '2026-10-10')
    expect(j.inicio).toBe('2026-09-15')
    expect(j.fim).toBe('2026-10-14')
  })

  it('corte no dia 31 não escorrega em mês curto', () => {
    // Fevereiro de 2026 tem 28 dias: o ciclo começa no dia 28, não "31 de fevereiro".
    const j = janelaDoCiclo('monthly', 31, '2026-02-28')
    expect(j.inicio).toBe('2026-02-28')
    expect(j.fim).toBe('2026-03-30')
  })

  it('período livre devolve o dia e deixa a escolha para a tela', () => {
    const j = janelaDoCiclo('custom', null, '2026-10-17')
    expect(j.inicio).toBe('2026-10-17')
    expect(j.fim).toBe('2026-10-17')
  })

  it('todo ciclo tem rótulo para a tela', () => {
    for (const c of ['daily', 'weekly', 'monthly', 'custom'] as const) {
      expect(ROTULO_CICLO[c]).toBeTruthy()
    }
  })
})

describe('janela anterior — é o período que realmente se fecha', () => {
  it('mensal: estando em outubro, fecha setembro', () => {
    const j = janelaAnterior('monthly', 1, '2026-10-17')
    expect(j.inicio).toBe('2026-09-01')
    expect(j.fim).toBe('2026-09-30')
  })

  it('semanal: fecha a semana cheia anterior, sem buraco nem sobreposição', () => {
    const atual = janelaDoCiclo('weekly', 1, '2026-10-17')
    const anterior = janelaAnterior('weekly', 1, '2026-10-17')
    expect(somarDias(anterior.fim, 1)).toBe(atual.inicio)
    expect(anterior.inicio).toBe('2026-10-05')
  })

  it('diário: fecha ontem', () => {
    expect(janelaAnterior('daily', null, '2026-10-17').inicio).toBe('2026-10-16')
  })
})

describe('últimas janelas (seletor da tela)', () => {
  it('devolve a quantidade pedida, da mais nova para a mais antiga, sem buraco', () => {
    const js = ultimasJanelas('monthly', 1, '2026-10-17', 4)
    expect(js.map(j => j.rotulo)).toEqual(['Outubro/2026', 'Setembro/2026', 'Agosto/2026', 'Julho/2026'])
    for (let i = 1; i < js.length; i++) {
      expect(somarDias(js[i].fim, 1)).toBe(js[i - 1].inicio)
    }
  })

  it('atravessa a virada de ano', () => {
    const js = ultimasJanelas('monthly', 1, '2026-01-15', 2)
    expect(js[0].rotulo).toBe('Janeiro/2026')
    expect(js[1].rotulo).toBe('Dezembro/2025')
  })
})

describe('valor intermediário do convênio', () => {
  it('per_item devolve null — quem manda é o split do pet+item', () => {
    expect(calcularSplitDoConvenio({ modo: 'per_item', percent: null, fixed: null }, 100)).toBeNull()
  })

  it('none: tutor não paga nada e o convênio deve o total', () => {
    expect(calcularSplitDoConvenio({ modo: 'none', percent: null, fixed: null }, 85))
      .toEqual({ copay: 0, repass: 85 })
  })

  it('percentual divide e respeita a regra de ouro total = copay + repass', () => {
    const r = calcularSplitDoConvenio({ modo: 'percent', percent: 20, fixed: null }, 85)!
    expect(r.copay).toBe(17)
    expect(r.repass).toBe(68)
    expect(r.copay + r.repass).toBe(85)
  })

  it('percentual com centavo quebrado não perde dinheiro, e a sobra fica no repasse', () => {
    const r = calcularSplitDoConvenio({ modo: 'percent', percent: 33.33, fixed: null }, 42.07)!
    expect(r.copay + r.repass).toBeCloseTo(42.07, 2)
    expect(r.copay).toBe(14.02)
    expect(r.repass).toBe(28.05)
  })

  it('valor fixo é POR ITEM: duas unidades cobram dois valores', () => {
    const r = calcularSplitDoConvenio({ modo: 'fixed', percent: null, fixed: 10 }, 60, 2)!
    expect(r.copay).toBe(20)
    expect(r.repass).toBe(40)
  })

  it('valor fixo maior que o total não faz o convênio dever negativo', () => {
    const r = calcularSplitDoConvenio({ modo: 'fixed', percent: null, fixed: 50 }, 35)!
    expect(r.copay).toBe(35)
    expect(r.repass).toBe(0)
  })

  it('percentual fora da faixa é contido em 0 e 100', () => {
    expect(calcularSplitDoConvenio({ modo: 'percent', percent: 150, fixed: null }, 50)!)
      .toEqual({ copay: 50, repass: 0 })
    expect(calcularSplitDoConvenio({ modo: 'percent', percent: -10, fixed: null }, 50)!)
      .toEqual({ copay: 0, repass: 50 })
  })

  it('total zero não gera valor negativo em lugar nenhum', () => {
    const r = calcularSplitDoConvenio({ modo: 'percent', percent: 30, fixed: null }, 0)!
    expect(r).toEqual({ copay: 0, repass: 0 })
  })

  it('descreve a regra em uma linha, para quem confere ler sem abrir a configuração', () => {
    expect(descreverRegraCopay({ modo: 'percent', percent: 20, fixed: null })).toContain('20%')
    expect(descreverRegraCopay({ modo: 'fixed', percent: null, fixed: 10 })).toContain('10,00')
    expect(descreverRegraCopay({ modo: 'none', percent: null, fixed: null })).toContain('integral')
    expect(descreverRegraCopay({ modo: 'per_item', percent: null, fixed: null })).toContain('cada item')
    for (const m of ['per_item', 'percent', 'fixed', 'none'] as const) {
      expect(ROTULO_MODO_COPAY[m]).toBeTruthy()
    }
  })
})
