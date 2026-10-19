// Gate do pré-anestésico (Fase 4 · item 4.2).
//
// Módulo PURO. O checklist pré-operatório já existe desde a migration 0202
// (jejum confirmado, exames pré-op, termo de consentimento, risco ASA) — o que
// não existe é CONSEQUÊNCIA: hoje nada impede mandar o animal para a sala com o
// checklist vazio.
//
// Quais itens travam e quais só avisam é a pergunta 10 das 24 enviadas ao
// Vinícius, e está sem resposta — por isso aqui cada exigência é configurável,
// com padrão que não muda o comportamento de ninguém (nada trava até a clínica
// ligar). O que NÃO é configurável é a liberação forçada ficar registrada com
// autor e motivo: urgência acontece — cesárea de emergência não espera hemograma
// — mas fica escrito quem liberou e por quê.

export type ExigenciaPreAnestesica =
  | 'jejum'
  | 'exames_preop'
  | 'consentimento'
  | 'asa'

export const ROTULO_EXIGENCIA: Record<ExigenciaPreAnestesica, string> = {
  jejum:         'Jejum confirmado',
  exames_preop:  'Exames pré-operatórios conferidos',
  consentimento: 'Termo de consentimento assinado',
  asa:           'Risco ASA classificado',
}

/** Configuração da clínica: o que trava e o que apenas avisa. */
export interface ConfigGate {
  /** Exigências que IMPEDEM a ida para a sala. */
  trava: ExigenciaPreAnestesica[]
  /** Exigências que só aparecem como aviso. */
  avisa: ExigenciaPreAnestesica[]
}

/**
 * Padrão: nada trava, tudo avisa.
 *
 * Deliberado. Ligar a trava é ato de configuração da clínica — uma clínica em
 * operação não pode descobrir numa terça-feira que o sistema passou a barrar a
 * cirurgia que ela sempre conseguiu fazer.
 */
export const CONFIG_GATE_PADRAO: ConfigGate = {
  trava: [],
  avisa: ['jejum', 'exames_preop', 'consentimento', 'asa'],
}

/** O checklist como está gravado no JSONB de `surgeries.checklist`. */
export interface ChecklistAvaliavel {
  fasting_confirmed?: boolean | null
  preop_exams_ok?:    boolean | null
  consent_signed?:    boolean | null
}

export interface AvaliacaoGate {
  /** Pode seguir para a sala sem liberação forçada? */
  liberado:  boolean
  /** Exigências configuradas como trava e ainda não cumpridas. */
  bloqueios: ExigenciaPreAnestesica[]
  /** Exigências pendentes que não travam — aparecem como aviso. */
  avisos:    ExigenciaPreAnestesica[]
  /** Texto pronto para a tela; vazio quando não há nada pendente. */
  mensagem:  string
}

function cumprida(
  exigencia: ExigenciaPreAnestesica,
  checklist: ChecklistAvaliavel,
  asaRisk: string | null | undefined,
): boolean {
  switch (exigencia) {
    case 'jejum':         return checklist.fasting_confirmed === true
    case 'exames_preop':  return checklist.preop_exams_ok === true
    case 'consentimento': return checklist.consent_signed === true
    case 'asa':           return Boolean(asaRisk && String(asaRisk).trim().length > 0)
  }
}

/**
 * Avalia se a cirurgia pode ir para a sala.
 *
 * Só avalia a entrada em sala: voltar para preparo, ir para RPA ou encerrar não
 * passam pelo gate — barrar a saída da sala prenderia o animal anestesiado numa
 * regra de software.
 */
export function avaliarGate(params: {
  checklist: ChecklistAvaliavel | null | undefined
  asaRisk:   string | null | undefined
  config?:   ConfigGate
}): AvaliacaoGate {
  const checklist = params.checklist ?? {}
  const config = params.config ?? CONFIG_GATE_PADRAO

  const bloqueios = config.trava.filter(e => !cumprida(e, checklist, params.asaRisk))
  // Uma exigência configurada como trava não se repete na lista de avisos.
  const avisos = config.avisa
    .filter(e => !config.trava.includes(e))
    .filter(e => !cumprida(e, checklist, params.asaRisk))

  const nomes = (lista: ExigenciaPreAnestesica[]) =>
    lista.map(e => ROTULO_EXIGENCIA[e].toLowerCase()).join(', ')

  let mensagem = ''
  if (bloqueios.length > 0) {
    mensagem = bloqueios.length === 1
      ? `Falta: ${nomes(bloqueios)}. Para seguir sem isso, é preciso liberar com motivo.`
      : `Faltam: ${nomes(bloqueios)}. Para seguir sem isso, é preciso liberar com motivo.`
  } else if (avisos.length > 0) {
    mensagem = avisos.length === 1
      ? `Pendente: ${nomes(avisos)}.`
      : `Pendentes: ${nomes(avisos)}.`
  }

  return { liberado: bloqueios.length === 0, bloqueios, avisos, mensagem }
}

/**
 * Lê a configuração do gate a partir do `flow_config` da clínica.
 *
 * Aceita o JSONB cru para não espalhar conhecimento do formato pelas actions.
 * Chave desconhecida é ignorada em silêncio: configuração antiga ou escrita à
 * mão no banco não pode derrubar a tela da cirurgia.
 */
export function lerConfigGate(flow: Record<string, unknown> | null | undefined): ConfigGate {
  const validas: ExigenciaPreAnestesica[] = ['jejum', 'exames_preop', 'consentimento', 'asa']
  const bruto = flow?.['gate_pre_anestesico']
  if (!Array.isArray(bruto)) return CONFIG_GATE_PADRAO

  const trava = bruto.filter((v): v is ExigenciaPreAnestesica =>
    typeof v === 'string' && (validas as string[]).includes(v))

  return { trava, avisa: validas.filter(e => !trava.includes(e)) }
}
