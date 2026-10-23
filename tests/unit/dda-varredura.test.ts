import {
  janelasDaVarredura, lerFrescor, DIAS_PARA_TRAS, DIAS_PARA_FRENTE,
} from '@/lib/financial/dda-varredura'

describe('janelasDaVarredura', () => {
  it('devolve duas janelas: vencidos e a vencer', () => {
    const j = janelasDaVarredura('2026-10-23')
    expect(j.map(x => x.rotulo)).toEqual(['vencidos', 'a_vencer'])
  })

  it('nenhuma janela passa do teto que o banco aceita', () => {
    for (const j of janelasDaVarredura('2026-10-23')) {
      const dias =
        (Date.parse(j.dataFinal) - Date.parse(j.dataInicial)) / 86400000
      expect(dias).toBeLessThanOrEqual(60)
    }
  })

  it('as janelas não deixam buraco nem se sobrepõem', () => {
    const [vencidos, aVencer] = janelasDaVarredura('2026-10-23')
    expect(vencidos.dataFinal).toBe('2026-10-23')
    expect(aVencer.dataInicial).toBe('2026-10-24')
  })

  it('cobre o passado e o futuro pedidos', () => {
    const [vencidos, aVencer] = janelasDaVarredura('2026-10-23')
    expect(vencidos.dataInicial).toBe('2026-09-23')   // 30 dias atrás
    expect(aVencer.dataFinal).toBe('2026-12-22')      // 60 dias à frente
    expect(DIAS_PARA_TRAS).toBe(30)
    expect(DIAS_PARA_FRENTE).toBe(60)
  })

  it('atravessa a virada de ano sem errar', () => {
    const [vencidos, aVencer] = janelasDaVarredura('2027-01-05')
    expect(vencidos.dataInicial).toBe('2026-12-06')
    expect(aVencer.dataFinal).toBe('2027-03-06')
  })

  it('atravessa fevereiro de ano bissexto', () => {
    const [, aVencer] = janelasDaVarredura('2028-01-15')
    expect(aVencer.dataFinal).toBe('2028-03-15')      // 2028 tem 29/02
  })
})

describe('lerFrescor', () => {
  const agora = '2026-10-23T12:00:00.000Z'

  it('diz quando a conta nunca foi atualizada', () => {
    const f = lerFrescor(null, 'ok', agora)
    expect(f.tom).toBe('atencao')
    expect(f.texto).toMatch(/ainda não atualizamos/i)
  })

  it('lista recente é tranquila', () => {
    const f = lerFrescor('2026-10-23T11:30:00.000Z', 'ok', agora)
    expect(f.tom).toBe('ok')
    expect(f.texto).toMatch(/poucos minutos/)
  })

  it('passou de 48h vira alerta com orientação de conferir', () => {
    const f = lerFrescor('2026-10-20T12:00:00.000Z', 'ok', agora)
    expect(f.tom).toBe('alerta')
    expect(f.texto).toMatch(/conferir no banco/)
  })

  it('falha na última tentativa mantém a idade da lista e avisa', () => {
    const f = lerFrescor('2026-10-22T12:00:00.000Z', 'erro', agora)
    expect(f.tom).toBe('alerta')
    expect(f.texto).toMatch(/há 1 dia/)
    expect(f.texto).toMatch(/avisamos o suporte/)
  })

  it('nunca vaza detalhe técnico para a tela', () => {
    // Qualquer combinação: a frase é sobre a lista, não sobre a integração.
    for (const situacao of ['ok', 'erro', null, undefined]) {
      for (const quando of [null, '2026-10-23T11:00:00.000Z', '2026-09-01T00:00:00.000Z']) {
        const { texto } = lerFrescor(quando, situacao, agora)
        expect(texto).not.toMatch(/certificad|mTLS|HTTP|TLS|token|client_id|500|403|pfx/i)
      }
    }
  })
})
