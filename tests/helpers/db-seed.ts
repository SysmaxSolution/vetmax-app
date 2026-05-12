import { createAdminClient } from './supabase-test-client';
import fixtures from '../fixtures/test-data.json';
import { createTestUser, deleteTestUser } from './supabase-test-client';

const admin = createAdminClient();

export async function seedClinics(): Promise<void> {
  await admin.from('clinics').upsert([
    {
      id: fixtures.clinics.clinicA.id,
      name: fixtures.clinics.clinicA.name,
      status: 'active',
      // Módulos completos para cobrir todos os testes E2E da suite
      active_modules: [
        'reception', 'triage', 'consultation', 'exams',
        'pharmacy', 'hospitalization', 'grooming', 'management', 'billing', 'mentor',
      ],
    },
    {
      id: fixtures.clinics.clinicB.id,
      name: fixtures.clinics.clinicB.name,
      status: 'active',
      active_modules: ['reception', 'grooming', 'consultation', 'triage'],
    },
  ]);
}

export async function seedUsers(): Promise<Record<string, string>> {
  // Garante que as clínicas existem antes de criar profiles (FK constraint)
  await seedClinics()
  const ids: Record<string, string> = {}
  for (const [key, user] of Object.entries(fixtures.users)) {
    try {
      // Find-or-update: preserva o mesmo UUID entre runs para evitar eventual consistency do Supabase auth
      const id = await createTestUser({
        email:     user.email,
        password:  user.password,
        role:      user.role,
        clinic_id: user.clinic_id,
        full_name: user.full_name,
      })
      ids[key] = id
      console.log(`[seed] ✓ user ${key} (${user.email})`)
    } catch (e) {
      console.error(`[seed] ✗ FALHOU user ${key} (${user.email}): ${(e as Error).message}`)
      throw e  // propaga — seed falho deve ser erro visível, não silencioso
    }
  }
  return ids
}

export async function seedTutorsAndPets(): Promise<void> {
  // Ensure clinics exist (may have been cleaned up by previous teardown)
  await seedClinics();
  await admin.from('tutors').upsert([fixtures.tutors.tutorA1]);
  await admin.from('patients').upsert([fixtures.patients.petA1]);
}

export async function seedProductPrices(): Promise<void> {
  await admin.from('clinic_catalog').upsert([
    fixtures.productPrices.groomingBath,
    fixtures.productPrices.groomingTosa,
    fixtures.productPrices.clinicBPrice,
  ]);
}

// Map from 'status' (col 0032) values to 'current_status' (col 0043) equivalents
const STATUS_TO_CURRENT_STATUS: Record<string, string> = {
  received:       'arrived',
  bathing:        'bathing',
  grooming:       'grooming',
  waiting_pickup: 'waiting_pickup',
  delivered:      'delivered',
};

export async function seedGroomingSession(overrides: Partial<typeof fixtures.groomingSessions.session1> = {}): Promise<string> {
  // Ensure grooming module is active for clinicA (may have been disabled by other tests)
  const { data: clinic } = await admin.from('clinics').select('active_modules').eq('id', fixtures.clinics.clinicA.id).single();
  const mods: string[] = Array.isArray(clinic?.active_modules) ? clinic.active_modules : [];
  if (!mods.includes('grooming')) {
    await admin.from('clinics').update({ active_modules: [...mods, 'grooming'] }).eq('id', fixtures.clinics.clinicA.id);
  }

  const merged = { ...fixtures.groomingSessions.session1, ...overrides } as Record<string, unknown>;
  // grooming_sessions has both 'status' (original, used by Kanban) and 'current_status' (migration 0043)
  // 'status' CHECK: received|bathing|grooming|waiting_pickup|delivered
  // 'current_status' CHECK: scheduled|arrived|bathing|grooming|drying|waiting_pickup|paid|delivered|cancelled
  const statusValue = ((overrides as Record<string, unknown>).status as string)
    ?? 'waiting_pickup';
  const currentStatusOverride = (overrides as Record<string, unknown>).current_status as string | undefined;
  const currentStatusValue = currentStatusOverride
    ?? STATUS_TO_CURRENT_STATUS[statusValue]
    ?? (merged.current_status as string)
    ?? 'waiting_pickup';

  const session = {
    ...merged,
    status: statusValue,
    current_status: currentStatusValue,
  };
  const { data, error } = await admin.from('grooming_sessions').upsert([session]).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function seedSlot(overrides: Partial<typeof fixtures.slots.slot1> & { professional_schedule_id?: string } = {}): Promise<string> {
  // grooming_slots.professional_schedule_id é NOT NULL — criar professional_schedule primeiro se não fornecido
  let professionalScheduleId = overrides.professional_schedule_id;
  if (!professionalScheduleId) {
    // Buscar um profile da clínica A para ser o professional (NOT NULL)
    const { data: profiles } = await admin
      .from('profiles')
      .select('id')
      .eq('clinic_id', fixtures.clinics.clinicA.id)
      .limit(1);

    const professionalId = profiles?.[0]?.id;
    if (!professionalId) throw new Error('No profile found for clinic A — run seedUsers first');

    // professional_schedules usa 'date' (not day_of_week)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const { data: schedule, error: schedErr } = await admin.from('professional_schedules').insert({
      clinic_id: fixtures.clinics.clinicA.id,
      professional_id: professionalId,
      date: tomorrow,
      start_time: '08:00:00',
      end_time: '18:00:00',
      available: true,
      capacity: 3,
      service_type: 'banho_tosa',
    }).select('id').single();
    if (schedErr) throw schedErr;
    professionalScheduleId = schedule.id;
  }

  const { professional_schedule_id: _, ...slotBase } = overrides;
  const slot = {
    ...fixtures.slots.slot1,
    ...slotBase,
    professional_schedule_id: professionalScheduleId,
  };
  const { data, error } = await admin.from('grooming_slots').insert([slot]).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function cleanupTestData(): Promise<void> {
  // Delete in dependency order
  await admin.from('central_cashier').delete().in('clinic_id', [
    fixtures.clinics.clinicA.id,
    fixtures.clinics.clinicB.id,
  ]);
  await admin.from('grooming_status_transitions').delete().eq('clinic_id', fixtures.clinics.clinicA.id);
  await admin.from('grooming_sessions').delete().in('clinic_id', [
    fixtures.clinics.clinicA.id,
    fixtures.clinics.clinicB.id,
  ]);
  await admin.from('clinic_catalog').delete().in('clinic_id', [
    fixtures.clinics.clinicA.id,
    fixtures.clinics.clinicB.id,
  ]);
  await admin.from('patients').delete().eq('clinic_id', fixtures.clinics.clinicA.id);
  await admin.from('tutors').delete().eq('clinic_id', fixtures.clinics.clinicA.id);

  for (const user of Object.values(fixtures.users)) {
    await deleteTestUser(user.email);
  }

  await admin.from('clinics').delete().in('id', [
    fixtures.clinics.clinicA.id,
    fixtures.clinics.clinicB.id,
  ]);
}
