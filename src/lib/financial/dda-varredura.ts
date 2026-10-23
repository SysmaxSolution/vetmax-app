// Janelas da varredura automática do DDA.
//
// O banco recusa período maior que 60 dias por consulta. Uma varredura só para
// a frente deixaria um buraco: o boleto que venceu enquanto ninguém olhava sai
// da janela futura e some da tela — justo o que não pode escapar. Por isso são
// duas janelas, cada uma dentro do limite.
//
// Módulo puro: sem I/O, sem Date fora do ponto de entrada. Assim as janelas
// são testáveis e não mudam de resultado conforme o fuso do servidor.

/** Dia sequencial desde 1970-01-01, para somar e subtrair dias com segurança. */
function paraDiaSerial(isoData: string): number {
  const [a, m, d] = isoData.slice(0, 10).split('-').map(Number)
  return Math.floor(Date.UTC(a, m - 1, d) / 86400000)
}

function deDiaSerial(dia: number): string {
  return new Date(dia * 86400000).toISOString().slice(0, 10)
}

export interface JanelaDda {
  dataInicial: string
  dataFinal:   string
  /** Para a mensagem de diagnóstico; não vai para a tela do operador. */
  rotulo:      'vencidos' | 'a_vencer'
}

/** Quantos dias para trás a varredura olha. Boleto vencido não pago continua devido. */
export const DIAS_PARA_TRAS = 30
/** Teto do banco. Não aumentar sem confirmar: acima disso a consulta é recusada. */
export const DIAS_PARA_FRENTE = 60

/**
 * As duas janelas da varredura, a partir de uma data de referência (hoje).
 *
 * Nenhuma delas passa de 60 dias, porque o banco recusa o período maior — e a
 * recusa vem como erro genérico, que custaria caro para diagnosticar depois.
 */
export function janelasDaVarredura(hojeISO: string): JanelaDda[] {
  const hoje = paraDiaSerial(hojeISO)
  return [
    { rotulo: 'vencidos', dataInicial: deDiaSerial(hoje - DIAS_PARA_TRAS), dataFinal: deDiaSerial(hoje) },
    { rotulo: 'a_vencer', dataInicial: deDiaSerial(hoje + 1), dataFinal: deDiaSerial(hoje + DIAS_PARA_FRENTE) },
  ]
}

/**
 * O que a tela diz sobre o frescor da lista.
 *
 * Deliberadamente sem detalhe técnico: o operador precisa saber se pode
 * confiar na lista, não por que a integração falhou. O motivo fica guardado
 * para quem dá suporte.
 */
export interface FrescorDaLista {
  texto:   string
  tom:     'ok' | 'atencao' | 'alerta'
}

export function lerFrescor(
  ultimoSucesso: string | null | undefined,
  situacao: string | null | undefined,
  agoraISO: string,
): FrescorDaLista {
  if (!ultimoSucesso) {
    return { texto: 'Ainda não atualizamos esta conta.', tom: 'atencao' }
  }

  const horas = Math.floor(
    (new Date(agoraISO).getTime() - new Date(ultimoSucesso).getTime()) / 3600000,
  )

  const quando =
    horas < 1  ? 'há poucos minutos'
    : horas < 24 ? `há ${horas} hora${horas > 1 ? 's' : ''}`
    : `há ${Math.floor(horas / 24)} dia${Math.floor(horas / 24) > 1 ? 's' : ''}`

  // Falhou na última tentativa, mas houve sucesso antes: a lista existe, só
  // não está fresca. Dizer isso é mais útil do que um alarme genérico.
  if (situacao === 'erro') {
    return {
      texto: `Lista de ${quando}. A atualização automática não está funcionando — já avisamos o suporte.`,
      tom:   'alerta',
    }
  }

  if (horas >= 48) {
    return { texto: `Lista de ${quando}. Vale conferir no banco antes de pagar.`, tom: 'alerta' }
  }
  if (horas >= 24) {
    return { texto: `Lista atualizada ${quando}.`, tom: 'atencao' }
  }
  return { texto: `Lista atualizada ${quando}.`, tom: 'ok' }
}
