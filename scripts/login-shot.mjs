import { chromium } from 'playwright'
const SP=process.argv[2], BASE='https://sysvetmax-dev.vercel.app'
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1200,height:900}}); const p=await ctx.newPage()
await p.goto(BASE+'/portal',{waitUntil:'networkidle'}); await p.waitForTimeout(4500)
await p.screenshot({path:SP+'/login-form.png',fullPage:true})
console.log('form de login?', (await p.locator('body').innerText()).includes('Código de acesso'))
// preenche
await p.fill('input[placeholder="000.000.000-00"]', '11111111111')
await p.fill('input[placeholder="Ex.: ABCD2345"]', 'TESTE234')
await p.click('button[type=submit]')
await p.waitForTimeout(3500)
const t=await p.locator('body').innerText()
console.log('logado?', t.includes('Meus pets')||t.includes('Tutu'), '| erro?', t.includes('inválido'))
await p.screenshot({path:SP+'/login-done.png',fullPage:true})
await b.close()
