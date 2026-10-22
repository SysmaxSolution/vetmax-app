import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'; import { resolve, dirname } from 'path'; import { fileURLToPath } from 'url'
import { scryptSync, randomBytes } from 'crypto'
const __d=dirname(fileURLToPath(import.meta.url)); config({path:resolve(__d,'../.env.local')})
const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const CLINIC='ad1c3fca-d264-42c3-9a11-4b7ddac52a72', PET='d704720e-d550-4247-b727-bc4c3541e315'
const norm=s=>s.toUpperCase().replace(/[^A-Z0-9]/g,'')
const hash=code=>{const s=randomBytes(16).toString('hex');return `${s}:${scryptSync(norm(code),s,32).toString('hex')}`}
// clínica encaminhadora
let {data:pc}=await a.from('partner_clinics').select('id').eq('clinic_id',CLINIC).ilike('name','%[DEMO]%').maybeSingle()
if(!pc){const r=await a.from('partner_clinics').insert({clinic_id:CLINIC,name:'[DEMO] Clínica Encaminhadora',is_active:true}).select('id').single();pc=r.data}
await a.from('partner_clinics').update({code_public:'ADMIN',code_secret_hash:hash('234567'),code_set_at:new Date().toISOString(),code_fail_count:0,code_locked_until:null}).eq('id',pc.id)
// profissional
let {data:pro}=await a.from('partner_clinic_professionals').select('id').eq('partner_clinic_id',pc.id).ilike('name','%Teste Solicitante%').maybeSingle()
if(!pro){const r=await a.from('partner_clinic_professionals').insert({clinic_id:CLINIC,partner_clinic_id:pc.id,name:'Dr. Teste Solicitante',crmv:'SP-99999'}).select('id').single();pro=r.data}
await a.from('partner_clinic_professionals').update({code_public:'DRVET',code_secret_hash:hash('234567'),code_set_at:new Date().toISOString(),code_fail_count:0,code_locked_until:null}).eq('id',pro.id)
// vincula os estudos de imagem do Tutu à parceira + profissional
await a.from('imaging_studies').update({partner_clinic_id:pc.id,referring_professional_id:pro.id}).eq('patient_id',PET)
console.log('✓ clínica encaminhadora + profissional. Códigos: ADMIN=ADMIN-234567 · MV=DRVET-234567')
