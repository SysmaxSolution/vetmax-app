import { cleanupTestData } from './helpers/db-seed';

export default async function globalTeardown() {
  console.log('\n[TEARDOWN] Cleaning test database...');
  await cleanupTestData();
  console.log('[TEARDOWN] Done.');
}
