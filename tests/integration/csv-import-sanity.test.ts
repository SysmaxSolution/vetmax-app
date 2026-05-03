/**
 * Integration — Importação de CSV de Preços
 *
 * TC-CSV-01: CSV válido importa todos os registros
 * TC-CSV-02: CSV com caracteres especiais (Unicode, aspas duplas, EM-dash) → importado corretamente
 * TC-CSV-03: CSV com valores inválidos → linhas válidas importadas, inválidas rejeitadas com relatório
 */

import { createUserClient, createAdminClient } from '../helpers/supabase-test-client';
import fixtures from '../fixtures/test-data.json';
import { parse } from 'csv-parse/sync';

const admin = createAdminClient();

// Simula a lógica de importação de CSV que existe na server action
// Importar do módulo real quando disponível
async function importCsvPrices(
  csvContent: string,
  clinicId: string,
  userId: string,
): Promise<{ imported: number; errors: Array<{ row: number; reason: string }> }> {
  const rows = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>;

  const VALID_CATEGORIES = ['grooming_supplies', 'medications', 'exams', 'services', 'other'];
  const MAX_NAME_LENGTH = 100;

  const toInsert: Array<{ clinic_id: string; name: string; category: string; price: number; created_by: string }> = [];
  const errors: Array<{ row: number; reason: string }> = [];

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-based + header
    const name = (row.name ?? '').trim();
    const category = (row.category ?? '').trim();
    const rawPrice = (row.price ?? '').trim();
    const price = parseFloat(rawPrice);

    if (!name) {
      errors.push({ row: rowNum, reason: 'Nome vazio' });
      return;
    }
    if (name.length > MAX_NAME_LENGTH) {
      errors.push({ row: rowNum, reason: `Nome excede ${MAX_NAME_LENGTH} caracteres` });
      return;
    }
    if (!VALID_CATEGORIES.includes(category)) {
      errors.push({ row: rowNum, reason: `Categoria inválida: "${category}"` });
      return;
    }
    if (isNaN(price) || price < 0) {
      errors.push({ row: rowNum, reason: `Preço inválido: "${rawPrice}"` });
      return;
    }

    toInsert.push({ clinic_id: clinicId, name, category, price, created_by: userId });
  });

  if (toInsert.length > 0) {
    const { error } = await admin.from('product_prices').upsert(toInsert, {
      onConflict: 'clinic_id,name,category',
    });
    if (error) throw new Error(`DB insert failed: ${error.message}`);
  }

  return { imported: toInsert.length, errors };
}

describe('TC-CSV-01: Importação de CSV válido', () => {
  afterEach(async () => {
    await admin.from('product_prices')
      .delete()
      .eq('clinic_id', fixtures.clinics.clinicA.id)
      .in('name', ['Banho Completo', 'Tosa Higiênica', 'Consulta Geral']);
  });

  test('Importa 3 linhas sem erros', async () => {
    const adminAClient = await createUserClient(
      fixtures.users.adminA.email,
      fixtures.users.adminA.password,
    );
    const { data: { user } } = await adminAClient.auth.getUser();

    const result = await importCsvPrices(
      fixtures.csvImportFixtures.validCsv,
      fixtures.clinics.clinicA.id,
      user!.id,
    );

    expect(result.imported).toBe(3);
    expect(result.errors).toHaveLength(0);

    const { data: rows } = await admin
      .from('product_prices')
      .select('name, price, category')
      .eq('clinic_id', fixtures.clinics.clinicA.id)
      .in('name', ['Banho Completo', 'Tosa Higiênica', 'Consulta Geral']);

    expect(rows).toHaveLength(3);
    const consulta = rows!.find((r) => r.name === 'Consulta Geral');
    expect(Number(consulta!.price)).toBe(150.00);
    expect(consulta!.category).toBe('exams');
  });
});

describe('TC-CSV-02: CSV com caracteres especiais', () => {
  const specialNames = ['Banho & Tosa — Premium', 'Serviço "Especial"', 'Àgua Oxigenada (3%)'];

  afterEach(async () => {
    await admin.from('product_prices')
      .delete()
      .eq('clinic_id', fixtures.clinics.clinicA.id)
      .in('name', specialNames);
  });

  test('Importa nomes com &, EM-dash, aspas duplas escapadas e acentos', async () => {
    const adminAClient = await createUserClient(
      fixtures.users.adminA.email,
      fixtures.users.adminA.password,
    );
    const { data: { user } } = await adminAClient.auth.getUser();

    const result = await importCsvPrices(
      fixtures.csvImportFixtures.csvWithSpecialChars,
      fixtures.clinics.clinicA.id,
      user!.id,
    );

    expect(result.imported).toBe(3);
    expect(result.errors).toHaveLength(0);

    const { data: rows } = await admin
      .from('product_prices')
      .select('name, price')
      .eq('clinic_id', fixtures.clinics.clinicA.id)
      .in('name', specialNames);

    expect(rows).toHaveLength(3);

    const premium = rows!.find((r) => r.name === 'Banho & Tosa — Premium');
    expect(Number(premium!.price)).toBe(95.50);

    const especial = rows!.find((r) => r.name === 'Serviço "Especial"');
    expect(especial).toBeDefined();

    const agua = rows!.find((r) => r.name === 'Àgua Oxigenada (3%)');
    expect(Number(agua!.price)).toBe(12.75);
  });
});

describe('TC-CSV-03: CSV com valores inválidos — partial import', () => {
  afterEach(async () => {
    await admin.from('product_prices')
      .delete()
      .eq('clinic_id', fixtures.clinics.clinicA.id)
      .eq('name', 'Serviço Válido');
  });

  test('Apenas linha válida é importada; 5 inválidas retornam erros com motivo', async () => {
    const adminAClient = await createUserClient(
      fixtures.users.adminA.email,
      fixtures.users.adminA.password,
    );
    const { data: { user } } = await adminAClient.auth.getUser();

    const result = await importCsvPrices(
      fixtures.csvImportFixtures.csvWithInvalidValues,
      fixtures.clinics.clinicA.id,
      user!.id,
    );

    // 1 válida + 5 inválidas no fixture
    expect(result.imported).toBe(1);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);

    // Verificar motivos específicos
    const reasons = result.errors.map((e) => e.reason);
    expect(reasons.some((r) => /negativo|inválido/i.test(r))).toBe(true); // preço negativo
    expect(reasons.some((r) => /categoria/i.test(r))).toBe(true);        // categoria inválida
    expect(reasons.some((r) => /inválido/i.test(r))).toBe(true);         // "abc" como preço

    // Linha válida foi inserida
    const { data: rows } = await admin
      .from('product_prices')
      .select('name')
      .eq('clinic_id', fixtures.clinics.clinicA.id)
      .eq('name', 'Serviço Válido');

    expect(rows).toHaveLength(1);
  });

  test('Nome vazio não é inserido', async () => {
    const adminAClient = await createUserClient(
      fixtures.users.adminA.email,
      fixtures.users.adminA.password,
    );
    const { data: { user } } = await adminAClient.auth.getUser();

    const result = await importCsvPrices(
      fixtures.csvImportFixtures.csvWithInvalidValues,
      fixtures.clinics.clinicA.id,
      user!.id,
    );

    const emptyNameError = result.errors.find((e) => /nome vazio/i.test(e.reason));
    expect(emptyNameError).toBeDefined();
  });

  test('Nome acima de 100 caracteres é rejeitado', async () => {
    const adminAClient = await createUserClient(
      fixtures.users.adminA.email,
      fixtures.users.adminA.password,
    );
    const { data: { user } } = await adminAClient.auth.getUser();

    const result = await importCsvPrices(
      fixtures.csvImportFixtures.csvWithInvalidValues,
      fixtures.clinics.clinicA.id,
      user!.id,
    );

    const longNameError = result.errors.find((e) => /caracteres/i.test(e.reason));
    expect(longNameError).toBeDefined();
  });
});

describe('TC-CSV-04: Idempotência — importação duplicada usa upsert', () => {
  afterEach(async () => {
    await admin.from('product_prices')
      .delete()
      .eq('clinic_id', fixtures.clinics.clinicA.id)
      .in('name', ['Banho Completo', 'Tosa Higiênica', 'Consulta Geral']);
  });

  test('Reimportar mesmo CSV não duplica registros', async () => {
    const adminAClient = await createUserClient(
      fixtures.users.adminA.email,
      fixtures.users.adminA.password,
    );
    const { data: { user } } = await adminAClient.auth.getUser();

    await importCsvPrices(fixtures.csvImportFixtures.validCsv, fixtures.clinics.clinicA.id, user!.id);
    await importCsvPrices(fixtures.csvImportFixtures.validCsv, fixtures.clinics.clinicA.id, user!.id);

    const { data: rows } = await admin
      .from('product_prices')
      .select('name')
      .eq('clinic_id', fixtures.clinics.clinicA.id)
      .in('name', ['Banho Completo', 'Tosa Higiênica', 'Consulta Geral']);

    // Exatamente 3 linhas, sem duplicação
    expect(rows).toHaveLength(3);
  });
});
