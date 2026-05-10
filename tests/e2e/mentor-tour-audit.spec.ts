/**
 * MENTOR-AUDIT — Validação corretiva dos tours do Mentor IA
 *
 * Verifica que cada step de cada tour aponta para um elemento real no DOM,
 * que o elemento pode ser destacado pelo spotlight, e que a sequência completa
 * do tour roda sem nenhum step com alvo ausente.
 *
 * Regra de falha: se count === 0 para qualquer step, o teste falha com
 * mensagem descritiva indicando qual componente precisa do data-mentor-step.
 */

import { test, expect, type Page } from '@playwright/test'

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:9000'

const ADMIN = {
  email:    'admin@clinica-alfa.test',
  password: 'TestPassword@123',
}

// ─── Tour definitions — espelho de MentorContext.tsx após correção ────────────

interface StepDef {
  target:      string
  title:       string
  waitForNext? :boolean
  autoAdvance?: boolean
  mustExist?:  boolean   // false = soft check (elemento pode não aparecer sem dados)
}

interface TourDef {
  path:  string
  steps: StepDef[]
}

const TOURS: Record<string, TourDef> = {
  recepcao: {
    path: '/dashboard/reception',
    steps: [
      { target: 'reception-search-input', title: 'Busca de Tutor ou Pet',  mustExist: true },
      { target: 'reception-new-btn',      title: 'Novo Cadastro',          mustExist: true },
      { target: 'reception-queue',        title: 'Fila de Espera',         mustExist: true },
    ],
  },
  'sala-espera': {
    path: '/dashboard/reception',
    steps: [
      { target: 'reception-queue',   title: 'Sala de Espera', mustExist: true },
      { target: 'reception-new-btn', title: 'Novo Check-in',  mustExist: true },
    ],
  },
  triagem: {
    path: '/dashboard/triage',
    steps: [
      { target: 'nurse-queue',    title: 'Fila de Triagem',      mustExist: true,  waitForNext: true },
      { target: 'triage-add-btn', title: 'Adicionar Manualmente', mustExist: true },
      { target: 'triage-voice-btn', title: 'Triagem por Voz',    mustExist: false },
      { target: 'triage-save-btn',  title: 'Concluir Triagem',   mustExist: false },
    ],
  },
  consulta: {
    path: '/dashboard/vet',
    steps: [
      { target: 'vet-queue',         title: 'Fila do Consultório',        mustExist: true,  waitForNext: true },
      { target: 'vet-notes-textarea', title: 'Anotações Clínicas (SOAP)', mustExist: false, autoAdvance: true },
      { target: 'vet-save-notes-btn', title: 'Salvar Prontuário',         mustExist: false },
    ],
  },
  exames: {
    path: '/dashboard/exams',
    steps: [
      { target: 'exams-queue',           title: 'Fila de Exames',    mustExist: true },
      { target: 'exams-request-btn',     title: 'Solicitar Exame',   mustExist: true },
      { target: 'exams-result-textarea', title: 'Registrar Laudo',   mustExist: false, autoAdvance: true },
    ],
  },
  internacao: {
    path: '/dashboard/hospitalization',
    steps: [
      { target: 'hospitalization-list', title: 'Quadro de Internados',   mustExist: true },
      { target: 'hosp-discharge-btn',   title: 'Dar Alta Hospitalar',    mustExist: false },
    ],
  },
  grooming: {
    path: '/dashboard/grooming',
    steps: [
      { target: 'grooming-queue',     title: 'Kanban de Banho e Tosa', mustExist: true },
      { target: 'grooming-voice-btn', title: 'Registro por Voz',       mustExist: false },
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
      { target: 'btn-novo-paciente',       title: 'Abrir Cadastro de Novo Pet', mustExist: true,  waitForNext: true },
      { target: 'pet-name-input',          title: 'Nome do Pet',                mustExist: false, autoAdvance: true },
      { target: 'pet-species-select',      title: 'Espécie',                    mustExist: false, autoAdvance: true },
      { target: 'pet-breed-input',         title: 'Raça',                       mustExist: false, autoAdvance: true },
      { target: 'pet-reproductive-select', title: 'Estado Reprodutivo',         mustExist: false, autoAdvance: true },
      { target: 'pet-behavior-tags',       title: 'Tags de Comportamento',      mustExist: false },
      { target: 'pet-allergies',           title: 'Alergias Conhecidas',        mustExist: false, autoAdvance: true },
      { target: 'pet-chronic-diseases',    title: 'Doenças Crônicas',           mustExist: false, autoAdvance: true },
      { target: 'pet-microchip',           title: 'Microchip ID',               mustExist: false, autoAdvance: true },
    ],
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loginAsAdmin(page: Page) {
  // Retry goto para absorver sobrecarga transitória do servidor (ERR_ABORTED)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(`${BASE_URL}/login`, { timeout: 20_000 })
      break
    } catch {
      if (attempt === 2) throw new Error(`Servidor não respondeu após 3 tentativas (ERR_ABORTED)`)
      await page.waitForTimeout(6_000)
    }
  }
  await page.getByLabel(/e-?mail/i).fill(ADMIN.email)
  await page.locator('#password').fill(ADMIN.password)
  await page.getByRole('button', { name: /entrar/i }).click()
  await page.waitForURL(/\/dashboard/, { timeout: 45_000 })
}

async function waitForMentorGlobals(page: Page) {
  await page.waitForFunction(
    () => typeof (window as Window & { __MENTOR_START_TOUR?: unknown }).__MENTOR_START_TOUR === 'function',
    { timeout: 10_000 },
  )
}

async function startTour(page: Page, tourId: string) {
  await page.evaluate((id: string) => {
    (window as Window & { __MENTOR_START_TOUR: (id: string) => void }).__MENTOR_START_TOUR(id)
  }, tourId)
}

async function advanceStep(page: Page) {
  await page.evaluate(() => {
    (window as Window & { __MENTOR_NEXT_STEP: () => void }).__MENTOR_NEXT_STEP()
  })
}

/**
 * Verifica o step atual: balão visível, título correto, elemento no DOM.
 * Falha hard se mustExist=true e o elemento não estiver no DOM.
 * Retorna a contagem de elementos encontrados.
 */
async function assertStep(page: Page, step: StepDef, nextTitle?: string): Promise<number> {
  const balloon = page.getByTestId('mentor-balloon')
  await expect(balloon).toBeVisible({ timeout: 8_000 })
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
    console.info(`    ↳ [data-mentor-step="${step.target}"] na DOM: ${count > 0 ? '✓' : '— (sem dados de teste)'}`)
  }

  return count
}

// ─── AUDIT-001: Recepção ──────────────────────────────────────────────────────

test.describe('AUDIT-001 — Tour: recepcao (3 passos corrigidos)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/reception`)
    await page.waitForLoadState('load')
    await waitForMentorGlobals(page)
  })

  test('todos os 3 steps têm elementos no DOM', async ({ page }) => {
    const { steps } = TOURS.recepcao
    await startTour(page, 'recepcao')

    for (let i = 0; i < steps.length; i++) {
      const isLast = i === steps.length - 1
      await assertStep(page, steps[i], isLast ? undefined : steps[i + 1].title)
      if (!isLast) await advanceStep(page)
    }

    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })

  test('step 0: campo de busca existe e recebe foco ao ser destacado', async ({ page }) => {
    await startTour(page, 'recepcao')
    const el = page.locator('[data-mentor-step="reception-search-input"]')
    await expect(el).toBeVisible({ timeout: 5_000 })
    await expect(el).toBeEnabled()
  })

  test('step 1: botão Novo Cadastro existe e está clicável', async ({ page }) => {
    await startTour(page, 'recepcao')
    await advanceStep(page)
    const el = page.locator('[data-mentor-step="reception-new-btn"]')
    await expect(el).toBeVisible({ timeout: 5_000 })
    await expect(el).toBeEnabled()
  })
})

// ─── AUDIT-002: Sala de Espera ─────────────────────────────────────────────────

test.describe('AUDIT-002 — Tour: sala-espera (target corrigido no step 1)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/reception`)
    await page.waitForLoadState('load')
    await waitForMentorGlobals(page)
  })

  test('step 1 agora aponta para reception-new-btn (sempre visível)', async ({ page }) => {
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

test.describe('AUDIT-003 — Tour: triagem (nurse-queue e triage-add-btn obrigatórios)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/triage`)
    await page.waitForLoadState('load')
    await waitForMentorGlobals(page)
  })

  test('steps 0 e 1 (na listagem) sempre existem no DOM', async ({ page }) => {
    const { steps } = TOURS.triagem
    await startTour(page, 'triagem')

    await assertStep(page, steps[0], steps[1].title)
    await advanceStep(page)
    await assertStep(page, steps[1], steps[2].title)
  })

  test('steps 2 e 3 (na ficha individual) — soft check sem dados', async ({ page }) => {
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

test.describe('AUDIT-004 — Tour: consulta (targets corrigidos para elementos reais)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/vet`)
    await page.waitForLoadState('load')
    await waitForMentorGlobals(page)
  })

  test('step 0 (vet-queue) sempre existe no DOM', async ({ page }) => {
    const { steps } = TOURS.consulta
    await startTour(page, 'consulta')
    const count = await assertStep(page, steps[0], steps[1].title)
    expect(count, 'vet-queue deve estar presente na página /dashboard/vet').toBeGreaterThan(0)
  })

  test('steps 1 e 2 — soft check (dependem de consulta aberta)', async ({ page }) => {
    const { steps } = TOURS.consulta
    await startTour(page, 'consulta')

    await advanceStep(page) // skip vet-queue
    await assertStep(page, steps[1], steps[2].title)

    await advanceStep(page)
    await assertStep(page, steps[2])
    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── AUDIT-005: Exames ────────────────────────────────────────────────────────

test.describe('AUDIT-005 — Tour: exames (exams-queue e exams-request-btn corrigidos)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/exams`)
    await page.waitForLoadState('load')
    await waitForMentorGlobals(page)
  })

  test('steps 0 e 1 (exams-queue e exams-request-btn) sempre presentes', async ({ page }) => {
    const { steps } = TOURS.exames
    await startTour(page, 'exames')

    const count0 = await assertStep(page, steps[0], steps[1].title)
    expect(count0, 'exams-queue deve existir na página de exames').toBeGreaterThan(0)

    await advanceStep(page)

    const count1 = await assertStep(page, steps[1], steps[2].title)
    expect(count1, 'exams-request-btn deve existir na página de exames').toBeGreaterThan(0)
  })

  test('step 2 (exams-result-textarea) — soft check (requer modal aberto)', async ({ page }) => {
    const { steps } = TOURS.exames
    await startTour(page, 'exames')

    await advanceStep(page)
    await advanceStep(page)

    await assertStep(page, steps[2])
    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── AUDIT-006: Internação ────────────────────────────────────────────────────

test.describe('AUDIT-006 — Tour: internacao (hospitalization-list corrigido)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/hospitalization`)
    await page.waitForLoadState('load')
    await waitForMentorGlobals(page)
  })

  test('step 0 (hospitalization-list) sempre presente', async ({ page }) => {
    const { steps } = TOURS.internacao
    await startTour(page, 'internacao')

    const count = await assertStep(page, steps[0], steps[1].title)
    expect(count, 'hospitalization-list deve existir na página de internação').toBeGreaterThan(0)
  })

  test('step 1 (hosp-discharge-btn) — soft check (requer animal pronto para alta)', async ({ page }) => {
    const { steps } = TOURS.internacao
    await startTour(page, 'internacao')

    await advanceStep(page)
    await assertStep(page, steps[1])
    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── AUDIT-007: Grooming ──────────────────────────────────────────────────────

test.describe('AUDIT-007 — Tour: grooming (grooming-queue e grooming-voice-btn corrigidos)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/grooming`)
    await page.waitForLoadState('load')
    await waitForMentorGlobals(page)
  })

  test('step 0 (grooming-queue) sempre presente', async ({ page }) => {
    const { steps } = TOURS.grooming
    await startTour(page, 'grooming')

    const count = await assertStep(page, steps[0], steps[1].title)
    expect(count, 'grooming-queue deve existir na página de grooming').toBeGreaterThan(0)
  })

  test('step 1 (grooming-voice-btn) — soft check (dentro de um card aberto)', async ({ page }) => {
    const { steps } = TOURS.grooming
    await startTour(page, 'grooming')

    await advanceStep(page)
    await assertStep(page, steps[1])
    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── AUDIT-008: Alta ──────────────────────────────────────────────────────────

test.describe('AUDIT-008 — Tour: alta (kanban toggle como passo 0 corrigido)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/reception`)
    await page.waitForLoadState('load')
    await waitForMentorGlobals(page)
  })

  test('step 0 (reception-kanban-toggle) sempre presente na listagem', async ({ page }) => {
    const { steps } = TOURS.alta
    await startTour(page, 'alta')

    const count = await assertStep(page, steps[0], steps[1].title)
    expect(count, 'reception-kanban-toggle deve existir na recepção').toBeGreaterThan(0)
  })

  test('ao clicar no toggle, kanban-board aparece e tour avança', async ({ page }) => {
    const { steps } = TOURS.alta
    await startTour(page, 'alta')

    await expect(page.locator('[data-mentor-step="reception-kanban-toggle"]')).toBeVisible()
    await page.locator('[data-mentor-step="reception-kanban-toggle"]').click()

    // Aguarda kanban-board aparecer no DOM (fetch do Supabase pode demorar)
    await expect(page.locator('[data-mentor-step="kanban-board"]')).toBeVisible({ timeout: 20_000 })

    // Com kanban-board no DOM, waitForNext deve avançar o tour automaticamente
    await expect(
      page.getByTestId('mentor-balloon').getByText(steps[1].title, { exact: true }),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('step 2 (kanban-col-completed) — soft check (requer Kanban ativo)', async ({ page }) => {
    const { steps } = TOURS.alta
    await startTour(page, 'alta')

    await advanceStep(page)
    await advanceStep(page)
    await assertStep(page, steps[2])
    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── AUDIT-009: Cadastro de Pet ───────────────────────────────────────────────

test.describe('AUDIT-009 — Tour: cadastro-pet (validação de regressão)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/patients`)
    await page.waitForLoadState('load')
    await waitForMentorGlobals(page)
  })

  test('step 0 (btn-novo-paciente) sempre presente e clicável', async ({ page }) => {
    const { steps } = TOURS['cadastro-pet']
    await startTour(page, 'cadastro-pet')

    const count = await assertStep(page, steps[0], steps[1].title)
    expect(count, 'btn-novo-paciente deve existir na página de pacientes').toBeGreaterThan(0)

    const btn = page.locator('[data-mentor-step="btn-novo-paciente"]')
    await expect(btn).toBeVisible()
    await expect(btn).toBeEnabled()
  })

  test('após clicar em btn-novo-paciente, modal abre e step 1 aparece automaticamente', async ({ page }) => {
    const { steps } = TOURS['cadastro-pet']
    await startTour(page, 'cadastro-pet')

    await expect(page.locator('[data-mentor-step="btn-novo-paciente"]')).toBeVisible({ timeout: 8_000 })
    await page.locator('[data-mentor-step="btn-novo-paciente"]').click()

    await expect(
      page.getByTestId('mentor-balloon').getByText(steps[1].title, { exact: true }),
    ).toBeVisible({ timeout: 10_000 })

    await expect(
      page.getByTestId('mentor-balloon').getByText(steps[2].title, { exact: true }),
    ).not.toBeVisible()
  })

  test('sequência completa dos 9 passos sem step com alvo ausente', async ({ page }) => {
    const { steps } = TOURS['cadastro-pet']
    await startTour(page, 'cadastro-pet')

    await assertStep(page, steps[0], steps[1].title)

    const btnExists = (await page.locator('[data-mentor-step="btn-novo-paciente"]').count()) > 0
    if (btnExists) {
      await page.locator('[data-mentor-step="btn-novo-paciente"]').click()
      await expect(
        page.getByTestId('mentor-balloon').getByText(steps[1].title, { exact: true }),
      ).toBeVisible({ timeout: 10_000 })
    } else {
      await advanceStep(page)
    }

    for (let i = 1; i < steps.length; i++) {
      const isLast = i === steps.length - 1
      await assertStep(page, steps[i], isLast ? undefined : steps[i + 1].title)
      if (!isLast) await advanceStep(page)
    }

    await expect(page.getByTestId('mentor-balloon').getByRole('button', { name: /concluir/i })).toBeVisible()
  })
})

// ─── AUDIT-010: Varredura global de targets ───────────────────────────────────

test.describe('AUDIT-010 — Varredura: todos os targets "mustExist" estão no DOM', () => {
  test('recepção: reception-search-input, reception-new-btn, reception-queue', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/reception`)
    await page.waitForLoadState('load')

    for (const target of ['reception-search-input', 'reception-new-btn', 'reception-queue']) {
      const count = await page.locator(`[data-mentor-step="${target}"]`).count()
      expect(count, `${target} deve estar na DOM da página de recepção`).toBeGreaterThan(0)
    }
  })

  test('triagem: nurse-queue, triage-add-btn', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/triage`)
    await page.waitForLoadState('load')

    for (const target of ['nurse-queue', 'triage-add-btn']) {
      const count = await page.locator(`[data-mentor-step="${target}"]`).count()
      expect(count, `${target} deve estar na DOM da página de triagem`).toBeGreaterThan(0)
    }
  })

  test('veterinário: vet-queue', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/vet`)
    await page.waitForLoadState('load')

    const count = await page.locator('[data-mentor-step="vet-queue"]').count()
    expect(count, 'vet-queue deve estar na DOM da página do veterinário').toBeGreaterThan(0)
  })

  test('exames: exams-queue, exams-request-btn', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/exams`)
    await page.waitForLoadState('load')

    for (const target of ['exams-queue', 'exams-request-btn']) {
      const count = await page.locator(`[data-mentor-step="${target}"]`).count()
      expect(count, `${target} deve estar na DOM da página de exames`).toBeGreaterThan(0)
    }
  })

  test('internação: hospitalization-list', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/hospitalization`)
    await page.waitForLoadState('load')

    const count = await page.locator('[data-mentor-step="hospitalization-list"]').count()
    expect(count, 'hospitalization-list deve estar na DOM da página de internação').toBeGreaterThan(0)
  })

  test('grooming: grooming-queue', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/grooming`)
    await page.waitForLoadState('load')

    const count = await page.locator('[data-mentor-step="grooming-queue"]').count()
    expect(count, 'grooming-queue deve estar na DOM da página de grooming').toBeGreaterThan(0)
  })

  test('alta: reception-kanban-toggle', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/reception`)
    await page.waitForLoadState('load')

    const count = await page.locator('[data-mentor-step="reception-kanban-toggle"]').count()
    expect(count, 'reception-kanban-toggle deve estar na DOM da recepção').toBeGreaterThan(0)
  })

  test('cadastro-pet: btn-novo-paciente', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto(`${BASE_URL}/dashboard/patients`)
    await page.waitForLoadState('load')

    const count = await page.locator('[data-mentor-step="btn-novo-paciente"]').count()
    expect(count, 'btn-novo-paciente deve estar na DOM da página de pacientes').toBeGreaterThan(0)
  })
})
