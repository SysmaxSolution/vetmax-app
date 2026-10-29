import { chromium } from 'playwright'
const ENTRAR=process.argv[2], SP=process.argv[3], PET=process.argv[4], BASE='https://sysvetmax-dev.vercel.app'
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1512,height:1100}}); const p=await ctx.newPage()
await p.goto(ENTRAR,{waitUntil:'networkidle'}); await p.waitForTimeout(4500)
await p.goto(BASE+'/portal/pet/'+PET,{waitUntil:'networkidle'}); await p.waitForTimeout(3500)
await p.screenshot({path:SP+'/f1-pet.png',fullPage:true})
const t=await p.locator('body').innerText()
console.log('evolução?', t.includes('Evolução dos exames'),'| linha do tempo?', t.includes('Linha do tempo'),'| histórico btn?', t.includes('Histórico'))
await p.goto(BASE+'/portal/pet/'+PET+'/imprimir',{waitUntil:'networkidle'}); await p.waitForTimeout(2500)
await p.screenshot({path:SP+'/f2-print.png',fullPage:true})
console.log('print doc?', (await p.locator('body').innerText()).includes('Histórico de saúde'))
await b.close()
