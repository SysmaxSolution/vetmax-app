import { type NextRequest, NextResponse } from 'next/server'

// Encaminha x-pathname para que Server Components possam ler o pathname via headers()
// O enforcement real de plano está em src/app/dashboard/template.tsx (re-renderiza em cada navegação)
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  return NextResponse.next({
    request: {
      headers: new Headers({
        ...Object.fromEntries(request.headers.entries()),
        'x-pathname': pathname,
        'x-url':      request.url,
      }),
    },
  })
}

export const config = {
  matcher: [
    // Exclui arquivos estáticos, imagens e rotas internas do Next.js
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
