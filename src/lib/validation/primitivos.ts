// Primitivos de validação para as actions que mexem com dinheiro e documento
// fiscal.
//
// O que estava acontecendo: as actions recebiam o objeto do navegador e
// conferiam, no máximo, `!data.amount || data.amount <= 0`. Isso deixa passar
// `NaN`, `Infinity`, `1.005` (que vira centavo errado no livro) e valor vindo
// como string. O banco então recebe o que lhe mandam — e no financeiro, erro
// de entrada não aparece como falha, aparece como número errado no fechamento.
//
// A regra aqui é conservadora de propósito: valida FORMA, não política. Quem
// decide se o valor faz sentido para a clínica é a regra de negócio no banco.
// Validar forma demais quebraria fluxo que hoje funciona.

import { z } from 'zod'
import { apenasDigitos, cpfOuCnpjValido } from './documento'

/** Teto de sanidade: pega erro de digitação, não limita o negócio. */
const TETO_CENTAVOS = 1_000_000_000   // R$ 10.000.000,00

function checaDinheiro(v: number, ctx: z.RefinementCtx, permiteZero: boolean) {
  if (!Number.isFinite(v)) {
    ctx.addIssue({ code: 'custom', message: 'Valor inválido.' }); return
  }
  if (permiteZero ? v < 0 : v <= 0) {
    ctx.addIssue({ code: 'custom', message: permiteZero ? 'Valor não pode ser negativo.' : 'Valor deve ser maior que zero.' }); return
  }
  // Mais de 2 casas vira centavo fantasma no livro. Arredondar em silêncio
  // esconderia o problema; recusar faz a tela corrigir na origem.
  if (Math.round(v * 100) !== Number((v * 100).toFixed(4))) {
    ctx.addIssue({ code: 'custom', message: 'Valor deve ter no máximo 2 casas decimais.' }); return
  }
  if (Math.round(v * 100) > TETO_CENTAVOS) {
    ctx.addIssue({ code: 'custom', message: 'Valor acima do limite permitido. Confira se não há dígito a mais.' })
  }
}

/** Dinheiro que precisa ser positivo (valor de título, de venda, de baixa). */
export const zDinheiro = z.coerce.number().superRefine((v, ctx) => checaDinheiro(v, ctx, false))

/** Dinheiro que pode ser zero (desconto, juros, acréscimo). */
export const zDinheiroOuZero = z.coerce.number().superRefine((v, ctx) => checaDinheiro(v, ctx, true))

/** Percentual de 0 a 100 — taxa de cartão, comissão, desconto proporcional. */
export const zPercentual = z.coerce.number()
  .refine(v => Number.isFinite(v), 'Percentual inválido.')
  .refine(v => v >= 0 && v <= 100, 'Percentual deve estar entre 0 e 100.')

/** Data no formato que o Postgres aceita como `date`: AAAA-MM-DD. */
export const zDataISO = z.string().trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato AAAA-MM-DD.')
  .refine(s => {
    const [a, m, d] = s.split('-').map(Number)
    const dt = new Date(Date.UTC(a, m - 1, d))
    // Pega 2026-02-30 e 2026-13-01, que casam no regex mas não existem.
    return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  }, 'Data inexistente.')

export const zUuid = z.string().uuid('Identificador inválido.')

/** Texto obrigatório, com teto para não estourar a coluna. */
export const zTexto = (max: number, rotulo = 'Campo') =>
  z.string().trim().min(1, `${rotulo} é obrigatório.`).max(max, `${rotulo} excede ${max} caracteres.`)

/**
 * CPF ou CNPJ com dígito verificador conferido. Normaliza para só dígitos —
 * é assim que gravamos, e é o que o emissor de NFS-e e o layout de boleto
 * esperam.
 */
export const zCpfCnpj = z.string()
  .transform(apenasDigitos)
  .refine(cpfOuCnpjValido, 'CPF/CNPJ inválido — confira os dígitos.')

/**
 * Mesma conferência de dígito, mas DEVOLVE COMO VEIO (só com trim).
 *
 * Usar quando o campo já está gravado mascarado — é o caso de
 * `companies.cnpj` em produção. Normalizar no save mudaria o formato de um
 * registro que já existe e que outros pontos leem esperando a máscara; a
 * conferência do dígito é o que importa aqui, não o formato.
 */
export const zCpfCnpjPreservandoFormato = z.string().trim()
  .refine(cpfOuCnpjValido, 'CPF/CNPJ inválido — confira os dígitos.')

/** Parcela: 1..n, inteiro. */
export const zParcela = z.coerce.number().int('Parcela deve ser número inteiro.').min(1, 'Parcela começa em 1.')

/**
 * Valida e devolve no formato que as actions já usam — `{ error }` com a
 * primeira mensagem, para a tela mostrar sem precisar entender zod.
 *
 * Uso:
 *   const v = valida(EsquemaCriarTitulo, data)
 *   if ('error' in v) return v
 *   // v.dados está tipado e normalizado
 */
export function valida<T extends z.ZodTypeAny>(
  esquema: T,
  entrada: unknown,
): { dados: z.infer<T> } | { error: string } {
  const r = esquema.safeParse(entrada)
  if (r.success) return { dados: r.data }
  const primeira = r.error.issues[0]
  const campo = primeira?.path?.length ? `${primeira.path.join('.')}: ` : ''
  return { error: `${campo}${primeira?.message ?? 'Dados inválidos.'}` }
}
