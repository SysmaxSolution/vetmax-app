import { chromium } from 'playwright'
const CODE=process.argv[2], SP=process.argv[3], BASE='https://sysvetmax-dev.vercel.app'
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1300,height:950}}); const p=await ctx.newPage()
await p.goto(BASE+'/parceiro',{waitUntil:'networkidle'}); await p.waitForTimeout(1500)
console.log('form login?', (await p.locator('body').innerText()).includes('Código de acesso'))
await p.fill('input[placeholder="Ex.: ABCDE-234567"]', CODE)
await p.click('button[type=submit]'); await p.waitForTimeout(3500)
const t=await p.locator('body').innerText()
console.log('logado?', t.includes('Pacientes')||t.includes('encaminhado'),'| tem Tutu?', t.includes('Tutu'),'| erro?', t.includes('inválido'))
await p.screenshot({path:SP+'/partner-list.png',fullPage:true})
// abre o pet
const petLink=p.locator('a[href^="/parceiro/pet/"]').first()
if(await petLink.count()){ await petLink.click(); await p.waitForLoadState('networkidle'); await p.waitForTimeout(2000); await p.screenshot({path:SP+'/partner-pet.png',fullPage:true}); console.log('pet detail?', (await p.locator('body').innerText()).includes('Exames de imagem')) }
await b.close()
