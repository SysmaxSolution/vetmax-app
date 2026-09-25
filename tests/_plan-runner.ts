import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

async function main() {
  const { createAdminClient } = await import('./helpers/supabase-test-client')
  const admin = createAdminClient()
  const clinic_id = '11111111-1111-1111-1111-111111111111'
  // tenta atualizar; se nao existir, insere
  const { data: existing } = await admin.from('tenant_subscriptions').select('clinic_id').eq('clinic_id', clinic_id).maybeSingle()
  if (existing) {
    const { error } = await admin.from('tenant_subscriptions').update({ plan_name: 'enterprise', status: 'active' }).eq('clinic_id', clinic_id)
    console.log('update:', error?.message || 'OK')
  } else {
    const { error } = await admin.from('tenant_subscriptions').insert({ clinic_id, plan_name: 'enterprise', status: 'active' })
    console.log('insert:', error?.message || 'OK')
  }
  const { data } = await admin.from('tenant_subscriptions').select('clinic_id, plan_name, status').eq('clinic_id', clinic_id).maybeSingle()
  console.log('agora:', JSON.stringify(data))
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1) })
