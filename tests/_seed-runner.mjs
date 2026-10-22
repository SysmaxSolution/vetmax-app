// Runner isolado para semear o DB dev com dados de demonstração (clínica de teste).
// Usa os mesmos helpers do e2e. Executar a partir de C:/sysvetmax-dev.
import { register } from 'node:module';
register('tsx/esm', import.meta.url);
const { seedClinics, seedUsers, seedTutorsAndPets, seedProductPrices } = await import('./tests/helpers/db-seed.ts');
console.log('[SEED] clinics...');   await seedClinics();
console.log('[SEED] users...');     await seedUsers();
console.log('[SEED] tutors/pets...'); await seedTutorsAndPets();
console.log('[SEED] prices...');    await seedProductPrices();
console.log('[SEED] OK');
process.exit(0);
