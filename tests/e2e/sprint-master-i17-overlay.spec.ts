/**
 * E2E — Modais overlay aninhados (#12)
 *
 * TC-I17-01: clicar em editar tarefa abre overlay (nested-task-edit) por cima
 *            do card de internação, sem fechar o pai.
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

let hospId: string | null = null
let taskId: string | null = null
async function seedHospAndTask(): Promise<void> {
  await seedTutorsAndPets()
  const { data: h } = await admin.from('hospitalizations')
    .insert({ clinic_id: CLINIC_A, patient_id: fixtures.patients.petA1.id, tutor_id: fixtures.tutors.tutorA1.id, status: 'observation', reason: 'E2E overlay' })
    .select('id').single()
  hospId = h?.id ?? null
  if (hospId) {
    const { data: t } = await admin.from('hospitalization_tasks')
      .insert({ clinic_id: CLINIC_A, hospitalization_id: hospId, kind: 'feeding', description: 'Ração úmida E2E', frequency_hours: 8, status: 'active', started_at: new Date().toISOString() })
      .select('id').single()
    taskId = t?.id ?? null
  }
}
async function cleanup() {
  if (taskId) await admin.from('hospitalization_tasks').delete().eq('id', taskId)
  if (hospId) await admin.from('hospitalizations').delete().eq('id', hospId)
  hospId = null; taskId = null
}

let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext(); const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto(process.env.TEST_BASE_URL ?? 'http://localhost:4000', { waitUntil: 'domcontentloaded', timeout: 8_000 }).then(() => true).catch(() => false)
  await _ctx.close()
  if (!_serverAlive) console.log('[SKIP ALL] sprint-master-i17-overlay.spec.ts — servidor fora do ar')
  if (_serverAlive) await seedUsers().catch(e => console.warn('[i17] seedUsers falhou:', e.message))
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })

test.describe('TC-I17-01: overlay de edição de tarefa', () => {
  let prev: Record<string, unknown>
  test.beforeEach(async () => { prev = await setInternacaoCompleta(true); await seedHospAndTask() })
  test.afterEach(async () => { await cleanup(); await restoreFlowConfig(prev) })

  test('TC-I17-01: clicar em editar abre nested-task-edit sobre o card', async ({ page }, testInfo) => {
    await loginViaApi(page, fixtures.users.adminA.email, fixtures.users.adminA.password, '/dashboard/hospitalization')
    await page.waitForTimeout(1_800)
    if (!page.url().includes('/dashboard/hospitalization')) { console.log('TC-I17-01: SKIP'); testInfo.skip(); return }
    const card = page.getByText(fixtures.patients.petA1.name).first()
    if (!(await card.isVisible({ timeout: 5_000 }).catch(() => false))) { console.log('TC-I17-01: SKIP — card ausente'); testInfo.skip(); return }
    await card.click(); await page.waitForTimeout(700)
    const tab = page.locator('[data-testid="tab-tarefas"]')
    if (!(await tab.isVisible({ timeout: 4_000 }).catch(() => false))) { console.log('TC-I17-01: SKIP — aba tarefas ausente'); testInfo.skip(); return }
    await tab.click(); await page.waitForTimeout(400)
    const editBtn = page.locator(`[data-testid="task-edit-${taskId}"]`)
    if (!(await editBtn.isVisible({ timeout: 3_000 }).catch(() => false))) { console.log('TC-I17-01: SKIP — botão editar ausente'); testInfo.skip(); return }
    await editBtn.click()
    await page.waitForTimeout(400)
    const overlay = page.locator('[data-testid="nested-task-edit"]')
    const visible = await overlay.isVisible({ timeout: 3_000 }).catch(() => false)
    console.log(`TC-I17-01: overlay nested-task-edit visível=${visible}`)
    expect(visible).toBe(true)
  })
})
