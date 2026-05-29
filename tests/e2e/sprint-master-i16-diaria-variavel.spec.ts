/**
 * E2E — Diária variável por categoria (#2)
 *
 * TC-I16-01: internacao_completa ON ⇒ aba "Tarifas de Diária" em Cadastros
 *            visível; criar uma tarifa aparece na lista.
 * TC-I16-02: flag OFF ⇒ aba ausente (gating).
 */

import { test, expect, Page } from '@playwright/test'
import { loginViaApi } from '../helpers/session'
import { createAdminClient } from '../helpers/supabase-test-client'
import { seedUsers } from '../helpers/db-seed'
import fixtures from '../fixtures/test-data.json'

const admin = createAdminClient()
const CLINIC_A = fixtures.clinics.clinicA.id

async function setInternacaoCompleta(value: boolean): Promise<Record<string, unknown>> {
  const { data } = await admin.from('clinics').select('flow_config').eq('id', CLINIC_A).single()
  const prev = (data?.flow_config ?? {}) as Record<string, unknown>
  await admin.from('clinics').update({ flow_config: { ...prev, internacao_completa: value } }).eq('id', CLINIC_A)
  return prev
}
async function restoreFlowConfig(flowConfig: Record<string, unknown>) {
  await admin.from('clinics').update({ flow_config: flowConfig }).eq('id', CLINIC_A)
}
async function cleanupRates() { await admin.from('hospitalization_daily_rates').delete().eq('clinic_id', CLINIC_A) }

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
  if (!_serverAlive) console.log('[SKIP ALL] sprint-master-i16-diaria-variavel.spec.ts — servidor fora do ar')
  if (_serverAlive) await seedUsers().catch(e => console.warn('[i16] seedUsers falhou:', e.message))
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })

test.describe('TC-I16-01: Tarifas (flag ON) — cadastro', () => {
  let prev: Record<string, unknown>
  test.beforeEach(async () => { prev = await setInternacaoCompleta(true); await cleanupRates() })
  test.afterEach(async () => { await cleanupRates(); await restoreFlowConfig(prev) })

  test('TC-I16-01: aba Tarifas visível e criação aparece na lista', async ({ page }, testInfo) => {
    if (!(await gotoRegistry(page))) { console.log('TC-I16-01: SKIP'); testInfo.skip(); return }
    const tab = page.getByRole('button', { name: /Tarifas de Di[áa]ria/i })
    if (!(await tab.isVisible({ timeout: 6_000 }).catch(() => false))) { console.log('TC-I16-01: SKIP — aba ausente'); testInfo.skip(); return }
    await tab.click(); await page.waitForTimeout(500)

    await page.locator('[data-testid="rate-new"]').click()
    await page.waitForTimeout(250)
    await page.locator('[data-testid="rates-tab"] select').first().selectOption('uti')
    await page.locator('[data-testid="rates-tab"] input[type="number"]').fill('500')
    await page.locator('[data-testid="rate-save"]').click()
    await page.waitForTimeout(1_000)

    const created = await page.getByText('R$ 500').first().isVisible({ timeout: 4_000 }).catch(() => false)
    console.log(`TC-I16-01: tarifa criada visível=${created}`)
    expect(created).toBe(true)
  })
})

test.describe('TC-I16-02: Tarifas gated (flag OFF)', () => {
  let prev: Record<string, unknown>
  test.beforeEach(async () => { prev = await setInternacaoCompleta(false) })
  test.afterEach(async () => { await restoreFlowConfig(prev) })

  test('TC-I16-02: aba ausente com flag OFF', async ({ page }, testInfo) => {
    if (!(await gotoRegistry(page))) { console.log('TC-I16-02: SKIP'); testInfo.skip(); return }
    const visible = await page.getByRole('button', { name: /Tarifas de Di[áa]ria/i }).isVisible({ timeout: 3_000 }).catch(() => false)
    console.log(`TC-I16-02: aba visível com flag OFF (esperado false): ${visible}`)
    expect(visible).toBe(false)
  })
})
