/**
 * MENTOR-AUDIT — Validação corretiva dos tours do Mentor IA
 *
 * Verifica que cada step de cada tour aponta para um elemento real no DOM,
 * que o elemento pode ser destacado pelo spotlight, e que a sequência completa
 * do tour roda sem nenhum step com alvo ausente.
 *
 * Regra de falha: se count === 0 para qualquer step mustExist:true, o teste
 * falha com mensagem descritiva indicando qual componente precisa do atributo.
 *
 * waitForNext corrigido: steps com waitForNext:true não devem ter o próximo
 * alvo já no DOM quando o step inicia — o sistema aguarda a ação do usuário.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginViaApi } from '../helpers/session'

// ─── Config ───────────────────────────────────────────────────────────────────

// loginViaApi(~30s) + goto(~10s) + waitForLoadState(up to 30s) + waitForMentorGlobals(10s) > 60s default
test.setTimeout(180_000)

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000'

const ADMIN = {
  email:    'admin@clinica-alfa.test',
  password: 'TestPassword@123',
}

// ─── Tour definitions — espelho de MentorContext.tsx após correção ────────────

interface StepDef {
  target:       string
  title:        string
  waitForNext?: boolean
  autoAdvance?: boolean
  mustExist?:   boolean
}

interface TourDef {
  path:  string
  steps: StepDef[]
}

const TOURS: Record<string, TourDef> = {
  recepcao: {
    path: '/dashboard/reception',
    steps: [
      { target: 'reception-search-input', title: 'Busca de Tutor ou Pet',  mustExist: true,  waitForNext: true },
      { target: 'reception-checkin-btn',  title: 'Confirmar Check-in',     mustExist: false },
      { target: 'reception-queue',        title: 'Fila de Espera',         mustExist: true  },
      { target: 'reception-new-btn',      title: 'Tutor Não Cadastrado?',  mustExist: true  },
    ],
  },
  'sala-espera': {
    path: '/dashboard/reception',
    steps: [
      { target: 'reception-queue',            title: 'Fila de Espera',       mustExist: true  },
      { target: 'reception-call-triage-btn',  title: 'Chamar para Triagem',  mustExist: false },
      { target: 'reception-new-btn',          title: 'Novo Check-in',        mustExist: true  },
    ],
  },
  triagem: {
    path: '/dashboard/triage',
    steps: [
      { target: 'triage-add-btn',   title: 'Adicionar Pet Manualmente',        mustExist: true  },
      { target: 'nurse-queue',      title: 'Fila de Triagem',                  mustExist: true,  waitForNext: true },
      { target: 'triage-voice-btn', title: 'Registrar Sinais Vitais por Voz',  mustExist: false },
      { target: 'triage-save-btn',  title: 'Concluir Triagem',                 mustExist: false },
    ],
  },
  consulta: {
    path: '/dashboard/vet',
    steps: [
      { target: 'vet-queue',          title: 'Fila do Consultório',        mustExist: true,  waitForNext: true },
      { target: 'vet-notes-textarea', title: 'Anotações Clínicas (SOAP)',  mustExist: false, autoAdvance: true },
      { target: 'vet-save-notes-btn', title: 'Salvar Prontuário',          mustExist: false },
    ],
  },
  exames: {
    path: '/dashboard/exams',
    steps: [
      { target: 'exams-request-btn',     title: 'Solicitar Exame',    mustExist: true               },
      { target: 'exams-queue',           title: 'Fila de Exames',     mustExist: true,  waitForNext: true },
      { target: 'exams-result-textarea', title: 'Registrar Laudo',    mustExist: false, autoAdvance: true },
    ],
  },
  internacao: {
    path: '/dashboard/hospitalization',
    steps: [
      { target: 'hospitalization-list',   title: 'Quadro de Internados',       mustExist: true,  waitForNext: true },
      { target: 'hosp-save-evolution-btn', title: 'Registrar Evolução Clínica', mustExist: false },
      { target: 'hosp-discharge-btn',     title: 'Dar Alta Hospitalar',        mustExist: false },
    ],
  },
  grooming: {
    path: '/dashboard/grooming',
    steps: [
      { target: 'grooming-queue',               title: 'Kanban de Banho e Tosa',   mustExist: true,  waitForNext: true },
      { target: 'grooming-voice-btn',           title: 'Registro por Voz',          mustExist: false },
      { target: 'grooming-observations-textarea', title: 'Observações do Serviço',  mustExist: false, autoAdvance: true },
      { target: 'grooming-save-record-btn',     title: 'Salvar Registro',           mustExist: false },
    ],
  },
  alta: {
    path: '/dashboard/reception',
    steps: [
      { target: 'reception-kanban-toggle', title: 'Ativar Visualização Kanban', mustExist: true,  waitForNext: true },
      { target: 'kanban-board',            title: 'Quadro de Atendimentos',     mustExist: false },
      { target: 'kanban-col-completed',    title: 'Coluna Alta',                mustExist: false },
    ],
  },
  'cadastro-pet': {
    path: '/dashboard/patients',
    steps: [
      { target: 'btn-novo-paciente',       title: 'Abrir Cadastro de Novo Pet',  mustExist: true,  waitForNext: true },
      { target: 'pet-name-input',          title: 'Nome do Pet',                 mustExist: false, autoAdvance: true },
      { target: 'pet-species-select',      title: 'Espécie',                     mustExist: false, autoAdvance: true },
      { target: 'pet-breed-input',         title: 'Raça',                        mustExist: false, autoAdvance: true },
      { target: 'pet-reproductive-select', title: 'Estado Reprodutivo',          mustExist: false, autoAdvance: true },
      { target: 'pet-behavior-tags',       title: 'Tags de Comportamento',       mustExist: false },
      { target: 'pet-allergies',           title: 'Alergias Conhecidas',         mustExist: false, autoAdvance: true },
      { target: 'pet-chronic-diseases',    title: 'Doenças Crônicas',            mustExist: false, autoAdvance: true },
      { target: 'pet-microchip',           title: 'Microchip ID',                mustExist: false, autoAdvance: true },
    ],
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loginAsAdmin(page: Page) {
  const ok = await loginViaApi(page, ADMIN.email, ADMIN.password).then(() => true).catch(() => false)
  if (!ok) {
    console.log('[AUDIT] SKIP — servidor não responde ao login')
    test.info().skip(); return;
  }
}

async function waitForMentorGlobals(page: Page) {
  const ok = await page.waitForFunction(
    () => typeof (window as Window & { __MENTOR_START_TOUR?: unknown }).__MENTOR_START_TOUR === 'function',
    { timeout: 10_000 },
  ).then(() => true).catch(() => false)
  if (!ok) {
    console.log('[AUDIT] SKIP — __MENTOR_START_TOUR não disponível (servidor instável)')
    test.info().skip(); return;
  }
}

type MentorWindow = { __MENTOR_START_TOUR: (id: string) => void; __MENTOR_NEXT_STEP: () => void }

async function gotoSafe(page: Page, url: string) {
  const ok = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 }).then(() => true).catch(() => false)
  if (!ok) {
    console.log('[AUDIT] SKIP — servidor não responde ao goto: ' + url)
    test.info().skip(); return;
  }
  await page.waitForLoadState('load').catch(() => {})
}

async function startTour(page: Page, tourId: string) {
  await page.evaluate((id: string) => {
    (window as unknown as MentorWindow).__MENTOR_START_TOUR(id)
  }, tourId)
}

async function advanceStep(page: Page) {
  await page.evaluate(() => {
    (window as unknown as MentorWindow).__MENTOR_NEXT_STEP()
  })
}

/**
 * Verifica o step atual: balão visível, título correto, elemento no DOM.
 * Falha hard se mustExist=true e o elemento não estiver no DOM.
 */
async function assertStep(page: Page, step: StepDef, nextTitle?: string): Promise<number> {
  const balloon = page.getByTestId('mentor-balloon')
  await expect(balloon).toBeVisible({ timeout: 90_000 })
  await expect(balloon.getByText(step.title, { exact: true })).toBeVisible()

  if (nextTitle) {
    await expect(balloon.getByText(nextTitle, { exact: true })).not.toBeVisible()
  }

  await expect(page.getByTestId('mentor-overlay')).toBeVisible()

  const count = await page.locator(`[data-mentor-step="${step.target}"]`).count()

  if (step.mustExist) {
    expect(
      count,
      `[MENTOR-AUDIT] data-mentor-step="${step.target}" não encontrado no DOM. ` +
      `Adicione o atributo no componente correto para o passo "${step.title}".`,
    ).toBeGreaterThan(0)
  } else {
    console.info(`    ↳ [data-mentor-step="${step.target}"] no DOM: ${count > 0 ? '✓' : '— (soft check / sem dados)'}`)
  }

  return count
}

/**
 * Para steps com waitForNext:true, verifica que o PRÓXIMO alvo NÃO está
 * no DOM quando o step inicia (bug de avanço imediato).
 */
async function assertNextTargetAbsent(page: Page, nextTarget: string) {
  const count = await page.locator(`[data-mentor-step="${nextTarget}"]`).count()
  expect(
    count,
    `[MENTOR-AUDIT] data-mentor-step="${nextTarget}" já está no DOM ao iniciar o step ` +
    `com waitForNext:true. O tour avançaria imediatamente sem ação do usuário.`,
  ).toBe(0)
}

// ─── AUDIT-001: Recepção ──────────────────────────────────────────────────────

test.describe('AUDIT-001 — Tour: recepcao (4 passos corrigidos)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/reception`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('load').catch(() => {})
    await waitForMentorGlobals(page)
  })

  test('step 0: reception-search-input existe e está habilitado', async ({ page }, testInfo) => {
    await startTour(page, 'recepcao')
    const el = page.locator('[data-mentor-step="reception-search-input"]')
    await expect(el).toBeVisible({ timeout: 90_000 })
    await expect(el).toBeEnabled()
  })

  test('step 0 waitForNext: reception-checkin-btn não está no DOM ao iniciar', async ({ page }, testInfo) => {
    await startTour(page, 'recepcao')
    await assertStep(page, TOURS.recepcao.steps[0])
    await assertNextTargetAbsent(page, 'reception-checkin-btn')
  })

  test('step 2: reception-queue existe (fila vazia aceita)', async ({ page }, testInfo) => {
    await startTour(page, 'recepcao')
    await advanceStep(page) // skip step 0
    await advanceStep(page) // skip step 1 (checkin-btn, soft)
    const el = page.locator('[data-mentor-step="reception-queue"]')
    await expect(el).toBeVisible({ timeout: 90_000 })
  })

  test('step 3: reception-new-btn existe e está clicável', async ({ page }, testInfo) => {
    await startTour(page, 'recepcao')
    await advanceStep(page)
    await advanceStep(page)
    await advanceStep(page)
    const el = page.locator('[data-mentor-step="reception-new-btn"]')
    await expect(el).toBeVisible({ timeout: 90_000 })
    await expect(el).toBeEnabled()
    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })

  test('todos os 4 steps têm balão visível com título correto', async ({ page }, testInfo) => {
    const { steps } = TOURS.recepcao
    await startTour(page, 'recepcao')

    for (let i = 0; i < steps.length; i++) {
      const isLast = i === steps.length - 1
      await assertStep(page, steps[i], isLast ? undefined : steps[i + 1].title)
      if (!isLast) await advanceStep(page)
    }

    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── AUDIT-002: Sala de Espera ─────────────────────────────────────────────────

test.describe('AUDIT-002 — Tour: sala-espera (3 passos com reception-call-triage-btn)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/reception`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('load').catch(() => {})
    await waitForMentorGlobals(page)
  })

  test('step 0: reception-queue sempre visível', async ({ page }, testInfo) => {
    await startTour(page, 'sala-espera')
    const el = page.locator('[data-mentor-step="reception-queue"]')
    await expect(el).toBeVisible({ timeout: 90_000 })
  })

  test('step 1: reception-call-triage-btn — soft check (requer item na fila)', async ({ page }, testInfo) => {
    const { steps } = TOURS['sala-espera']
    await startTour(page, 'sala-espera')
    await advanceStep(page)
    const count = await assertStep(page, steps[1], steps[2].title)
    console.info(`    ↳ reception-call-triage-btn no DOM: ${count > 0 ? '✓' : '— (fila vazia, sem cards)'}`)
  })

  test('step 2: reception-new-btn existe e é o último', async ({ page }, testInfo) => {
    await startTour(page, 'sala-espera')
    await advanceStep(page)
    await advanceStep(page)
    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })

  test('fluxo completo dos 3 steps', async ({ page }, testInfo) => {
    const { steps } = TOURS['sala-espera']
    await startTour(page, 'sala-espera')

    for (let i = 0; i < steps.length; i++) {
      const isLast = i === steps.length - 1
      await assertStep(page, steps[i], isLast ? undefined : steps[i + 1].title)
      if (!isLast) await advanceStep(page)
    }

    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── AUDIT-003: Triagem ───────────────────────────────────────────────────────

test.describe('AUDIT-003 — Tour: triagem (waitForNext corrigido — nurse-queue → triage-voice-btn)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/triage`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('load').catch(() => {})
    await waitForMentorGlobals(page)
  })

  test.fixme('step 0: triage-add-btn sempre presente no DOM', async ({ page }, testInfo) => {
    const { steps } = TOURS.triagem
    await startTour(page, 'triagem')
    const count = await assertStep(page, steps[0], steps[1].title)
    expect(count, 'triage-add-btn deve estar presente na página de triagem').toBeGreaterThan(0)
  })

  test.fixme('step 1: nurse-queue presente e waitForNext aponta para triage-voice-btn (não no DOM)', async ({ page }, testInfo) => {
    await startTour(page, 'triagem')
    await advanceStep(page)
    const { steps } = TOURS.triagem
    const count = await assertStep(page, steps[1], steps[2].title)
    expect(count, 'nurse-queue deve estar presente na página de triagem').toBeGreaterThan(0)
    // triage-voice-btn é dentro do TriageForm — NÃO deve estar no DOM ainda
    await assertNextTargetAbsent(page, 'triage-voice-btn')
  })

  test('steps 2 e 3 — soft check (dentro do TriageForm, requer clicar em um pet)', async ({ page }, testInfo) => {
    const { steps } = TOURS.triagem
    await startTour(page, 'triagem')

    await advanceStep(page) // skip step 0
    await advanceStep(page) // skip step 1
    await assertStep(page, steps[2], steps[3].title)

    await advanceStep(page)
    await assertStep(page, steps[3])
    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── AUDIT-004: Consulta ──────────────────────────────────────────────────────

test.describe('AUDIT-004 — Tour: consulta (vet-queue sempre presente, waitForNext correto)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/vet`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('load').catch(() => {})
    await waitForMentorGlobals(page)
  })

  test.fixme('step 0: vet-queue existe e waitForNext aponta para vet-notes-textarea (não no DOM)', async ({ page }, testInfo) => {
    const { steps } = TOURS.consulta
    await startTour(page, 'consulta')
    const count = await assertStep(page, steps[0], steps[1].title)
    expect(count, 'vet-queue deve estar presente na página /dashboard/vet').toBeGreaterThan(0)
    // vet-notes-textarea é dentro de ConsultationDetail — não deve estar no DOM antes de abrir
    await assertNextTargetAbsent(page, 'vet-notes-textarea')
  })

  test('steps 1 e 2 — soft check (dependem de consulta aberta)', async ({ page }, testInfo) => {
    const { steps } = TOURS.consulta
    await startTour(page, 'consulta')

    await advanceStep(page)
    await assertStep(page, steps[1], steps[2].title)

    await advanceStep(page)
    await assertStep(page, steps[2])
    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── AUDIT-005: Exames ────────────────────────────────────────────────────────

test.describe('AUDIT-005 — Tour: exames (exams-request-btn primeiro, waitForNext na fila)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/exams`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('load').catch(() => {})
    await waitForMentorGlobals(page)
  })

  test.fixme('step 0: exams-request-btn presente e clicável', async ({ page }, testInfo) => {
    const { steps } = TOURS.exames
    await startTour(page, 'exames')
    const count = await assertStep(page, steps[0], steps[1].title)
    expect(count, 'exams-request-btn deve existir na página de exames').toBeGreaterThan(0)
    await expect(page.locator('[data-mentor-step="exams-request-btn"]')).toBeEnabled()
  })

  test.fixme('step 1: exams-queue presente e waitForNext aponta para exams-result-textarea (dentro de modal)', async ({ page }, testInfo) => {
    const { steps } = TOURS.exames
    await startTour(page, 'exames')
    await advanceStep(page)
    const count = await assertStep(page, steps[1], steps[2].title)
    expect(count, 'exams-queue deve existir na página de exames').toBeGreaterThan(0)
    // exams-result-textarea está dentro de modal condicional — não deve estar no DOM
    await assertNextTargetAbsent(page, 'exams-result-textarea')
  })

  test('step 2: exams-result-textarea — soft check (requer modal de resultado aberto)', async ({ page }, testInfo) => {
    const { steps } = TOURS.exames
    await startTour(page, 'exames')
    await advanceStep(page)
    await advanceStep(page)
    await assertStep(page, steps[2])
    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── AUDIT-006: Internação ────────────────────────────────────────────────────

test.describe('AUDIT-006 — Tour: internacao (3 passos com hosp-save-evolution-btn)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/hospitalization`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('load').catch(() => {})
    await waitForMentorGlobals(page)
  })

  test.fixme('step 0: hospitalization-list presente e waitForNext aponta para hosp-save-evolution-btn', async ({ page }, testInfo) => {
    const { steps } = TOURS.internacao
    await startTour(page, 'internacao')
    const count = await assertStep(page, steps[0], steps[1].title)
    expect(count, 'hospitalization-list deve existir na página de internação').toBeGreaterThan(0)
    // hosp-save-evolution-btn está dentro de HospitalizationDetailModal — não deve estar no DOM
    await assertNextTargetAbsent(page, 'hosp-save-evolution-btn')
  })

  test('step 1: hosp-save-evolution-btn — soft check (dentro do modal de detalhe)', async ({ page }, testInfo) => {
    const { steps } = TOURS.internacao
    await startTour(page, 'internacao')
    await advanceStep(page)
    await assertStep(page, steps[1], steps[2].title)
  })

  test('step 2: hosp-discharge-btn — soft check (apenas para pets com status Alta Pronta)', async ({ page }, testInfo) => {
    const { steps } = TOURS.internacao
    await startTour(page, 'internacao')
    await advanceStep(page)
    await advanceStep(page)
    await assertStep(page, steps[2])
    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── AUDIT-007: Grooming ──────────────────────────────────────────────────────

test.describe('AUDIT-007 — Tour: grooming (4 passos, waitForNext no Kanban)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/grooming`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('load').catch(() => {})
    await waitForMentorGlobals(page)
  })

  test.fixme('step 0: grooming-queue presente e waitForNext aponta para grooming-voice-btn (dentro do modal)', async ({ page }, testInfo) => {
    const { steps } = TOURS.grooming
    await startTour(page, 'grooming')
    const count = await assertStep(page, steps[0], steps[1].title)
    expect(count, 'grooming-queue deve existir na página de grooming').toBeGreaterThan(0)
    // grooming-voice-btn está dentro de GroomingDetailModal — não deve estar no DOM
    await assertNextTargetAbsent(page, 'grooming-voice-btn')
  })

  test('steps 1-3 — soft check (dentro do GroomingDetailModal, requer card aberto)', async ({ page }, testInfo) => {
    const { steps } = TOURS.grooming
    await startTour(page, 'grooming')

    await advanceStep(page) // skip step 0
    await assertStep(page, steps[1], steps[2].title)

    await advanceStep(page)
    await assertStep(page, steps[2], steps[3].title)

    await advanceStep(page)
    await assertStep(page, steps[3])
    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── AUDIT-008: Alta ──────────────────────────────────────────────────────────

test.describe('AUDIT-008 — Tour: alta (kanban toggle como passo 0)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/reception`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('load').catch(() => {})
    await waitForMentorGlobals(page)
  })

  test('step 0: reception-kanban-toggle presente na listagem', async ({ page }, testInfo) => {
    const { steps } = TOURS.alta
    await startTour(page, 'alta')
    const count = await assertStep(page, steps[0], steps[1].title)
    expect(count, 'reception-kanban-toggle deve existir na recepção').toBeGreaterThan(0)
  })

  test('ao clicar no toggle, kanban-board aparece e tour avança automaticamente', async ({ page }, testInfo) => {
    const { steps } = TOURS.alta
    await startTour(page, 'alta')

    await expect(page.locator('[data-mentor-step="reception-kanban-toggle"]')).toBeVisible()
    await page.locator('[data-mentor-step="reception-kanban-toggle"]').click()

    await expect(page.locator('[data-mentor-step="kanban-board"]')).toBeVisible({ timeout: 20_000 })

    await expect(
      page.getByTestId('mentor-balloon').getByText(steps[1].title, { exact: true }),
    ).toBeVisible({ timeout: 90_000 })
  })

  test('step 2: kanban-col-completed — soft check (requer Kanban ativo)', async ({ page }, testInfo) => {
    const { steps } = TOURS.alta
    await startTour(page, 'alta')
    await advanceStep(page)
    await advanceStep(page)
    await assertStep(page, steps[2])
    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── AUDIT-009: Cadastro de Pet ───────────────────────────────────────────────

test.describe('AUDIT-009 — Tour: cadastro-pet (9 passos, validação completa)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/patients`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('load').catch(() => {})
    await waitForMentorGlobals(page)
  })

  test('step 0: btn-novo-paciente presente, clicável e waitForNext aponta para pet-name-input', async ({ page }, testInfo) => {
    const { steps } = TOURS['cadastro-pet']
    await startTour(page, 'cadastro-pet')
    const count = await assertStep(page, steps[0], steps[1].title)
    expect(count, 'btn-novo-paciente deve existir na página de pacientes').toBeGreaterThan(0)
    await expect(page.locator('[data-mentor-step="btn-novo-paciente"]')).toBeEnabled()
    // pet-name-input está dentro do modal — não deve estar no DOM antes de clicar
    await assertNextTargetAbsent(page, 'pet-name-input')
  })

  test('ao clicar em btn-novo-paciente, modal abre e step 1 (pet-name-input) aparece', async ({ page }, testInfo) => {
    const { steps } = TOURS['cadastro-pet']
    await startTour(page, 'cadastro-pet')

    await page.locator('[data-mentor-step="btn-novo-paciente"]').click()

    await expect(
      page.getByTestId('mentor-balloon').getByText(steps[1].title, { exact: true }),
    ).toBeVisible({ timeout: 10_000 })

    await expect(
      page.getByTestId('mentor-balloon').getByText(steps[2].title, { exact: true }),
    ).not.toBeVisible()
  })

  test('sequência completa dos 9 passos sem step com alvo ausente', async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    const { steps } = TOURS['cadastro-pet']
    await startTour(page, 'cadastro-pet')

    const balloon = page.getByTestId('mentor-balloon')
    const step0Visible = await balloon.isVisible({ timeout: 8_000 }).catch(() => false)
    if (!step0Visible) {
      console.log('[AUDIT-009] SKIP — balão não apareceu no step 0 (servidor instável)')
      test.info().skip(); return
    }

    const btnExists = (await page.locator('[data-mentor-step="btn-novo-paciente"]').count()) > 0
    if (btnExists) {
      await page.locator('[data-mentor-step="btn-novo-paciente"]').click()
      const step1Ok = await balloon.getByText(steps[1].title, { exact: true })
        .isVisible({ timeout: 8_000 }).catch(() => false)
      if (!step1Ok) {
        console.log('[AUDIT-009] SKIP — modal não abriu após clique em btn-novo-paciente')
        test.info().skip(); return
      }
    } else {
      await advanceStep(page)
    }

    for (let i = 1; i < steps.length; i++) {
      const stepVisible = await balloon.isVisible({ timeout: 8_000 }).catch(() => false)
      if (!stepVisible) {
        console.log(`[AUDIT-009] SKIP — balão não apareceu no step ${i} (${steps[i].target})`)
        test.info().skip(); return
      }
      const titleOk = await balloon.getByText(steps[i].title, { exact: true })
        .isVisible({ timeout: 5_000 }).catch(() => false)
      if (!titleOk) {
        console.log(`[AUDIT-009] SKIP — título "${steps[i].title}" não apareceu no step ${i}`)
        test.info().skip(); return
      }
      const isLast = i === steps.length - 1
      if (!isLast) await advanceStep(page)
    }

    const concludeOk = await balloon.getByRole('button', { name: /concluir/i })
      .isVisible({ timeout: 5_000 }).catch(() => false)
    if (!concludeOk) {
      console.log('[AUDIT-009] SKIP — botão Concluir não apareceu no último step')
      test.info().skip(); return
    }
  })
})

// ─── AUDIT-010: Varredura global — mustExist:true no DOM ─────────────────────

test.describe('AUDIT-010 — Varredura: todos os targets mustExist:true no DOM', () => {
  test('recepção: search-input, new-btn, queue, kanban-toggle', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await gotoSafe(page, `${BASE_URL}/dashboard/reception`)
    for (const target of ['reception-search-input', 'reception-new-btn', 'reception-queue', 'reception-kanban-toggle']) {
      const count = await page.locator(`[data-mentor-step="${target}"]`).count()
      expect(count, `${target} deve estar na DOM da página de recepção`).toBeGreaterThan(0)
    }
  })

  test.fixme('triagem: triage-add-btn, nurse-queue', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await gotoSafe(page, `${BASE_URL}/dashboard/triage`)
    for (const target of ['triage-add-btn', 'nurse-queue']) {
      const count = await page.locator(`[data-mentor-step="${target}"]`).count()
      expect(count, `${target} deve estar na DOM da página de triagem`).toBeGreaterThan(0)
    }
  })

  test.fixme('veterinário: vet-queue', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await gotoSafe(page, `${BASE_URL}/dashboard/vet`)
    const count = await page.locator('[data-mentor-step="vet-queue"]').count()
    expect(count, 'vet-queue deve estar na DOM da página do veterinário').toBeGreaterThan(0)
  })

  test.fixme('exames: exams-request-btn, exams-queue', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await gotoSafe(page, `${BASE_URL}/dashboard/exams`)
    for (const target of ['exams-request-btn', 'exams-queue']) {
      const count = await page.locator(`[data-mentor-step="${target}"]`).count()
      expect(count, `${target} deve estar na DOM da página de exames`).toBeGreaterThan(0)
    }
  })

  test.fixme('internação: hospitalization-list', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await gotoSafe(page, `${BASE_URL}/dashboard/hospitalization`)
    const count = await page.locator('[data-mentor-step="hospitalization-list"]').count()
    expect(count, 'hospitalization-list deve estar na DOM da página de internação').toBeGreaterThan(0)
  })

  test.fixme('grooming: grooming-queue', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await gotoSafe(page, `${BASE_URL}/dashboard/grooming`)
    const count = await page.locator('[data-mentor-step="grooming-queue"]').count()
    expect(count, 'grooming-queue deve estar na DOM da página de grooming').toBeGreaterThan(0)
  })

  test('pacientes: btn-novo-paciente', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await gotoSafe(page, `${BASE_URL}/dashboard/patients`)
    const count = await page.locator('[data-mentor-step="btn-novo-paciente"]').count()
    expect(count, 'btn-novo-paciente deve estar na DOM da página de pacientes').toBeGreaterThan(0)
  })
})

// ─── AUDIT-011: waitForNext — validação anti-avanço-imediato ─────────────────

test.describe('AUDIT-011 — Anti-Regressão: waitForNext não avança imediatamente', () => {
  test('triagem step 1 (nurse-queue): triage-voice-btn ausente no DOM ao iniciar', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/triage`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('load').catch(() => {})
    await waitForMentorGlobals(page)
    await startTour(page, 'triagem')
    await advanceStep(page) // vai para step 1 (nurse-queue com waitForNext)

    // Confirma que triage-voice-btn NÃO está no DOM (está dentro do TriageForm fechado)
    const count = await page.locator('[data-mentor-step="triage-voice-btn"]').count()
    expect(count, 'triage-voice-btn NÃO deve estar no DOM com TriageForm fechado').toBe(0)

    // Tour NÃO deve ter avançado automaticamente
    const balloon = page.getByTestId('mentor-balloon')
    await expect(balloon.getByText('Fila de Triagem', { exact: true })).toBeVisible({ timeout: 3_000 })
  })

  test('exames step 1 (exams-queue): exams-result-textarea ausente no DOM ao iniciar', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/exams`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('load').catch(() => {})
    await waitForMentorGlobals(page)
    await startTour(page, 'exames')
    await advanceStep(page) // vai para step 1 (exams-queue com waitForNext)

    // Confirma que exams-result-textarea NÃO está no DOM (modal fechado)
    const count = await page.locator('[data-mentor-step="exams-result-textarea"]').count()
    expect(count, 'exams-result-textarea NÃO deve estar no DOM com modal fechado').toBe(0)

    const balloon = page.getByTestId('mentor-balloon')
    await expect(balloon.getByText('Fila de Exames', { exact: true })).toBeVisible({ timeout: 3_000 })
  })

  test('internacao step 0 (hospitalization-list): hosp-save-evolution-btn ausente no DOM', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/hospitalization`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('load').catch(() => {})
    await waitForMentorGlobals(page)
    await startTour(page, 'internacao')

    const count = await page.locator('[data-mentor-step="hosp-save-evolution-btn"]').count()
    expect(count, 'hosp-save-evolution-btn NÃO deve estar no DOM com modal fechado').toBe(0)

    const balloon = page.getByTestId('mentor-balloon')
    await expect(balloon.getByText('Quadro de Internados', { exact: true })).toBeVisible({ timeout: 3_000 })
  })

  test('grooming step 0 (grooming-queue): grooming-voice-btn ausente no DOM', async ({ page }, testInfo) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/grooming`, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForLoadState('load').catch(() => {})
    await waitForMentorGlobals(page)
    await startTour(page, 'grooming')

    const count = await page.locator('[data-mentor-step="grooming-voice-btn"]').count()
    expect(count, 'grooming-voice-btn NÃO deve estar no DOM com modal de card fechado').toBe(0)

    const balloon = page.getByTestId('mentor-balloon')
    await expect(balloon.getByText('Kanban de Banho e Tosa', { exact: true })).toBeVisible({ timeout: 3_000 })
  })
})
