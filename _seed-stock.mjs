import { createRequire } from 'module'; import { readFileSync } from 'node:fs'
const require=createRequire('C:/sysvetmax-dev/package.json')
const env=Object.fromEntries(readFileSync('C:/sysvetmax-dev/.env.local','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,'')]}))
const { createClient }=require('@supabase/supabase-js')
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const CID='11111111-1111-1111-1111-111111111111'
const items=[
  {name:'Amoxicilina 250mg',category:'medication',quantity:40,unit:'comprimido',min_quantity:10,unit_price:2.5,is_controlled:false,brand:'Vetnil',batch_number:'LOT2024A',expiry_date:'2027-03-01',supplier:'Distribuidora Pet Brasil'},
  {name:'Dipirona 500mg/mL',category:'medication',quantity:22,unit:'frasco',min_quantity:6,unit_price:18.9,is_controlled:false,brand:'Agener',batch_number:'DIP331',expiry_date:'2026-11-01'},
  {name:'Tramadol 50mg',category:'controlled_medication',quantity:8,unit:'comprimido',min_quantity:12,unit_price:3.8,is_controlled:true,brand:'Cristália',batch_number:'TRM-77',expiry_date:'2026-08-01'},
  {name:'Vermifugo Drontal Plus',category:'petshop',quantity:30,unit:'comprimido',min_quantity:8,unit_price:12.0,is_controlled:false,brand:'Bayer'},
  {name:'Racao Terapeutica Renal 2kg',category:'petshop',quantity:14,unit:'saco',min_quantity:4,unit_price:98.0,is_controlled:false,brand:'Royal Canin'},
]
const { data: existing }=await db.from('stock_items').select('name').eq('clinic_id',CID).eq('is_service',false)
const have=new Set((existing||[]).map(x=>x.name))
let ins=0
for(const it of items){ if(have.has(it.name))continue
  const row={clinic_id:CID,is_service:false,last_restock:new Date().toISOString(),...it}
  const { error }=await db.from('stock_items').insert(row)
  if(error){console.log('ERRO '+it.name+': '+error.message.slice(0,60))} else ins++
}
console.log('SEED_STOCK: inseridos='+ins+' (existentes='+have.size+')')
