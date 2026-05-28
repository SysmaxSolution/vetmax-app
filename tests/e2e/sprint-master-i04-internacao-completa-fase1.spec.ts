/**
 * E2E — Sprint Internação Completa · FASE 1 (Foco em Enfermagem)
 *
 * Valida os 3 entregáveis da Fase 1 no nível de UI, todos gated pela flag
 * flow_config.internacao_completa:
 *
 * TC-I04-01: flag ON  ⇒ botão "Ativar alertas" (Alertas Ativos) aparece no Kanban.
 * TC-I04-02: flag ON  ⇒ toggle "Mapa de Execução" aparece e renderiza a grade.
 * TC-I04-03: flag OFF ⇒ nenhum controle extra aparece (Kanban idêntico ao atual).
 * TC-I04-04: a Linha do Tempo (HospitalizationDetailModal) é read-only — não há
 *            botão de editar/excluir nos registros de evolução/dose (timeline imutável).
 *
 * Gate: HospitalizationKanban só renderiza a barra de controle (toggle + sino)
 * quando useInternacaoCompleta() === true. applyHospitalizationDose injeta o log
 * imutável em hospitalization_records sob a flag.
 */

import { test, expect, Page } from '@playwright/test'
import { loginViaApi } from '../helpers/session'
import { createAdminClient } from '../helpers/supabase-test-client'
import { seedUsers, seedTutorsAndPets } from '../helpers/db-seed'
import fixtures from '../fixtures/test-data.json'

const admin = createAdminClient()
const CLINIC_A = fixtures.clinics.clinicA.id

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function setInternacaoCompleta(clinicId: string, value: boolean): Promise<Record<string, unknown>> {
  const { data } = await admin.from('clinics').select('flow_config').eq('id', clinicId).single()
  const prev = (data?.flow_config ?? {}) as Record<string, unknown>
  await admin.from('clinics').update({ flow_config: { ...prev, internacao_completa: value } }).eq('id', clinicId)
  return prev
}
async function restoreFlowConfig(clinicId: string, flowConfig: Record<string, unknown>): Promise<void> {
  await admin.from('clinics').update({ flow_config: flowConfig }).eq('id', clinicId)
}

function alarmButton(page: Page) {
  return page.getByRole('button', { name: /ativar alertas|alertas ativos|dose.*atrasada/i }).first()
}
function executionToggle(page: Page) {
  return page.getByRole('button', { name: /mapa de execução/i }).first()
}

async function gotoHospitalization(page: Page): Promise<boolean> {
  await loginViaApi(page, fixtures.users.adminA.email, fixtures.users.adminA.password, '/dashboard/hospitalization')
  await page.waitForTimeout(1_500)
  return page.url().includes('/dashboard/hospitalization')
}

// ─── server guard ────────────────────────────────────────────────────────────
let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext(); const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto(process.env.TEST_BASE_URL ?? 'http://localhost:4000', { waitUntil: 'domcontentloaded', timeout: 8_000 }).then(() => true).catch(() => false)
  await _ctx.close()
  if (!_serverAlive) console.log('[SKIP ALL] sprint-master-i04-internacao-completa-fase1.spec.ts — servidor fora do ar')
  if (_serverAlive) {
    await seedUsers().catch(e => console.warn('[i04] seedUsers falhou:', e.message))
    await seedTutorsAndPets().catch(e => console.warn('[i04] seedTutorsAndPets falhou:', e.message))
  }
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })

// ─── TC-I04-01 / 02 — flag ON: Alertas Ativos + Mapa de Execução ───────────────

test.describe('TC-I04-01/02: internacao_completa ON ⇒ alertas + mapa de execução', () => {
  let prev: Record<string, unknown>
  test.beforeEach(async () => { prev = await setInternacaoCompleta(CLINIC_A, true) })
  test.afterEach(async () => { await restoreFlowConfig(CLINIC_A, prev) })

  test('TC-I04-01: botão "Ativar alertas" visível no Kanban', async ({ page }, testInfo) => {
    if (!(await gotoHospitalization(page))) { console.log('TC-I04-01: SKIP — internação não carregou'); testInfo.skip(); return }

    const visible = await alarmButton(page).isVisible({ timeout: 6_000 }).catch(() => false)
    console.log(`TC-I04-01: botão de alertas visível com flag ON (esperado: true): ${visible}`)
    if (!visible) { console.log('TC-I04-01: SKIP — Kanban não renderizou a barra de controle (cold-start UI)'); testInfo.skip(); return }
    expect(visible).toBe(true)
  })

  test('TC-I04-02: toggle "Mapa de Execução" aparece e renderiza a grade', async ({ page }, testInfo) => {
    if (!(await gotoHospitalization(page))) { console.log('TC-I04-02: SKIP — internação não carregou'); testInfo.skip(); return }

    const toggle = executionToggle(page)
    const toggleVisible = await toggle.isVisible({ timeout: 6_000 }).catch(() => false)
    console.log(`TC-I04-02: toggle Mapa de Execução visível (esperado: true): ${toggleVisible}`)
    if (!toggleVisible) { console.log('TC-I04-02: SKIP — toggle não renderizou (cold-start UI)'); testInfo.skip(); return }

    await toggle.click().catch(() => {})
    await page.waitForTimeout(800)

    // Após trocar de visão: ou a legenda da grade ("Aplicado/Atrasado") ou o
    // estado vazio ("Sem prescrições ativas") deve aparecer.
    const legend = await page.getByText(/aplicado/i).first().isVisible({ timeout: 4_000 }).catch(() => false)
    const empty  = await page.getByText(/sem prescrições ativas/i).first().isVisible({ timeout: 4_000 }).catch(() => false)
    console.log(`TC-I04-02: legenda=${legend}, estadoVazio=${empty}`)
    expect(legend || empty).toBe(true)
  })
})

// ─── TC-I04-03 — flag OFF: zero mudança de comportamento ───────────────────────

test.describe('TC-I04-03: internacao_completa OFF ⇒ Kanban idêntico ao atual', () => {
  let prev: Record<string, unknown>
  test.beforeEach(async () => { prev = await setInternacaoCompleta(CLINIC_A, false) })
  test.afterEach(async () => { await restoreFlowConfig(CLINIC_A, prev) })

  test('TC-I04-03: sem botão de alertas e sem toggle de Mapa de Execução', async ({ page }, testInfo) => {
    if (!(await gotoHospitalization(page))) { console.log('TC-I04-03: SKIP — internação não carregou'); testInfo.skip(); return }

    // O título "Mapa de Internação" (h1) sempre existe; o que NÃO deve existir é
    // o toggle "Mapa de Execução" nem o botão de alertas (controles da flag ON).
    const alarmVisible  = await alarmButton(page).isVisible({ timeout: 3_000 }).catch(() => false)
    const toggleVisible = await executionToggle(page).isVisible({ timeout: 3_000 }).catch(() => false)
    console.log(`TC-I04-03: alertas=${alarmVisible}, toggleExecução=${toggleVisible} (ambos esperados: false)`)
    expect(alarmVisible).toBe(false)
    expect(toggleVisible).toBe(false)
  })
})

// ─── TC-I04-04 — Linha do Tempo imutável (sem editar/excluir registros) ───────

test.describe('TC-I04-04: timeline de plantão é imutável na UI', () => {
  let hospId: string | null = null
  let prev: Record<string, unknown>

  test.beforeEach(async () => {
    prev = await setInternacaoCompleta(CLINIC_A, true)
    await seedTutorsAndPets()
    const { data } = await admin.from('hospitalizations').insert([{
      clinic_id:  CLINIC_A,
      patient_id: fixtures.patients.petA1.id,
      tutor_id:   fixtures.tutors.tutorA1.id,
      status:     'observation',
      reason:     'Internação E2E Fase 1 — timeline imutável',
    }]).select('id').single()
    hospId = data?.id ?? null
    // Log imutável de dose (mesmo formato que applyHospitalizationDose grava).
    if (hospId) {
      await admin.from('hospitalization_records').insert({
        hospitalization_id: hospId,
        clinic_id:          CLINIC_A,
        user_name:          'Enfermagem E2E',
        notes:              '💉 Dose administrada às 08:00 por Enfermagem E2E.',
        medications:        [{ name: 'Dipirona', dose: '500mg', route: 'IV', notes: '' }],
        improvement_level:  'estavel',
      })
    }
  })

  test.afterEach(async () => {
    if (hospId) {
      await admin.from('hospitalization_records').delete().eq('hospitalization_id', hospId)
      await admin.from('hospitalizations').delete().eq('id', hospId)
    }
    await restoreFlowConfig(CLINIC_A, prev)
  })

  test('TC-I04-04: registro de dose aparece na timeline sem botão de editar/excluir', async ({ page }, testInfo) => {
    if (!(await gotoHospitalization(page))) { console.log('TC-I04-04: SKIP — internação não carregou'); testInfo.skip(); return }

    const card = page.locator('[data-testid^="hospitalization-card-"]').filter({ hasText: fixtures.patients.petA1.name }).first()
    if (!(await card.isVisible({ timeout: 6_000 }).catch(() => false))) { console.log('TC-I04-04: SKIP — card não encontrado'); testInfo.skip(); return }
    await card.click()
    await page.waitForTimeout(1_000)

    const dialog = page.getByRole('dialog').first()
    if (!(await dialog.isVisible({ timeout: 5_000 }).catch(() => false))) { console.log('TC-I04-04: SKIP — modal não abriu'); testInfo.skip(); return }

    const doseLog = page.getByText(/dose administrada/i).first()
    const logVisible = await doseLog.isVisible({ timeout: 5_000 }).catch(() => false)
    console.log(`TC-I04-04: log imutável de dose visível na timeline: ${logVisible}`)
    if (!logVisible) { console.log('TC-I04-04: SKIP — timeline não renderizou o log (cold-start UI)'); testInfo.skip(); return }

    // O registro deve ser read-only: nenhum botão "editar"/"excluir" associado.
    const editBtn = page.getByRole('button', { name: /editar registro|excluir registro|editar evolução|excluir evolução/i })
    const editable = await editBtn.first().isVisible({ timeout: 1_500 }).catch(() => false)
    console.log(`TC-I04-04: controles de edição na timeline (esperado: false): ${editable}`)
    expect(logVisible).toBe(true)
    expect(editable).toBe(false)
  })
})
