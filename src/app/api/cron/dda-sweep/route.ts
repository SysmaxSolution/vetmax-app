import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { varrerContaDoDda } from '@/lib/financial/dda-sync'
import { limitarPorIp } from '@/lib/api/rate-limit'

// GET /api/cron/dda-sweep
//
// Varredura automática do DDA. Antes, o operador tinha de escolher um período
// e clicar — e o banco recusa período maior que 60 dias, o que empurrava a
// escolha para quem não tem como saber qual janela é a certa. Agora a rotina
// traz todo dia as duas janelas (vencidos e a vencer) de cada conta, e a tela
// apenas lê o que está guardado.
//
// Auth FAIL-CLOSED, como os demais crons: sem CRON_SECRET no ambiente a rota
// NÃO fica pública.
//
// Só varre conta que tem o que varrer: banco 756, integração bancária ligada
// na clínica e credencial configurada. Conta sem isso não é erro — é conta que
// não usa a integração, e tratá-la como falha encheria a tela de alarme falso.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface ContaParaVarrer {
  id:        string
  clinic_id: string
  name:      string
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const barrado = await limitarPorIp(request, { escopo: 'cron:dda', limite: 60 })
  if (barrado) return barrado

  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET ?? process.env.KEEPALIVE_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Clínicas com integração bancária ligada. Sem o gate, varreríamos clínica
  // que nunca pediu a rotina.
  const { data: integracoes } = await admin
    .from('clinic_bank_integrations')
    .select('clinic_id')
    .eq('bank_enabled', true)
  const clinicas = (integracoes ?? []).map(i => (i as { clinic_id: string }).clinic_id)
  if (!clinicas.length) return NextResponse.json({ ok: true, contas: 0, detalhe: 'nenhuma clínica com integração bancária' })

  const { data: contasRaw } = await admin
    .from('bank_accounts')
    .select('id, clinic_id, name, bank_code')
    .in('clinic_id', clinicas)
  const contas = (contasRaw ?? [])
    .filter(c => String((c as { bank_code?: string }).bank_code ?? '').replace(/\D/g, '') === '756')
    .map(c => c as unknown as ContaParaVarrer)

  const hoje = new Date().toISOString().slice(0, 10)
  const agora = new Date().toISOString()
  let ok = 0
  let falhas = 0
  let novos = 0

  for (const conta of contas) {
    const r = await varrerContaDoDda(admin, conta.clinic_id, conta.id, hoje)

    // O estado é gravado SEMPRE — inclusive na falha. É o que permite a tela
    // dizer "lista de 3 dias atrás" em vez de mostrar uma lista velha com cara
    // de nova. O erro cru fica aqui; a tela nunca o exibe.
    await admin.from('dda_varreduras').upsert({
      clinic_id:        conta.clinic_id,
      bank_account_id:  conta.id,
      ultima_tentativa: agora,
      ...(r.ok ? { ultimo_sucesso: agora } : {}),
      situacao:         r.ok ? 'ok' : 'erro',
      encontrados:      r.encontrados,
      novos:            r.novos,
      erro_tecnico:     r.erro,
      updated_at:       agora,
    }, { onConflict: 'clinic_id,bank_account_id' })

    if (r.ok) { ok++; novos += r.novos } else { falhas++ }
  }

  return NextResponse.json({ ok: true, contas: contas.length, sucesso: ok, falhas, novos })
}
