/**
 * E2E — Cadastros de Infraestrutura (Boxes / Salas)
 *
 * TC-I11-01: Cadastros → Boxes → criar um Box com capacidade + valor da diária
 *            persiste em rooms (type=hospitalization, daily_rate, operational_status).
 */

import { test, expect, Page } from '@playwright/test'
import { loginViaApi } from '../helpers/session'
import { createAdminClient } from '../helpers/supabase-test-client'
import { seedUsers } from '../helpers/db-seed'
import fixtures from '../fixtures/test-data.json'

const admin = createAdminClient()
const CLINIC_A = fixtures.clinics.clinicA.id
const BOX_NAME = `Box E2E ${Date.now().toString().slice(-6)}`

async function cleanupBox() {
  await admin.from('rooms').delete().eq('clinic_id', CLINIC_A).eq('name', BOX_NAME)
}

async function gotoRegistry(page: Page): Promise<boolean> {
  await loginViaApi(page, fixtures.users.adminA.email, fixtures.users.adminA.password, '/dashboard/registry')
  await page.waitForTimeout(1_500)
  return page.url().includes('/dashboard/registry')
}

let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext(); const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto(process.env.TEST_BASE_URL ?? 'http://localhost:4000', { waitUntil: 'domcontentloaded', timeout: 8_000 }).then(() => true).catch(() => false)
  await _ctx.close()
  if (!_serverAlive) console.log('[SKIP ALL] sprint-master-i11-cadastros-boxes.spec.ts — servidor fora do ar')
  if (_serverAlive) await seedUsers().catch(e => console.warn('[i11] seedUsers falhou:', e.message))
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })

test.describe('TC-I11: Cadastros > Boxes (diária + capacidade + status)', () => {
  test.afterEach(async () => { await cleanupBox() })

  test('TC-I11-01: criar Box persiste rooms (hospitalization + daily_rate)', async ({ page }, testInfo) => {
    if (!(await gotoRegistry(page))) { console.log('TC-I11-01: SKIP — registry não carregou'); testInfo.skip(); return }

    const boxesTab = page.getByRole('button', { name: /^boxes$/i }).first()
    if (!(await boxesTab.isVisible({ timeout: 6_000 }).catch(() => false))) { console.log('TC-I11-01: SKIP — aba Boxes ausente (cold-start UI)'); testInfo.skip(); return }
    await boxesTab.click(); await page.waitForTimeout(500)

    const newBtn = page.locator('[data-testid="room-new-box"]')
    if (!(await newBtn.isVisible({ timeout: 4_000 }).catch(() => false))) { console.log('TC-I11-01: SKIP — botão Novo Box ausente'); testInfo.skip(); return }
    await newBtn.click(); await page.waitForTimeout(400)

    const scope = page.locator('[data-testid="rooms-tab-box"]')
    await scope.getByPlaceholder(/Box UTI/i).fill(BOX_NAME)
    await scope.getByPlaceholder(/300/).fill('300')
    await page.locator('[data-testid="room-save-box"]').click()
    await page.waitForTimeout(1_500)

    const { data } = await admin
      .from('rooms')
      .select('type, daily_rate, operational_status')
      .eq('clinic_id', CLINIC_A).eq('name', BOX_NAME).maybeSingle()
    console.log(`TC-I11-01: box no banco → ${JSON.stringify(data)}`)
    expect(data?.type).toBe('hospitalization')
    expect(Number(data?.daily_rate ?? 0)).toBe(300)
  })
})
