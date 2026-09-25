import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL ausente no .env.local')
  const { seedClinics, seedUsers, seedTutorsAndPets, seedProductPrices } = await import('./helpers/db-seed')
  console.log('[SEED] clinics...');     await seedClinics()
  console.log('[SEED] users...');       await seedUsers()
  console.log('[SEED] tutors/pets...'); await seedTutorsAndPets()
  console.log('[SEED] prices...');      await seedProductPrices()
  console.log('[SEED] OK')
}
main().then(() => process.exit(0)).catch((e) => { console.error('[SEED] ERRO:', e?.message || e); process.exit(1) })
