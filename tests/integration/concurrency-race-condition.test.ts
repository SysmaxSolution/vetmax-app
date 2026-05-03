/**
 * Integration — Stress & Concorrência
 *
 * TC-RACE-01: 10 agendamentos simultâneos no mesmo slot não ultrapassam a capacidade
 * TC-RACE-02: clinic_id isolation — Clínica B não lê product_prices da Clínica A
 */

import { createAdminClient, createUserClient } from '../helpers/supabase-test-client';
import { seedSlot, seedTutorsAndPets } from '../helpers/db-seed';
import fixtures from '../fixtures/test-data.json';

const admin = createAdminClient();

describe('TC-RACE-01: Race condition — 10 agendamentos simultâneos no mesmo slot', () => {
  let slotId: string;
  const CAPACITY = 2;
  const CONCURRENT_REQUESTS = 10;
  const sessionIds: string[] = [];

  beforeAll(async () => {
    await seedTutorsAndPets();

    slotId = await seedSlot({
      capacity: CAPACITY,
      booked_count: 0,
      status: 'available',
    });

    // Criar 10 sessões prontas para ser atribuídas ao slot
    for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
      const { data, error } = await admin.from('grooming_sessions').insert({
        clinic_id: fixtures.clinics.clinicA.id,
        patient_id: fixtures.patients.petA1.id,
        tutor_id: fixtures.tutors.tutorA1.id,
        services_requested: ['banho'],
        current_status: 'scheduled',
        price_total: 85.00,
        payment_status: 'pending',
      }).select('id').single();

      if (error) throw error;
      sessionIds.push(data.id);
    }
  });

  afterAll(async () => {
    // Obter professional_schedule_id do slot para cleanup
    const { data: slot } = await admin
      .from('grooming_slots')
      .select('professional_schedule_id')
      .eq('id', slotId)
      .single();

    await admin.from('grooming_slot_assignments').delete().eq('grooming_slot_id', slotId);
    await admin.from('grooming_sessions').delete().in('id', sessionIds);
    await admin.from('grooming_slots').delete().eq('id', slotId);
    if (slot?.professional_schedule_id) {
      await admin.from('professional_schedules').delete().eq('id', slot.professional_schedule_id);
    }
  });

  test('Apenas CAPACITY reservas bem-sucedidas; restantes falham graciosamente', async () => {
    // Disparar 10 chamadas ao RPC de reserva atomicamente em paralelo
    const results = await Promise.allSettled(
      sessionIds.map((sessionId) =>
        admin.rpc('rpc_reserve_slot', {
          p_slot_id: slotId,
          p_session_id: sessionId,
        }),
      ),
    );

    // RPC retorna TABLE → data é array; extrair primeiro row
    const getSuccess = (r: PromiseSettledResult<{ data: unknown; error: unknown }>) => {
      if (r.status !== 'fulfilled') return false;
      const { data, error } = r.value as { data: unknown; error: unknown };
      if (error) return false;
      const row = Array.isArray(data) ? (data as Array<{ success: boolean }>)[0] : (data as { success: boolean });
      return row?.success === true;
    };

    const successes = results.filter(getSuccess);
    const failures = results.filter((r) => !getSuccess(r));

    // Exatamente CAPACITY reservas devem ter sucedido
    expect(successes.length).toBe(CAPACITY);
    expect(failures.length).toBe(CONCURRENT_REQUESTS - CAPACITY);

    // Verificar estado do slot no banco
    const { data: slot } = await admin
      .from('grooming_slots')
      .select('booked_count, status')
      .eq('id', slotId)
      .single();

    expect(slot!.booked_count).toBe(CAPACITY);
    expect(slot!.status).toBe('full');

    // Verificar assignments criados = CAPACITY exato
    const { data: assignments } = await admin
      .from('grooming_slot_assignments')
      .select('id')
      .eq('grooming_slot_id', slotId);

    expect(assignments!.length).toBe(CAPACITY);
  });

  test('booked_count nunca excede capacity (invariante de banco)', async () => {
    const { data: slot } = await admin
      .from('grooming_slots')
      .select('booked_count, capacity')
      .eq('id', slotId)
      .single();

    expect(slot!.booked_count).toBeLessThanOrEqual(slot!.capacity);
  });
});

describe('TC-RACE-02: clinic_id isolation — Clínica B não acessa product_prices da Clínica A', () => {
  beforeAll(async () => {
    // Seed de product_prices para Clínica A (tabela product_prices, não clinic_catalog)
    await admin.from('product_prices').upsert([
      {
        clinic_id: fixtures.clinics.clinicA.id,
        name: 'Banho Completo',
        category: 'services',
        price: 85.00,
        is_active: true,
      },
      {
        clinic_id: fixtures.clinics.clinicA.id,
        name: 'Tosa Higiênica',
        category: 'services',
        price: 60.00,
        is_active: true,
      },
      {
        clinic_id: fixtures.clinics.clinicB.id,
        name: 'Banho Simples',
        category: 'services',
        price: 70.00,
        is_active: true,
      },
    ]);
  });

  afterAll(async () => {
    await admin.from('product_prices').delete().in('clinic_id', [
      fixtures.clinics.clinicA.id,
      fixtures.clinics.clinicB.id,
    ]);
  });

  test('RLS bloqueia leitura cross-clinic', async () => {
    const adminBClient = await createUserClient(
      fixtures.users.adminB.email,
      fixtures.users.adminB.password,
    );

    // Admin da Clínica B tenta ler preços da Clínica A
    const { data, error } = await adminBClient
      .from('product_prices')
      .select('*')
      .eq('clinic_id', fixtures.clinics.clinicA.id);

    // RLS deve retornar lista vazia (não erro, apenas isolamento silencioso)
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  test('Admin B vê APENAS os preços da Clínica B', async () => {
    const adminBClient = await createUserClient(
      fixtures.users.adminB.email,
      fixtures.users.adminB.password,
    );

    const { data, error } = await adminBClient
      .from('product_prices')
      .select('clinic_id, name');

    expect(error).toBeNull();
    // Todos os registros retornados pertencem à Clínica B
    data!.forEach((row) => {
      expect(row.clinic_id).toBe(fixtures.clinics.clinicB.id);
    });
  });

  test('Inserção com clinic_id da Clínica A por usuário da Clínica B → bloqueada pelo RLS', async () => {
    const adminBClient = await createUserClient(
      fixtures.users.adminB.email,
      fixtures.users.adminB.password,
    );

    const { error } = await adminBClient.from('product_prices').insert({
      clinic_id: fixtures.clinics.clinicA.id, // Tentativa de injeção cross-clinic
      name: 'Produto Invasivo',
      category: 'services',
      price: 999.99,
    });

    // Deve falhar com violação de RLS ou FK
    expect(error).not.toBeNull();
    expect(error!.code).toMatch(/42501|23503|PGRST301/); // permission denied / FK violation / RLS
  });

  test('Clínica A vê seus preços — isolamento não quebra acesso legítimo', async () => {
    const adminAClient = await createUserClient(
      fixtures.users.adminA.email,
      fixtures.users.adminA.password,
    );

    const { data, error } = await adminAClient
      .from('product_prices')
      .select('name, price')
      .eq('clinic_id', fixtures.clinics.clinicA.id);

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(2);
    const names = data!.map((r) => r.name);
    expect(names).toContain('Banho Completo');
    expect(names).toContain('Tosa Higiênica');
  });
});
