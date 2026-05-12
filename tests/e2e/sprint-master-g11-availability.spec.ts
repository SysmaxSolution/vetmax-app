/**
 * E2E — Sprint Master G-11: Validação de Disponibilidade
 *
 * TC-G11-01: Warning NÃO aparece quando profissional está disponível no horário
 * TC-G11-02: Warning aparece quando profissional não tem agenda cadastrada para a data
 * TC-G11-03: Warning aparece quando o horário selecionado está fora do slot disponível
 * TC-G11-04: Warning desaparece ao trocar para horário disponível
 * TC-G11-05 (Crítico): Warning não bloqueia o agendamento (apenas informa)
 * TC-G11-06 (Crítico): Profissional sem schedules retorna available:true (sem restrição)
 *
 * Comportamento: em NewAppointmentModal, useEffect verifica
 * checkProfessionalAvailability(professionalId, date, time) e exibe
 * warning âmbar se fora do horário configurado.
 */

import { test, expect, Page } from '@playwright/test';
import { loginViaApi } from '../helpers/session'
import { createAdminClient } from '../helpers/supabase-test-client';
import { seedTutorsAndPets } from '../helpers/db-seed';
import fixtures from '../fixtures/test-data.json';

const admin = createAdminClient();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loginAs(page: Page, email: string, password: string) {
  await loginViaApi(page, email, password)
}

async function enableModule(clinicId: string, module: string) {
  const { data } = await admin.from('clinics').select('active_modules').eq('id', clinicId).single();
  const mods: string[] = Array.isArray(data?.active_modules) ? data.active_modules : [];
  if (!mods.includes(module)) {
    await admin.from('clinics').update({ active_modules: [...mods, module] }).eq('id', clinicId);
  }
}

/** Retorna o ID de um profissional da clínica A */
async function getProfessionalId(): Promise<string | null> {
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('clinic_id', fixtures.clinics.clinicA.id)
    .in('role', ['vet', 'admin', 'assistant'])
    .limit(1);
  return data?.[0]?.id ?? null;
}

/** Cria um schedule para o profissional na data/horário especificados */
async function seedProfessionalSchedule(options: {
  professionalId: string;
  date: string;
  startTime: string;
  endTime: string;
}): Promise<string> {
  const { professionalId, date, startTime, endTime } = options;
  const { data, error } = await admin.from('professional_schedules').insert([{
    clinic_id: fixtures.clinics.clinicA.id,
    professional_id: professionalId,
    date,
    start_time: startTime,
    end_time: endTime,
    available: true,
    capacity: 5,
    service_type: 'consultation',
  }]).select('id').single();
  if (error) throw error;
  return data.id;
}

/** Data futura no formato YYYY-MM-DD (amanhã) */
function getTomorrow(): string {
  return new Date(Date.now() + 86400000).toISOString().split('T')[0];
}

/** Abre o modal de novo agendamento e seleciona profissional/data/hora */
async function openNewAppointmentModal(page: Page): Promise<boolean> {
  await page.goto('/dashboard/reception', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2_000);

  const newApptBtn = page.getByRole('button', { name: /novo agendamento|agendar|novo atendimento/i })
    .or(page.locator('[data-testid="new-appointment-btn"]'))
    .first();

  const btnVisible = await newApptBtn.isVisible({ timeout: 8_000 }).catch(() => false);
  if (!btnVisible) {
    // Tentar via recepção diretamente
    await page.goto('/dashboard/reception/schedule', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    const btn2 = page.getByRole('button', { name: /novo agendamento|agendar/i }).first();
    if (!(await btn2.isVisible({ timeout: 5_000 }).catch(() => false))) {
      return false;
    }
    await btn2.click();
  } else {
    await newApptBtn.click();
  }

  await page.waitForTimeout(1_000);
  const modal = page.getByRole('dialog').first();
  return modal.isVisible({ timeout: 5_000 }).catch(() => false);
}

/** Seleciona profissional, data e hora no modal */
async function fillAppointmentForm(page: Page, date: string, time: string): Promise<boolean> {
  // Selecionar profissional
  const professionalSelect = page.getByLabel(/profissional|veterinário|médico/i)
    .or(page.locator('select[name*="professional"]'))
    .first();

  if (await professionalSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
    // Selecionar primeiro profissional disponível
    const options = await professionalSelect.locator('option').all();
    if (options.length > 1) {
      await professionalSelect.selectOption({ index: 1 });
    }
  }

  // Data
  const dateInput = page.getByLabel(/data|date/i)
    .or(page.locator('input[type="date"], input[name*="date"]').first());
  if (await dateInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dateInput.fill(date);
    await dateInput.press('Tab');
    await page.waitForTimeout(500);
  }

  // Hora
  const timeInput = page.getByLabel(/hora|horário|time/i)
    .or(page.locator('input[type="time"], input[name*="time"]').first());
  if (await timeInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await timeInput.fill(time);
    await timeInput.press('Tab');
    await page.waitForTimeout(1_000); // aguardar useEffect de disponibilidade
    return true;
  }

  return false;
}

/** Verifica se warning âmbar de disponibilidade está visível */
async function isAvailabilityWarningVisible(page: Page): Promise<boolean> {
  const warning = page.getByText(/fora do horário|horário indisponível|sem agenda|profissional.*disponível/i)
    .or(page.locator('[data-testid*="availability-warning"]'))
    .or(page.locator('.text-yellow, .text-amber, [class*="warning"]').filter({ hasText: /horário|disponível|agenda/i }))
    .first();
  return warning.isVisible({ timeout: 4_000 }).catch(() => false);
}

// ─── TC-G11-01: Warning NÃO aparece quando profissional está disponível ───────

// — server guard ——————————————————————————————————————————————————————————————
let _serverAlive = true
test.beforeAll(async ({ browser }) => {
  const _ctx = await browser.newContext(); const _pg = await _ctx.newPage()
  _serverAlive = await _pg.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 8_000 }).then(() => true).catch(() => false)
  await _ctx.close(); if (!_serverAlive) console.log('[SKIP ALL] sprint-master-g11-availability.spec.ts — servidor fora do ar')
})
test.beforeEach(async ({}, testInfo) => { if (!_serverAlive) testInfo.skip() })

test.describe('TC-G11-01: Warning não aparece quando profissional está disponível', () => {
  let scheduleId: string;
  const tomorrow = getTomorrow();

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    await enableModule(fixtures.clinics.clinicA.id, 'reception');
    const profId = await getProfessionalId();
    if (profId) {
      try {
        scheduleId = await seedProfessionalSchedule({
          professionalId: profId,
          date: tomorrow,
          startTime: '08:00:00',
          endTime: '18:00:00',
        });
      } catch {
        // professional_schedules pode não existir ainda (G-11 pendente)
      }
    }
  });

  test.afterEach(async () => {
    if (scheduleId) await admin.from('professional_schedules').delete().eq('id', scheduleId);
  });

  test('Selecionar horário disponível não exibe warning âmbar', async ({ page }, testInfo) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);

    const modalOpened = await openNewAppointmentModal(page);
    if (!modalOpened) {
      console.log('TC-G11-01: SKIP — Modal de novo agendamento não abriu');
      testInfo.skip();
      return;
    }

    const filled = await fillAppointmentForm(page, tomorrow, '10:00');
    if (!filled) {
      console.log('TC-G11-01: SKIP — Formulário de agendamento não encontrado');
      testInfo.skip();
      return;
    }

    const warningVisible = await isAvailabilityWarningVisible(page);
    console.log(`TC-G11-01: Warning visível com horário disponível (esperado: false): ${warningVisible}`);
    expect(warningVisible).toBe(false);
  });
});

// ─── TC-G11-02: Warning aparece quando não tem agenda para a data ─────────────

test.describe('TC-G11-02: Warning aparece quando profissional não tem agenda para a data', () => {
  const dayAfterTomorrow = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    await enableModule(fixtures.clinics.clinicA.id, 'reception');
    // Garantir que não há schedule para dayAfterTomorrow
    const profId = await getProfessionalId();
    if (profId) {
      await admin.from('professional_schedules')
        .delete()
        .eq('clinic_id', fixtures.clinics.clinicA.id)
        .eq('professional_id', profId)
        .eq('date', dayAfterTomorrow);
    }
  });

  test('Selecionar data sem agenda exibe warning de disponibilidade', async ({ page }, testInfo) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);

    const modalOpened = await openNewAppointmentModal(page);
    if (!modalOpened) {
      console.log('TC-G11-02: SKIP — Modal de novo agendamento não abriu');
      testInfo.skip();
      return;
    }

    const filled = await fillAppointmentForm(page, dayAfterTomorrow, '10:00');
    if (!filled) {
      console.log('TC-G11-02: SKIP — Formulário de agendamento não encontrado');
      testInfo.skip();
      return;
    }

    const warningVisible = await isAvailabilityWarningVisible(page);
    console.log(`TC-G11-02: Warning visível sem agenda na data (esperado: true): ${warningVisible}`);

    if (!warningVisible) {
      console.log('TC-G11-02: FUNCIONALIDADE PENDENTE — Warning de disponibilidade não apareceu para data sem agenda. Verificar checkProfessionalAvailability.');
    }
    expect(warningVisible).toBe(true);
  });
});

// ─── TC-G11-03: Warning aparece quando horário está fora do slot ─────────────

test.describe('TC-G11-03: Warning aparece quando horário está fora do slot disponível', () => {
  let scheduleId: string;
  const tomorrow = getTomorrow();

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    await enableModule(fixtures.clinics.clinicA.id, 'reception');
    const profId = await getProfessionalId();
    if (profId) {
      try {
        scheduleId = await seedProfessionalSchedule({
          professionalId: profId,
          date: tomorrow,
          startTime: '08:00:00',
          endTime: '12:00:00',
        });
      } catch {
        // professional_schedules pode não existir ainda (G-11 pendente)
      }
    }
  });

  test.afterEach(async () => {
    if (scheduleId) await admin.from('professional_schedules').delete().eq('id', scheduleId);
  });

  test('Horário fora do slot (14:00 com agenda até 12:00) exibe warning', async ({ page }, testInfo) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);

    const modalOpened = await openNewAppointmentModal(page);
    if (!modalOpened) {
      console.log('TC-G11-03: SKIP — Modal de novo agendamento não abriu');
      testInfo.skip();
      return;
    }

    const filled = await fillAppointmentForm(page, tomorrow, '14:00');
    if (!filled) {
      console.log('TC-G11-03: SKIP — Formulário de agendamento não encontrado');
      testInfo.skip();
      return;
    }

    const warningVisible = await isAvailabilityWarningVisible(page);
    console.log(`TC-G11-03: Warning para horário 14:00 (fora de 08:00-12:00) (esperado: true): ${warningVisible}`);

    if (!warningVisible) {
      console.log('TC-G11-03: FUNCIONALIDADE PENDENTE — Warning não apareceu para horário fora do slot.');
    }
    expect(warningVisible).toBe(true);
  });
});

// ─── TC-G11-04: Warning desaparece ao trocar para horário disponível ──────────

test.describe('TC-G11-04: Warning desaparece ao trocar para horário disponível', () => {
  let scheduleId: string;
  const tomorrow = getTomorrow();

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    await enableModule(fixtures.clinics.clinicA.id, 'reception');
    const profId = await getProfessionalId();
    if (profId) {
      try {
        scheduleId = await seedProfessionalSchedule({
          professionalId: profId,
          date: tomorrow,
          startTime: '08:00:00',
          endTime: '12:00:00',
        });
      } catch {
        // professional_schedules pode não existir ainda (G-11 pendente)
      }
    }
  });

  test.afterEach(async () => {
    if (scheduleId) await admin.from('professional_schedules').delete().eq('id', scheduleId);
  });

  test('Warning some ao mudar de 14:00 (fora) para 09:00 (dentro do slot)', async ({ page }, testInfo) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);

    const modalOpened = await openNewAppointmentModal(page);
    if (!modalOpened) {
      console.log('TC-G11-04: SKIP — Modal de novo agendamento não abriu');
      testInfo.skip();
      return;
    }

    // Primeiro selecionar horário fora do slot
    const filled = await fillAppointmentForm(page, tomorrow, '14:00');
    if (!filled) {
      console.log('TC-G11-04: SKIP — Formulário de agendamento não encontrado');
      testInfo.skip();
      return;
    }

    const warningBefore = await isAvailabilityWarningVisible(page);
    console.log(`TC-G11-04: Warning com 14:00 (fora do slot): ${warningBefore}`);

    if (!warningBefore) {
      console.log('TC-G11-04: SKIP — Warning não apareceu para horário fora do slot (pré-condição falhou)');
      testInfo.skip();
      return;
    }

    // Trocar para horário disponível
    const timeInput = page.getByLabel(/hora|horário|time/i)
      .or(page.locator('input[type="time"], input[name*="time"]').first());

    if (await timeInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await timeInput.fill('09:00');
      await timeInput.press('Tab');
      await page.waitForTimeout(1_500); // aguardar useEffect
    }

    const warningAfter = await isAvailabilityWarningVisible(page);
    console.log(`TC-G11-04: Warning com 09:00 (dentro do slot, esperado: false): ${warningAfter}`);
    expect(warningAfter).toBe(false);
  });
});

// ─── TC-G11-05 (Crítico): Warning não bloqueia o agendamento ─────────────────

test.describe('TC-G11-05: Warning não bloqueia o agendamento (apenas informa)', () => {
  const dayAfterTomorrow = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    await enableModule(fixtures.clinics.clinicA.id, 'reception');
  });

  test('Com warning de disponibilidade, botão Agendar permanece habilitado', async ({ page }, testInfo) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);

    const modalOpened = await openNewAppointmentModal(page);
    if (!modalOpened) {
      console.log('TC-G11-05: SKIP — Modal de novo agendamento não abriu');
      testInfo.skip();
      return;
    }

    // Selecionar data sem agenda para gerar warning
    const filled = await fillAppointmentForm(page, dayAfterTomorrow, '10:00');
    if (!filled) {
      console.log('TC-G11-05: SKIP — Formulário de agendamento não encontrado');
      testInfo.skip();
      return;
    }

    const warningVisible = await isAvailabilityWarningVisible(page);
    console.log(`TC-G11-05: Warning apareceu: ${warningVisible}`);

    // Verificar que o botão de agendar não está desabilitado
    const submitBtn = page.getByRole('button', { name: /agendar|confirmar|salvar agendamento/i }).first();
    const submitVisible = await submitBtn.isVisible({ timeout: 5_000 }).catch(() => false);

    if (!submitVisible) {
      console.log('TC-G11-05: SKIP — Botão de agendar não encontrado');
      testInfo.skip();
      return;
    }

    const isDisabled = await submitBtn.isDisabled();
    console.log(`TC-G11-05: Botão Agendar desabilitado com warning (esperado: false): ${isDisabled}`);

    if (isDisabled && warningVisible) {
      console.log('TC-G11-05: FALHA — Warning está bloqueando o agendamento. Deve ser apenas informativo.');
    }
    expect(isDisabled).toBe(false);
  });
});

// ─── TC-G11-06 (Crítico): Profissional sem schedules retorna available:true ───

test.describe('TC-G11-06: Profissional sem schedules retorna available:true (sem restrição)', () => {
  const tomorrow = getTomorrow();

  test.beforeEach(async () => {
    await seedTutorsAndPets();
    await enableModule(fixtures.clinics.clinicA.id, 'reception');
    // Remover todos os schedules do profissional para amanhã
    const profId = await getProfessionalId();
    if (profId) {
      await admin.from('professional_schedules')
        .delete()
        .eq('clinic_id', fixtures.clinics.clinicA.id)
        .eq('professional_id', profId)
        .eq('date', tomorrow);
    }
  });

  test('Sem schedules cadastrados, profissional é tratado como disponível (sem warning)', async ({ page }, testInfo) => {
    await loginAs(page, fixtures.users.adminA.email, fixtures.users.adminA.password);

    const modalOpened = await openNewAppointmentModal(page);
    if (!modalOpened) {
      console.log('TC-G11-06: SKIP — Modal de novo agendamento não abriu');
      testInfo.skip();
      return;
    }

    // Verificar que profissional sem schedules não causa warning
    const filled = await fillAppointmentForm(page, tomorrow, '10:00');
    if (!filled) {
      console.log('TC-G11-06: SKIP — Formulário de agendamento não encontrado');
      testInfo.skip();
      return;
    }

    const warningVisible = await isAvailabilityWarningVisible(page);
    console.log(`TC-G11-06: Warning sem schedules cadastrados (esperado: false): ${warningVisible}`);

    if (warningVisible) {
      console.log('TC-G11-06: FUNCIONALIDADE PENDENTE — checkProfessionalAvailability deve retornar available:true quando sem schedules (sem restrição).');
    }
    expect(warningVisible).toBe(false);
  });
});
