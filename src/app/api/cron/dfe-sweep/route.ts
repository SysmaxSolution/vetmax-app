import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sincronizarEmpresa } from '@/lib/fiscal/dfe-sync'
import { limitarPorIp } from '@/lib/api/rate-limit'

// GET /api/cron/dfe-sweep
//
// Busca as notas emitidas contra o CNPJ de cada empresa que ativou a rotina, e
// declara Ciência nas que ainda não têm XML.
//
// Por que rodar sozinho, e não só quando alguém clica: a Ciência só é aceita
// nos 10 DIAS seguintes à emissão da nota (Ajuste SINIEF 44/20). Depender de
// alguém abrir a tela significa perder o direito ao XML de toda nota que
// chegar numa semana cheia — e aí a entrada volta a ser digitada à mão.
//
// Por que às 3h17, e não numa hora redonda: a Receita entrega cada nota uma
// única vez por CNPJ e limita a frequência das consultas. Se a contabilidade
// também consultar, um horário quebrado reduz a chance de os dois baterem no
// mesmo minuto. Não é solução — a solução é combinar quem consulta — mas
// custa nada.
//
// Auth FAIL-CLOSED, como os demais crons.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest): Promise<NextResponse> {
  const barrado = await limitarPorIp(request, { escopo: 'cron:dfe', limite: 60 })
  if (barrado) return barrado

  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET ?? process.env.KEEPALIVE_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('company_dfe')
    .select('company_id, clinic_id')
    .eq('enabled', true)

  const empresas = (data ?? []) as { company_id: string; clinic_id: string }[]
  let novas = 0, comXml = 0, manifestadas = 0, falhas = 0, bloqueadas = 0

  for (const e of empresas) {
    // `sincronizarEmpresa` já respeita o bloqueio e grava o próprio estado;
    // aqui só contamos o que aconteceu.
    const r = await sincronizarEmpresa(admin, e.clinic_id, e.company_id)
    if (!r.ok) { falhas++; continue }
    if (r.bloqueado) { bloqueadas++; continue }
    novas += r.novas
    comXml += r.comXml
    manifestadas += r.manifestadas
  }

  return NextResponse.json({
    ok: true, empresas: empresas.length, novas, comXml, manifestadas, falhas, bloqueadas,
  })
}
