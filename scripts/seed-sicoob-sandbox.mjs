import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'; import { resolve, dirname } from 'path'; import { fileURLToPath } from 'url'
const __d=dirname(fileURLToPath(import.meta.url)); config({path:resolve(__d,'../.env.local')})
const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const CLINIC='ad1c3fca-d264-42c3-9a11-4b7ddac52a72'
const SBX_CID='9b5e603e428cc477a2841e2683c92d21', SBX_TOK='1301865f-c6bc-38f3-9f49-666dbcfc59c3'
const { error } = await a.from('clinic_bank_integrations').upsert({
  clinic_id: CLINIC,
  bank_enabled: true,
  banks: [{ bank_code:'756', provider:'sicoob', environment:'sandbox', client_id:SBX_CID, agencia:'0000', conta:'12345' }],
  pix_enabled: true,
  pix: { enabled:true, provider:'sicoob', environment:'sandbox', client_id:SBX_CID, client_secret:'', token:SBX_TOK, pix_key:'sandbox@sicoob.com.br' },
  updated_at: new Date().toISOString(),
}, { onConflict: 'clinic_id' })
console.log(error ? '✗ '+error.message : '✓ integração Sicoob (sandbox) habilitada na clínica dev')
