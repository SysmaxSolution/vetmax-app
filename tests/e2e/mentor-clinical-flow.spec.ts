/**
 * [QA] mentor-clinical-flow.spec.ts
 *
 * Testa o Modo Mentor guiando um fluxo clínico completo:
 * Cadastro → Check-in → Triagem → Consulta → Exames → Internação → Alta
 *
 * Requisitos: Clínica com todos os módulos clínicos ativos.
 */

import { test, expect, type Page } from '@playwright/test'
import fixtures from '../fixtures/test-data.json'

// ─── Auth helpers ─────────────────────────────────────────────────────────────

const BASE = process.env.TEST_BASE_URL ?? 'http://localhost:4000'

// Map generic roles to fixture keys (all tests use clinicA)
const ROLE_MAP = {
  receptionist: 'receptionistA',
  vet: 'vetA',
  assistant: 'assistantA',
  admin: 'adminA',
} as const

async function loginAs(page: Page, role: keyof typeof ROLE_MAP) {
  const user = fixtures.users[ROLE_MAP[role]]
  await page.goto(`${BASE}/login`)
  await page.getByLabel(/e-?mail/i).fill(user.email)
  await page.getByLabel(/senha/i).fill(user.password)
  await page.getByRole('button', { name: /entrar/i }).click()
  // Accept onboarding or dashboard as valid post-login destinations
  await page.waitForURL(/\/(dashboard|reception|triage|vet|exams|hospitalization|onboarding)/, { timeout: 30_000 })
}

// ─── Mentor helpers ───────────────────────────────────────────────────────────

/** Abre o chat do Mentor e envia uma mensagem */
async function mentorAsk(page: Page, question: string) {
  // The floating button aria-label is "Abrir Modo Mentor"
  const btn = page.getByLabel('Abrir Modo Mentor')
  await expect(btn).toBeVisible({ timeout: 8_000 })
  // Only click if the chat panel isn't already open
  const inputVisible = await page.getByPlaceholder(/pergunte algo/i).isVisible().catch(() => false)
  if (!inputVisible) await btn.click()
  await expect(page.getByPlaceholder(/pergunte algo/i)).toBeVisible({ timeout: 5_000 })
  await page.getByPlaceholder(/pergunte algo/i).fill(question)
  await page.getByRole('button', { name: /enviar/i }).click()
}

/**
 * Clica no botão de ação de tour do Mentor.
 * O MentorChat renderiza o label como: "Iniciar tour: <tourId>"
 * tourId examples: recepcao, triagem, consulta, exames, internacao, grooming, alta
 */
async function clickTourAction(page: Page, tourId: string) {
  // The action button text is exactly: "Iniciar tour: <tourId>"
  const actionBtn = page.locator('button').filter({ hasText: new RegExp(`iniciar tour.*${tourId}`, 'i') }).last()
  await expect(actionBtn).toBeVisible({ timeout: 10_000 })
  await actionBtn.click()
}

/** Aguarda o balão do tour aparecer com o título esperado */
async function expectTourBalloon(page: Page, titlePattern: RegExp) {
  // Balloon is rendered with position:fixed z-[10000] — it always within viewport
  const balloon = page.locator('.fixed.z-\\[10000\\]')
  await expect(balloon).toBeVisible({ timeout: 8_000 })
  await expect(balloon.getByText(titlePattern)).toBeVisible({ timeout: 5_000 })
}

/** Clica em "Próximo" no balão do tour */
async function tourNext(page: Page) {
  await page.locator('.fixed.z-\\[10000\\] button', { hasText: /próximo/i }).click()
}

/** Clica em "Concluir" no balão do tour */
async function tourFinish(page: Page) {
  await page.locator('.fixed.z-\\[10000\\] button', { hasText: /concluir/i }).click()
}

// ─── Viewport boundary assertion ─────────────────────────────────────────────

/** Garante que o balão está completamente dentro da viewport */
async function assertBalloonInViewport(page: Page) {
  const balloon = page.locator('.fixed.z-\\[10000\\]')
  const box = await balloon.boundingBox()
  if (!box) return // tour ended, skip

  const vp = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1)  // +1 rounding tolerance
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Mentor — Fluxo Clínico Completo', () => {

  test('1. Mentor responde "Como dou entrada no pet?" e inicia tour de Recepção', async ({ page }) => {
    await loginAs(page, 'receptionist')
    await page.goto(`${BASE}/dashboard/reception`)

    await mentorAsk(page, 'Como dou entrada no pet?')
    await expect(page.locator('text=/check-in|ponto de partida/i').last()).toBeVisible({ timeout: 8_000 })
    await clickTourAction(page, 'recepcao')

    await expectTourBalloon(page, /check-in do animal/i)
    await assertBalloonInViewport(page)
    await tourNext(page)
    await expectTourBalloon(page, /fila de espera/i)
    await assertBalloonInViewport(page)
    await tourFinish(page)
  })

  test('2. Mentor responde "Como atendo na triagem?" e guia tour de Triagem', async ({ page }) => {
    await loginAs(page, 'assistant')
    await page.goto(`${BASE}/dashboard/triage`)

    await mentorAsk(page, 'Como atendo na triagem?')
    await expect(page.locator('text=/triagem|sinais vitais/i').last()).toBeVisible({ timeout: 8_000 })
    await clickTourAction(page, 'triagem')

    await expectTourBalloon(page, /fila de triagem/i)
    await assertBalloonInViewport(page)
    await tourNext(page)
    await expectTourBalloon(page, /triagem por voz/i)
    await assertBalloonInViewport(page)
    await tourNext(page)
    await expectTourBalloon(page, /concluir triagem/i)
    await assertBalloonInViewport(page)
    await tourFinish(page)
  })

  test('3. Mentor guia tour de Consultório via pergunta sobre SOAP', async ({ page }) => {
    await loginAs(page, 'vet')
    await page.goto(`${BASE}/dashboard/vet`)

    await mentorAsk(page, 'Como registro a consulta com SOAP?')
    await expect(page.locator('text=/consultório|registrar/i').last()).toBeVisible({ timeout: 8_000 })
    await clickTourAction(page, 'consulta')

    await expectTourBalloon(page, /gravar consulta/i)
    await assertBalloonInViewport(page)
    await tourNext(page)
    await expectTourBalloon(page, /prontuário soap/i)
    await assertBalloonInViewport(page)
    await tourNext(page)
    await expectTourBalloon(page, /salvar prontuário/i)
    await assertBalloonInViewport(page)
    await tourFinish(page)
  })

  test('4. Mentor guia tour de Exames', async ({ page }) => {
    await loginAs(page, 'assistant')
    await page.goto(`${BASE}/dashboard/exams`)

    await mentorAsk(page, 'Como registro resultado de exame?')
    await expect(page.locator('text=/exame|laudo/i').last()).toBeVisible({ timeout: 8_000 })
    await clickTourAction(page, 'exames')

    await expectTourBalloon(page, /fila de exames/i)
    await assertBalloonInViewport(page)
    await tourNext(page)
    await expectTourBalloon(page, /registrar resultado/i)
    await assertBalloonInViewport(page)
    await tourFinish(page)
  })

  test('5. Mentor guia tour de Internação', async ({ page }) => {
    await loginAs(page, 'vet')
    await page.goto(`${BASE}/dashboard/hospitalization`)

    await mentorAsk(page, 'Como internar um animal?')
    await expect(page.locator('text=/internado|internação/i').last()).toBeVisible({ timeout: 8_000 })
    await clickTourAction(page, 'internacao')

    await expectTourBalloon(page, /lista de internados/i)
    await assertBalloonInViewport(page)
    await tourNext(page)
    await expectTourBalloon(page, /alta hospitalar/i)
    await assertBalloonInViewport(page)
    await tourFinish(page)
  })

  test('6. Mentor guia tour de Alta a partir do chat', async ({ page }) => {
    await loginAs(page, 'receptionist')
    await page.goto(`${BASE}/dashboard/reception`)

    await mentorAsk(page, 'Como dou alta ao animal?')
    await expect(page.locator('text=/alta|tour/i').last()).toBeVisible({ timeout: 8_000 })
    await clickTourAction(page, 'alta')

    await expectTourBalloon(page, /quadro de atendimentos/i)
    await assertBalloonInViewport(page)
    await tourNext(page)
    await expectTourBalloon(page, /coluna alta/i)
    await assertBalloonInViewport(page)
    await tourFinish(page)
  })

  test('7. Fluxo completo guiado pelo Mentor via Quick Tours (Cadastro→Alta)', async ({ page }) => {
    await loginAs(page, 'receptionist')

    // Passo a passo por tours rápidos na ordem clínica.
    // Note: 'exames' has no quick-tour chip in MentorChat QUICK_TOURS, so it's omitted here.
    const flows: Array<{ url: string; chipLabel: RegExp; firstTitle: RegExp }> = [
      { url: '/dashboard/reception',      chipLabel: /recepção/i,   firstTitle: /check-in do animal/i },
      { url: '/dashboard/triage',         chipLabel: /triagem/i,    firstTitle: /fila de triagem/i },
      { url: '/dashboard/vet',            chipLabel: /consultório/i,firstTitle: /gravar consulta/i },
      { url: '/dashboard/reception',      chipLabel: /alta/i,       firstTitle: /quadro de atendimentos/i },
      { url: '/dashboard/grooming',       chipLabel: /banho.*tosa/i,firstTitle: /fila do banho e tosa/i },
    ]

    for (const flow of flows) {
      await page.goto(`${BASE}${flow.url}`)

      // Abre o mentor e clica no chip de tour rápido
      const mentorBtn = page.getByLabel('Abrir Modo Mentor')
      await expect(mentorBtn).toBeVisible({ timeout: 8_000 })
      const inputAlreadyOpen = await page.getByPlaceholder(/pergunte algo/i).isVisible().catch(() => false)
      if (!inputAlreadyOpen) await mentorBtn.click()
      await expect(page.getByPlaceholder(/pergunte algo/i)).toBeVisible({ timeout: 5_000 })
      // Scope to the chat panel to avoid matching nav links with same text
      const chatPanel = page.locator('.fixed.bottom-24')
      const chip = chatPanel.locator('button').filter({ hasText: flow.chipLabel }).first()
      await expect(chip).toBeVisible({ timeout: 5_000 })
      await chip.click()

      // Aguarda balão e verifica que está dentro da viewport
      await expectTourBalloon(page, flow.firstTitle)
      await assertBalloonInViewport(page)

      // Avança todos os passos do tour
      const nextBtn = page.locator('.fixed.z-\\[10000\\] button', { hasText: /próximo/i })
      while (await nextBtn.isVisible().catch(() => false)) {
        await assertBalloonInViewport(page)
        await nextBtn.click()
        await page.waitForTimeout(150) // aguarda animação de transição
      }

      // Clica em Concluir
      await page.locator('.fixed.z-\\[10000\\] button', { hasText: /concluir/i }).click()
      await expect(page.locator('.fixed.z-\\[10000\\]')).toBeHidden({ timeout: 3_000 })

      console.log(`[QA] Tour "${flow.chipLabel}" concluído — balão 100% dentro da viewport`)
    }
  })

  test('8. Balão permanece dentro da viewport em telas pequenas (375px)', async ({ page }) => {
    await loginAs(page, 'receptionist')
    await page.goto(`${BASE}/dashboard/reception`)
    await page.waitForLoadState('networkidle')
    // Set viewport after page loads to avoid hydration issues at small sizes
    await page.setViewportSize({ width: 375, height: 667 }) // iPhone SE
    await page.waitForTimeout(300) // allow layout reflow

    const mentorBtn8 = page.getByLabel('Abrir Modo Mentor')
    await expect(mentorBtn8).toBeVisible({ timeout: 8_000 })
    await mentorBtn8.click()
    await expect(page.getByPlaceholder(/pergunte algo/i)).toBeVisible({ timeout: 5_000 })
    const chatPanel8 = page.locator('.fixed.bottom-24')
    const chip = chatPanel8.locator('button').filter({ hasText: /recepção/i }).first()
    await expect(chip).toBeVisible({ timeout: 5_000 })
    await chip.click()

    const balloon = page.locator('.fixed.z-\\[10000\\]')
    await expect(balloon).toBeVisible({ timeout: 8_000 })

    const box = await balloon.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(375 + 1)
      expect(box.x + box.width).toBeLessThanOrEqual(375 + 1)
      console.log(`[QA] Balão em 375px — x:${box.x} y:${box.y} w:${box.width} (max 375)`)
    }

    // Advance all steps and then finish (Recepção has 2 steps)
    const nextBtnMobile = page.locator('.fixed.z-\\[10000\\] button', { hasText: /próximo/i })
    while (await nextBtnMobile.isVisible().catch(() => false)) {
      await nextBtnMobile.click()
      await page.waitForTimeout(150)
    }
    await tourFinish(page)
  })

  test('9. Mentor busca animal por nome durante o tour (integração chat + tour)', async ({ page }) => {
    await loginAs(page, 'receptionist')
    await page.goto(`${BASE}/dashboard/reception`)

    // Inicia tour de recepção
    const mentorBtn9 = page.getByLabel('Abrir Modo Mentor')
    await expect(mentorBtn9).toBeVisible({ timeout: 8_000 })
    await mentorBtn9.click()
    await expect(page.getByPlaceholder(/pergunte algo/i)).toBeVisible({ timeout: 5_000 })
    await page.locator('.fixed.bottom-24 button').filter({ hasText: /recepção/i }).first().click()
    await expectTourBalloon(page, /check-in do animal/i)

    // Encerra tour para perguntar algo ao chat
    await page.locator('.fixed.z-\\[10000\\] button[aria-label="Fechar tour"]').click()
    await expect(page.locator('.fixed.z-\\[10000\\]')).toBeHidden({ timeout: 3_000 })

    // Reabre o chat e busca animal (fixtures.tutors.petName)
    await mentorAsk(page, `Cadê o ${fixtures.patients?.petA1?.name ?? 'Rex'}?`)
    // Mentor deve responder com status ou "não encontrei"
    await expect(
      page.locator('text=/encontrei|não encontrei|procurando/i').last()
    ).toBeVisible({ timeout: 10_000 })

    console.log('[QA] Busca de animal via Mentor durante tour concluída')
  })

})
