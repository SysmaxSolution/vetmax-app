import { chromium } from 'playwright'
const ENTRAR = process.argv[2], SP = process.argv[3]
const BASE='https://sysvetmax-dev.vercel.app'
const b = await chromium.launch(); const ctx = await b.newContext(); const p = await ctx.newPage()
await p.goto(ENTRAR, { waitUntil:'networkidle' }); await p.waitForTimeout(4000)
console.log('cookies após /portal:', (await ctx.cookies()).map(c=>c.name).join(',')||'(vazio)')
await p.goto(BASE+'/portal/pet/d704720e-d550-4247-b727-bc4c3541e315', { waitUntil:'networkidle' }); await p.waitForTimeout(3500)
await p.screenshot({ path: SP+'/02-pet.png', fullPage:true })
const t = await p.locator('body').innerText()
console.log('pet:', t.includes('expirou')?'EXPIROU ❌':(t.includes('Vacinas')?'OK ✓':'?'), '| trecho:', JSON.stringify(t.slice(0,120)))
await b.close()
