import { chromium } from 'playwright'
const CODE=process.argv[2], SP=process.argv[3], PET='d704720e-d550-4247-b727-bc4c3541e315', BASE='https://sysvetmax-dev.vercel.app'
const b=await chromium.launch(); const ctx=await b.newContext(); const p=await ctx.newPage()
await p.goto(BASE+'/parceiro',{waitUntil:'networkidle'}); await p.waitForTimeout(1200)
await p.fill('input[placeholder="Ex.: ABCDE-234567"]', CODE)
await p.click('button[type=submit]'); await p.waitForTimeout(3000)
await p.goto(BASE+'/parceiro/pet/'+PET,{waitUntil:'networkidle'}); await p.waitForTimeout(2500)
const t=await p.locator('body').innerText()
console.log('detalhe:', t.includes('expirou')?'EXPIROU':(t.includes('Exames de imagem')?'OK':'?'),'| exames DICOM/abrir?', t.includes('Abrir')||t.includes('Raio-X'))
await p.screenshot({path:SP+'/partner-pet.png',fullPage:true})
await b.close()
