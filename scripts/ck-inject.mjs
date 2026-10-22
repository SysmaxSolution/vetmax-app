import { chromium } from 'playwright'
const S = process.argv[2]
const b = await chromium.launch(); const ctx = await b.newContext()
await ctx.addCookies([{ name:'sysvet_tutor', value:S, url:'https://sysvetmax-dev.vercel.app', httpOnly:true, secure:true, sameSite:'Lax' }])
const p = await ctx.newPage()
console.log('cookie inicial:', (await ctx.cookies()).length)
await p.goto('https://sysvetmax-dev.vercel.app/portal', { waitUntil:'networkidle' })
console.log('após /portal — cookies:', (await ctx.cookies()).map(c=>c.name+' exp='+c.expires).join(',') || '(vazio)')
await b.close()
