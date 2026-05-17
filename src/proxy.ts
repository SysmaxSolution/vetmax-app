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

const ROLE_ALLOWED_PATHS: Partial<Record<UserRole, string[]>> = {
  receptionist: [
    '/dashboard/reception',
    '/dashboard/patients',
    '/dashboard/cashier',
    '/dashboard/grooming',
  ],
  assistant: [
    '/dashboard/triage',
    '/dashboard/reception',
    '/dashboard/patients',
  ],
  pharmacist: [
    '/dashboard/pharmacy',
    '/dashboard/patients',
  ],
  vet: [
    '/dashboard/vet',
    '/dashboard/patients',
    '/dashboard/exams',
    '/dashboard/reception',
    '/dashboard/hospitalization',
  ],
}

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

function isRoleAllowed(role: string, pathname: string): boolean {
  const allowed = ROLE_ALLOWED_PATHS[role as UserRole]
  if (!allowed) return true
  return allowed.some(p => pathname === p || pathname.startsWith(p + '/'))
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

    if (!isRoleAllowed(role, pathname)) {
      const home = ROLE_HOME[role as UserRole] ?? '/dashboard/reception'
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = home
      redirectUrl.search = '?error=unauthorized'
      return NextResponse.redirect(redirectUrl)
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
