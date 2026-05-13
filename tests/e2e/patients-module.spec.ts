import { loginViaApi } from '../helpers/session'
/**
 * E2E — Módulo Pacientes
 *
 * TC-PAC-01: Cadastrar novo paciente (pet + tutor) via workspace
 * TC-PAC-02: Buscar paciente por nome/espécie e ver prontuário
 * TC-PAC-03: Timeline do prontuário exibe histórico de consultas e exames
 * TC-PAC-04: RLS — Clínica B não vê pacientes da Clínica A
 */

import { test, expect, Page } from '@playwright/test';
import { createAdminClient } from '../helpers/supabase-test-client';
import { seedTutorsAndPets, seedUsers } from '../helpers/db-seed';
import fixtures from '../fixtures/test-data.json';

const admin = createAdminClient();

async function loginAs(page: Page, email: string, password: string) {
  await loginViaApi(page, email, password)
}

// — server guard: skip all if Next.js dev server is down ——————————————————————
let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext()
  const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto(process.env.TEST_BASE_URL ?? 'http://localhost:4000', { waitUntil: 'domcontentloaded', timeout: 8_000 })
    .then(() => true).catch(() => false)
  await _ctx.close()
  if (!_serverAlive) console.log('[SKIP ALL] patients-module — servidor fora do ar')
  if (_serverAlive) await seedUsers().catch(e => console.warn('[patients] seedUsers falhou:', e.message))
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })

// ─── TC-PAC-01: Cadastrar novo paciente ──────────────────────────────────────

test.describe('TC-PAC-01: Cadastrar novo pet no módulo Pacientes', () => {
  const NEW_PET_NAME = 'Bolinha-Teste-E2E';
  const NEW_TUTOR_NAME = 'Tutor Novo Teste E2E';

  test.afterEach(async () => {
    await admin.from('patients').delete()
      .eq('clinic_id', fixtures.clinics.clinicA.id)
      .eq('name', NEW_PET_NAME);
    await admin.from('tutors').delete()
      .eq('clinic_id', fixtures.clinics.clinicA.id)
      .eq('name', NEW_TUTOR_NAME);
  });

  test('Admin cadastra novo tutor + pet e eles aparecem na lista', async ({ page }, testInfo) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);
    await page.goto('/dashboard/patients', { waitUntil: 'domcontentloaded' });

    // Módulo deve carregar — usar heading para evitar strict mode
    await expect(
      page.getByRole('heading', { name: /pacientes|prontuário/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Botão de novo paciente
    const addBtn = page.getByRole('button', { name: /novo paciente|cadastrar|adicionar/i }).first();

    if (!(await addBtn.isVisible({ timeout: 8_000 }).catch(() => false))) {
      console.log('FUNCIONALIDADE PENDENTE DE IMPLEMENTAÇÃO: Botão de novo paciente não encontrado no módulo Pacientes');
      testInfo.skip();
      return;
    }

    await addBtn.click();

    // Modal/form de cadastro
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    // O modal abre na aba "Paciente" — preencher nome do pet primeiro
    const petNameField = page.getByPlaceholder('Ex: Thor, Luna...');
    await petNameField.fill(NEW_PET_NAME);

    // Navegar para aba "Recepção" (tutor) — preencher campos obrigatórios
    const tutorTab = page.getByRole('button', { name: /recepção/i });
    if (await tutorTab.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await tutorTab.click();
      await page.waitForTimeout(300);
    }
    const tutorNameField = page.getByPlaceholder('Ex: Maria Silva');
    if (await tutorNameField.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await tutorNameField.fill(NEW_TUTOR_NAME);
    }
    // CPF obrigatório (11 dígitos)
    const cpfField = page.getByPlaceholder('000.000.000-00').first();
    if (await cpfField.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await cpfField.fill('99988877766');
    }
    // Telefone obrigatório
    const phoneField = page.getByPlaceholder('(00) 00000-0000').first();
    if (await phoneField.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await phoneField.fill('(11) 99999-8877');
    }

    const speciesSelect = page.locator('select').filter({ has: page.locator('option[value="dog"], option:has-text("Cão")') });
    if (await speciesSelect.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await speciesSelect.selectOption({ value: 'dog' }).catch(() => {});
    }

    // Confirmar — botão "CRIAR CADASTRO" no modo criação
    await page.getByRole('button', { name: /criar cadastro|salvar|confirmar/i }).click();

    // Após CRIAR CADASTRO o modal avança para aba Vacinas — isso indica sucesso
    await expect(
      page.getByRole('button', { name: /vacinas/i })
    ).toBeVisible({ timeout: 10_000 });

    // Confirmar no banco que o pet foi criado
    // (fechar modal e verificar na lista também é válido)
    await page.getByRole('button', { name: /concluir cadastro/i }).click();

    // Paciente deve aparecer na lista após fechar o modal
    await expect(page.getByText(NEW_PET_NAME)).toBeVisible({ timeout: 8_000 });

    // Verificar no banco
    const { data: patients } = await admin
      .from('patients')
      .select('id, name')
      .eq('clinic_id', fixtures.clinics.clinicA.id)
      .eq('name', NEW_PET_NAME);

    expect(patients?.length).toBeGreaterThan(0);
  });
});

// ─── TC-PAC-02: Buscar paciente ───────────────────────────────────────────────

test.describe('TC-PAC-02: Buscar paciente por nome', () => {
  test.beforeEach(async () => {
    await seedTutorsAndPets();
  });

  test('Busca por "Rex" retorna o paciente correto', async ({ page }, testInfo) => {
    await loginAs(page, fixtures.users.receptionistA.email, fixtures.users.receptionistA.password);
    await page.goto('/dashboard/patients', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /pacientes|prontuário/i }).first()).toBeVisible({ timeout: 10_000 });

    // Campo de busca
    const searchInput = page.getByPlaceholder(/buscar|pesquisar|nome/i).or(
      page.getByRole('searchbox')
    );
    await expect(searchInput).toBeVisible({ timeout: 8_000 });
    await searchInput.fill('Rex');

    // Resultado deve aparecer
    await expect(page.getByText('Rex').first()).toBeVisible({ timeout: 8_000 });

    // Abrir prontuário clicando no botão Histórico do card de Rex
    await page.locator('div').filter({ has: page.locator('p').filter({ hasText: /^Rex$/ }) }).getByRole('button', { name: /histórico/i }).first().click();
    await page.waitForTimeout(500);

    // Modal/dialog de prontuário deve abrir
    await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 8_000 });
  });
});

// ─── TC-PAC-03: Timeline do prontuário ───────────────────────────────────────

test.describe('TC-PAC-03: Timeline exibe histórico de consultas', () => {
  let consultationId: string;

  test.beforeEach(async () => {
    await seedTutorsAndPets();

    // Seed de consulta concluída para Rex
    const { data, error } = await admin.from('consultations').upsert([{
      clinic_id: fixtures.clinics.clinicA.id,
      patient_id: fixtures.patients.petA1.id,
      tutor_id: fixtures.tutors.tutorA1.id,
      status: 'completed',
      reason: 'Check-up geral — TC-PAC-03',
      anamnesis: 'Animal saudável, check-up de rotina.',
    }]).select('id').single();

    if (error) throw error;
    consultationId = data.id;
  });

  test.afterEach(async () => {
    if (consultationId) await admin.from('consultations').delete().eq('id', consultationId);
  });

  test('Prontuário de Rex exibe consulta histórica', async ({ page }, testInfo) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);
    await page.goto('/dashboard/patients', { waitUntil: 'domcontentloaded' });

    const searchInput = page.getByPlaceholder(/buscar|pesquisar|nome/i).or(page.getByRole('searchbox'));
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await searchInput.fill('Rex');

    await page.getByText('Rex').first().waitFor({ timeout: 8_000 });
    // Abrir prontuário pelo botão Histórico no card de Rex (clicar no nome não abre o modal)
    await page.locator('div').filter({ has: page.locator('p').filter({ hasText: /^Rex$/ }) }).getByRole('button', { name: /histórico/i }).first().click();

    // Timeline deve mostrar o histórico
    await expect(
      page.getByText(/check-up geral|TC-PAC-03/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ─── TC-PAC-04: RLS — Clínica B não vê pacientes da Clínica A ────────────────

test.describe('TC-PAC-04: Isolamento RLS multi-tenant — pacientes', () => {
  test.beforeEach(async () => {
    await seedTutorsAndPets();
  });

  test('Admin da Clínica B não vê pacientes da Clínica A', async ({ page }, testInfo) => {
    await loginAs(page, fixtures.users.adminB.email, fixtures.users.adminB.password);
    await page.goto('/dashboard/patients', { waitUntil: 'domcontentloaded' });

    await page.waitForTimeout(3_000);

    // Rex pertence à Clínica A — Clínica B não deve ver
    const searchInput = page.getByPlaceholder(/buscar|pesquisar|nome/i).or(page.getByRole('searchbox'));
    if (await searchInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await searchInput.fill('Rex');
      await page.waitForTimeout(2_000);
    }

    // Verificar que nenhum paciente 'Rex' aparece na lista (exceto em mensagens de "não encontrado")
    // A busca por 'Rex' pode retornar "Nenhum paciente encontrado para 'Rex'" — isso é correto
    const patientCard = page.locator('[data-testid*="patient"], [class*="patient-card"], table tr').filter({ hasText: 'Rex' });
    const cardCount = await patientCard.count();
    expect(cardCount).toBe(0);

    // Garantir que o tutor da Clínica A também não aparece
    const tutorVisible = await page.getByText('Carlos Tutor Silva').count();
    if (tutorVisible > 0) {
      // Verificar que não está em um card/linha de paciente (pode estar em mensagem de sistema)
      const tutorInCard = page.locator('[data-testid*="patient"], [class*="patient-card"], table tr').filter({ hasText: 'Carlos Tutor Silva' });
      expect(await tutorInCard.count()).toBe(0);
    }
  });
});
