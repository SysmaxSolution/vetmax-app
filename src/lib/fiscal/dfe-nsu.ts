// A disciplina de consulta da Distribuição DF-e.
//
// É aqui que mora a regra difícil, e ela é implacável: a SEFAZ controla a
// sequência de NSU POR CNPJ, não por aplicação. Consultar a partir de um NSU
// já entregue — mesmo que entregue ao software da contabilidade — é consumo
// indevido. E quem consulta antes de cumprir o bloqueio tem o relógio ZERADO:
// a punição recomeça do início.
//
// Por isso esta decisão não pode ficar espalhada em `if`s dentro do cron. É um
// módulo puro, com teste, que responde a uma pergunta só: posso consultar
// agora, e a partir de qual NSU?
//
// Módulo puro — sem I/O, sem Date implícito.

/** Códigos que a SEFAZ devolve e que mudam o que fazemos a seguir. */
export const CSTAT = {
  /** Nenhum documento novo. Obriga esperar 1 hora. */
  SEM_DOCUMENTO:   '137',
  /** Documentos localizados — pode continuar a partir do ultNSU devolvido. */
  COM_DOCUMENTO:   '138',
  /** Consumo indevido. Bloqueia o CNPJ por 1 hora. */
  CONSUMO_INDEVIDO: '656',
} as const

/** Uma hora, que é o prazo que a norma impõe nos dois casos de espera. */
export const ESPERA_MS = 60 * 60 * 1000

/**
 * Margem de segurança sobre a hora exigida.
 *
 * Não é preciosismo: encostar no limite e errar por um segundo custa outra
 * hora de bloqueio E zera o relógio. Cinco minutos de folga valem mais do que
 * cinco minutos de ganho.
 */
export const MARGEM_MS = 5 * 60 * 1000

export interface EstadoDfe {
  ult_nsu:       number
  max_nsu:       number
  bloqueado_ate: string | null
  enabled:       boolean
}

export type Decisao =
  | { consultar: true;  aPartirDe: number }
  | { consultar: false; motivo: 'desligado' | 'bloqueado' | 'em_dia'; liberaEm: string | null }

/**
 * Pode consultar agora? A partir de qual NSU?
 *
 * `em_dia` (ult_nsu === max_nsu) não é erro: é a situação normal depois de
 * sincronizar. Consultar assim mesmo devolveria 137 e, com ele, uma hora de
 * bloqueio — então a rotina simplesmente não consulta.
 */
export function decidirConsulta(estado: EstadoDfe, agoraISO: string): Decisao {
  if (!estado.enabled) return { consultar: false, motivo: 'desligado', liberaEm: null }

  if (estado.bloqueado_ate) {
    const libera = new Date(estado.bloqueado_ate).getTime()
    if (new Date(agoraISO).getTime() < libera) {
      return { consultar: false, motivo: 'bloqueado', liberaEm: estado.bloqueado_ate }
    }
  }

  // Já temos tudo que existe: nada a pedir, e pedir custaria bloqueio.
  if (estado.max_nsu > 0 && estado.ult_nsu >= estado.max_nsu) {
    return { consultar: false, motivo: 'em_dia', liberaEm: null }
  }

  return { consultar: true, aPartirDe: estado.ult_nsu }
}

export interface RespostaSefaz {
  cStat:   string
  ultNSU?: number
  maxNSU?: number
  /** Quantos documentos vieram no lote (máximo 50 por consulta). */
  documentos?: number
}

export interface ProximoEstado {
  ult_nsu:       number
  max_nsu:       number
  bloqueado_ate: string | null
  /** Soma 1 aos bloqueios quando caiu em consumo indevido. */
  contarBloqueio: boolean
  /** Se vale consultar de novo já, dentro da mesma execução. */
  continuar:     boolean
  /**
   * Prova de que OUTRO software consome este CNPJ.
   *
   * Quando a rejeição 656 vem com um `ultNSU` MAIOR do que o nosso, a Receita
   * está dizendo que já entregou até ali — e não foi a nós. Isso é evidência
   * direta, não estatística: basta uma ocorrência. Medido em 23/10/2026, com
   * a Receita informando ultNSU 977 para um CNPJ cujo ponteiro, do nosso
   * lado, estava em zero.
   */
  outroConsumidor: boolean
}

/**
 * O estado depois de uma resposta.
 *
 * Nunca retrocede o `ult_nsu`: a sequência é por CNPJ e andar para trás é o
 * que caracteriza uso indevido. Mesmo numa resposta estranha, o pior que
 * fazemos é não avançar.
 */
export function aplicarResposta(
  estado: EstadoDfe,
  resposta: RespostaSefaz,
  agoraISO: string,
): ProximoEstado {
  const agora = new Date(agoraISO).getTime()
  const esperar = () => new Date(agora + ESPERA_MS + MARGEM_MS).toISOString()

  // Só avança; nunca volta.
  const ult = Math.max(estado.ult_nsu, Number(resposta.ultNSU ?? 0) || 0)
  const max = Math.max(estado.max_nsu, Number(resposta.maxNSU ?? 0) || 0)

  if (resposta.cStat === CSTAT.CONSUMO_INDEVIDO) {
    // A rejeição carrega o ponto onde a sequência está. Adotá-lo é o que nos
    // põe em dia sem ficar tentando às cegas — e é a única forma de voltar a
    // receber quando outro software avançou o ponteiro.
    const informado = Number(resposta.ultNSU ?? 0) || 0
    return {
      ult_nsu: Math.max(ult, informado),
      max_nsu: max,
      bloqueado_ate: esperar(),
      contarBloqueio: true,
      continuar: false,
      outroConsumidor: informado > estado.ult_nsu,
    }
  }

  if (resposta.cStat === CSTAT.SEM_DOCUMENTO) {
    // Nada novo: a norma manda esperar uma hora antes de voltar.
    return { ult_nsu: ult, max_nsu: max, bloqueado_ate: esperar(), contarBloqueio: false, continuar: false, outroConsumidor: false }
  }

  if (resposta.cStat === CSTAT.COM_DOCUMENTO) {
    // Lote cheio e ainda há NSU adiante: segue na mesma execução, que é o
    // comportamento esperado — o bloqueio é para quem insiste SEM documento.
    const faltam = max > ult
    return { ult_nsu: ult, max_nsu: max, bloqueado_ate: null, contarBloqueio: false, continuar: faltam, outroConsumidor: false }
  }

  // Qualquer outro código: não avança e espera, por precaução. Melhor um ciclo
  // perdido do que um bloqueio de uma hora sobre o CNPJ.
  return { ult_nsu: estado.ult_nsu, max_nsu: max, bloqueado_ate: esperar(), contarBloqueio: false, continuar: false, outroConsumidor: false }
}

/**
 * Bloqueios recorrentes significam que há OUTRO software consumindo o mesmo
 * CNPJ — provavelmente o da contabilidade. Não é defeito nosso, e não se
 * resolve com código: alguém precisa combinar quem consulta.
 */
export function suspeitaDeOutroConsumidor(bloqueios: number): boolean {
  return bloqueios >= 3
}
