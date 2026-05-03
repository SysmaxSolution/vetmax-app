import * as dotenv from 'dotenv';
import path from 'path';
import { seedClinics, seedUsers, seedTutorsAndPets, seedProductPrices } from './helpers/db-seed';

module.exports = async () => {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
  await seedClinics();
  await seedUsers();
  await seedTutorsAndPets();
  await seedProductPrices();
};
