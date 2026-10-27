// Traduz falhas da integração bancária para quem opera o caixa.
//
// As mensagens das actions são escritas para quem configura: falam de
// certificado e-CNPJ, arquivo .pfx, client_id, ambiente. Isso é certo na tela
// de Configurações e errado na tela de quem está pagando fornecedor — ali a
// pessoa não tem o que fazer com a informação, e a mensagem só atrapalha.
//
// Regra: a tela OPERACIONAL diz o que aconteceu e quem resolve. A tela de
// CONFIGURAÇÃO continua mostrando o detalhe, porque lá ele é acionável.
//
// Módulo puro — sem I/O, testável.

export interface MensagemOperador {
  texto: string
  /** Quando true, a tela sugere falar com o administrador da clínica. */
  chamarAdmin: boolean
}

/**
 * Nunca devolve a mensagem crua: ou casa com um caso conhecido, ou entrega
 * a frase genérica. Repassar o texto da integração é como mostrar um stack
 * trace — informação que só serve para quem escreveu o código.
 */
export function mensagemParaOperador(bruto: string | null | undefined): MensagemOperador {
  const e = (bruto ?? '').toLowerCase()

  // Sessão e permissão: o operador resolve sozinho, então o texto é direto.
  if (e.includes('não autenticado') || e.includes('nao autenticado')) {
    return { texto: 'Sua sessão expirou. Entre de novo para continuar.', chamarAdmin: false }
  }
  if (e.includes('sem permissão') || e.includes('sem permissao')) {
    return { texto: 'Seu usuário não tem permissão para esta operação.', chamarAdmin: false }
  }

  // Configuração: existe quem resolva, e não é quem está na tela.
  if (e.includes('certificado') || e.includes('.pfx') || e.includes('e-cnpj')) {
    return { texto: 'A conexão com o banco precisa ser revista.', chamarAdmin: true }
  }
  if (e.includes('integração bancária não está ativada') || e.includes('integracao bancaria nao esta ativada')) {
    return { texto: 'A integração bancária não está ativa para esta clínica.', chamarAdmin: true }
  }
  if (e.includes('nenhuma conta sicoob') || e.includes('conta bancária não encontrada') || e.includes('conta bancaria nao encontrada')) {
    return { texto: 'Nenhuma conta do banco está cadastrada.', chamarAdmin: true }
  }
  if (e.includes('sem número no cadastro') || e.includes('sem numero no cadastro') || e.includes('agência') && e.includes('cadastro')) {
    return { texto: 'Falta completar o cadastro desta conta bancária.', chamarAdmin: true }
  }
  if (e.includes('nenhum banco configurado')) {
    return { texto: 'Esta conta ainda não está ligada ao banco.', chamarAdmin: true }
  }

  // Limites do banco que o operador consegue contornar sozinho.
  if (e.includes('período de consulta') || e.includes('periodo de consulta') || e.includes('10320')) {
    return { texto: 'O banco só aceita consultas de até 60 dias por vez. Reduza o período.', chamarAdmin: false }
  }

  // Vazio é diferente de desconhecido: não inventa falha onde não houve.
  if (!e.trim()) return { texto: '', chamarAdmin: false }

  // Qualquer outra coisa — inclusive erro de rede, timeout e resposta
  // inesperada do banco — vira a mesma frase. O detalhe fica no servidor.
  return {
    texto: 'Não foi possível falar com o banco agora. Tente de novo em alguns minutos.',
    chamarAdmin: false,
  }
}

/** Frase final, já com o complemento de quem resolve. */
export function textoParaTela(bruto: string | null | undefined): string {
  const m = mensagemParaOperador(bruto)
  if (!m.texto) return ''
  return m.chamarAdmin ? `${m.texto} Fale com o administrador da clínica.` : m.texto
}
