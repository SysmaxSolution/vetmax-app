// Tradução dos erros da EvoluServices — módulo PURO.
//
// POR QUE ISTO EXISTE
// -------------------
// Na Transação Remota, **todos** os 13 erros de criação chegam como `HTTP 500`,
// inclusive os que são claramente validação de campo. Não dá para distinguir
// "erro meu" de "erro deles" pelo código HTTP: é obrigatório ler o campo
// `error` do corpo.
//
// Sem esta tradução, a recepcionista vê "erro 500" quando o problema real é que
// o veterinário terceirizado ainda não aceitou o vínculo de split no portal.
// Quem está no balcão com o tutor esperando precisa ler em português o que
// fazer — e a mensagem precisa dizer QUEM resolve.

export type GravidadeErro = 'operacional' | 'configuracao' | 'temporario'

export interface ErroTraduzido {
  /** Mensagem para quem está no balcão. */
  mensagem: string
  /** Quem resolve: a recepção ali mesmo, ou a gestão/suporte depois. */
  gravidade: GravidadeErro
  /** `true` quando repetir a chamada tem chance de funcionar. */
  pode_repetir: boolean
  /** Código cru deles, para o log. */
  codigo: string
}

const DICIONARIO: Record<string, Omit<ErroTraduzido, 'codigo'>> = {
  // ─── token (chegam como HTTP 401, exceto os dois da autenticação) ─────────
  INVALID_TOKEN: {
    mensagem: 'A sessão com a operadora de cartão expirou. Tentando de novo…',
    gravidade: 'temporario', pode_repetir: true,
  },
  EXPIRED_TOKEN: {
    mensagem: 'A sessão com a operadora de cartão expirou. Tentando de novo…',
    gravidade: 'temporario', pode_repetir: true,
  },
  REVOKED_TOKEN: {
    mensagem: 'O acesso desta clínica à operadora de cartão foi revogado. Fale com a gestão.',
    gravidade: 'configuracao', pode_repetir: false,
  },
  USER_TOKEN_NOT_FOUND: {
    mensagem: 'O usuário de integração com a operadora não existe neste ambiente. Confira a configuração da empresa.',
    gravidade: 'configuracao', pode_repetir: false,
  },
  PASSWORD_INVALID: {
    mensagem: 'A chave de integração com a operadora está incorreta. Confira a configuração da empresa.',
    gravidade: 'configuracao', pode_repetir: false,
  },

  // ─── estabelecimento e terminal ──────────────────────────────────────────
  MERCHANT_NOT_FOUND: {
    mensagem: 'Estabelecimento não encontrado na operadora. Confira o código da empresa na configuração.',
    gravidade: 'configuracao', pode_repetir: false,
  },
  MERCHANT_ID_INVALID: {
    mensagem: 'O código do estabelecimento está incorreto. Confira a configuração da empresa.',
    gravidade: 'configuracao', pode_repetir: false,
  },
  MERCHANT_CODE_INVALID: {
    mensagem: 'O código do estabelecimento está incorreto. Confira a configuração da empresa.',
    gravidade: 'configuracao', pode_repetir: false,
  },
  TERMINAL_ID_INVALID: {
    mensagem: 'A maquininha selecionada não existe mais. Escolha outra na lista.',
    gravidade: 'operacional', pode_repetir: false,
  },
  MERCHANT_TERMINAL_INVALID: {
    mensagem: 'Esta maquininha não está habilitada para receber cobrança pelo sistema. Verifique se ela está ligada e conectada.',
    gravidade: 'operacional', pode_repetir: true,
  },

  // ─── split: o caso mais importante de traduzir ───────────────────────────
  SUPPLIER_NOT_FOUND: {
    mensagem: 'O código de repasse deste profissional não existe na operadora. Confira o cadastro dele.',
    gravidade: 'configuracao', pode_repetir: false,
  },
  SUPPLIER_INVALID: {
    mensagem: 'O profissional ainda não aceitou o vínculo de repasse na operadora — os dois lados precisam confirmar. Cobre sem o repasse e acerte depois, ou peça a ele para aceitar o convite.',
    gravidade: 'configuracao', pode_repetir: false,
  },
  SPLIT_SUM_GREATER_THAN_TRANSACTION_VALUE: {
    mensagem: 'A soma dos repasses passa do valor da venda. Revise as comissões antes de cobrar.',
    gravidade: 'configuracao', pode_repetir: false,
  },

  // ─── valor, parcelas e bandeira ──────────────────────────────────────────
  VALUE_FIELD_INVALID: {
    mensagem: 'O valor enviado está em formato inválido.',
    gravidade: 'configuracao', pode_repetir: false,
  },
  INSTALLMENTS_INVALID_FOR_DEBIT: {
    mensagem: 'Débito não pode ser parcelado. Use crédito ou cobre em uma parcela.',
    gravidade: 'operacional', pode_repetir: false,
  },
  INVALID_PAYMENT_BRAND: {
    mensagem: 'Esta bandeira não está habilitada para a empresa. Escolha outra forma de pagamento.',
    gravidade: 'operacional', pode_repetir: false,
  },
  PAYMENT_BRAND_ID_INVALID: {
    mensagem: 'Bandeira de cartão não reconhecida pela operadora.',
    gravidade: 'configuracao', pode_repetir: false,
  },
  INVALID_INSTALLMENTS_QUANTITY_OR_VALUE: {
    mensagem: 'O número de parcelas ou o valor mínimo da parcela não é aceito para esta empresa.',
    gravidade: 'operacional', pode_repetir: false,
  },

  // ─── dados do cliente ────────────────────────────────────────────────────
  NAME_CLIENT_INVALID: {
    mensagem: 'O nome do responsável tem caracteres que a operadora não aceita.',
    gravidade: 'operacional', pode_repetir: false,
  },
  DOCUMENT_INVALID: {
    mensagem: 'O CPF/CNPJ do responsável está em formato inválido — envie só os números.',
    gravidade: 'operacional', pode_repetir: false,
  },
  CLIENT_PHONE_INVALID: {
    mensagem: 'O telefone do responsável está em formato inválido.',
    gravidade: 'operacional', pode_repetir: false,
  },

  // ─── cancelamento de transação remota ────────────────────────────────────
  INEXISTENT_REMOTE_TRANSACTION: {
    mensagem: 'Esta cobrança não existe mais na operadora.',
    gravidade: 'operacional', pode_repetir: false,
  },
  REMOTE_TRANSACTION_ALREADY_PROCESSED: {
    mensagem: 'A maquininha já começou a processar — não é possível cancelar pelo sistema. O cancelamento tem de ser feito no portal da operadora.',
    gravidade: 'operacional', pode_repetir: false,
  },
  ID_INVALID: {
    mensagem: 'Identificador de cobrança inválido.',
    gravidade: 'configuracao', pode_repetir: false,
  },

  // ─── link de pagamento ───────────────────────────────────────────────────
  INVALID_PARAMETER: {
    mensagem: 'A operadora recusou um dos campos enviados.',
    gravidade: 'configuracao', pode_repetir: false,
  },
}

/**
 * Traduz o erro deles.
 *
 * Código desconhecido NÃO é tratado como falha nossa: eles acrescentam valores
 * sem avisar (a própria doc diz que há códigos internos "extremamente
 * voláteis"). Nesse caso devolvemos o código cru na mensagem, para o suporte
 * ter por onde começar, em vez de esconder atrás de "erro inesperado".
 */
export function traduzirErro(codigo: string | null | undefined, http?: number): ErroTraduzido {
  const cru = String(codigo ?? '').trim().toUpperCase()

  const conhecido = DICIONARIO[cru]
  if (conhecido) return { ...conhecido, codigo: cru }

  // 401 sem código reconhecido ainda é problema de token: vale repetir uma vez.
  if (http === 401) {
    return {
      mensagem: 'A sessão com a operadora de cartão expirou. Tentando de novo…',
      gravidade: 'temporario', pode_repetir: true, codigo: cru || 'HTTP_401',
    }
  }

  if (!cru) {
    return {
      mensagem: `A operadora de cartão não respondeu como esperado${http ? ` (HTTP ${http})` : ''}.`,
      gravidade: 'temporario', pode_repetir: true, codigo: http ? `HTTP_${http}` : 'SEM_CODIGO',
    }
  }

  return {
    mensagem: `A operadora de cartão recusou a cobrança (${cru}). Registre o código e fale com o suporte.`,
    gravidade: 'configuracao', pode_repetir: false, codigo: cru,
  }
}

/** Bandeiras aceitas na Transação Remota, com o tipo de cobrança que cada uma
 *  determina. É o `paymentBrand` que define crédito × débito, não um campo
 *  separado — e o Link de Pagamento aceita só as de crédito. */
export const BANDEIRAS: Record<string, { rotulo: string; tipo: 'credito' | 'debito'; no_link: boolean }> = {
  VISA_CREDITO:  { rotulo: 'Visa',                    tipo: 'credito', no_link: true  },
  MASTERCARD:    { rotulo: 'Mastercard',              tipo: 'credito', no_link: true  },
  AMEX:          { rotulo: 'American Express',        tipo: 'credito', no_link: true  },
  ELO:           { rotulo: 'Elo',                     tipo: 'credito', no_link: true  },
  VISA_ELECTRON: { rotulo: 'Visa Electron (débito)',  tipo: 'debito',  no_link: false },
  MAESTRO:       { rotulo: 'Maestro (débito)',        tipo: 'debito',  no_link: false },
  ELO_DEBITO:    { rotulo: 'Elo Débito',              tipo: 'debito',  no_link: false },
  DINERS:        { rotulo: 'Diners',                  tipo: 'credito', no_link: false },
  SOROCRED:      { rotulo: 'Sorocred',                tipo: 'credito', no_link: false },
  SICREDI:       { rotulo: 'Sicredi',                 tipo: 'credito', no_link: false },
  AGIPLAN:       { rotulo: 'Agiplan',                 tipo: 'credito', no_link: false },
  BANESCARD:     { rotulo: 'Banescard',               tipo: 'credito', no_link: false },
  CREDZ:         { rotulo: 'CredZ',                   tipo: 'credito', no_link: false },
  JCB:           { rotulo: 'JCB',                     tipo: 'credito', no_link: false },
  CABAL:         { rotulo: 'Cabal',                   tipo: 'credito', no_link: false },
  MAIS:          { rotulo: 'Mais',                    tipo: 'credito', no_link: false },
}

/** Status do terminal, com o que a recepção precisa entender de cada um. */
export const STATUS_TERMINAL: Record<string, { rotulo: string; pode_cobrar: boolean; explicacao: string }> = {
  ONLINE: {
    rotulo: 'Pronta', pode_cobrar: true,
    explicacao: 'A maquininha está ligada e pronta para receber a cobrança.',
  },
  ONLINE_DIFFERENT_ACCOUNT: {
    rotulo: 'Em uso por outra empresa', pode_cobrar: true,
    explicacao: 'A maquininha está sendo usada por outro estabelecimento do grupo. A cobrança funciona se o aparelho for versão 4.14 ou mais nova.',
  },
  OFFLINE: {
    rotulo: 'Desligada', pode_cobrar: false,
    explicacao: 'A maquininha está desligada ou desconectada. Se for de cabo, confira se o computador dela está ligado e com o programa aberto.',
  },
  UNKNOWN: {
    rotulo: 'Estado desconhecido', pode_cobrar: false,
    explicacao: 'O aparelho é de versão antiga (anterior à 4.0) e não informa o próprio estado. Tente cobrar; se não chegar, use outra maquininha.',
  },
}

// ─── Interpretação de status — medida no sandbox, não suposta ───────────────

export type SituacaoCobranca =
  | 'aguardando'   // criada, ninguém pagou ainda
  | 'aprovada'     // dinheiro garantido
  | 'recusada'     // o cartão negou; o tutor pode tentar de novo
  | 'cancelada'    // o link foi cancelado
  | 'desconhecida'

export interface LeituraDeStatus {
  situacao:  SituacaoCobranca
  rotulo:    string
  /** O que a recepção faz agora. */
  orientacao: string
}

/**
 * Traduz o estado real de uma cobrança.
 *
 * ⚠️ ARMADILHA MEDIDA EM 22/10/2026: quando o cartão é recusado, a transação
 * fica `DISAPPROVED` mas **a ORDER continua `PENDING`**. Olhar só o status da
 * order faria uma recusa parecer "ainda esperando pagamento" — e o caixa
 * liberaria o atendimento achando que o tutor ainda vai pagar.
 *
 * Por isso a leitura considera os DOIS: o status da transação manda quando
 * existe; o da order só vale quando não houve tentativa nenhuma.
 *
 * Também: `PENDING` e `CANCELED` (com um L) são status REAIS que não constam da
 * tabela publicada — a doc lista `CANCELLED`, com dois.
 */
export function lerSituacao(
  statusOrder: string | null | undefined,
  statusTransacao?: string | null,
): LeituraDeStatus {
  const t = String(statusTransacao ?? '').toUpperCase()
  const o = String(statusOrder ?? '').toUpperCase()

  if (t === 'APPROVED' || t === 'COMPLETE') {
    return { situacao: 'aprovada', rotulo: 'Pago',
      orientacao: 'Pagamento aprovado. O valor entra conforme a data de cada parcela.' }
  }
  if (t === 'DISAPPROVED' || t === 'ABORTED' || t === 'ABORTED_BY_MERCHANT') {
    return { situacao: 'recusada', rotulo: 'Recusado',
      orientacao: 'O cartão não autorizou. O responsável pode tentar outro cartão pelo mesmo link.' }
  }
  if (t === 'CANCELLED' || t === 'CANCELED' || o === 'CANCELLED' || o === 'CANCELED') {
    return { situacao: 'cancelada', rotulo: 'Cancelado',
      orientacao: 'Esta cobrança foi cancelada e o link não aceita mais pagamento.' }
  }
  if (o === 'APPROVED' || o === 'COMPLETE') {
    return { situacao: 'aprovada', rotulo: 'Pago',
      orientacao: 'Pagamento aprovado. O valor entra conforme a data de cada parcela.' }
  }
  if (o === 'PENDING' || o === 'PRE_APPROVED' || o === 'INCOMPLETE' || o === '') {
    return { situacao: 'aguardando', rotulo: 'Aguardando pagamento',
      orientacao: 'O link foi gerado e ainda não foi pago.' }
  }
  return { situacao: 'desconhecida', rotulo: `Situação ${o || t}`,
    orientacao: 'Situação não reconhecida — confira no portal da operadora.' }
}
