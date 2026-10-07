// Rate limit para rotas de API. Server-only.
//
// Lastro no banco (migration 0493) e não em memória: a aplicação roda em
// serverless, cada instância teria o próprio contador e o limite efetivo
// viraria "N × instâncias" — ou seja, nenhum.
//
// Regra de ouro: se o limitador falhar, a requisição PASSA. Um erro de
// infraestrutura no contador não pode derrubar o recebimento de um webhook de
// pagamento ou de resultado de exame — o risco de perder um boleto confirmado
// é maior que o de aceitar algumas chamadas a mais.

import { createAdminClient } from '@/lib/supabase/admin'

export interface LimiteConfig {
  /** Quantas chamadas são permitidas na janela. */
  limite: number
  /** Tamanho da janela em segundos (padrão 60). */
  janelaSegundos?: number
  /** Prefixo que separa os contadores por rota. */
  escopo: string
}

/** IP de origem, atrás do proxy da Vercel. */
export function ipDaRequisicao(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'desconhecido'
}

/**
 * Conta a chamada e diz se deve recusar.
 * `identificador` separa os chamadores — normalmente o IP, ou o id da clínica
 * quando a rota já sabe de quem é.
 */
export async function excedeuLimite(
  identificador: string,
  cfg: LimiteConfig,
): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('rate_limit_exceeded', {
      p_bucket: `${cfg.escopo}:${identificador}`,
      p_limit: cfg.limite,
      p_window_seconds: cfg.janelaSegundos ?? 60,
    })
    if (error) return false      // falhou o contador → deixa passar
    return data === true
  } catch {
    return false
  }
}

/** Resposta padrão de recusa, com o cabeçalho que os clientes esperam. */
export function respostaLimiteExcedido(janelaSegundos = 60): Response {
  return new Response(
    JSON.stringify({ error: 'Muitas requisições. Tente novamente em instantes.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(janelaSegundos),
      },
    },
  )
}

/**
 * Atalho para o caso comum: limita por IP e devolve a resposta de recusa
 * pronta, ou null quando pode seguir.
 *
 *   const barrado = await limitarPorIp(request, { escopo: 'webhook:asaas', limite: 120 })
 *   if (barrado) return barrado
 */
export async function limitarPorIp(
  req: Request,
  cfg: LimiteConfig,
): Promise<Response | null> {
  const excedeu = await excedeuLimite(ipDaRequisicao(req), cfg)
  return excedeu ? respostaLimiteExcedido(cfg.janelaSegundos ?? 60) : null
}
