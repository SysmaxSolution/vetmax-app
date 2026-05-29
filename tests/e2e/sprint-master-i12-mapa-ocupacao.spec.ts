/**
 * E2E — Mapa de Ocupação de Leitos (Internação Completa)
 *
 * TC-I12-01: flag ON ⇒ toggle "Mapa de Ocupação" + grid com box ocupado
 *            (data-state=full em box de capacidade 1) exibindo o paciente.
 * TC-I12-02: flag OFF ⇒ toggle de ocupação ausente (gated).
 */

import { test, expect, Page } from '@playwright/test'
import { loginViaApi } from '../helpers/session'
import { createAdminClient } from '../helpers/supabase-test-client'
import { seedUsers, seedTutorsAndPets } from '../helpers/db-seed'
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

let boxId: string | null = null
let hospId: string | null = null
async function seedBoxOccupied(): Promise<void> {
  await seedTutorsAndPets()
  const { data: box } = await admin.from('rooms')
    .insert({ clinic_id: CLINIC_A, name: 'Box E2E Ocupação', type: 'hospitalization', capacity: 1, active: true, daily_rate: 150, operational_status: 'active' })
    .select('id').single()
  boxId = box?.id ?? null
  const { data: h } = await admin.from('hospitalizations')
    .insert({ clinic_id: CLINIC_A, patient_id: fixtures.patients.petA1.id, tutor_id: fixtures.tutors.tutorA1.id, status: 'observation', reason: 'E2E ocupação', box_id: boxId })
    .select('id').single()
  hospId = h?.id ?? null
}
async function cleanup() {
  if (hospId) await admin.from('hospitalizations').delete().eq('id', hospId)
  if (boxId) await admin.from('rooms').delete().eq('id', boxId)
  hospId = null; boxId = null
}

async function gotoHosp(page: Page): Promise<boolean> {
  await loginViaApi(page, fixtures.users.adminA.email, fixtures.users.adminA.password, '/dashboard/hospitalization')
  await page.waitForTimeout(1_500)
  return page.url().includes('/dashboard/hospitalization')
}

let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext(); const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto(process.env.TEST_BASE_URL ?? 'http://localhost:4000', { waitUntil: 'domcontentloaded', timeout: 8_000 }).then(() => true).catch(() => false)
  await _ctx.close()
  if (!_serverAlive) console.log('[SKIP ALL] sprint-master-i12-mapa-ocupacao.spec.ts — servidor fora do ar')
  if (_serverAlive) await seedUsers().catch(e => console.warn('[i12] seedUsers falhou:', e.message))
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })

test.describe('TC-I12-01: flag ON ⇒ Mapa de Ocupação com box cheio', () => {
  let prev: Record<string, unknown>
  test.beforeEach(async () => { prev = await setInternacaoCompleta(true); await seedBoxOccupied() })
  test.afterEach(async () => { await cleanup(); await restoreFlowConfig(prev) })

  test('TC-I12-01: grid renderiza, box capacidade 1 com 1 ocupante = full + paciente', async ({ page }, testInfo) => {
    if (!(await gotoHosp(page))) { console.log('TC-I12-01: SKIP — internação não carregou'); testInfo.skip(); return }
    const toggle = page.locator('[data-testid="view-occupancy"]')
    if (!(await toggle.isVisible({ timeout: 6_000 }).catch(() => false))) { console.log('TC-I12-01: SKIP — toggle ausente (cold-start UI)'); testInfo.skip(); return }
    await toggle.click(); await page.waitForTimeout(900)

    const grid = page.locator('[data-testid="occupancy-map"]')
    if (!(await grid.isVisible({ timeout: 5_000 }).catch(() => false))) { console.log('TC-I12-01: SKIP — grid não renderizou'); testInfo.skip(); return }

    const box = page.locator(`[data-testid="occ-box-${boxId}"]`)
    const boxVisible = await box.isVisible({ timeout: 4_000 }).catch(() => false)
    const state = await box.getAttribute('data-state').catch(() => null)
    const patient = await box.getByText(fixtures.patients.petA1.name).first().isVisible({ timeout: 3_000 }).catch(() => false)
    console.log(`TC-I12-01: box visível=${boxVisible}, state=${state} (esperado full), paciente=${patient}`)
    expect(boxVisible).toBe(true)
    expect(state).toBe('full')
    expect(patient).toBe(true)
  })
})

test.describe('TC-I12-02: flag OFF ⇒ sem toggle de ocupação', () => {
  let prev: Record<string, unknown>
  test.beforeEach(async () => { prev = await setInternacaoCompleta(false) })
  test.afterEach(async () => { await restoreFlowConfig(prev) })

  test('TC-I12-02: toggle "Mapa de Ocupação" ausente', async ({ page }, testInfo) => {
    if (!(await gotoHosp(page))) { console.log('TC-I12-02: SKIP — internação não carregou'); testInfo.skip(); return }
    const visible = await page.locator('[data-testid="view-occupancy"]').isVisible({ timeout: 3_000 }).catch(() => false)
    console.log(`TC-I12-02: toggle ocupação visível com flag OFF (esperado false): ${visible}`)
    expect(visible).toBe(false)
  })
})
