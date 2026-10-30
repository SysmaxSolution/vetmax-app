// Tradução de erro do banco para mensagem de usuário.
//
// Por quê: havia ~278 pontos devolvendo `error.message` cru ao cliente. O
// Postgres conta demais nessa mensagem — nome de tabela, de coluna, de
// constraint, de índice. É o mapa da estrutura interna entregue de graça a
// quem está sondando.
//
// Mas nem toda mensagem é vazamento: nossas funções usam RAISE EXCEPTION com
// texto escrito para o usuário ("Apenas gestores podem cancelar parcelas.",
// "Caixa já fechado"). Essas PRECISAM chegar — engolidas, o usuário perde a
// única pista do que fazer.
//
// O separador não é heurística, é o SQLSTATE. Medido contra o banco de testes:
//
//   RAISE EXCEPTION nosso (com ou sem ERRCODE)  → P0001
//   relation "x" does not exist                 → 42P01
//   column "x" does not exist                   → 42703
//   invalid input syntax for type uuid          → 22P02
//   null value in column "x" ... violates        → 23502
//   duplicate key value violates constraint      → 23505
//   function x() does not exist                  → 42883
//
// P0001 é só nosso. Então: P0001 passa, código conhecido ganha tradução, o
// resto vira texto genérico. O detalhe cru continua indo para o log do
// servidor, onde é útil e seguro.

interface ErroBanco {
  message?: string
  code?: string
  details?: string
  hint?: string
}

/** SQLSTATE das exceções levantadas pelas nossas próprias funções plpgsql. */
const NOSSO = 'P0001'

/** Códigos do motor que merecem uma explicação própria em vez da genérica. */
const POR_CODIGO: Record<string, string> = {
  '23505': 'Já existe um registro com esses dados.',
  '23503': 'Este registro está vinculado a outro e não pode ser alterado ou removido.',
  '23502': 'Falta preencher um campo obrigatório.',
  '23514': 'Os dados informados não atendem a uma regra do sistema.',
  '22001': 'Um dos campos excede o tamanho permitido.',
  '22P02': 'Um dos valores informados está em formato inválido.',
  '22012': 'Houve uma divisão por zero no cálculo.',
  '42501': 'Você não tem permissão para esta operação.',
  '40001': 'Outra pessoa alterou este registro ao mesmo tempo. Tente novamente.',
  '40P01': 'Duas operações se bloquearam. Tente novamente.',
  '57014': 'A operação demorou demais e foi interrompida. Tente novamente.',
  '53300': 'O sistema está com muitas conexões abertas. Tente novamente em instantes.',
  'PGRST116': 'Registro não encontrado.',
  'PGRST301': 'Sua sessão expirou. Entre novamente.',
}

/**
 * CHECK do banco explicada em português. Sem isto, violar uma regra de formato
 * devolve "Os dados informados não atendem a uma regra do sistema", que não diz
 * à pessoa o que corrigir (caso do CRMV sem a sigla do estado, 30/10/2026).
 */
const POR_CONSTRAINT: Record<string, string> = {
  chk_crmv_tamanho: 'O CRMV deve ter no máximo 30 caracteres.',
}

const GENERICA = 'Não foi possível concluir a operação. Tente novamente — se persistir, acione o suporte.'

/**
 * Rede de segurança para erro SEM código: `throw new Error('...')` do nosso
 * TypeScript, erro de integração, falha de rede. Esses textos são nossos e
 * úteis — passam. A exceção é o que cheira a mensagem do motor, caso algum
 * caminho perca o SQLSTATE no meio.
 */
const CHEIRO_DE_MOTOR =
  /relation "|column "|constraint "|violates |duplicate key|permission denied for|does not exist|invalid input syntax|schema cache|pg_|SQLSTATE/i

/**
 * Mensagem segura para devolver ao cliente.
 * Loga o erro cru no servidor — é lá que ele serve.
 */
export function mensagemErro(erro: unknown, contexto?: string): string {
  const e = (erro ?? {}) as ErroBanco
  const msg = String(e.message ?? '').trim()
  const code = e.code ? String(e.code) : ''

  if (process.env.NODE_ENV !== 'test') {
    console.error('[erro]', contexto ?? '', { code: code || null, message: msg, details: e.details ?? null })
  }

  if (code === NOSSO) return msg || GENERICA        // nossa exceção: passa inteira
  // A CHECK violada vem no texto do erro ("violates check constraint \"x\"").
  // Quando conhecemos a regra, dizemos o que corrigir em vez da frase genérica.
  for (const [nome, frase] of Object.entries(POR_CONSTRAINT)) {
    if (msg.includes(nome)) return frase
  }
  if (code && POR_CODIGO[code]) return POR_CODIGO[code]
  if (code) return GENERICA                          // qualquer outro código = motor
  if (msg && !CHEIRO_DE_MOTOR.test(msg)) return msg  // erro nosso, sem código
  return GENERICA
}

/** Açúcar para o formato que as actions já usam: `return erro(e, 'ctx')`. */
export function erro(e: unknown, contexto?: string): { error: string } {
  return { error: mensagemErro(e, contexto) }
}

/**
 * Traduz o erro do GoTrue para algo que o usuário consiga agir.
 *
 * `mensagemErro` devolve a mensagem genérica para qualquer erro que tenha
 * `code` — regra certa para erro de banco, errada aqui: o GoTrue usa o código
 * justamente para dizer o que o usuário precisa corrigir. Sem esta tradução, a
 * pessoa lê "não foi possível concluir a operação" e não tem como saber que o
 * problema é a senha. Já custou um cadastro perdido na frente do cliente
 * (AVA, 13/10/2026).
 *
 * A política de senha é do projeto Supabase, não do nosso código:
 * mínimo 8 caracteres, exigindo minúscula + MAIÚSCULA + dígito, e recusa de
 * senha que apareça em vazamentos conhecidos (HIBP).
 */
export function mensagemErroCadastro(erro: unknown): string {
  const e = (erro ?? {}) as { code?: string; message?: string; status?: number }
  const code = String(e.code ?? '')
  const msg  = String(e.message ?? '')

  if (code === 'weak_password' || /weak|password should contain/i.test(msg)) {
    const vazada = /pwned|known to be weak|easy to guess/i.test(msg)
    return vazada
      ? 'Senha recusada: além de precisar de letra minúscula, letra MAIÚSCULA e número (mínimo 8 caracteres), esta senha aparece em vazamentos públicos conhecidos. Escolha outra.'
      : 'A senha precisa ter no mínimo 8 caracteres, com ao menos uma letra minúscula, uma letra MAIÚSCULA e um número.'
  }
  if (code === 'email_exists' || code === 'user_already_exists') {
    return 'Este e-mail já possui uma conta. Acesse a página de login ou redefina sua senha.'
  }
  if (code === 'email_address_invalid' || code === 'validation_failed') {
    return 'E-mail inválido. Confira se está digitado corretamente.'
  }
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'
  }
  if (code === 'signup_disabled') {
    return 'O cadastro está temporariamente desativado. Acione o suporte.'
  }
  if (code === 'unexpected_failure' && /database error/i.test(msg)) {
    return 'Falha no cadastro deste e-mail. Acione o suporte informando o e-mail usado.'
  }
  // SMTP do Auth fora do ar (29/10/2026: chave da Resend revogada derrubou o
  // cadastro por 2 semanas com a mensagem genérica). Dizer o que houve.
  if (/confirmation email|sending.*email|smtp/i.test(msg)) {
    return 'Não conseguimos enviar o e-mail de confirmação do cadastro. Acione o suporte — o problema é no envio de e-mail, não nos seus dados.'
  }
  return mensagemErro(erro, 'lib/errors.ts')
}
