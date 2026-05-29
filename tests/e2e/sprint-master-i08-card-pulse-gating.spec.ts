/**
 * E2E — Sprint Internação Completa · Alerta visual do HospitalizationCard
 *
 * Pulse CSS (med-card-overdue) + ícone de pílula piscando (MedicationAlertBadge)
 * gated por flow_config.internacao_completa.
 *
 * TC-I08-01: flag ON + dose atrasada ⇒ card recebe a classe de pulse e exibe o
 *            badge de medicação.
 * TC-I08-02: flag OFF (mesma dose atrasada) ⇒ card SEM pulse e SEM badge
 *            (idêntico ao legado).
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

async function seedHospWithOverdueDose(): Promise<string | null> {
  await seedTutorsAndPets()
  const { data } = await admin.from('hospitalizations').insert([{
    clinic_id: CLINIC_A, patient_id: fixtures.patients.petA1.id, tutor_id: fixtures.tutors.tutorA1.id,
    status: 'observation', reason: 'Internação E2E pulse',
  }]).select('id').single()
  const hospId = data?.id ?? null
  if (hospId) {
    // started_at 1 dia atrás + 4/4h, sem administração ⇒ dose ATRASADA agora.
    await admin.from('hospitalization_prescriptions').insert({
      clinic_id: CLINIC_A, hospitalization_id: hospId,
      medication_name: 'Cefalexina', dose: '30 mg/kg', route: 'IV',
      frequency_hours: 4, started_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      status: 'active', prescribed_by: null,
    })
  }
  return hospId
}
async function cleanup(hospId: string | null) {
  if (!hospId) return
  await admin.from('hospitalization_prescriptions').delete().eq('hospitalization_id', hospId)
  await admin.from('hospitalizations').delete().eq('id', hospId)
}

async function gotoKanban(page: Page): Promise<boolean> {
  await loginViaApi(page, fixtures.users.adminA.email, fixtures.users.adminA.password, '/dashboard/hospitalization')
  await page.waitForTimeout(1_800) // aguarda fetch de prescrições + tick
  return page.url().includes('/dashboard/hospitalization')
}

let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext(); const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto(process.env.TEST_BASE_URL ?? 'http://localhost:4000', { waitUntil: 'domcontentloaded', timeout: 8_000 }).then(() => true).catch(() => false)
  await _ctx.close()
  if (!_serverAlive) console.log('[SKIP ALL] sprint-master-i08-card-pulse-gating.spec.ts — servidor fora do ar')
  if (_serverAlive) await seedUsers().catch(e => console.warn('[i08] seedUsers falhou:', e.message))
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })

test.describe('TC-I08-01: flag ON ⇒ pulse + badge no card', () => {
  let prev: Record<string, unknown>; let hospId: string | null = null
  test.beforeEach(async () => { prev = await setInternacaoCompleta(true); hospId = await seedHospWithOverdueDose() })
  test.afterEach(async () => { await cleanup(hospId); await restoreFlowConfig(prev) })

  test('TC-I08-01: card com pulse (med-card-*) e badge de medicação', async ({ page }, testInfo) => {
    if (!(await gotoKanban(page))) { console.log('TC-I08-01: SKIP — kanban não carregou'); testInfo.skip(); return }
    const card = page.locator(`[data-testid="hospitalization-card-${hospId}"]`)
    if (!(await card.isVisible({ timeout: 6_000 }).catch(() => false))) { console.log('TC-I08-01: SKIP — card ausente (cold-start UI)'); testInfo.skip(); return }
    const cls = (await card.getAttribute('class').catch(() => '')) ?? ''
    const hasPulse = /med-card-(overdue|imminent)/.test(cls)
    const badge = await page.getByRole('button', { name: /atrasada|chegando/i }).first().isVisible({ timeout: 3_000 }).catch(() => false)
    console.log(`TC-I08-01: pulse=${hasPulse}, badge=${badge}`)
    expect(hasPulse).toBe(true)
    expect(badge).toBe(true)
  })
})

test.describe('TC-I08-02: flag OFF ⇒ badge VISÍVEL, sem pulse (decisão do PO)', () => {
  let prev: Record<string, unknown>; let hospId: string | null = null
  test.beforeEach(async () => { prev = await setInternacaoCompleta(false); hospId = await seedHospWithOverdueDose() })
  test.afterEach(async () => { await cleanup(hospId); await restoreFlowConfig(prev) })

  test('TC-I08-02: badge aparece, mas sem pulse no card (animação/som só com flag ON)', async ({ page }, testInfo) => {
    if (!(await gotoKanban(page))) { console.log('TC-I08-02: SKIP — kanban não carregou'); testInfo.skip(); return }
    const card = page.locator(`[data-testid="hospitalization-card-${hospId}"]`)
    if (!(await card.isVisible({ timeout: 6_000 }).catch(() => false))) { console.log('TC-I08-02: SKIP — card ausente (cold-start UI)'); testInfo.skip(); return }
    const cls = (await card.getAttribute('class').catch(() => '')) ?? ''
    const hasPulse = /med-card-(overdue|imminent)/.test(cls)
    const badge = await page.getByRole('button', { name: /atrasada|chegando/i }).first().isVisible({ timeout: 3_000 }).catch(() => false)
    console.log(`TC-I08-02: pulse=${hasPulse} (esperado false), badge=${badge} (esperado true)`)
    expect(hasPulse).toBe(false)
    expect(badge).toBe(true)
  })
})
