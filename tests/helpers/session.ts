import { createClient } from '@supabase/supabase-js'
import type { BrowserContext, Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const BASE_URL          = process.env.TEST_BASE_URL ?? 'http://localhost:4000'

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

// ─── Fallback: injeção direta de cookies Supabase ────────────────────────────
// Usado quando o storageState salvo não está disponível ou está vazio.
// Mantido como safety net — a rota primária é loadStorageState().

const MAX_CHUNK_SIZE = 3180

function getProjectRef(): string {
  return new URL(SUPABASE_URL).hostname.split('.')[0]
}

function buildCookieChunks(key: string, value: string): Array<{ name: string; value: string }> {
  const encodedValue = encodeURIComponent(value)
  if (encodedValue.length <= MAX_CHUNK_SIZE) {
    return [{ name: key, value }]
  }
  const chunks: string[] = []
  let remaining = encodedValue
  while (remaining.length > 0) {
    let encodedHead = remaining.slice(0, MAX_CHUNK_SIZE)
    const lastEscapePos = encodedHead.lastIndexOf('%')
    if (lastEscapePos > MAX_CHUNK_SIZE - 3) {
      encodedHead = encodedHead.slice(0, lastEscapePos)
    }
    let valueHead = ''
    while (encodedHead.length > 0) {
      try { valueHead = decodeURIComponent(encodedHead); break }
      catch {
        if (encodedHead.at(-3) === '%' && encodedHead.length > 3) {
          encodedHead = encodedHead.slice(0, encodedHead.length - 3)
        } else { break }
      }
    }
    chunks.push(valueHead)
    remaining = remaining.slice(encodedHead.length)
  }
  return chunks.map((v, i) => ({ name: `${key}.${i}`, value: v }))
}

export async function injectFreshSession(
  context: BrowserContext,
  email: string,
  password: string,
): Promise<void> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(`[session] Auth failed for ${email}: ${error?.message ?? 'no session'}`)
  }
  const { access_token, refresh_token, expires_at, user } = data.session
  const ref        = getProjectRef()
  const cookieKey  = `sb-${ref}-auth-token`
  const sessionPayload = JSON.stringify({
    access_token, token_type: 'bearer',
    expires_in: (expires_at ?? 0) - Math.floor(Date.now() / 1000),
    expires_at, refresh_token, user,
  })
  const domain = new URL(BASE_URL).hostname
  const chunks = buildCookieChunks(cookieKey, sessionPayload)
  await context.addCookies(
    chunks.map(({ name, value }) => ({
      name, value, domain, path: '/',
      httpOnly: false, secure: false, sameSite: 'Lax' as const,
      expires: expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    })),
  )
}

// ─── Rota primária: carrega storageState salvo pelo global-setup ──────────────
// Usa os cookies REAIS que o @supabase/ssr define após um login bem-sucedido,
// eliminando qualquer incompatibilidade de formato.

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
