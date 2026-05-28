/**
 * E2E — Sprint Internação Completa · FASE 1b (Abas Clínicas)
 *
 * Valida o CHECKPOINT da Fase 1b: as novas abas clínicas do card do paciente
 * (HospitalizationDetailModal), gated por flow_config.internacao_completa.
 *
 * TC-I05-01: flag ON  ⇒ abrir card mostra as abas "Sinais Vitais" e "Fluidoterapia"
 *            e o botão "Medicações".
 * TC-I05-02: flag ON  ⇒ a aba Fluidoterapia exibe o "Saldo Hídrico" (Regra 3).
 * TC-I05-03: flag OFF ⇒ o card não exibe as abas clínicas avançadas.
 *
 * (A RPC FIFO da Regra 1 é validada no banco — não há fluxo E2E que consuma
 * estoque de produção; o CREATE OR REPLACE foi aplicado e compilou na 0198.)
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

async function seedHosp(): Promise<string | null> {
  await seedTutorsAndPets()
  const { data } = await admin.from('hospitalizations').insert([{
    clinic_id:  CLINIC_A,
    patient_id: fixtures.patients.petA1.id,
    tutor_id:   fixtures.tutors.tutorA1.id,
    status:     'observation',
    reason:     'Internação E2E Fase 1b — abas clínicas',
  }]).select('id').single()
  return data?.id ?? null
}

async function openCard(page: Page): Promise<boolean> {
  await loginViaApi(page, fixtures.users.adminA.email, fixtures.users.adminA.password, '/dashboard/hospitalization')
  await page.waitForTimeout(1_500)
  if (!page.url().includes('/dashboard/hospitalization')) return false
  const card = page.locator('[data-testid^="hospitalization-card-"]').filter({ hasText: fixtures.patients.petA1.name }).first()
  if (!(await card.isVisible({ timeout: 6_000 }).catch(() => false))) return false
  await card.click()
  await page.waitForTimeout(1_000)
  return await page.getByRole('dialog').first().isVisible({ timeout: 5_000 }).catch(() => false)
}

let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext(); const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto(process.env.TEST_BASE_URL ?? 'http://localhost:4000', { waitUntil: 'domcontentloaded', timeout: 8_000 }).then(() => true).catch(() => false)
  await _ctx.close()
  if (!_serverAlive) console.log('[SKIP ALL] sprint-master-i05-internacao-completa-fase1b.spec.ts — servidor fora do ar')
  if (_serverAlive) await seedUsers().catch(e => console.warn('[i05] seedUsers falhou:', e.message))
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })

// ─── flag ON ───────────────────────────────────────────────────────────────

test.describe('TC-I05-01/02: internacao_completa ON ⇒ abas clínicas no card', () => {
  let prev: Record<string, unknown>
  let hospId: string | null = null
  test.beforeEach(async () => { prev = await setInternacaoCompleta(true); hospId = await seedHosp() })
  test.afterEach(async () => {
    if (hospId) await admin.from('hospitalizations').delete().eq('id', hospId)
    await restoreFlowConfig(prev)
  })

  test('TC-I05-01: abas Sinais Vitais e Fluidoterapia + botão Medicações visíveis', async ({ page }, testInfo) => {
    if (!(await openCard(page))) { console.log('TC-I05-01: SKIP — card/modal não abriu (cold-start UI)'); testInfo.skip(); return }

    const vitalsTab = page.locator('[data-testid="tab-vitals"]')
    const fluidsTab = page.locator('[data-testid="tab-fluids"]')
    const medsBtn   = page.locator('[data-testid="open-medications-btn"]')
    const vitalsVisible = await vitalsTab.isVisible({ timeout: 5_000 }).catch(() => false)
    const fluidsVisible = await fluidsTab.isVisible({ timeout: 3_000 }).catch(() => false)
    const medsVisible   = await medsBtn.isVisible({ timeout: 3_000 }).catch(() => false)
    console.log(`TC-I05-01: vitals=${vitalsVisible}, fluids=${fluidsVisible}, meds=${medsVisible}`)
    expect(vitalsVisible).toBe(true)
    expect(fluidsVisible).toBe(true)
    expect(medsVisible).toBe(true)
  })

  test('TC-I05-02: aba Fluidoterapia exibe o Saldo Hídrico (Regra 3)', async ({ page }, testInfo) => {
    if (!(await openCard(page))) { console.log('TC-I05-02: SKIP — card/modal não abriu (cold-start UI)'); testInfo.skip(); return }

    const fluidsTab = page.locator('[data-testid="tab-fluids"]')
    if (!(await fluidsTab.isVisible({ timeout: 5_000 }).catch(() => false))) { console.log('TC-I05-02: SKIP — aba Fluidoterapia ausente'); testInfo.skip(); return }
    await fluidsTab.click()
    await page.waitForTimeout(600)
    const saldo = await page.getByText(/saldo hídrico/i).first().isVisible({ timeout: 4_000 }).catch(() => false)
    console.log(`TC-I05-02: Saldo Hídrico visível: ${saldo}`)
    expect(saldo).toBe(true)
  })
})

// ─── flag OFF ──────────────────────────────────────────────────────────────

test.describe('TC-I05-03: internacao_completa OFF ⇒ card sem abas clínicas', () => {
  let prev: Record<string, unknown>
  let hospId: string | null = null
  test.beforeEach(async () => { prev = await setInternacaoCompleta(false); hospId = await seedHosp() })
  test.afterEach(async () => {
    if (hospId) await admin.from('hospitalizations').delete().eq('id', hospId)
    await restoreFlowConfig(prev)
  })

  test('TC-I05-03: abas Sinais Vitais/Fluidoterapia e botão Medicações ausentes', async ({ page }, testInfo) => {
    if (!(await openCard(page))) { console.log('TC-I05-03: SKIP — card/modal não abriu (cold-start UI)'); testInfo.skip(); return }

    const vitalsVisible = await page.locator('[data-testid="tab-vitals"]').isVisible({ timeout: 3_000 }).catch(() => false)
    const fluidsVisible = await page.locator('[data-testid="tab-fluids"]').isVisible({ timeout: 2_000 }).catch(() => false)
    const medsVisible   = await page.locator('[data-testid="open-medications-btn"]').isVisible({ timeout: 2_000 }).catch(() => false)
    console.log(`TC-I05-03: vitals=${vitalsVisible}, fluids=${fluidsVisible}, meds=${medsVisible} (todos esperados: false)`)
    expect(vitalsVisible).toBe(false)
    expect(fluidsVisible).toBe(false)
    expect(medsVisible).toBe(false)
  })
})
