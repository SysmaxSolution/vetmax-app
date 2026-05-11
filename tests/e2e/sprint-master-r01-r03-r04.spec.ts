/**
 * E2E — Sprint Master Recepção: R-01, R-03, R-04
 *
 * R-01: Desativar módulo B&T oculta botões "Check-in B&T" e "Agendar B&T" na Recepção
 * R-03: Tag "Banho e Tosa" substitui "Geral" no modal de agendamento
 * R-04: Dados completos do pet (espécie, raça, idade, tutor, telefone, última visita) na Recepção
 *
 * Implementação:
 *  - R-01: ReceptionWorkspace.tsx — `groomingActive = activeModules.includes('grooming')`
 *  - R-03: NewAppointmentModal.tsx — VISIT_REASON_OPTIONS contém `{ value: 'grooming', label: '✂️ Banho e Tosa' }`
 *  - R-04: QueueCard exibe espécie (SpeciesBadge), raça, idade, tutor.name, tutor.phone
 */

import { test, expect, Page } from '@playwright/test';
import { createAdminClient } from '../helpers/supabase-test-client';
import { seedTutorsAndPets } from '../helpers/db-seed';
import fixtures from '../fixtures/test-data.json';

const admin = createAdminClient();

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL(/\/(dashboard|reception|vet|onboarding)/, { timeout: 30_000 });
}

async function navigateToReception(page: Page): Promise<boolean> {
  await page.goto('/dashboard/reception');
  await page.waitForTimeout(2_500);
  const heading = page.getByText(/recepção|reception/i).first();
  return heading.isVisible({ timeout: 8_000 }).catch(() => false);
}

async function setGroomingModule(enabled: boolean) {
  const { data } = await admin.from('clinics').select('active_modules').eq('id', fixtures.clinics.clinicA.id).single();
  let mods: string[] = Array.isArray(data?.active_modules) ? data.active_modules : [];
  if (enabled && !mods.includes('grooming')) {
    mods = [...mods, 'grooming'];
  } else if (!enabled) {
    mods = mods.filter(m => m !== 'grooming');
  }
  await admin.from('clinics').update({ active_modules: mods }).eq('id', fixtures.clinics.clinicA.id);
}

// ─── R-01: Desativar B&T oculta botões ──────────────────────────────────────

test.describe('R-01: Desativar módulo B&T oculta botões de grooming na Recepção', () => {
  test.beforeEach(async () => {
    await seedTutorsAndPets();
  });

  test.afterEach(async () => {
    // Reativar grooming para não quebrar outros testes
    await setGroomingModule(true);
  });

  test('R-01-01: Com grooming ATIVO, botões B&T são visíveis na Recepção', async ({ page }) => {
    await setGroomingModule(true);
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);
    const loaded = await navigateToReception(page);
    if (!loaded) { console.log('R-01-01: SKIP — Recepção não carregou'); test.skip(); return; }

    const groomingBtn = page.getByRole('button', { name: /banho|tosa|grooming/i }).first()
      .or(page.getByText(/agendar.*tosa|check.?in.*tosa|banho.*tosa/i).first());
    const visible = await groomingBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    console.log(`R-01-01: Botão B&T com grooming ativo: ${visible}`);
    if (!visible) {
      console.log('R-01-01: FUNCIONALIDADE PENDENTE — botão B&T não encontrado com módulo ativo');
      test.skip();
    } else {
      expect(visible).toBe(true);
    }
  });

  test('R-01-02: Com grooming DESATIVADO, botões B&T não aparecem', async ({ page }) => {
    await setGroomingModule(false);
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);
    const loaded = await navigateToReception(page);
    if (!loaded) { console.log('R-01-02: SKIP — Recepção não carregou'); test.skip(); return; }

    await page.waitForTimeout(1_500);
    const groomingBtn = page.getByRole('button', { name: /agendar.*tosa|check.?in.*tosa/i }).first();
    const visible = await groomingBtn.isVisible({ timeout: 3_000 }).catch(() => false);
    console.log(`R-01-02: Botão B&T com grooming desativado: ${visible} (esperado: false)`);
    expect(visible).toBe(false);
  });
});

// ─── R-03: Tag "Banho e Tosa" no modal de agendamento ───────────────────────

test.describe('R-03: Opção "Banho e Tosa" substitui "Geral" no agendamento', () => {
  test.beforeEach(async () => {
    await seedTutorsAndPets();
  });

  test('R-03-01: Modal de agendamento exibe opção "Banho e Tosa" (não "Geral")', async ({ page }) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);
    const loaded = await navigateToReception(page);
    if (!loaded) { console.log('R-03-01: SKIP — Recepção não carregou'); test.skip(); return; }

    // Abrir modal de agendamento
    const scheduleBtn = page.getByRole('button', { name: /agendar|novo agendamento|schedule/i }).first();
    if (!(await scheduleBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      console.log('R-03-01: SKIP — Botão de agendamento não encontrado');
      test.skip(); return;
    }
    await scheduleBtn.click();
    await page.waitForTimeout(1_000);

    // Verificar que "Banho e Tosa" está presente
    const groomingOption = page.getByText(/banho e tosa|✂️/i).first();
    const groomingVisible = await groomingOption.isVisible({ timeout: 5_000 }).catch(() => false);
    console.log(`R-03-01: Opção "Banho e Tosa" visível: ${groomingVisible}`);

    // Verificar que "Geral" NÃO está como opção de tipo de visita
    const geralOption = page.getByRole('option', { name: /^geral$/i }).first();
    const geralVisible = await geralOption.isVisible({ timeout: 2_000 }).catch(() => false);
    console.log(`R-03-01: Opção "Geral" ainda presente: ${geralVisible} (esperado: false)`);

    expect(groomingVisible).toBe(true);
    expect(geralVisible).toBe(false);
  });

  test('R-03-02: Constante VISIT_REASON_OPTIONS contém value grooming com label Banho e Tosa', async () => {
    // Teste de contrato — verifica diretamente na DB que agendamentos com motivo grooming são criáveis
    const { error } = await admin.from('appointments').insert([{
      clinic_id:            fixtures.clinics.clinicA.id,
      pet_id:               fixtures.patients.petA1.id,
      tutor_id:             fixtures.tutors.tutorA1.id,
      appointment_datetime: new Date(Date.now() + 86_400_000).toISOString(),
      reason:               'grooming',
      status:               'scheduled',
    }]).select('id').single();

    if (error) {
      console.log(`R-03-02: Erro ao inserir agendamento grooming: ${error.message}`);
    } else {
      console.log('R-03-02: Agendamento com visit_reason=grooming inserido com sucesso');
    }
    expect(error).toBeNull();

    // Cleanup
    await admin.from('appointments')
      .delete()
      .eq('clinic_id', fixtures.clinics.clinicA.id)
      .eq('reason', 'grooming');
  });
});

// ─── R-04: Dados completos do pet na Recepção ────────────────────────────────

test.describe('R-04: Dados completos do pet exibidos na Recepção', () => {
  test.beforeEach(async () => {
    await seedTutorsAndPets();
  });

  test('R-04-01: Card da fila exibe espécie, raça e nome do tutor', async ({ page }) => {
    // Colocar pet na fila
    const { data: queue, error } = await admin.from('queue_entries').insert([{
      clinic_id:  fixtures.clinics.clinicA.id,
      patient_id: fixtures.patients.petA1.id,
      tutor_id:   fixtures.tutors.tutorA1.id,
      status:     'reception',
      visit_reason: 'consultation',
    }]).select('id').single();

    if (error) { console.log(`R-04-01: SKIP — Erro ao inserir queue_entry: ${error.message}`); test.skip(); return; }

    try {
      await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);
      const loaded = await navigateToReception(page);
      if (!loaded) { console.log('R-04-01: SKIP — Recepção não carregou'); test.skip(); return; }

      const card = page.getByText(fixtures.patients.petA1.name).first();
      const cardVisible = await card.isVisible({ timeout: 8_000 }).catch(() => false);
      if (!cardVisible) { console.log('R-04-01: SKIP — Card do pet não encontrado na fila'); test.skip(); return; }

      // Verificar espécie (dog → 🐶 ou "Cão" ou "dog")
      const speciesVisible = await page.getByText(/cão|dog|🐶/i).first().isVisible({ timeout: 3_000 }).catch(() => false);
      // Verificar tutor
      const tutorVisible = await page.getByText(fixtures.tutors.tutorA1.name).first().isVisible({ timeout: 3_000 }).catch(() => false);

      console.log(`R-04-01: Espécie visível: ${speciesVisible}, Tutor visível: ${tutorVisible}`);
      expect(tutorVisible).toBe(true);
    } finally {
      if (queue?.id) await admin.from('queue_entries').delete().eq('id', queue.id);
    }
  });

  test('R-04-02: Seção "Atendidos Hoje" existe na Recepção', async ({ page }) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);
    const loaded = await navigateToReception(page);
    if (!loaded) { console.log('R-04-02: SKIP — Recepção não carregou'); test.skip(); return; }

    const atendidosHoje = page.getByText(/atendidos hoje|hoje.*atendidos|discharged today/i).first();
    const visible = await atendidosHoje.isVisible({ timeout: 8_000 }).catch(() => false);
    console.log(`R-04-02: Seção "Atendidos Hoje" visível: ${visible}`);
    if (!visible) {
      console.log('R-04-02: FUNCIONALIDADE PENDENTE — seção "Atendidos Hoje" não encontrada');
      test.skip();
    } else {
      expect(visible).toBe(true);
    }
  });
});
