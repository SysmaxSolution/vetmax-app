import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const { createAdminClient } = await import('./helpers/supabase-test-client')
  const admin = createAdminClient()
  const clinic_id = '11111111-1111-1111-1111-111111111111'

  const keys = ['cashier','financial','purchases','pharmacy','reports','billing',
    'exams','hospitalization','surgery','grooming','whatsapp_intelligent','registry','internal_chat','sales','triage']
  console.log('keys a conceder:', keys.length, JSON.stringify(keys))

  for (const module_key of keys) {
    const { data: ex } = await admin.from('clinic_contracted_modules').select('id').eq('clinic_id', clinic_id).eq('module_key', module_key).maybeSingle()
    if (ex) {
      await admin.from('clinic_contracted_modules').update({ is_active: true }).eq('clinic_id', clinic_id).eq('module_key', module_key)
    } else {
      const { error } = await admin.from('clinic_contracted_modules').insert({ clinic_id, module_key, is_active: true })
      if (error) console.log('  insert', module_key, 'erro:', error.message.slice(0, 60))
    }
  }
  const { count } = await admin.from('clinic_contracted_modules').select('*', { count: 'exact', head: true }).eq('clinic_id', clinic_id).eq('is_active', true)
  console.log('contratados ativos:', count)
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1) })
