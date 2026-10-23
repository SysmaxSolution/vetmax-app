import {
  decidirConsulta, aplicarResposta, suspeitaDeOutroConsumidor,
  CSTAT, ESPERA_MS, MARGEM_MS,
} from '@/lib/fiscal/dfe-nsu'

const AGORA = '2026-10-23T12:00:00.000Z'
const base = { ult_nsu: 10, max_nsu: 50, bloqueado_ate: null, enabled: true }

describe('decidirConsulta', () => {
  it('não consulta quando a empresa não ativou', () => {
    const d = decidirConsulta({ ...base, enabled: false }, AGORA)
    expect(d).toEqual({ consultar: false, motivo: 'desligado', liberaEm: null })
  })

  it('consulta a partir do último NSU conhecido', () => {
    expect(decidirConsulta(base, AGORA)).toEqual({ consultar: true, aPartirDe: 10 })
  })

  it('respeita o bloqueio em vigor', () => {
    const d = decidirConsulta({ ...base, bloqueado_ate: '2026-10-23T12:30:00.000Z' }, AGORA)
    expect(d).toEqual({ consultar: false, motivo: 'bloqueado', liberaEm: '2026-10-23T12:30:00.000Z' })
  })

  it('volta a consultar depois que o bloqueio vence', () => {
    const d = decidirConsulta({ ...base, bloqueado_ate: '2026-10-23T11:00:00.000Z' }, AGORA)
    expect(d).toEqual({ consultar: true, aPartirDe: 10 })
  })

  it('não consulta estando em dia — pedir sem ter o que receber custa 1h de bloqueio', () => {
    const d = decidirConsulta({ ...base, ult_nsu: 50, max_nsu: 50 }, AGORA)
    expect(d).toEqual({ consultar: false, motivo: 'em_dia', liberaEm: null })
  })

  it('primeira sincronização (nunca consultou) pode consultar do zero', () => {
    const d = decidirConsulta({ ult_nsu: 0, max_nsu: 0, bloqueado_ate: null, enabled: true }, AGORA)
    expect(d).toEqual({ consultar: true, aPartirDe: 0 })
  })
})

describe('aplicarResposta', () => {
  it('138 com mais documentos adiante: avança e continua na mesma execução', () => {
    const r = aplicarResposta(base, { cStat: CSTAT.COM_DOCUMENTO, ultNSU: 60, maxNSU: 120 }, AGORA)
    expect(r.ult_nsu).toBe(60)
    expect(r.max_nsu).toBe(120)
    expect(r.bloqueado_ate).toBeNull()
    expect(r.continuar).toBe(true)
  })

  it('138 chegando ao fim: avança e para', () => {
    const r = aplicarResposta(base, { cStat: CSTAT.COM_DOCUMENTO, ultNSU: 50, maxNSU: 50 }, AGORA)
    expect(r.continuar).toBe(false)
    expect(r.bloqueado_ate).toBeNull()
  })

  it('137 obriga esperar mais de uma hora', () => {
    const r = aplicarResposta(base, { cStat: CSTAT.SEM_DOCUMENTO, maxNSU: 50 }, AGORA)
    expect(r.continuar).toBe(false)
    const espera = new Date(r.bloqueado_ate!).getTime() - new Date(AGORA).getTime()
    expect(espera).toBeGreaterThanOrEqual(ESPERA_MS)
    expect(espera).toBe(ESPERA_MS + MARGEM_MS)
  })

  it('656 bloqueia, conta a ocorrência e não continua', () => {
    const r = aplicarResposta(base, { cStat: CSTAT.CONSUMO_INDEVIDO }, AGORA)
    expect(r.contarBloqueio).toBe(true)
    expect(r.continuar).toBe(false)
    expect(r.bloqueado_ate).not.toBeNull()
  })

  it('NUNCA retrocede o NSU, mesmo se a resposta vier menor', () => {
    const r = aplicarResposta(base, { cStat: CSTAT.COM_DOCUMENTO, ultNSU: 3, maxNSU: 40 }, AGORA)
    expect(r.ult_nsu).toBe(10)        // manteve o que já tinha
    expect(r.max_nsu).toBe(50)        // idem
  })

  it('código desconhecido não avança e espera, por precaução', () => {
    const r = aplicarResposta(base, { cStat: '999', ultNSU: 99 }, AGORA)
    expect(r.ult_nsu).toBe(10)
    expect(r.continuar).toBe(false)
    expect(r.bloqueado_ate).not.toBeNull()
  })

  it('resposta sem NSU nenhum não quebra nem zera o estado', () => {
    const r = aplicarResposta(base, { cStat: CSTAT.COM_DOCUMENTO }, AGORA)
    expect(r.ult_nsu).toBe(10)
    expect(r.max_nsu).toBe(50)
  })
})

describe('ciclo completo', () => {
  it('sincroniza em lotes e para sozinho ao chegar ao fim', () => {
    let estado = { ult_nsu: 0, max_nsu: 0, bloqueado_ate: null as string | null, enabled: true }
    const lotes = [
      { cStat: CSTAT.COM_DOCUMENTO, ultNSU: 50,  maxNSU: 130 },
      { cStat: CSTAT.COM_DOCUMENTO, ultNSU: 100, maxNSU: 130 },
      { cStat: CSTAT.COM_DOCUMENTO, ultNSU: 130, maxNSU: 130 },
    ]
    let voltas = 0
    for (const lote of lotes) {
      const d = decidirConsulta(estado, AGORA)
      expect(d.consultar).toBe(true)
      const r = aplicarResposta(estado, lote, AGORA)
      estado = { ...estado, ult_nsu: r.ult_nsu, max_nsu: r.max_nsu, bloqueado_ate: r.bloqueado_ate }
      voltas++
      if (!r.continuar) break
    }
    expect(voltas).toBe(3)
    expect(estado.ult_nsu).toBe(130)
    // Na execução seguinte, não consulta: está em dia.
    expect(decidirConsulta(estado, AGORA)).toMatchObject({ consultar: false, motivo: 'em_dia' })
  })

  it('depois de 656, a execução seguinte não consulta', () => {
    const r = aplicarResposta(base, { cStat: CSTAT.CONSUMO_INDEVIDO }, AGORA)
    const estado = { ...base, bloqueado_ate: r.bloqueado_ate }
    expect(decidirConsulta(estado, AGORA)).toMatchObject({ consultar: false, motivo: 'bloqueado' })
    // E meia hora depois ainda não — o prazo é de uma hora, não de meia.
    expect(decidirConsulta(estado, '2026-10-23T12:30:00.000Z'))
      .toMatchObject({ consultar: false, motivo: 'bloqueado' })
  })
})

describe('suspeitaDeOutroConsumidor', () => {
  it('bloqueio isolado não acusa ninguém', () => {
    expect(suspeitaDeOutroConsumidor(0)).toBe(false)
    expect(suspeitaDeOutroConsumidor(2)).toBe(false)
  })
  it('recorrência indica outro software no mesmo CNPJ', () => {
    expect(suspeitaDeOutroConsumidor(3)).toBe(true)
  })
})

describe('realinhamento pelo 656 (caso real de 23/10/2026)', () => {
  // A Receita respondeu 656 com ultNSU=977 para um CNPJ cujo ponteiro, do
  // nosso lado, estava em zero. Isso significa que ela já entregou até ali —
  // e não foi a nós. Adotar o 977 é o que nos põe de volta na sequência.
  const zerado = { ult_nsu: 0, max_nsu: 0, bloqueado_ate: null, enabled: true }

  it('adota o ultNSU que a rejeição informa', () => {
    const r = aplicarResposta(zerado, { cStat: CSTAT.CONSUMO_INDEVIDO, ultNSU: 977 }, AGORA)
    expect(r.ult_nsu).toBe(977)
  })

  it('reconhece a prova de que há outro consumidor', () => {
    const r = aplicarResposta(zerado, { cStat: CSTAT.CONSUMO_INDEVIDO, ultNSU: 977 }, AGORA)
    expect(r.outroConsumidor).toBe(true)
  })

  it('656 sem ultNSU adiante NÃO acusa outro consumidor', () => {
    // Aqui o 656 é só excesso de consultas nossas — não há evidência de
    // terceiro, e acusar a contabilidade sem prova seria pior que não avisar.
    const r = aplicarResposta({ ...zerado, ult_nsu: 500 }, { cStat: CSTAT.CONSUMO_INDEVIDO, ultNSU: 500 }, AGORA)
    expect(r.outroConsumidor).toBe(false)
  })

  it('depois de adotar, a consulta seguinte parte do ponto certo', () => {
    const r = aplicarResposta(zerado, { cStat: CSTAT.CONSUMO_INDEVIDO, ultNSU: 977 }, AGORA)
    const depois = { ...zerado, ult_nsu: r.ult_nsu, bloqueado_ate: r.bloqueado_ate }
    // Ainda bloqueado agora…
    expect(decidirConsulta(depois, AGORA)).toMatchObject({ consultar: false, motivo: 'bloqueado' })
    // …e, cumprida a espera, parte de 977 e não de zero.
    expect(decidirConsulta(depois, '2026-10-23T14:00:00.000Z')).toEqual({ consultar: true, aPartirDe: 977 })
  })

  it('o 656 nunca faz o ponteiro retroceder', () => {
    const adiantado = { ...zerado, ult_nsu: 1200 }
    const r = aplicarResposta(adiantado, { cStat: CSTAT.CONSUMO_INDEVIDO, ultNSU: 977 }, AGORA)
    expect(r.ult_nsu).toBe(1200)
  })
})
