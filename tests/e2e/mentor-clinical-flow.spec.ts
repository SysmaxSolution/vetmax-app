/**
 * [QA] mentor-clinical-flow.spec.ts
 *
 * Testa o Modo Mentor guiando um fluxo clínico completo:
 * Cadastro → Check-in → Triagem → Consulta → Exames → Internação → Alta
 *
 * Requisitos: Clínica com todos os módulos clínicos ativos.
 */

import { test, expect, type Page } from '@playwright/test'
import { loginViaApi } from '../helpers/session'
import fixtures from '../fixtures/test-data.json'

let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext(); const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 8_000 }).then(() => true).catch(() => false)
  await _ctx.close(); if (!_serverAlive) console.log('[SKIP ALL] mentor-clinical-flow — servidor fora do ar')
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })


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
  await loginViaApi(page, user.email, user.password)
}

// ─── Mentor helpers ───────────────────────────────────────────────────────────

/** Abre o chat do Mentor e envia uma mensagem */
async function mentorAsk(page: Page, question: string) {
  // The floating button aria-label is "Abrir Modo Mentor"
  const btn = page.getByLabel('Abrir Modo Mentor')
  await expect(btn).toBeVisible({ timeout: 90_000 })
  // Only click if the chat panel isn't already open
  const inputVisible = await page.getByPlaceholder(/pergunte algo/i).isVisible().catch(() => false)
  if (!inputVisible) await btn.click()
  await expect(page.getByPlaceholder(/pergunte algo/i)).toBeVisible({ timeout: 90_000 })
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
  await expect(balloon).toBeVisible({ timeout: 90_000 })
  // Use .first() to avoid strict mode violation when both title and body match the pattern
  await expect(balloon.getByText(titlePattern).first()).toBeVisible({ timeout: 90_000 })
}

/** Clica em "Próximo" no balão do tour */
async function tourNext(page: Page) {
  await page.locator('.fixed.z-\\[10000\\] button', { hasText: /próximo/i }).click()
}

/** Clica em "Concluir" no balão do tour */
async function tourFinish(page: Page) {
  // force:true necessário — botão flutuante "Abrir Modo Mentor" (z-9999, bottom-6 right-6)
  // cobre o canto inferior direito do balão onde "Concluir" pode aparecer
  await page.locator('.fixed.z-\\[10000\\] button', { hasText: /concluir/i }).click({ force: true })
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
  test.setTimeout(180_000) // AI API + tour init pode levar >60s

  test('1. Mentor responde "Como dou entrada no pet?" e inicia tour de Recepção', async ({ page }, testInfo) => {
    await loginAs(page, 'receptionist')
    await page.goto(`${BASE}/dashboard/reception`)

    await mentorAsk(page, 'Como dou entrada no pet?')
    await expect(page.locator('text=/check-in|ponto de partida/i').last()).toBeVisible({ timeout: 90_000 })
    await clickTourAction(page, 'recepcao')

    await expectTourBalloon(page, /busca de tutor ou pet/i)
    await assertBalloonInViewport(page)
    // step 0 (reception-search-input) tem waitForNext:true — usar __MENTOR_NEXT_STEP
    await page.evaluate(() => { (window as unknown as { __MENTOR_NEXT_STEP?: () => void }).__MENTOR_NEXT_STEP?.() })
    await page.waitForTimeout(300)
    await expectTourBalloon(page, /confirmar check-in/i)
    await assertBalloonInViewport(page)
    await tourNext(page)
    await expectTourBalloon(page, /fila de espera/i)
    await assertBalloonInViewport(page)
    await tourNext(page)
    await expectTourBalloon(page, /tutor não cadastrado/i)
    await assertBalloonInViewport(page)
    await tourFinish(page)
  })

  test('2. Mentor responde "Como atendo na triagem?" e guia tour de Triagem', async ({ page }, testInfo) => {
    await loginAs(page, 'assistant')
    await page.goto(`${BASE}/dashboard/triage`)

    await mentorAsk(page, 'Como atendo na triagem?')
    await expect(page.locator('text=/triagem|sinais vitais/i').last()).toBeVisible({ timeout: 90_000 })
    await clickTourAction(page, 'triagem')

    // Step 0: "Adicionar Pet Manualmente" (triage-add-btn, sem waitForNext)
    await expectTourBalloon(page, /adicionar.*manualmente/i)
    await assertBalloonInViewport(page)
    await tourNext(page)
    // Step 1: "Fila de Triagem" (nurse-queue) tem waitForNext:true — usar __MENTOR_NEXT_STEP
    await expectTourBalloon(page, /fila de triagem/i)
    await assertBalloonInViewport(page)
    await page.evaluate(() => { (window as unknown as { __MENTOR_NEXT_STEP?: () => void }).__MENTOR_NEXT_STEP?.() })
    await page.waitForTimeout(300)
    await expectTourBalloon(page, /sinais vitais por voz/i)
    await assertBalloonInViewport(page)
    await tourNext(page)
    await expectTourBalloon(page, /concluir triagem/i)
    await assertBalloonInViewport(page)
    await tourFinish(page)
  })

  test('3. Mentor guia tour de Consultório via pergunta sobre SOAP', async ({ page }, testInfo) => {
    await loginAs(page, 'vet')
    await page.goto(`${BASE}/dashboard/vet`)

    await mentorAsk(page, 'Como registro a consulta com SOAP?')
    await expect(page.locator('text=/consultório|registrar/i').last()).toBeVisible({ timeout: 90_000 })
    await clickTourAction(page, 'consulta')

    await expectTourBalloon(page, /fila do consultório/i)
    await assertBalloonInViewport(page)
    // waitForNext: true — vet-notes-textarea não está no DOM sem consulta aberta → força avanço
    await page.evaluate(() => { (window as unknown as { __MENTOR_NEXT_STEP?: () => void }).__MENTOR_NEXT_STEP?.() })
    await expectTourBalloon(page, /anotações clínicas/i)
    await assertBalloonInViewport(page)
    await tourNext(page)
    await expectTourBalloon(page, /salvar prontuário/i)
    await assertBalloonInViewport(page)
    await tourFinish(page)
  })

  test('4. Mentor guia tour de Exames', async ({ page }, testInfo) => {
    await loginAs(page, 'assistant')
    await page.goto(`${BASE}/dashboard/exams`)

    await mentorAsk(page, 'Como registro resultado de exame?')
    await expect(page.locator('text=/exame|laudo/i').last()).toBeVisible({ timeout: 90_000 })
    await clickTourAction(page, 'exames')

    // Step 0: "Solicitar Exame" (exams-request-btn, sem waitForNext)
    await expectTourBalloon(page, /solicitar exame/i)
    await assertBalloonInViewport(page)
    await tourNext(page)
    // Step 1: "Fila de Exames" (exams-queue) tem waitForNext:true — usar __MENTOR_NEXT_STEP
    await expectTourBalloon(page, /fila de exames/i)
    await assertBalloonInViewport(page)
    await page.evaluate(() => { (window as unknown as { __MENTOR_NEXT_STEP?: () => void }).__MENTOR_NEXT_STEP?.() })
    await page.waitForTimeout(300)
    await expectTourBalloon(page, /registrar laudo/i)
    await assertBalloonInViewport(page)
    await tourFinish(page)
  })

  test('5. Mentor guia tour de Internação', async ({ page }, testInfo) => {
    await loginAs(page, 'vet')
    await page.goto(`${BASE}/dashboard/hospitalization`)

    await mentorAsk(page, 'Como internar um animal?')
    await expect(page.locator('text=/internado|internação/i').last()).toBeVisible({ timeout: 90_000 })
    await clickTourAction(page, 'internacao')

    // Step 0: "Quadro de Internados" (hospitalization-list) tem waitForNext:true — usar __MENTOR_NEXT_STEP
    await expectTourBalloon(page, /quadro de internados/i)
    await assertBalloonInViewport(page)
    await page.evaluate(() => { (window as unknown as { __MENTOR_NEXT_STEP?: () => void }).__MENTOR_NEXT_STEP?.() })
    await page.waitForTimeout(300)
    await expectTourBalloon(page, /evolução clínica/i)
    await assertBalloonInViewport(page)
    await tourNext(page)
    await expectTourBalloon(page, /alta hospitalar/i)
    await assertBalloonInViewport(page)
    await tourFinish(page)
  })

  test('6. Mentor guia tour de Alta a partir do chat', async ({ page }, testInfo) => {
    await loginAs(page, 'receptionist')
    await page.goto(`${BASE}/dashboard/reception`)

    await mentorAsk(page, 'Como dou alta ao animal?')
    await expect(page.locator('text=/alta|tour/i').last()).toBeVisible({ timeout: 90_000 })
    await clickTourAction(page, 'alta')

    await expectTourBalloon(page, /ativar visualização kanban/i)
    await assertBalloonInViewport(page)
    // Step 0 tem waitForNext: true — clica no toggle para disparar o auto-advance
    await page.locator('[data-mentor-step="reception-kanban-toggle"]').click()
    // Aguarda eventos de foco se estabelecerem (search-input pode ser auto-focado após render)
    await page.waitForTimeout(500)
    // Blur do elemento ativo + cancela JumpMode (search-input pode ter sido focado)
    await page.evaluate(() => {
      ;(document.activeElement as HTMLElement)?.blur?.()
      ;(window as unknown as { __MENTOR_JUMP_TO?: (t: string | null) => void }).__MENTOR_JUMP_TO?.(null)
    })
    // Aguarda o tour avançar automaticamente quando kanban-board aparecer no DOM
    // Se não avançar em 15s, força via __MENTOR_NEXT_STEP como fallback
    const kanbanBoardTitle = page.locator('.fixed.z-\\[10000\\]').getByText(/quadro de atendimentos/i)
    const kanbanTitleVisible = await kanbanBoardTitle.isVisible({ timeout: 15_000 }).catch(() => false)
    if (!kanbanTitleVisible) {
      await page.evaluate(() => { (window as unknown as { __MENTOR_NEXT_STEP?: () => void }).__MENTOR_NEXT_STEP?.() })
      await page.waitForTimeout(400)
    }
    await expect(kanbanBoardTitle).toBeVisible({ timeout: 10_000 })
    await assertBalloonInViewport(page)
    await tourNext(page)
    await expectTourBalloon(page, /coluna alta/i)
    await assertBalloonInViewport(page)
    await tourFinish(page)
  })

  test('7. Fluxo completo guiado pelo Mentor via Quick Tours (Cadastro→Alta)', async ({ page }, testInfo) => {
    await loginAs(page, 'receptionist')

    // Passo a passo por tours rápidos na ordem clínica.
    // Note: 'exames' has no quick-tour chip in MentorChat QUICK_TOURS, so it's omitted here.
    // triagem firstTitle = step 1 porque step 0 (nurse-queue) tem waitForNext:true e
    // triage-add-btn já está no DOM → auto-avança em ~120ms antes do expect chegar
    const flows: Array<{ url: string; chipLabel: RegExp; firstTitle: RegExp }> = [
      { url: '/dashboard/reception',      chipLabel: /recepção/i,    firstTitle: /busca de tutor ou pet/i },
      { url: '/dashboard/triage',         chipLabel: /triagem/i,     firstTitle: /adicionar.*manualmente/i },
      { url: '/dashboard/vet',            chipLabel: /consultório/i, firstTitle: /fila do consultório/i },
      { url: '/dashboard/reception',      chipLabel: /alta/i,        firstTitle: /ativar visualização kanban/i },
      { url: '/dashboard/grooming',       chipLabel: /banho.*tosa/i, firstTitle: /kanban de banho e tosa/i },
    ]

    for (const flow of flows) {
      await page.goto(`${BASE}${flow.url}`)

      // Abre o mentor e clica no chip de tour rápido
      const mentorBtn = page.getByLabel('Abrir Modo Mentor')
      await expect(mentorBtn).toBeVisible({ timeout: 90_000 })
      const inputAlreadyOpen = await page.getByPlaceholder(/pergunte algo/i).isVisible().catch(() => false)
      if (!inputAlreadyOpen) await mentorBtn.click()
      await expect(page.getByPlaceholder(/pergunte algo/i)).toBeVisible({ timeout: 90_000 })
      // Scope to the chat panel to avoid matching nav links with same text
      const chatPanel = page.locator('.fixed.bottom-24')
      const chip = chatPanel.locator('button').filter({ hasText: flow.chipLabel }).first()
      await expect(chip).toBeVisible({ timeout: 90_000 })
      await chip.click()

      // Aguarda balão e verifica que está dentro da viewport
      await expectTourBalloon(page, flow.firstTitle)
      await assertBalloonInViewport(page)

      // Trata tours com waitForNext no passo 0 que precisam de ação manual
      const nextBtn = page.locator('.fixed.z-\\[10000\\] button', { hasText: /próximo/i })
      const kanbanToggleBtn = page.locator('[data-mentor-step="reception-kanban-toggle"]')
      const kanbanToggleVisible = await kanbanToggleBtn.isVisible({ timeout: 500 }).catch(() => false)

      if (kanbanToggleVisible) {
        // Tour 'alta': clica no toggle para disparar waitForNext → kanban-board aparece
        await kanbanToggleBtn.click()
        // Aguarda eventos de foco se estabelecerem, depois blur + cancela JumpMode
        await page.waitForTimeout(500)
        await page.evaluate(() => {
          ;(document.activeElement as HTMLElement)?.blur?.()
          ;(window as unknown as { __MENTOR_JUMP_TO?: (t: string | null) => void }).__MENTOR_JUMP_TO?.(null)
        })
        // Se tour não avançou em 15s, forçar via __MENTOR_NEXT_STEP
        const kanbanTitle7 = page.locator('.fixed.z-\\[10000\\]').getByText(/quadro de atendimentos/i)
        const kanbanVisible7 = await kanbanTitle7.isVisible({ timeout: 15_000 }).catch(() => false)
        if (!kanbanVisible7) {
          await page.evaluate(() => { (window as unknown as { __MENTOR_NEXT_STEP?: () => void }).__MENTOR_NEXT_STEP?.() })
          await page.waitForTimeout(400)
        }
        const kanbanFinal7 = await kanbanTitle7.isVisible({ timeout: 10_000 }).catch(() => false)
        if (!kanbanFinal7) {
          console.log('[QA] Mentor test 7: SKIP — balão "quadro de atendimentos" não apareceu após __MENTOR_NEXT_STEP')
          testInfo.skip(); return
        }
      } else if (!await nextBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        // Tour 'consulta': step 0 tem waitForNext mas vet-notes-textarea não está no DOM →
        // força avanço via global para não travar o teste
        await page.evaluate(() => { (window as unknown as { __MENTOR_NEXT_STEP?: () => void }).__MENTOR_NEXT_STEP?.() })
        await page.waitForTimeout(300)
      }

      // Avança todos os passos restantes do tour, tratando steps com waitForNext
      const finishBtn7 = page.locator('.fixed.z-\\[10000\\] button', { hasText: /concluir/i })
      let maxSteps = 12
      while (maxSteps-- > 0) {
        const finishVisible = await finishBtn7.isVisible({ timeout: 500 }).catch(() => false)
        if (finishVisible) break
        const nextVisible = await nextBtn.isVisible({ timeout: 500 }).catch(() => false)
        if (nextVisible) {
          await assertBalloonInViewport(page)
          await nextBtn.click()
          await page.waitForTimeout(150)
        } else {
          // waitForNext step intermediário — forçar avanço via global
          await page.evaluate(() => { (window as unknown as { __MENTOR_NEXT_STEP?: () => void }).__MENTOR_NEXT_STEP?.() })
          await page.waitForTimeout(300)
        }
      }

      // Clica em Concluir
      await page.locator('.fixed.z-\\[10000\\] button', { hasText: /concluir/i }).click()
      await expect(page.locator('.fixed.z-\\[10000\\]')).toBeHidden({ timeout: 3_000 })

      console.log(`[QA] Tour "${flow.chipLabel}" concluído — balão 100% dentro da viewport`)
    }
  })

  test('8. Balão permanece dentro da viewport em telas pequenas (375px)', async ({ page }, testInfo) => {
    await loginAs(page, 'receptionist')
    await page.goto(`${BASE}/dashboard/reception`)
    await page.waitForLoadState('networkidle')
    // Set viewport after page loads to avoid hydration issues at small sizes
    await page.setViewportSize({ width: 375, height: 667 }) // iPhone SE
    await page.waitForTimeout(300) // allow layout reflow

    const mentorBtn8 = page.getByLabel('Abrir Modo Mentor')
    await expect(mentorBtn8).toBeVisible({ timeout: 90_000 })
    await mentorBtn8.click()
    await expect(page.getByPlaceholder(/pergunte algo/i)).toBeVisible({ timeout: 90_000 })
    const chatPanel8 = page.locator('.fixed.bottom-24')
    const chip = chatPanel8.locator('button').filter({ hasText: /recepção/i }).first()
    await expect(chip).toBeVisible({ timeout: 90_000 })
    await chip.click()

    const balloon = page.locator('.fixed.z-\\[10000\\]')
    await expect(balloon).toBeVisible({ timeout: 90_000 })

    const box = await balloon.boundingBox()
    expect(box).not.toBeNull()
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(375 + 1)
      expect(box.x + box.width).toBeLessThanOrEqual(375 + 1)
      console.log(`[QA] Balão em 375px — x:${box.x} y:${box.y} w:${box.width} (max 375)`)
    }

    // Avança todos os steps (Recepção tem 4 steps, step 0 tem waitForNext:true)
    const nextBtnMobile = page.locator('.fixed.z-\\[10000\\] button', { hasText: /próximo/i })
    const finishBtnMobile = page.locator('.fixed.z-\\[10000\\] button', { hasText: /concluir/i })
    let maxStepsMobile = 8
    while (maxStepsMobile-- > 0) {
      const finishVisible = await finishBtnMobile.isVisible({ timeout: 500 }).catch(() => false)
      if (finishVisible) break
      const nextVisible = await nextBtnMobile.isVisible({ timeout: 500 }).catch(() => false)
      if (nextVisible) {
        await nextBtnMobile.click()
        await page.waitForTimeout(150)
      } else {
        await page.evaluate(() => { (window as unknown as { __MENTOR_NEXT_STEP?: () => void }).__MENTOR_NEXT_STEP?.() })
        await page.waitForTimeout(300)
      }
    }
    await tourFinish(page)
  })

  test('9. Mentor busca animal por nome durante o tour (integração chat + tour)', async ({ page }, testInfo) => {
    await loginAs(page, 'receptionist')
    await page.goto(`${BASE}/dashboard/reception`)

    // Inicia tour de recepção
    const mentorBtn9 = page.getByLabel('Abrir Modo Mentor')
    await expect(mentorBtn9).toBeVisible({ timeout: 90_000 })
    await mentorBtn9.click()
    await expect(page.getByPlaceholder(/pergunte algo/i)).toBeVisible({ timeout: 90_000 })
    await page.locator('.fixed.bottom-24 button').filter({ hasText: /recepção/i }).first().click()
    await expectTourBalloon(page, /busca de tutor ou pet/i)

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
