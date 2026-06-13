import type { Page } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000'

const AUTH_DIR = path.resolve(process.cwd(), 'tests/.auth')

const EMAIL_TO_ROLE: Record<string, string> = {
  'admin@clinica-alfa.test':      'admin',
  'vet@clinica-alfa.test':        'vet',
  'recepcao@clinica-alfa.test':   'receptionist',
  'assistente@clinica-alfa.test': 'assistant',
  'contador@clinica-alfa.test':   'accountant',
  'admin@clinica-beta.test':      'adminB',
}

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

// Login via UI diretamente na página do teste (sem temp page — evita race condition de cookies)
export async function injectFreshSession(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.locator('#email').waitFor({ state: 'visible', timeout: 30_000 })
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.getByRole('button', { name: /entrar/i }).click()
  // waitUntil:'domcontentloaded' garante que o browser processou os Set-Cookie da resposta antes de retornar
  await page.waitForURL(/\/(dashboard\/[a-z]|onboarding)/, { timeout: 90_000, waitUntil: 'domcontentloaded' })
  if (page.url().includes('/onboarding')) {
    throw new Error(
      `[injectFreshSession] Login para ${email} redirecionou para /onboarding — profile.clinic_id está null no DB. Verifique seedUsers().`
    )
  }
}

async function loadStorageState(page: Page, email: string): Promise<boolean> {
  const role = EMAIL_TO_ROLE[email]
  if (!role) return false

  // Se o contexto já tem cookies válidos (ex: refresh pós-test anterior), reutilizar.
  // Evita sobrescrever tokens rotacionados pelo servidor com os antigos do arquivo.
  const existing = await page.context().cookies()
  if (existing.length > 0 && !isStorageStateExpired(existing as unknown as Record<string, unknown>[])) {
    return true
  }

  const statePath = path.join(AUTH_DIR, `${role}.json`)
  if (!fs.existsSync(statePath)) return false

  try {
    const raw   = fs.readFileSync(statePath, 'utf-8')
    const state = JSON.parse(raw) as {
      cookies?: Record<string, unknown>[]
      origins?: { origin: string; localStorage?: { name: string; value: string }[] }[]
    }

    if (!state.cookies || state.cookies.length === 0) return false
    if (isStorageStateExpired(state.cookies)) return false

    await page.context().clearCookies()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.context().addCookies(state.cookies as any)

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

/**
 * Autentica a página como o usuário indicado e navega para targetPath.
 * Prioridade: storageState salvo → login via UI (fallback).
 * Usa waitUntil:'domcontentloaded' para evitar hang do evento load em Next.js dev.
 */
/**
 * Suprime o OnboardingWizard automático que abre modal full-screen e
 * intercepta cliques em E2E. Marca todas as clínicas conhecidas como já
 * "dispensadas" no localStorage.
 */
async function suppressOnboardingModal(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      const knownClinics = [
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
      ]
      for (const id of knownClinics) {
        localStorage.setItem(`vetmax_onboarding_done_${id}`, '1')
      }
    })
  } catch {
    /* localStorage indisponível antes da página carregar — ignorar */
  }
}

export async function loginViaApi(
  page: Page,
  email: string,
  password: string,
  targetPath = '/dashboard',
): Promise<void> {
  const loaded = await loadStorageState(page, email)

  if (!loaded) {
    // Fallback: login direto na página principal
    await injectFreshSession(page, email, password)
    await suppressOnboardingModal(page)
    // Após login a página está em /dashboard — navegar ao targetPath se necessário
    if (targetPath !== '/dashboard' && !page.url().includes(targetPath)) {
      await page.goto(`${BASE_URL}${targetPath}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await suppressOnboardingModal(page)
    }
    return
  }

  // Cookies carregados: navegar ao target (45s pois sob carga o dev server pode ser lento)
  await page.goto(`${BASE_URL}${targetPath}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await suppressOnboardingModal(page)

  // Se fomos redirecionados para login, os cookies estavam inválidos — fallback para UI login
  if (!page.url().includes('/dashboard')) {
    await injectFreshSession(page, email, password)
    await suppressOnboardingModal(page)
    if (targetPath !== '/dashboard' && !page.url().includes(targetPath)) {
      await page.goto(`${BASE_URL}${targetPath}`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      await suppressOnboardingModal(page)
    }
  }
}
