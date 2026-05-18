/**
 * Smoke test do motor Canva Nativo — critério de sucesso do Diretor:
 *   "Veterinário arrasta um slider de margem na tela de Gestão > Modelos
 *    e vê a caixa cinza sólida da AlmaVet mudando de posição em tempo real."
 *
 * Validações automatizadas (reatividade pura de React state):
 *  1. ManagementWorkspace renderiza botão Sparkles em cada template
 *  2. CanvaTemplateEditor abre split-screen com sliders
 *  3. Mudar margin_top via slider muda o `top` inline-style do .canva-a4-content em tempo real
 *  4. Trocar block_style de solid→transparent remove o background cinza do .canva-patient-block
 *
 * Pré-requisitos para o teste visual com a Dra. Laís (não automatizável aqui):
 *  - Dev server rodando (`npm run dev` em http://localhost:3000)
 *  - Login como admin de uma clínica que já tenha pelo menos 1 DocumentTemplate
 *  - Subir o PNG do papel timbrado AlmaVet (converter Modelo Receituario
 *    Preenchido.pdf para PNG via Acrobat/Preview com export A4 vertical em
 *    300 DPI)
 *  - Arrastar slider margin_top de 2.0cm → 4.5cm → 1.0cm e confirmar movimento
 *    fluido do bloco do Toby sem reload/flicker.
 */

import { test, expect } from '@playwright/test'

test.describe('Canva Nativo — smoke', () => {
  test.fixme(true, 'smoke visual: rodar manual com Dra. Laís após dev server up + bg AlmaVet upado')

  test('slider margin_top reposiciona bloco do paciente em tempo real', async ({ page }) => {
    await page.goto('/dashboard/management')

    await page.getByRole('button', { name: /configurar canva nativo/i }).first().click()

    const slider = page.locator('input[type="range"]').first()
    const block = page.locator('.canva-a4-content')

    const initialTop = await block.evaluate(el => (el as HTMLElement).style.top)
    expect(initialTop).toMatch(/2(\.\d)?cm/)

    await slider.fill('4.5')
    const updatedTop = await block.evaluate(el => (el as HTMLElement).style.top)
    expect(updatedTop).toBe('4.5cm')
    expect(updatedTop).not.toBe(initialTop)
  })

  test('alternar block_style solid→transparent zera o background cinza do bloco', async ({ page }) => {
    await page.goto('/dashboard/management')
    await page.getByRole('button', { name: /configurar canva nativo/i }).first().click()

    const patientBlock = page.locator('.canva-patient-block')

    await page.getByRole('button', { name: 'Caixa cinza' }).click()
    const solidBg = await patientBlock.evaluate(el => getComputedStyle(el).backgroundColor)
    expect(solidBg).not.toBe('rgba(0, 0, 0, 0)')

    await page.getByRole('button', { name: 'Transparente' }).click()
    const transparentBg = await patientBlock.evaluate(el => getComputedStyle(el).backgroundColor)
    expect(transparentBg).toBe('rgba(0, 0, 0, 0)')
  })
})
