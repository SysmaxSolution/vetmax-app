import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'; import { resolve, dirname } from 'path'; import { fileURLToPath } from 'url'
import { scryptSync, randomBytes } from 'crypto'
const __d=dirname(fileURLToPath(import.meta.url)); config({path:resolve(__d,'../.env.local')})
const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const PET='d704720e-d550-4247-b727-bc4c3541e315'
const CODE='TESTE234', CPF='11111111111'
const norm=s=>s.toUpperCase().replace(/[^A-Z0-9]/g,'')
const salt=randomBytes(16).toString('hex'); const hash=`${salt}:${scryptSync(norm(CODE),salt,32).toString('hex')}`
const {data:pet}=await a.from('patients').select('tutor_id,clinic_id').eq('id',PET).single()
// garante cpf no tutor
await a.from('tutors').update({cpf:CPF}).eq('id',pet.tutor_id)
// find-or-create tutor_user por cpf, com código
let {data:tu}=await a.from('tutor_users').select('id').eq('cpf',CPF).limit(1).maybeSingle()
if(!tu){ const r=await a.from('tutor_users').insert({cpf:CPF,full_name:'Melissa (teste)'}).select('id').single(); tu=r.data }
await a.from('tutor_users').update({access_code_hash:hash,access_code_set_at:new Date().toISOString(),code_fail_count:0,code_locked_until:null}).eq('id',tu.id)
// vínculo com o tutor do Tutu
const {data:lk}=await a.from('tutor_user_links').select('id').eq('tutor_user_id',tu.id).eq('tutor_id',pet.tutor_id).maybeSingle()
if(!lk) await a.from('tutor_user_links').insert({tutor_user_id:tu.id,tutor_id:pet.tutor_id,clinic_id:pet.clinic_id,linked_via:'self_cpf'})
console.log('✓ login de teste: CPF 111.111.111-11 · código '+CODE)
