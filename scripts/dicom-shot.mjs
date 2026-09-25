import { chromium } from 'playwright'
const URL = process.argv[2], SP = process.argv[3]
const b = await chromium.launch(); const ctx = await b.newContext({viewport:{width:1200,height:1100}}); const p = await ctx.newPage()
const errs=[]; p.on('console', m=>{ if(m.type()==='error') errs.push(m.text()) })
await p.goto(URL, { waitUntil:'networkidle' }); await p.waitForTimeout(7000)
await p.screenshot({ path: SP+'/dicom.png', fullPage:true })
const t = await p.locator('body').innerText()
console.log('tem canvas?', await p.locator('canvas').count())
console.log('fallback comprimido?', t.includes('formato comprimido'))
console.log('carregando ainda?', t.includes('Carregando DICOM'))
if(errs.length) console.log('console errors:', errs.slice(0,3).join(' | '))
await b.close()
