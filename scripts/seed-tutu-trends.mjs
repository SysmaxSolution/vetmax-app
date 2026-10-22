import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'; import { resolve, dirname } from 'path'; import { fileURLToPath } from 'url'
const __d=dirname(fileURLToPath(import.meta.url)); config({path:resolve(__d,'../.env.local')})
const a=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const PET='d704720e-d550-4247-b727-bc4c3541e315'
const {data:c}=await a.from('consultations').select('id,clinic_id').eq('patient_id',PET).order('created_at',{ascending:false}).limit(1).maybeSingle()
const C=c.clinic_id, CID=c.id
const {count}=await a.from('exam_results').select('id',{count:'exact',head:true}).eq('consultation_id',CID).ilike('panel','%Evolução%')
if(count){console.log('trends já existem');process.exit(0)}
const mk=(panel,an,unit,ref,val,flag,date)=>({clinic_id:C,consultation_id:CID,panel,analyte_name:an,value_text:String(val),unit,ref_text:ref,flag,status:'released',released_at:date+'T10:00:00Z'})
const rows=[]
// Creatinina subindo (3 datas)
;[['2026-03-10','1.1','N'],['2026-06-10','1.4','N'],['2026-09-05','1.8','H']].forEach(([d,v,f])=>rows.push(mk('Evolução [DEMO]','Creatinina','mg/dL','0.5 – 1.5',v,f,d)))
// ALT (2 datas)
;[['2026-06-10','60','N'],['2026-09-05','95','H']].forEach(([d,v,f])=>rows.push(mk('Evolução [DEMO]','ALT (TGP)','U/L','10 – 88',v,f,d)))
await a.from('exam_results').insert(rows)
console.log('✓ histórico de exames inserido ('+rows.length+' linhas)')
