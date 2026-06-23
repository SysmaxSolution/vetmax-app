import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const CLINIC_ALFA = '11111111-1111-1111-1111-111111111111'
const REASONS = ['consultation', 'vaccination', 'surgery', 'exam', 'emergency', 'grooming']

/** Insere agenda colorida (junho/2026) para a tela de Agenda não ficar vazia nos criativos. */
async function enrichAgenda() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const admin = createClient(url, key, { auth: { persistSession: false } })
  const { data: pets } = await admin
    .from('patients')
    .select('id, tutor_id')
    .eq('clinic_id', CLINIC_ALFA)
    .not('tutor_id', 'is', null)
    .limit(20)
  if (!pets?.length) { console.log('[enrich] sem pets — pulando agenda'); return }
  const rows: Record<string, unknown>[] = []
  // espalha ~16 agendamentos pelos dias úteis de junho/2026, horários comerciais
  const days = [2, 3, 4, 5, 9, 10, 11, 12, 16, 17, 18, 19, 23, 24, 25, 26]
  const hours = [9, 10, 11, 14, 15, 16, 17]
  days.forEach((d, i) => {
    const pet = pets[i % pets.length]
    const h = hours[i % hours.length]
    rows.push({
      clinic_id: CLINIC_ALFA,
      pet_id: pet.id,
      tutor_id: pet.tutor_id,
      appointment_datetime: `2026-06-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00-03:00`,
      reason: REASONS[i % REASONS.length],
      status: i % 3 === 0 ? 'confirmed' : 'scheduled',
    })
  })
  const { error } = await admin.from('appointments').insert(rows)
  console.log(error ? `[enrich] erro agenda: ${error.message}` : `[enrich] ✓ ${rows.length} agendamentos`)
}

/**
 * Captura telas REAIS do SYSVETMAX (clínica-demo seedada pelo globalSetup) para
 * uso nos criativos de marketing. Login via UI (fluxo do injectFreshSession),
 * dados de demo (LGPD ok). Ciclo: globalSetup (seed) → este spec → teardown.
 */
const OUT = resolve(process.cwd(), 'Marketing/video/public/app')
mkdirSync(OUT, { recursive: true })

const EMAIL = 'admin@clinica-alfa.test'
const PASS = 'TestPassword@123'

const PAGES = [
  { slug: 'dashboard', path: '/dashboard' },
  { slug: 'cashier', path: '/dashboard/cashier' },
  { slug: 'agenda', path: '/dashboard/reception/calendar' },
  { slug: 'patients', path: '/dashboard/patients' },
  { slug: 'financial', path: '/dashboard/financial' },
  { slug: 'whatsapp', path: '/dashboard/whatsapp' },
  { slug: 'vet', path: '/dashboard/vet' },
  { slug: 'billing', path: '/dashboard/billing' },
  { slug: 'reception', path: '/dashboard/reception' },
  { slug: 'hospitalization', path: '/dashboard/hospitalization' },
]

test.use({
  storageState: { cookies: [], origins: [] }, // sessão limpa: faremos login via UI
  viewport: { width: 1680, height: 1050 },
  deviceScaleFactor: 2,
})

// Só roda sob demanda (MARKETING_CAPTURE=1) — fora da bateria E2E normal.
test.skip(process.env.MARKETING_CAPTURE !== '1', 'utilitário de captura de marketing (defina MARKETING_CAPTURE=1)')

test('captura de telas para marketing', async ({ page }) => {
  test.setTimeout(300_000)

  await enrichAgenda()

  // Login via UI
  await page.goto('/login', { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.locator('#email').waitFor({ state: 'visible', timeout: 30_000 })
  await page.fill('#email', EMAIL)
  await page.fill('#password', PASS)
  await page.getByRole('button', { name: /entrar/i }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 90_000, waitUntil: 'domcontentloaded' })
  // espera o app sair do splash (logo de carregamento some quando o shell monta)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.waitForTimeout(3500)
  // eslint-disable-next-line no-console
  console.log('[capture] login OK →', page.url())

  for (const p of PAGES) {
    try {
      await page.goto(p.path, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      // garante que não estamos no /login (sessão válida)
      await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })
      await page.waitForLoadState('networkidle').catch(() => {})
      await page.waitForTimeout(3500) // assenta skeletons/dados em dev mode
      await page.screenshot({ path: resolve(OUT, `${p.slug}.png`), fullPage: false })
      // eslint-disable-next-line no-console
      console.log(`[capture] ✓ ${p.slug}`)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`[capture] ✗ ${p.slug}: ${(e as Error).message.split('\n')[0]}`)
    }
  }
})
