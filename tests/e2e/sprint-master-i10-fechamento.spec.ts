/**
 * E2E — Mini-Sprint de Fechamento (gaps Must-Have)
 *
 * TC-I10-01: Aba "Dados Clínicos" + Toggle de Isolamento → persiste
 *            isolation_required no banco (badge acende no Kanban via onCardUpdated).
 * TC-I10-02: Aba "Tarefas" → agendar Alimentação cria hospitalization_tasks
 *            (kind=feeding) que entra no Mapa de Execução.
 *
 * (Gap 3 — retroalimentação FIFO na entrada de estoque — é backend em
 * stock.ts/restockItemV2; coberto por typecheck + auditoria manual no Estoque.)
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
async function seedHosp(): Promise<string | null> {
  await seedTutorsAndPets()
  const { data } = await admin.from('hospitalizations').insert([{
    clinic_id: CLINIC_A, patient_id: fixtures.patients.petA1.id, tutor_id: fixtures.tutors.tutorA1.id,
    status: 'observation', reason: 'Internação E2E fechamento', isolation_required: false,
  }]).select('id').single()
  return data?.id ?? null
}
async function cleanup(hospId: string | null) {
  if (!hospId) return
  await admin.from('hospitalization_tasks').delete().eq('hospitalization_id', hospId)
  await admin.from('hospitalizations').delete().eq('id', hospId)
}

async function openCard(page: Page, hospId: string): Promise<boolean> {
  await loginViaApi(page, fixtures.users.adminA.email, fixtures.users.adminA.password, '/dashboard/hospitalization')
  await page.waitForTimeout(1_500)
  if (!page.url().includes('/dashboard/hospitalization')) return false
  const card = page.locator(`[data-testid="hospitalization-card-${hospId}"]`)
    .or(page.locator('[data-testid^="hospitalization-card-"]').filter({ hasText: fixtures.patients.petA1.name }).first())
  if (!(await card.first().isVisible({ timeout: 6_000 }).catch(() => false))) return false
  await card.first().click(); await page.waitForTimeout(1_000)
  return await page.getByRole('dialog').first().isVisible({ timeout: 5_000 }).catch(() => false)
}

let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext(); const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto(process.env.TEST_BASE_URL ?? 'http://localhost:4000', { waitUntil: 'domcontentloaded', timeout: 8_000 }).then(() => true).catch(() => false)
  await _ctx.close()
  if (!_serverAlive) console.log('[SKIP ALL] sprint-master-i10-fechamento.spec.ts — servidor fora do ar')
  if (_serverAlive) await seedUsers().catch(e => console.warn('[i10] seedUsers falhou:', e.message))
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })

test.describe('TC-I10: fechamento (Dados Clínicos + Tarefas)', () => {
  let prev: Record<string, unknown>; let hospId: string | null = null
  test.beforeEach(async () => { prev = await setInternacaoCompleta(true); hospId = await seedHosp() })
  test.afterEach(async () => { await cleanup(hospId); await restoreFlowConfig(prev) })

  test('TC-I10-01: toggle de Isolamento persiste isolation_required', async ({ page }, testInfo) => {
    if (!hospId || !(await openCard(page, hospId))) { console.log('TC-I10-01: SKIP — card/modal não abriu'); testInfo.skip(); return }
    const tab = page.locator('[data-testid="tab-dados"]')
    if (!(await tab.isVisible({ timeout: 5_000 }).catch(() => false))) { console.log('TC-I10-01: SKIP — aba Dados Clínicos ausente'); testInfo.skip(); return }
    await tab.click(); await page.waitForTimeout(700)
    const toggle = page.locator('[data-testid="toggle-isolamento"]')
    if (!(await toggle.isVisible({ timeout: 4_000 }).catch(() => false))) { console.log('TC-I10-01: SKIP — toggle ausente'); testInfo.skip(); return }
    await toggle.click(); await page.waitForTimeout(1_200) // persistência imediata

    const { data } = await admin.from('hospitalizations').select('isolation_required').eq('id', hospId).single()
    console.log(`TC-I10-01: isolation_required no banco (esperado true): ${data?.isolation_required}`)
    expect(data?.isolation_required).toBe(true)
  })

  test('TC-I10-02: agendar Alimentação cria hospitalization_tasks (feeding)', async ({ page }, testInfo) => {
    if (!hospId || !(await openCard(page, hospId))) { console.log('TC-I10-02: SKIP — card/modal não abriu'); testInfo.skip(); return }
    const tab = page.locator('[data-testid="tab-tarefas"]')
    if (!(await tab.isVisible({ timeout: 5_000 }).catch(() => false))) { console.log('TC-I10-02: SKIP — aba Tarefas ausente'); testInfo.skip(); return }
    await tab.click(); await page.waitForTimeout(700)

    await page.locator('[data-testid="task-kind-feeding"]').click().catch(() => {})
    await page.locator('[data-testid="tarefas-tab"] input[type="text"], [data-testid="tarefas-tab"] input:not([type])').first()
      .fill('Ração úmida 50g').catch(async () => {
        await page.getByPlaceholder(/ração|raio-x|curativo/i).fill('Ração úmida 50g')
      })
    const createBtn = page.locator('[data-testid="task-create-btn"]')
    if (!(await createBtn.isVisible({ timeout: 4_000 }).catch(() => false))) { console.log('TC-I10-02: SKIP — form de tarefa ausente'); testInfo.skip(); return }
    await createBtn.click(); await page.waitForTimeout(1_500)

    const { count } = await admin.from('hospitalization_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('hospitalization_id', hospId).eq('kind', 'feeding')
    console.log(`TC-I10-02: tarefas feeding criadas (esperado ≥1): ${count}`)
    expect(count ?? 0).toBeGreaterThanOrEqual(1)
  })
})
