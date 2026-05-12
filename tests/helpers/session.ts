import type { BrowserContext, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000'

const AUTH_DIR = path.resolve(process.cwd(), 'tests/.auth')

// Mapeamento email → role para localizar o storageState salvo no global-setup
const EMAIL_TO_ROLE: Record<string, string> = {
  'admin@clinica-alfa.test':      'admin',
  'vet@clinica-alfa.test':        'vet',
  'recepcao@clinica-alfa.test':   'receptionist',
  'assistente@clinica-alfa.test': 'assistant',
  'contador@clinica-alfa.test':   'accountant',
  'admin@clinica-beta.test':      'adminB',
}

// Verifica se o access_token do @supabase/ssr já expirou (com 90s de margem)
function isStorageStateExpired(cookies: Record<string, unknown>[]): boolean {
  const authCookie = cookies.find(
    (c) => typeof (c as any).name === 'string' && (c as any).name.includes('auth-token'),
  ) as { value?: string } | undefined

  if (!authCookie?.value) return true
  try {
    const raw = (authCookie.value as string).replace(/^base64-/, '')
    const session = JSON.parse(Buffer.from(raw, 'base64url').toString('utf-8')) as { expires_at?: number }
    if (!session.expires_at) return true
    return session.expires_at < Math.floor(Date.now() / 1000) + 90
  } catch {
    return true
  }
}

// ─── Fallback: login real via UI do Next.js ───────────────────────────────────
// Abre uma página temporária no mesmo contexto, navega para /login,
// preenche as credenciais e aguarda o redirect para /dashboard.
// Os cookies de sessão gerados pelo @supabase/ssr ficam no contexto compartilhado.
export async function injectFreshSession(
  context: BrowserContext,
  email: string,
  password: string,
): Promise<void> {
  const loginPage = await context.newPage()
  try {
    await loginPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle', timeout: 60_000 })
    await loginPage.locator('#email').waitFor({ state: 'visible', timeout: 15_000 })
    await loginPage.fill('#email', email)
    await loginPage.fill('#password', password)
    await loginPage.getByRole('button', { name: /entrar/i }).click()
    await loginPage.waitForURL(/\/dashboard/, { timeout: 45_000 })
  } catch (err) {
    throw new Error(`[session] UI login failed for ${email}: ${(err as Error).message}`)
  } finally {
    await loginPage.close()
  }
}

// ─── Rota primária: carrega storageState salvo pelo global-setup ──────────────
// Usa os cookies REAIS que o @supabase/ssr define após um login bem-sucedido.
// Retorna false se o storageState não existir, estiver vazio ou com token expirado
// (nesse caso loginViaApi faz fallback para injectFreshSession).

async function loadStorageState(page: Page, email: string): Promise<boolean> {
  const role = EMAIL_TO_ROLE[email]
  if (!role) return false

  const statePath = path.join(AUTH_DIR, `${role}.json`)
  if (!fs.existsSync(statePath)) return false

  try {
    const raw   = fs.readFileSync(statePath, 'utf-8')
    const state = JSON.parse(raw) as {
      cookies?: Record<string, unknown>[]
      origins?: { origin: string; localStorage?: { name: string; value: string }[] }[]
    }

    if (!state.cookies || state.cookies.length === 0) return false

    // Rejeita tokens expirados — evita que o middleware tente refresh com token inválido
    if (isStorageStateExpired(state.cookies)) return false

    await page.context().clearCookies()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.context().addCookies(state.cookies as any)

    // Restaura localStorage do origin correto (caso @supabase/ssr use localStorage)
    const origin = state.origins?.find(o => o.origin.includes('localhost'))
    if (origin?.localStorage?.length) {
      await page.goto(`${BASE_URL}/`, { waitUntil: 'commit', timeout: 15_000 })
      await page.evaluate((items) => {
        for (const { name, value } of items) localStorage.setItem(name, value)
      }, origin.localStorage)
    }

    return true
  } catch {
    return false
  }
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Autentica a página como o usuário indicado e navega para targetPath.
 * Prioridade: storageState salvo → injeção direta de cookies (fallback).
 */
export async function loginViaApi(
  page: Page,
  email: string,
  password: string,
  targetPath = '/dashboard',
): Promise<void> {
  const loaded = await loadStorageState(page, email)

  if (!loaded) {
    // Fallback: injeção direta (usado se global-setup falhou para este role)
    await injectFreshSession(page.context(), email, password)
  }

  await page.goto(`${BASE_URL}${targetPath}`)
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 })
}
