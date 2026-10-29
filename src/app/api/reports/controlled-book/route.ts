// Exporta o Livro de Controlados da clínica do usuário em Excel ou PDF, no
// layout do Livro de Registro Específico (Portaria SVS/MS 344/1998).
//
//   GET /api/reports/controlled-book?format=xlsx|pdf&from=AAAA-MM-DD&to=AAAA-MM-DD
//
// Rota (e não server action) porque o arquivo volta como download direto: sem
// base64 no cliente, sem gravar no Storage.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { montarLivroControlados } from '@/lib/server/controlled-book-data'
import { mensagemErro } from '@/lib/errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAPEIS = ['admin', 'owner', 'manager', 'accountant', 'vet']
const DATA = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('clinic_id, role').eq('id', user.id).single()
  if (!profile?.clinic_id) return NextResponse.json({ error: 'Perfil sem clínica.' }, { status: 403 })
  if (!PAPEIS.includes((profile.role as string) ?? '')) return NextResponse.json({ error: 'Acesso negado ao Livro de Controlados.' }, { status: 403 })

  const url = new URL(req.url)
  const format = url.searchParams.get('format') === 'pdf' ? 'pdf' : 'xlsx'
  const from = url.searchParams.get('from') ?? ''
  const to = url.searchParams.get('to') ?? ''
  if (!DATA.test(from) || !DATA.test(to) || from > to) {
    return NextResponse.json({ error: 'Período inválido. Use from e to no formato AAAA-MM-DD.' }, { status: 400 })
  }

  try {
    const book = await montarLivroControlados(admin, profile.clinic_id as string, from, to)
    const nomeBase = `livro-controlados-${from}-a-${to}`
    if (format === 'pdf') {
      const { renderLivroControladosPdfBuffer } = await import('@/lib/reports/render-controlled-book-pdf')
      const buf = await renderLivroControladosPdfBuffer(book)
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${nomeBase}.pdf"`,
          'Cache-Control': 'no-store',
        },
      })
    }
    const { gerarLivroControladosXlsx } = await import('@/lib/reports/controlled-book-xlsx')
    const buf = await gerarLivroControladosXlsx(book)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${nomeBase}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return NextResponse.json({ error: 'Não foi possível gerar o livro: ' + mensagemErro(e, 'app/api/reports/controlled-book/route.ts') }, { status: 500 })
  }
}
