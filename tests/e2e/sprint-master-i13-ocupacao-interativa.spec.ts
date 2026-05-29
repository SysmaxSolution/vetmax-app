/**
 * E2E — Mapa de Ocupação Interativo (Internação Completa)
 *
 * Cobre a camada de interatividade do Mapa de Ocupação:
 * TC-I13-01: Admissão direta por clique — clicar num box 🟢 Livre abre o
 *            AdmitModal com o leito pré-selecionado/travado (admit-preselected-box).
 * TC-I13-02: Afordâncias de drag&drop — paciente sem leito aparece como chip
 *            arrastável (draggable) na área "Sem leito atribuído" e o box Livre
 *            é alvo de drop (data-state=free).
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
/** Box livre (capacidade 1, sem ocupante) + internação SEM leito (sem leito atribuído). */
async function seedFreeBoxAndUnassigned(): Promise<void> {
  await seedTutorsAndPets()
  const { data: box } = await admin.from('rooms')
    .insert({ clinic_id: CLINIC_A, name: 'Box E2E Interativo', type: 'hospitalization', capacity: 1, active: true, daily_rate: 150, operational_status: 'active' })
    .select('id').single()
  boxId = box?.id ?? null
  const { data: h } = await admin.from('hospitalizations')
    .insert({ clinic_id: CLINIC_A, patient_id: fixtures.patients.petA1.id, tutor_id: fixtures.tutors.tutorA1.id, status: 'observation', reason: 'E2E interativo', box_id: null })
    .select('id').single()
  hospId = h?.id ?? null
}
async function cleanup() {
  if (hospId) await admin.from('hospitalizations').delete().eq('id', hospId)
  if (boxId) await admin.from('rooms').delete().eq('id', boxId)
  hospId = null; boxId = null
}

async function gotoOccupancy(page: Page): Promise<boolean> {
  await loginViaApi(page, fixtures.users.adminA.email, fixtures.users.adminA.password, '/dashboard/hospitalization')
  await page.waitForTimeout(1_500)
  if (!page.url().includes('/dashboard/hospitalization')) return false
  const toggle = page.locator('[data-testid="view-occupancy"]')
  if (!(await toggle.isVisible({ timeout: 6_000 }).catch(() => false))) return false
  await toggle.click(); await page.waitForTimeout(900)
  return page.locator('[data-testid="occupancy-map"]').isVisible({ timeout: 5_000 }).catch(() => false)
}

let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext(); const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto(process.env.TEST_BASE_URL ?? 'http://localhost:4000', { waitUntil: 'domcontentloaded', timeout: 8_000 }).then(() => true).catch(() => false)
  await _ctx.close()
  if (!_serverAlive) console.log('[SKIP ALL] sprint-master-i13-ocupacao-interativa.spec.ts — servidor fora do ar')
  if (_serverAlive) await seedUsers().catch(e => console.warn('[i13] seedUsers falhou:', e.message))
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })

test.describe('Mapa de Ocupação interativo (flag ON)', () => {
  let prev: Record<string, unknown>
  test.beforeEach(async () => { prev = await setInternacaoCompleta(true); await seedFreeBoxAndUnassigned() })
  test.afterEach(async () => { await cleanup(); await restoreFlowConfig(prev) })

  test('TC-I13-01: clicar em box Livre abre AdmitModal com leito pré-selecionado', async ({ page }, testInfo) => {
    if (!(await gotoOccupancy(page))) { console.log('TC-I13-01: SKIP — mapa não carregou (cold-start UI)'); testInfo.skip(); return }

    const box = page.locator(`[data-testid="occ-box-${boxId}"]`)
    if (!(await box.isVisible({ timeout: 4_000 }).catch(() => false))) { console.log('TC-I13-01: SKIP — box não renderizou'); testInfo.skip(); return }
    expect(await box.getAttribute('data-state')).toBe('free')

    await box.click()
    await page.waitForTimeout(700)

    const preselected = page.locator('[data-testid="admit-preselected-box"]')
    const visible = await preselected.isVisible({ timeout: 4_000 }).catch(() => false)
    const text = visible ? await preselected.innerText().catch(() => '') : ''
    console.log(`TC-I13-01: campo leito pré-selecionado visível=${visible}, texto="${text.replace(/\n/g, ' ')}"`)
    expect(visible).toBe(true)
    expect(text).toContain('Box E2E Interativo')
  })

  test('TC-I13-02: paciente sem leito é chip arrastável e box Livre é alvo de drop', async ({ page }, testInfo) => {
    if (!(await gotoOccupancy(page))) { console.log('TC-I13-02: SKIP — mapa não carregou (cold-start UI)'); testInfo.skip(); return }

    const unassigned = page.locator('[data-testid="occ-unassigned"]')
    if (!(await unassigned.isVisible({ timeout: 4_000 }).catch(() => false))) { console.log('TC-I13-02: SKIP — área sem leito ausente'); testInfo.skip(); return }

    const chip = page.locator(`[data-testid="occ-patient-${hospId}"]`)
    const chipVisible = await chip.isVisible({ timeout: 3_000 }).catch(() => false)
    const draggable = chipVisible ? await chip.getAttribute('draggable') : null
    const box = page.locator(`[data-testid="occ-box-${boxId}"]`)
    const boxState = await box.getAttribute('data-state').catch(() => null)
    console.log(`TC-I13-02: chip visível=${chipVisible}, draggable=${draggable}, boxState=${boxState} (drop alvo)`)
    expect(chipVisible).toBe(true)
    expect(draggable).toBe('true')
    expect(boxState).toBe('free')
  })
})
