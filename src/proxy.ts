import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { getAppUrl } from '@/lib/app-url'
import { moduleKeyFromPath } from '@/config/path-modules'

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_COOKIE = 'vetmax-role'

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/privacy-policy',
  '/pending-approval',
  '/email-confirmado',
  '/auth',
  '/invite',
  '/onboarding',
  // Rotas públicas de conteúdo — carteira de vacinação compartilhada com o
  // tutor (links enviados pelo recall de WhatsApp!), termos e recuperação de
  // senha. Incidente Almavet 24/07: /public/* fora desta lista redirecionava
  // a carteira para /login.
  '/public',
  // Portal do Tutor (Fase 3): área logada do tutor com autenticação PRÓPRIA
  // (cookie sysvet_tutor via link no WhatsApp) — NÃO usa a sessão Supabase de
  // staff, então precisa ficar fora do gate do proxy. A proteção é feita dentro
  // de /portal (getTutorContext), não aqui.
  '/portal',
  // Portal do Parceiro (vet solicitante): autenticação própria por código
  // (cookie sysvet_parceiro), fora do gate de staff.
  '/parceiro',
  '/forgot-password',
  '/reset-password',
  '/privacidade',
  '/termos-de-uso',
  '/termos-assinatura',
  '/dpa',
  '/',
]

// Decisão de design (2026-05-22, requisito do PO): controle de acesso aos
// módulos do dashboard depende EXCLUSIVAMENTE de user_module_access. Sem
// gate por role. Apenas /dashboard/management continua restrito a admin.
//
// Quem é barrado volta para /dashboard, e a página de pouso escolhe um módulo
// que o usuário PODE abrir (src/lib/dashboard/modulo-inicial.ts). Antes havia
// um destino fixo por papel (admin → /dashboard/reception): quando esse módulo
// estava bloqueado, o gate devolvia para ele mesmo → ERR_TOO_MANY_REDIRECTS
// (Animais, 29/10/2026).
function redirecionarParaPainel(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone()
  url.pathname = '/dashboard'
  url.search = ''
  return NextResponse.redirect(url)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    pub => pathname === pub || pathname.startsWith(pub + '/')
  )
}

// /dashboard/<segmento> → key do módulo: extraído para src/config/path-modules.ts
// (compartilhado com o enforcement de plano em src/app/dashboard/template.tsx).

// ─── Proxy ────────────────────────────────────────────────────────────────────

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  // Acessos por subdomínios obsoletos da Vercel são redirecionados para o
  // domínio canônico, preservando path e query (?code=… do email Supabase etc).
  const host = request.headers.get('host') ?? ''
  // Ambiente de testes (sysvetmax-dev) roda em *.vercel.app de propósito —
  // NEXT_PUBLIC_ALLOW_VERCEL_HOST=1 (setado SÓ lá) desliga o redirect canônico.
  if (host.endsWith('.vercel.app') && process.env.NEXT_PUBLIC_ALLOW_VERCEL_HOST !== '1') {
    return NextResponse.redirect(`${getAppUrl()}${pathname}${search}`, 308)
  }

  // Encaminha x-pathname/x-url para Server Components — necessário para
  // src/app/dashboard/template.tsx aplicar enforcement de plano (default-deny).
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)
  requestHeaders.set('x-url',      request.url)

  // Security headers aplicados em todas as respostas (públicas e privadas).
  // X-Frame-Options previne clickjacking (especialmente em /email-confirmado etc.).
  const applySecurityHeaders = (res: NextResponse) => {
    res.headers.set('X-Frame-Options', 'DENY')
    res.headers.set('X-Content-Type-Options', 'nosniff')
    res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    return res
  }

  if (isPublicPath(pathname)) {
    return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }))
  }

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.')
  ) {
    return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }))
  }

  let response = applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // Atualiza cookies no request para que Server Components recebam o token renovado
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }))
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (err) {
    console.error('[proxy] erro ao renovar sessão:', err)
  }

  if (!user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (pathname.startsWith('/dashboard')) {
    const role = request.cookies.get(ROLE_COOKIE)?.value ?? 'admin'

    // /dashboard/management permanece exclusivo do admin (controle de plano,
    // cadastros de equipe etc.). Os demais módulos seguem user_module_access.
    if (pathname.startsWith('/dashboard/management') && role !== 'admin') {
      return redirecionarParaPainel(request)
    }

    // Controle por módulo: só bloqueia se admin marcou enabled=false explícito.
    // Default permissivo: row ausente = permitido.
    //
    // Admin não passa pelo gate: o layout mostra a ele todos os módulos ativos
    // da clínica, e barrar aqui gerava loop (29/10/2026, Animais: convite de
    // admin gravava enabled=false em todos os módulos → /dashboard mandava
    // para /dashboard/reception → o gate devolvia para /dashboard/reception).
    const moduleKey = moduleKeyFromPath(pathname)
    if (moduleKey && role !== 'admin') {
      // Multi-clínica: vale a linha da clínica ATIVA. Sem este filtro,
      // maybeSingle() falhava com 2+ clínicas e o gate deixava passar.
      const { data: perfil } = await supabase
        .from('profiles')
        .select('clinic_id')
        .eq('id', user.id)
        .maybeSingle()
      let consulta = supabase
        .from('user_module_access')
        .select('enabled')
        .eq('user_id', user.id)
        .eq('module_name', moduleKey)
      if (perfil?.clinic_id) consulta = consulta.eq('clinic_id', perfil.clinic_id)
      const { data: rows } = await consulta.limit(1)
      if (rows?.[0]?.enabled === false) return redirecionarParaPainel(request)
    }
  }

  return response
}

// ─── Matcher ──────────────────────────────────────────────────────────────────

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
