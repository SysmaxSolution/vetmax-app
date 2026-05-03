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

  if (isPublicPath(pathname)) return NextResponse.next()

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: request.headers } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

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
