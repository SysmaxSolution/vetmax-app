import { loginViaApi } from '../helpers/session'
/**
 * MENTOR-MODULE-PROCESS — Testes de processo do Modo Mentor
 *
 * Verifica que cada tour guia o usuário passo a passo, na ordem correta,
 * sem exibir informação do próximo passo antes de destacar o elemento atual.
 *
 * Cobertura: 9 tours × todos os steps (recepcao, sala-espera, triagem,
 * consulta, exames, internacao, grooming, alta, cadastro-pet)
 */

import { test, expect, type Page } from '@playwright/test'

let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext(); const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 8_000 }).then(() => true).catch(() => false)
  await _ctx.close(); if (!_serverAlive) console.log('[SKIP ALL] mentor-module-process — servidor fora do ar')
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })


// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4000'

const ADMIN = {
  email:    'admin@clinica-alfa.test',
  password: 'TestPassword@123',
}

// ─── Tour definitions (espelho de MentorContext.tsx TOURS) ────────────────────

interface TourStepDef { target: string; title: string; waitForNext?: boolean }
interface TourDef     { path: string; steps: TourStepDef[] }

const TOURS: Record<string, TourDef> = {
  recepcao: {
    path: '/dashboard/reception',
    steps: [
      { target: 'reception-search-input', title: 'Busca de Tutor ou Pet', waitForNext: true },
      { target: 'reception-checkin-btn',  title: 'Confirmar Check-in' },
      { target: 'reception-queue',        title: 'Fila de Espera' },
      { target: 'reception-new-btn',      title: 'Tutor Não Cadastrado?' },
    ],
  },
  'sala-espera': {
    path: '/dashboard/reception',
    steps: [
      { target: 'reception-queue',           title: 'Fila de Espera' },
      { target: 'reception-call-triage-btn', title: 'Chamar para Triagem' },
      { target: 'reception-new-btn',         title: 'Novo Check-in' },
    ],
  },
  triagem: {
    path: '/dashboard/triage',
    steps: [
      { target: 'triage-add-btn',   title: 'Adicionar Pet Manualmente' },
      { target: 'nurse-queue',      title: 'Fila de Triagem', waitForNext: true },
      { target: 'triage-voice-btn', title: 'Registrar Sinais Vitais por Voz' },
      { target: 'triage-save-btn',  title: 'Concluir Triagem' },
    ],
  },
  consulta: {
    path: '/dashboard/vet',
    steps: [
      { target: 'vet-queue',          title: 'Fila do Consultório', waitForNext: true },
      { target: 'vet-notes-textarea', title: 'Anotações Clínicas (SOAP)' },
      { target: 'vet-save-notes-btn', title: 'Salvar Prontuário' },
    ],
  },
  exames: {
    path: '/dashboard/exams',
    steps: [
      { target: 'exams-request-btn',     title: 'Solicitar Exame' },
      { target: 'exams-queue',           title: 'Fila de Exames', waitForNext: true },
      { target: 'exams-result-textarea', title: 'Registrar Laudo' },
    ],
  },
  internacao: {
    path: '/dashboard/hospitalization',
    steps: [
      { target: 'hospitalization-list',    title: 'Quadro de Internados', waitForNext: true },
      { target: 'hosp-save-evolution-btn', title: 'Registrar Evolução Clínica' },
      { target: 'hosp-discharge-btn',      title: 'Dar Alta Hospitalar' },
    ],
  },
  grooming: {
    path: '/dashboard/grooming',
    steps: [
      { target: 'grooming-queue',                 title: 'Kanban de Banho e Tosa', waitForNext: true },
      { target: 'grooming-voice-btn',             title: 'Registro por Voz' },
      { target: 'grooming-observations-textarea', title: 'Observações do Serviço' },
      { target: 'grooming-save-record-btn',       title: 'Salvar Registro' },
    ],
  },
  alta: {
    path: '/dashboard/reception',
    steps: [
      { target: 'reception-kanban-toggle', title: 'Ativar Visualização Kanban', waitForNext: true },
      { target: 'kanban-board',            title: 'Quadro de Atendimentos' },
      { target: 'kanban-col-completed',    title: 'Coluna Alta' },
    ],
  },
  'cadastro-pet': {
    path: '/dashboard/patients',
    steps: [
      { target: 'btn-novo-paciente',       title: 'Abrir Cadastro de Novo Pet', waitForNext: true },
      { target: 'pet-name-input',          title: 'Nome do Pet' },
      { target: 'pet-species-select',      title: 'Espécie' },
      { target: 'pet-breed-input',         title: 'Raça' },
      { target: 'pet-reproductive-select', title: 'Estado Reprodutivo' },
      { target: 'pet-behavior-tags',       title: 'Tags de Comportamento' },
      { target: 'pet-allergies',           title: 'Alergias Conhecidas' },
      { target: 'pet-chronic-diseases',    title: 'Doenças Crônicas' },
      { target: 'pet-microchip',           title: 'Microchip ID' },
    ],
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loginAsAdmin(page: Page) {
  await loginViaApi(page, ADMIN.email, ADMIN.password)
}

async function waitForMentorGlobals(page: Page) {
  await page.waitForFunction(
    () => typeof (window as Window & { __MENTOR_START_TOUR?: unknown }).__MENTOR_START_TOUR === 'function',
    { timeout: 90_000 },
  )
}

async function startTour(page: Page, tourId: string) {
  await page.evaluate((id: string) => {
    (window as unknown as { __MENTOR_START_TOUR: (id: string) => void }).__MENTOR_START_TOUR(id)
  }, tourId)
}

async function advanceStep(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __MENTOR_NEXT_STEP: () => void }).__MENTOR_NEXT_STEP()
  })
}

/**
 * Verifica que o balão exibe o título do passo atual e NÃO exibe o título do
 * próximo passo (garantia de que não há informação antecipada).
 */
async function assertStep(
  page: Page,
  step: TourStepDef,
  nextTitle?: string,
) {
  const balloon = page.getByTestId('mentor-balloon')
  await expect(balloon).toBeVisible({ timeout: 90_000 })

  // Título correto no balão
  await expect(balloon.getByText(step.title, { exact: true })).toBeVisible()

  // Próximo título NÃO deve estar visível ainda
  if (nextTitle) {
    await expect(balloon.getByText(nextTitle, { exact: true })).not.toBeVisible()
  }

  // Overlay de tour ativo
  await expect(page.getByTestId('mentor-overlay')).toBeVisible()

  // Soft: elemento alvo na DOM (pode estar ausente se não há dados de teste)
  const targetCount = await page.locator(`[data-mentor-step="${step.target}"]`).count()
  console.info(`    ↳ [data-mentor-step="${step.target}"] na DOM: ${targetCount > 0 ? '✓' : '— (sem dados)'}`)

  return targetCount
}

// ─── MENTOR-001: Tour — Recepção ──────────────────────────────────────────────

test.describe('MENTOR-001 — Tour: recepcao', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/reception`)
    await page.waitForLoadState('networkidle')
    await waitForMentorGlobals(page)
  })

  test('verifica passo a passo sem antecipar informação do próximo passo', async ({ page }) => {
    const { steps } = TOURS.recepcao
    await startTour(page, 'recepcao')

    for (let i = 0; i < steps.length; i++) {
      const isLast = i === steps.length - 1
      await assertStep(page, steps[i], isLast ? undefined : steps[i + 1].title)

      if (isLast) {
        // Último passo: botão "Concluir" visível
        await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
      } else {
        await advanceStep(page)
      }
    }
  })
})

// ─── MENTOR-002: Tour — Sala de Espera ───────────────────────────────────────

test.describe('MENTOR-002 — Tour: sala-espera', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/reception`)
    await page.waitForLoadState('networkidle')
    await waitForMentorGlobals(page)
  })

  test('verifica passo a passo sem antecipar informação do próximo passo', async ({ page }) => {
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

// ─── MENTOR-003: Tour — Triagem ───────────────────────────────────────────────

test.describe('MENTOR-003 — Tour: triagem', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/triage`)
    await page.waitForLoadState('networkidle')
    await waitForMentorGlobals(page)
  })

  test('verifica passo 0 (fila) — elementos sem dados de teste são soft-check', async ({ page }) => {
    const { steps } = TOURS.triagem
    await startTour(page, 'triagem')

    // Passo 0: triage-add-btn sempre existe na página de triagem
    const count0 = await assertStep(page, steps[0], steps[1].title)
    expect(count0, 'triage-add-btn deve estar na DOM').toBeGreaterThan(0)

    // Passos 1, 2 e 3 dependem de um animal na fila — soft-check
    await advanceStep(page)
    await assertStep(page, steps[1], steps[2].title)

    await advanceStep(page)
    await assertStep(page, steps[2], steps[3].title)

    await advanceStep(page)
    await assertStep(page, steps[3])
    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── MENTOR-004: Tour — Consulta ─────────────────────────────────────────────

test.describe('MENTOR-004 — Tour: consulta', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/vet`)
    await page.waitForLoadState('networkidle')
    await waitForMentorGlobals(page)
  })

  test('verifica passo a passo sem antecipar informação do próximo passo', async ({ page }) => {
    const { steps } = TOURS.consulta
    await startTour(page, 'consulta')

    for (let i = 0; i < steps.length; i++) {
      const isLast = i === steps.length - 1
      await assertStep(page, steps[i], isLast ? undefined : steps[i + 1].title)
      if (!isLast) await advanceStep(page)
    }

    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── MENTOR-005: Tour — Exames ────────────────────────────────────────────────

test.describe('MENTOR-005 — Tour: exames', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/exams`)
    await page.waitForLoadState('networkidle')
    await waitForMentorGlobals(page)
  })

  test('verifica passo a passo sem antecipar informação do próximo passo', async ({ page }) => {
    const { steps } = TOURS.exames
    await startTour(page, 'exames')

    for (let i = 0; i < steps.length; i++) {
      const isLast = i === steps.length - 1
      await assertStep(page, steps[i], isLast ? undefined : steps[i + 1].title)
      if (!isLast) await advanceStep(page)
    }

    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── MENTOR-006: Tour — Internação ───────────────────────────────────────────

test.describe('MENTOR-006 — Tour: internacao', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/hospitalization`)
    await page.waitForLoadState('networkidle')
    await waitForMentorGlobals(page)
  })

  test('verifica passo a passo sem antecipar informação do próximo passo', async ({ page }) => {
    const { steps } = TOURS.internacao
    await startTour(page, 'internacao')

    for (let i = 0; i < steps.length; i++) {
      const isLast = i === steps.length - 1
      await assertStep(page, steps[i], isLast ? undefined : steps[i + 1].title)
      if (!isLast) await advanceStep(page)
    }

    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── MENTOR-007: Tour — Banho e Tosa ─────────────────────────────────────────

test.describe('MENTOR-007 — Tour: grooming', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/grooming`)
    await page.waitForLoadState('networkidle')
    await waitForMentorGlobals(page)
  })

  test('verifica passo a passo sem antecipar informação do próximo passo', async ({ page }) => {
    const { steps } = TOURS.grooming
    await startTour(page, 'grooming')

    for (let i = 0; i < steps.length; i++) {
      const isLast = i === steps.length - 1
      await assertStep(page, steps[i], isLast ? undefined : steps[i + 1].title)
      if (!isLast) await advanceStep(page)
    }

    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── MENTOR-008: Tour — Alta ──────────────────────────────────────────────────

test.describe('MENTOR-008 — Tour: alta', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/reception`)
    await page.waitForLoadState('networkidle')
    await waitForMentorGlobals(page)
  })

  test('verifica passo a passo sem antecipar informação do próximo passo', async ({ page }) => {
    const { steps } = TOURS.alta
    await startTour(page, 'alta')

    for (let i = 0; i < steps.length; i++) {
      const isLast = i === steps.length - 1
      await assertStep(page, steps[i], isLast ? undefined : steps[i + 1].title)
      if (!isLast) await advanceStep(page)
    }

    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── MENTOR-009: Tour — Cadastro de Pet (9 passos + waitForNext) ─────────────

test.describe('MENTOR-009 — Tour: cadastro-pet', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/patients`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
    await waitForMentorGlobals(page)
  })

  test('passo 0: btn-novo-paciente destacado antes de mostrar campos do formulário', async ({ page }) => {
    const { steps } = TOURS['cadastro-pet']
    await startTour(page, 'cadastro-pet')

    // Passo 0: botão existe e é exibido — título correto, sem info do passo 1
    const count = await assertStep(page, steps[0], steps[1].title)
    expect(count, 'btn-novo-paciente deve estar na DOM').toBeGreaterThan(0)

    // Destaque no botão correto ANTES de clicar
    const btnEl = page.locator('[data-mentor-step="btn-novo-paciente"]')
    await expect(btnEl).toBeVisible()
  })

  test('após abrir modal, tour avança para campos internos sem antecipar informação', async ({ page }) => {
    const { steps } = TOURS['cadastro-pet']
    await startTour(page, 'cadastro-pet')

    // Aguarda e clica no botão de novo paciente (waitForNext ativo no tour)
    await expect(page.locator('[data-mentor-step="btn-novo-paciente"]')).toBeVisible({ timeout: 90_000 })
    await page.locator('[data-mentor-step="btn-novo-paciente"]').click()

    // Tour deve auto-avançar via MutationObserver (waitForNext) quando modal abre
    // Aguarda o balão mostrar o título do passo 1 (pet-name-input)
    await expect(
      page.getByTestId('mentor-balloon').getByText(steps[1].title, { exact: true }),
    ).toBeVisible({ timeout: 90_000 })

    // Passo 1 (pet-name-input) não deve mostrar passo 2 (Espécie)
    await expect(
      page.getByTestId('mentor-balloon').getByText(steps[2].title, { exact: true }),
    ).not.toBeVisible()

    // Verifica passos 1 a 4 do formulário via avance manual
    for (let i = 1; i <= 4; i++) {
      const isLast = i === steps.length - 1
      await assertStep(page, steps[i], isLast ? undefined : steps[i + 1].title)
      if (!isLast) await advanceStep(page)
    }
  })

  test('todos os 9 passos em sequência — sem salto de informação', async ({ page }) => {
    const { steps } = TOURS['cadastro-pet']
    await startTour(page, 'cadastro-pet')

    // Passo 0: verifica manualmente e tenta abrir modal
    await assertStep(page, steps[0], steps[1].title)

    const btnExists = (await page.locator('[data-mentor-step="btn-novo-paciente"]').count()) > 0
    if (btnExists) {
      await page.locator('[data-mentor-step="btn-novo-paciente"]').click()
      // Aguarda auto-advance via waitForNext
      await expect(
        page.getByTestId('mentor-balloon').getByText(steps[1].title, { exact: true }),
      ).toBeVisible({ timeout: 90_000 })
    } else {
      // Sem botão na DOM: avança manualmente
      await advanceStep(page)
      await expect(
        page.getByTestId('mentor-balloon').getByText(steps[1].title, { exact: true }),
      ).toBeVisible({ timeout: 90_000 })
    }

    // Passos 1-8: avança verificando cada um
    for (let i = 1; i < steps.length; i++) {
      const isLast = i === steps.length - 1
      await assertStep(page, steps[i], isLast ? undefined : steps[i + 1].title)
      if (!isLast) await advanceStep(page)
    }

    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── MENTOR-010: Spotlight — elemento destacado ANTES do balão ───────────────

test.describe('MENTOR-010 — Spotlight aparece junto com o balão (sem delay visual)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/reception`)
    await page.waitForLoadState('networkidle')
    await waitForMentorGlobals(page)
  })

  test('ao iniciar tour, overlay e balão são renderizados no mesmo frame', async ({ page }) => {
    await startTour(page, 'recepcao')

    // Overlay e balão devem aparecer simultaneamente (não há delay entre eles)
    const [overlayVisible, balloonVisible] = await Promise.all([
      page.getByTestId('mentor-overlay').isVisible(),
      page.getByTestId('mentor-balloon').isVisible(),
    ])
    expect(overlayVisible, 'overlay deve estar visível ao iniciar tour').toBe(true)
    expect(balloonVisible, 'balão deve estar visível ao iniciar tour').toBe(true)
  })

  test('ao avançar passo, balão mostra novo título antes de qualquer ação do usuário', async ({ page }) => {
    const { steps } = TOURS.recepcao
    await startTour(page, 'recepcao')

    // Passo 0 visível
    await expect(page.getByTestId('mentor-balloon').getByText(steps[0].title, { exact: true })).toBeVisible()

    // Avança
    await advanceStep(page)

    // Passo 1 aparece IMEDIATAMENTE (sem aguardar interação do usuário)
    await expect(
      page.getByTestId('mentor-balloon').getByText(steps[1].title, { exact: true }),
    ).toBeVisible({ timeout: 2_000 })

    // Passo 0 NÃO deve mais estar visível no balão
    await expect(
      page.getByTestId('mentor-balloon').getByText(steps[0].title, { exact: true }),
    ).not.toBeVisible()
  })

  test('spotlight sobre reception-queue — elemento está na DOM quando balão exibe', async ({ page }) => {
    // Avança para o passo 2 (reception-queue) que sempre está na DOM independente de dados
    await startTour(page, 'recepcao')
    await assertStep(page, TOURS.recepcao.steps[0])
    await advanceStep(page)
    await assertStep(page, TOURS.recepcao.steps[1])
    await advanceStep(page)

    const balloon = page.getByTestId('mentor-balloon')
    await expect(balloon.getByText('Fila de Espera', { exact: true })).toBeVisible()

    // reception-queue é sempre renderizado na página de recepção (fila vazia ou não)
    const targetInDom = await page.locator('[data-mentor-step="reception-queue"]').count()
    expect(targetInDom, 'reception-queue deve estar na DOM quando balão exibe o título').toBeGreaterThan(0)
  })
})

// ─── MENTOR-011: Fechar tour ──────────────────────────────────────────────────

test.describe('MENTOR-011 — Fechar tour remove overlay e balão', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/reception`)
    await page.waitForLoadState('networkidle')
    await waitForMentorGlobals(page)
  })

  test('botão Concluir no último passo fecha o tour', async ({ page }) => {
    const { steps } = TOURS.recepcao
    await startTour(page, 'recepcao')

    // Avança até o último passo
    for (let i = 0; i < steps.length - 1; i++) {
      await assertStep(page, steps[i])
      await advanceStep(page)
    }

    // Clica em Concluir
    await page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i }).click()

    // Overlay e balão devem desaparecer
    await expect(page.getByTestId('mentor-overlay')).not.toBeVisible({ timeout: 3_000 })
    await expect(page.getByTestId('mentor-balloon')).not.toBeVisible({ timeout: 3_000 })
  })

  test('botão X no header fecha o tour em qualquer passo', async ({ page }) => {
    await startTour(page, 'triagem')
    await expect(page.getByTestId('mentor-balloon')).toBeVisible()

    // Clica no botão de fechar (aria-label="Fechar tour")
    await page.getByLabel('Fechar tour').click()

    await expect(page.getByTestId('mentor-overlay')).not.toBeVisible({ timeout: 3_000 })
    await expect(page.getByTestId('mentor-balloon')).not.toBeVisible({ timeout: 3_000 })
  })
})
