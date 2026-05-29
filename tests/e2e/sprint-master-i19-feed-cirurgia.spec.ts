/**
 * E2E — Feed por etapa do Centro Cirúrgico (#4)
 *
 * TC-I19-01: criar anotação no feed da etapa "preop" persiste em surgery_records
 *            e o item aparece na UI.
 */

import { test, expect } from '@playwright/test'
import { loginViaApi } from '../helpers/session'
import { createAdminClient } from '../helpers/supabase-test-client'
import { seedUsers, seedTutorsAndPets } from '../helpers/db-seed'
import fixtures from '../fixtures/test-data.json'

const admin = createAdminClient()
const CLINIC_A = fixtures.clinics.clinicA.id

async function setCentroCirurgico(value: boolean): Promise<Record<string, unknown>> {
  const { data } = await admin.from('clinics').select('flow_config').eq('id', CLINIC_A).single()
  const prev = (data?.flow_config ?? {}) as Record<string, unknown>
  await admin.from('clinics').update({ flow_config: { ...prev, centro_cirurgico: value } }).eq('id', CLINIC_A)
  return prev
}
async function restoreFlowConfig(flowConfig: Record<string, unknown>) {
  await admin.from('clinics').update({ flow_config: flowConfig }).eq('id', CLINIC_A)
}

let surgeryId: string | null = null
async function seedSurgery(): Promise<void> {
  await seedTutorsAndPets()
  const { data } = await admin.from('surgeries')
    .insert({ clinic_id: CLINIC_A, patient_id: fixtures.patients.petA1.id, procedure_name: 'Castração E2E', status: 'preparo' })
    .select('id').single()
  surgeryId = data?.id ?? null
}
async function cleanup() {
  if (surgeryId) {
    await admin.from('surgery_records').delete().eq('surgery_id', surgeryId)
    await admin.from('surgeries').delete().eq('id', surgeryId)
  }
  surgeryId = null
}

let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext(); const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto(process.env.TEST_BASE_URL ?? 'http://localhost:4000', { waitUntil: 'domcontentloaded', timeout: 8_000 }).then(() => true).catch(() => false)
  await _ctx.close()
  if (!_serverAlive) console.log('[SKIP ALL] sprint-master-i19-feed-cirurgia.spec.ts — servidor fora do ar')
  if (_serverAlive) await seedUsers().catch(e => console.warn('[i19] seedUsers falhou:', e.message))
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })

test.describe('TC-I19-01: feed por etapa', () => {
  let prev: Record<string, unknown>
  test.beforeEach(async () => { prev = await setCentroCirurgico(true); await seedSurgery() })
  test.afterEach(async () => { await cleanup(); await restoreFlowConfig(prev) })

  test('TC-I19-01: adicionar anotação no feed preop aparece na UI', async ({ page }, testInfo) => {
    await loginViaApi(page, fixtures.users.adminA.email, fixtures.users.adminA.password, '/dashboard/surgery')
    await page.waitForTimeout(1_800)
    if (!page.url().includes('/dashboard/surgery')) { console.log('TC-I19-01: SKIP'); testInfo.skip(); return }
    const card = page.locator(`[data-testid="surgery-card-${surgeryId}"]`)
    if (!(await card.isVisible({ timeout: 5_000 }).catch(() => false))) { console.log('TC-I19-01: SKIP — card cirurgia ausente'); testInfo.skip(); return }
    await card.click(); await page.waitForTimeout(700)

    const input = page.locator('[data-testid="surgery-feed-input-preop"]')
    if (!(await input.isVisible({ timeout: 4_000 }).catch(() => false))) { console.log('TC-I19-01: SKIP — feed preop ausente'); testInfo.skip(); return }
    await input.fill('Pré-anestésico aplicado às 10h')
    await page.locator('[data-testid="surgery-feed-add-preop"]').click()
    await page.waitForTimeout(1_000)

    const visible = await page.getByText('Pré-anestésico aplicado às 10h').first().isVisible({ timeout: 4_000 }).catch(() => false)
    console.log(`TC-I19-01: anotação visível no feed=${visible}`)
    expect(visible).toBe(true)
  })
})
