import * as dotenv from 'dotenv';
import path from 'path';
import { cleanupTestData } from './helpers/db-seed';

module.exports = async () => {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
  await cleanupTestData();
};
