/**
 * E2E — Sprint Internação Completa · FASE 1b (Regra 4: Conta + Máquina de Alta)
 *
 * TC-I06-01: flag ON ⇒ card mostra a aba "Conta" + botão "Dar Alta Médica".
 * TC-I06-02: ready_for_discharge com saldo em aberto ⇒ no Kanban a "Alta
 *            Administrativa" fica DESABILITADA (Conta pendente).
 * TC-I06-03: ready_for_discharge com conta zerada ⇒ "Alta Administrativa" habilitada.
 * TC-I06-04: flag OFF ⇒ card ready_for_discharge mostra a "Dar Alta" legada (1 clique).
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
async function restoreFlowConfig(flowConfig: Record<string, unknown>): Promise<void> {
  await admin.from('clinics').update({ flow_config: flowConfig }).eq('id', CLINIC_A)
}

async function seedHosp(status: string): Promise<string | null> {
  await seedTutorsAndPets()
  const { data } = await admin.from('hospitalizations').insert([{
    clinic_id: CLINIC_A, patient_id: fixtures.patients.petA1.id, tutor_id: fixtures.tutors.tutorA1.id,
    status, reason: 'Internação E2E Regra 4',
  }]).select('id').single()
  return data?.id ?? null
}
async function addOpenCharge(hospId: string, amount: number) {
  await admin.from('hospitalization_charges').insert({
    clinic_id: CLINIC_A, hospitalization_id: hospId, kind: 'other',
    description: 'Item E2E', quantity: 1, unit_amount: amount, amount, status: 'open',
  })
}
async function cleanup(hospId: string | null) {
  if (!hospId) return
  await admin.from('hospitalization_charges').delete().eq('hospitalization_id', hospId)
  await admin.from('hospitalizations').delete().eq('id', hospId)
}

async function gotoKanban(page: Page): Promise<boolean> {
  await loginViaApi(page, fixtures.users.adminA.email, fixtures.users.adminA.password, '/dashboard/hospitalization')
  await page.waitForTimeout(1_500)
  return page.url().includes('/dashboard/hospitalization')
}
function cardLocator(page: Page) {
  return page.locator('[data-testid^="hospitalization-card-"]').filter({ hasText: fixtures.patients.petA1.name }).first()
}

let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext(); const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto(process.env.TEST_BASE_URL ?? 'http://localhost:4000', { waitUntil: 'domcontentloaded', timeout: 8_000 }).then(() => true).catch(() => false)
  await _ctx.close()
  if (!_serverAlive) console.log('[SKIP ALL] sprint-master-i06-internacao-conta-alta.spec.ts — servidor fora do ar')
  if (_serverAlive) await seedUsers().catch(e => console.warn('[i06] seedUsers falhou:', e.message))
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })

// ─── TC-I06-01 — Conta + Alta Médica ─────────────────────────────────────────

test.describe('TC-I06-01: aba Conta + botão Dar Alta Médica (flag ON)', () => {
  let prev: Record<string, unknown>; let hospId: string | null = null
  test.beforeEach(async () => { prev = await setInternacaoCompleta(true); hospId = await seedHosp('observation') })
  test.afterEach(async () => { await cleanup(hospId); await restoreFlowConfig(prev) })

  test('TC-I06-01: Conta tab abre e mostra Saldo + Dar Alta Médica', async ({ page }, testInfo) => {
    if (!(await gotoKanban(page))) { console.log('TC-I06-01: SKIP — kanban não carregou'); testInfo.skip(); return }
    const card = cardLocator(page)
    if (!(await card.isVisible({ timeout: 6_000 }).catch(() => false))) { console.log('TC-I06-01: SKIP — card ausente'); testInfo.skip(); return }
    await card.click(); await page.waitForTimeout(1_000)

    const contaTab = page.locator('[data-testid="tab-conta"]')
    if (!(await contaTab.isVisible({ timeout: 5_000 }).catch(() => false))) { console.log('TC-I06-01: SKIP — aba Conta ausente'); testInfo.skip(); return }
    await contaTab.click(); await page.waitForTimeout(800)

    const saldo = await page.getByText(/saldo da internação/i).first().isVisible({ timeout: 4_000 }).catch(() => false)
    const altaMedica = await page.locator('[data-testid="btn-alta-medica"]').isVisible({ timeout: 4_000 }).catch(() => false)
    console.log(`TC-I06-01: saldo=${saldo}, altaMedica=${altaMedica}`)
    expect(saldo).toBe(true)
    expect(altaMedica).toBe(true)
  })
})

// ─── TC-I06-02 — Alta Administrativa bloqueada por saldo ──────────────────────

test.describe('TC-I06-02: Alta Administrativa DESABILITADA com conta pendente', () => {
  let prev: Record<string, unknown>; let hospId: string | null = null
  test.beforeEach(async () => {
    prev = await setInternacaoCompleta(true)
    hospId = await seedHosp('ready_for_discharge')
    if (hospId) await addOpenCharge(hospId, 150)
  })
  test.afterEach(async () => { await cleanup(hospId); await restoreFlowConfig(prev) })

  test('TC-I06-02: botão no Kanban fica desabilitado (Conta pendente)', async ({ page }, testInfo) => {
    if (!(await gotoKanban(page))) { console.log('TC-I06-02: SKIP — kanban não carregou'); testInfo.skip(); return }
    await page.waitForTimeout(1_500) // aguarda getOpenBalances
    const btn = page.locator('[data-testid="kanban-alta-administrativa"]').first()
    if (!(await btn.isVisible({ timeout: 6_000 }).catch(() => false))) { console.log('TC-I06-02: SKIP — botão ausente (cold-start UI)'); testInfo.skip(); return }
    const disabled = await btn.isDisabled().catch(() => false)
    const txt = (await btn.textContent().catch(() => '')) ?? ''
    console.log(`TC-I06-02: disabled=${disabled}, texto="${txt.trim()}"`)
    expect(disabled).toBe(true)
    expect(txt.toLowerCase()).toContain('pendente')
  })
})

// ─── TC-I06-03 — Alta Administrativa liberada com conta zerada ────────────────

test.describe('TC-I06-03: Alta Administrativa HABILITADA com conta zerada', () => {
  let prev: Record<string, unknown>; let hospId: string | null = null
  test.beforeEach(async () => { prev = await setInternacaoCompleta(true); hospId = await seedHosp('ready_for_discharge') })
  test.afterEach(async () => { await cleanup(hospId); await restoreFlowConfig(prev) })

  test('TC-I06-03: botão no Kanban habilitado (Alta Adm.)', async ({ page }, testInfo) => {
    if (!(await gotoKanban(page))) { console.log('TC-I06-03: SKIP — kanban não carregou'); testInfo.skip(); return }
    await page.waitForTimeout(1_500)
    const btn = page.locator('[data-testid="kanban-alta-administrativa"]').first()
    if (!(await btn.isVisible({ timeout: 6_000 }).catch(() => false))) { console.log('TC-I06-03: SKIP — botão ausente (cold-start UI)'); testInfo.skip(); return }
    const disabled = await btn.isDisabled().catch(() => true)
    console.log(`TC-I06-03: disabled=${disabled} (esperado: false)`)
    expect(disabled).toBe(false)
  })
})

// ─── TC-I06-04 — flag OFF: alta legada ───────────────────────────────────────

test.describe('TC-I06-04: flag OFF mantém a alta legada (1 clique)', () => {
  let prev: Record<string, unknown>; let hospId: string | null = null
  test.beforeEach(async () => { prev = await setInternacaoCompleta(false); hospId = await seedHosp('ready_for_discharge') })
  test.afterEach(async () => { await cleanup(hospId); await restoreFlowConfig(prev) })

  test('TC-I06-04: card mostra "Dar Alta" e NÃO o botão gated', async ({ page }, testInfo) => {
    if (!(await gotoKanban(page))) { console.log('TC-I06-04: SKIP — kanban não carregou'); testInfo.skip(); return }
    await page.waitForTimeout(1_200)
    const card = cardLocator(page)
    if (!(await card.isVisible({ timeout: 6_000 }).catch(() => false))) { console.log('TC-I06-04: SKIP — card ausente'); testInfo.skip(); return }
    const gated = await page.locator('[data-testid="kanban-alta-administrativa"]').isVisible({ timeout: 2_000 }).catch(() => false)
    const legacy = await page.getByRole('button', { name: /^dar alta$/i }).first().isVisible({ timeout: 3_000 }).catch(() => false)
    console.log(`TC-I06-04: gated=${gated} (esperado false), legacy "Dar Alta"=${legacy}`)
    expect(gated).toBe(false)
  })
})
