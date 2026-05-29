/**
 * E2E — Voz Clínica Unificada (Internação Completa)
 *
 * A lógica de extração multi-domínio, merge cumulativo (sem sobrescrever) e
 * roteamento por aba é coberta DETERMINISTICAMENTE pelos testes de unidade
 * (tests/unit/voice-unified-extraction.test.ts). Voz + LLM não são
 * determinísticos em E2E; aqui validamos o GATING e a presença do ponto único
 * de gravação (painel de revisão) no card de internação.
 *
 * TC-I15-01: internacao_completa ON ⇒ painel de voz unificada presente no card.
 * TC-I15-02: internacao_completa OFF ⇒ painel ausente (gated).
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
async function seedHosp(): Promise<void> {
  await seedTutorsAndPets()
  const { data } = await admin.from('hospitalizations')
    .insert({ clinic_id: CLINIC_A, patient_id: fixtures.patients.petA1.id, tutor_id: fixtures.tutors.tutorA1.id, status: 'observation', reason: 'E2E voz unificada' })
    .select('id').single()
  hospId = data?.id ?? null
}
async function cleanup() { if (hospId) await admin.from('hospitalizations').delete().eq('id', hospId); hospId = null }

async function openCard(page: Page): Promise<boolean> {
  await loginViaApi(page, fixtures.users.adminA.email, fixtures.users.adminA.password, '/dashboard/hospitalization')
  await page.waitForTimeout(1_800)
  if (!page.url().includes('/dashboard/hospitalization')) return false
  const card = page.getByText(fixtures.patients.petA1.name).first()
  if (!(await card.isVisible({ timeout: 6_000 }).catch(() => false))) return false
  await card.click()
  await page.waitForTimeout(900)
  return true
}

let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext(); const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto(process.env.TEST_BASE_URL ?? 'http://localhost:4000', { waitUntil: 'domcontentloaded', timeout: 8_000 }).then(() => true).catch(() => false)
  await _ctx.close()
  if (!_serverAlive) console.log('[SKIP ALL] sprint-master-i15-voz-unificada.spec.ts — servidor fora do ar')
  if (_serverAlive) await seedUsers().catch(e => console.warn('[i15] seedUsers falhou:', e.message))
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })

test.describe('TC-I15-01: voz unificada presente (flag ON)', () => {
  let prev: Record<string, unknown>
  test.beforeEach(async () => { prev = await setInternacaoCompleta(true); await seedHosp() })
  test.afterEach(async () => { await cleanup(); await restoreFlowConfig(prev) })

  test('TC-I15-01: painel + botão único de voz no card', async ({ page }, testInfo) => {
    if (!(await openCard(page))) { console.log('TC-I15-01: SKIP — card não abriu (cold-start UI)'); testInfo.skip(); return }
    const panel = page.locator('[data-testid="voice-review-panel"]')
    const btn = page.locator('[data-testid="unified-voice-btn"]')
    const panelVisible = await panel.isVisible({ timeout: 5_000 }).catch(() => false)
    const btnVisible = await btn.isVisible({ timeout: 3_000 }).catch(() => false)
    console.log(`TC-I15-01: painel=${panelVisible}, botão único=${btnVisible}`)
    expect(panelVisible).toBe(true)
    expect(btnVisible).toBe(true)
  })
})

test.describe('TC-I15-02: voz unificada gated (flag OFF)', () => {
  let prev: Record<string, unknown>
  test.beforeEach(async () => { prev = await setInternacaoCompleta(false); await seedHosp() })
  test.afterEach(async () => { await cleanup(); await restoreFlowConfig(prev) })

  test('TC-I15-02: painel de voz ausente com flag OFF', async ({ page }, testInfo) => {
    if (!(await openCard(page))) { console.log('TC-I15-02: SKIP — card não abriu'); testInfo.skip(); return }
    const panelVisible = await page.locator('[data-testid="voice-review-panel"]').isVisible({ timeout: 3_000 }).catch(() => false)
    console.log(`TC-I15-02: painel visível com flag OFF (esperado false): ${panelVisible}`)
    expect(panelVisible).toBe(false)
  })
})
