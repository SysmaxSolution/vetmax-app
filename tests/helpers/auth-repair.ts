// Duas proteções que o `globalSetup` do Jest precisa antes de semear.
//
// 1) RECUSAR PRODUÇÃO. O `globalSetup` faz
//    `dotenv.config({ path: resolve(process.cwd(), '.env.local') })` e em
//    seguida chama `seedClinics()` / `seedUsers()`. O `.env.local` de
//    `C:\SysMax` aponta para o projeto de PRODUÇÃO — rodar `npx jest` daquele
//    diretório criaria "Clínica Alfa", "Clínica Beta" e seis usuários de teste
//    no banco do cliente. Nada no código impedia isso.
//
// 2) CONSERTAR OS NULL DO GOTRUE. O GoTrue (Go) lê algumas colunas de texto de
//    `auth.users` como `string`, não `*string`. Uma única linha com NULL ali
//    derruba a consulta INTEIRA de `GET /admin/users` com
//    "Database error finding users" — e o `listUsers` passa a devolver zero
//    usuários. Foi o que travou o seed: `createTestUser` não achava
//    `admin@clinica-alfa.test` pelo `listUsers`, o `createUser` respondia que o
//    e-mail já existe, e a busca exaustiva também vinha vazia, resultando em
//    "createUser falhou e usuário não localizável".
//
//    Em 09/10/2026 o banco de testes tinha 2 dos 6 usuários com NULL em
//    confirmation_token, recovery_token, email_change e
//    email_change_token_new. Produção estava limpa. NULL aparece quando a linha
//    é inserida por SQL direto (dump/restore, script de seed) em vez da API,
//    então pode voltar — por isso o conserto roda a cada execução.

import pg from 'pg'

/** Projetos onde o seed NUNCA pode rodar. O ref é público (vai no bundle). */
const PROJETOS_PROIBIDOS: Record<string, string> = {
  yivjuhurcadxtllmkkqd: 'PRODUÇÃO (Clínica Animais)',
}

/** Colunas que o GoTrue escaneia como texto e não aceitam NULL. */
const COLUNAS_TEXTO = [
  'confirmation_token',
  'recovery_token',
  'email_change',
  'email_change_token_new',
  'email_change_token_current',
  'phone_change',
  'phone_change_token',
  'reauthentication_token',
] as const

function refDoProjeto(url: string | undefined): string {
  const m = /https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url ?? '')
  if (!m) throw new Error(`NEXT_PUBLIC_SUPABASE_URL ausente ou inesperada: ${url ?? '(vazia)'}`)
  return m[1]
}

/**
 * Aborta se o alvo for um banco proibido. Chamar ANTES de qualquer escrita.
 * Devolve o ref do projeto para quem quiser registrar.
 */
export function exigirBancoDeTestes(): string {
  const ref = refDoProjeto(process.env.NEXT_PUBLIC_SUPABASE_URL)
  const proibido = PROJETOS_PROIBIDOS[ref]
  if (proibido) {
    throw new Error(
      `[seed] ABORTADO: o alvo é ${proibido} (projeto ${ref}).\n` +
      `O seed cria clínicas e usuários de teste — isso não pode tocar o banco do cliente.\n` +
      `Rode os testes de C:\\sysvetmax-dev, cujo .env.local aponta para o banco de testes.`,
    )
  }
  console.log(`[seed] alvo: projeto ${ref} (permitido)`)
  return ref
}

/**
 * Troca NULL por '' nas colunas de texto de `auth.users`, devolvendo quantas
 * linhas foram consertadas. Sem isso o `listUsers` do Supabase falha inteiro.
 *
 * Idempotente: sem NULL, não escreve nada.
 */
export async function consertarNullsDoAuth(): Promise<number> {
  const ref = exigirBancoDeTestes()
  const senha = process.env.SUPABASE_DEV_DB_PASSWORD
  if (!senha) {
    console.warn('[seed] SUPABASE_DEV_DB_PASSWORD ausente — pulando conserto dos NULL do auth')
    return 0
  }

  const cliente = new pg.Client({
    host:     'aws-0-us-east-1.pooler.supabase.com',
    port:     6543,
    user:     `postgres.${ref}`,
    password: senha,
    database: 'postgres',
    ssl:      { rejectUnauthorized: false },
  })

  await cliente.connect()
  try {
    const onde = COLUNAS_TEXTO.map(c => `${c} IS NULL`).join(' OR ')
    const sets = COLUNAS_TEXTO.map(c => `${c} = COALESCE(${c}, '')`).join(', ')
    // Transação, não SET SESSION: na porta 6543 o pooler reaproveita a conexão
    // de backend entre clientes e um SET vazaria para outro processo.
    await cliente.query('BEGIN')
    const r = await cliente.query(`UPDATE auth.users SET ${sets} WHERE ${onde}`)
    await cliente.query('COMMIT')
    if (r.rowCount) console.log(`[seed] consertados ${r.rowCount} usuário(s) com NULL em colunas do GoTrue`)
    return r.rowCount ?? 0
  } catch (e) {
    await cliente.query('ROLLBACK')
    throw e
  } finally {
    await cliente.end()
  }
}
