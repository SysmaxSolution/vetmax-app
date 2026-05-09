import { seedClinics, seedUsers, seedTutorsAndPets, seedProductPrices } from './helpers/db-seed';
import * as dotenv from 'dotenv';
import path from 'path';

export default async function globalSetup() {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
  dotenv.config({ path: path.resolve(process.cwd(), 'vetmax-app', '.env.local') });
  console.log('\n[SETUP] Seeding test database...');
  await seedClinics();
  await seedUsers();
  await seedTutorsAndPets();
  await seedProductPrices();
  console.log('[SETUP] Done.');
}
