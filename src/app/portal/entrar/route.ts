import { NextRequest, NextResponse } from 'next/server'
import { createTutorSessionFromToken } from '@/lib/actions/tutor-portal'
import { TUTOR_COOKIE } from '@/lib/portal/session'

export const dynamic = 'force-dynamic'

// GET /portal/entrar?t=<login-token>
// Valida o link mágico (WhatsApp), cria a sessão e grava o cookie. Usa uma
// resposta 200 (HTML com meta-refresh) em vez de 307: navegadores persistem o
// Set-Cookie de forma confiável numa resposta 200, mas podem descartá-lo num
// redirect — o que derrubava a sessão ao navegar para o pet.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('t') ?? ''
  const origin = req.nextUrl.origin

  const res = await createTutorSessionFromToken(token)
  if ('error' in res) {
    const url = new URL('/portal', origin)
    url.searchParams.set('erro', res.error)
    return NextResponse.redirect(url)
  }

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  const cookie = `${TUTOR_COOKIE}=${res.sessionToken}; Path=/; Max-Age=${res.maxAge}; HttpOnly; SameSite=Lax${secure}`
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">`
    + `<meta http-equiv="refresh" content="0;url=/portal">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>Entrando…</title></head>`
    + `<body style="font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#475569">`
    + `<p>Entrando na Área do Tutor… <a href="/portal">continuar</a></p>`
    + `<script>location.replace('/portal')</script></body></html>`

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': cookie },
  })
}
