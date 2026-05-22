import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import type { UserRole } from '@/types'

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
  '/',
]

// Decisão de design (2026-05-22, requisito do PO): controle de acesso aos
// módulos do dashboard depende EXCLUSIVAMENTE de user_module_access. Sem
// gate por role. Apenas /dashboard/management continua restrito a admin.
const ROLE_HOME: Partial<Record<UserRole, string>> = {
  receptionist: '/dashboard/reception',
  assistant:    '/dashboard/triage',
  pharmacist:   '/dashboard/pharmacy',
  vet:          '/dashboard/vet',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    pub => pathname === pub || pathname.startsWith(pub + '/')
  )
}

// /dashboard/<segmento> → key do módulo (alguns segmentos diferem do moduleKey).
const PATH_SEGMENT_TO_MODULE: Record<string, string> = {
  reception:       'reception',
  patients:        'patients',
  triage:          'triage',
  vet:             'consultation',
  exams:           'exams',
  hospitalization: 'hospitalization',
  grooming:        'grooming',
  pharmacy:        'pharmacy',
  sales:           'sales',
  cashier:         'cashier',
  registry:        'registry',
  whatsapp:        'whatsapp_intelligent',
  purchases:       'purchases',
  financial:       'financial',
  reports:         'reports',
  appointments:    'reception',  // sub-tela de recepção
}

function moduleKeyFromPath(pathname: string): string | null {
  const seg = pathname.split('/')[2]
  if (!seg) return null
  return PATH_SEGMENT_TO_MODULE[seg] ?? null
}

// ─── Proxy ────────────────────────────────────────────────────────────────────

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Encaminha x-pathname/x-url para Server Components — necessário para
  // src/app/dashboard/template.tsx aplicar enforcement de plano (default-deny).
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)
  requestHeaders.set('x-url',      request.url)

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // Atualiza cookies no request para que Server Components recebam o token renovado
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: requestHeaders } })
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
      const home = ROLE_HOME[role as UserRole] ?? '/dashboard/reception'
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = home
      redirectUrl.search = ''
      return NextResponse.redirect(redirectUrl)
    }

    // Controle por módulo: só bloqueia se admin marcou enabled=false explícito.
    // Default permissivo: row ausente = permitido.
    const moduleKey = moduleKeyFromPath(pathname)
    if (moduleKey) {
      const { data: row } = await supabase
        .from('user_module_access')
        .select('enabled')
        .eq('user_id', user.id)
        .eq('module_name', moduleKey)
        .maybeSingle()
      if (row?.enabled === false) {
        const home = ROLE_HOME[role as UserRole] ?? '/dashboard/reception'
        const redirectUrl = request.nextUrl.clone()
        redirectUrl.pathname = home
        redirectUrl.search = ''
        return NextResponse.redirect(redirectUrl)
      }
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
