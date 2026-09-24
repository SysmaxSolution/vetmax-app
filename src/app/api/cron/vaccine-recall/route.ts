import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTutorPortalWhatsApp } from '@/lib/actions/tutor-portal'
import { parseRecallConfig, shouldRunNow, recallWindow, localDateInTimeZone, cronModeFromEnv } from '@/lib/vaccines/recall-schedule'

// GET /api/cron/vaccine-recall
// Recall proativo de vacina: avisa o Tutor (WhatsApp + link do portal) quando a
// próxima dose está próxima. Registrado em vercel.json de hora em hora
// (produção); a seleção de quem roda agora é feita AQUI, comparando a hora local
// configurada por cada clínica com a hora corrente.
//
// A rota é AGNÓSTICA à frequência do cron, e a tabela clinic_vaccine_recall_runs
// (0474) garante UMA execução por clínica por dia local:
//   VACCINE_RECALL_CRON_HOURLY=1 + cron "0 * * * *" (produção/Pro) → dispara na
//     primeira execução em que a hora local já alcançou a hora configurada.
//   sem a variável + cron diário (ambiente de testes, cuja conta Vercel é Hobby
//     e recusa cron sub-diário) → o disparo do dia atende todas as clínicas
//     ativas; o horário escolhido vira aproximado em vez de a clínica ficar sem
//     recall por ter escolhido um horário posterior ao do cron.
//
// Tarefa 0 — duas mudanças de segurança/consentimento:
//  (a) auth FAIL-CLOSED, igual aos demais crons. Antes, sem CRON_SECRET no
//      ambiente, a rota ficava pública e qualquer um disparava WhatsApp.
//  (b) ativação por flag PRÓPRIA `vaccine_recall_enabled` (padrão desligado),
//      separada de `portal_enabled`: ligar o Portal não pode, sozinho, iniciar
//      uma campanha diária de mensagens aos tutores (LGPD + risco de ban).
// O limite passou a ser POR CLÍNICA — antes um backlog grande consumia a cota
// global e deixava as demais sem recall no dia.

const PER_CLINIC_LIMIT = 200

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET ?? process.env.KEEPALIVE_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()
  const mode = cronModeFromEnv()

  // Só clínicas que ATIVARAM o recall. O filtro grosso vai para o banco; a
  // conferência estrita (=== true) fica no parse.
  const { data: clinics, error: clinicsErr } = await admin
    .from('clinics')
    .select('id, flow_config')
    .contains('flow_config', { vaccine_recall_enabled: true })
  if (clinicsErr) return NextResponse.json({ error: clinicsErr.message }, { status: 500 })

  let sent = 0, skipped = 0, considered = 0
  const ranFor: string[] = []

  for (const c of (clinics ?? []) as { id: string; flow_config: Record<string, unknown> | null }[]) {
    const cfg = parseRecallConfig(c.flow_config)
    const today = localDateInTimeZone(now, cfg.timeZone)

    const { data: lastRun } = await admin
      .from('clinic_vaccine_recall_runs')
      .select('run_date').eq('clinic_id', c.id).eq('run_date', today).maybeSingle()
    if (!shouldRunNow(cfg, now, (lastRun as { run_date?: string } | null)?.run_date ?? null, mode)) continue

    // Reserva o dia ANTES de enviar: se duas execuções do cron se cruzarem, a
    // segunda encontra a linha e não redispara. PK (clinic_id, run_date).
    const { error: claimErr } = await admin
      .from('clinic_vaccine_recall_runs').insert({ clinic_id: c.id, run_date: today })
    if (claimErr) continue   // já reservado por outra execução
    ranFor.push(c.id)
    let sentHere = 0

    const { from, to } = recallWindow(cfg, now)
    const { data: vaccines, error } = await admin
      .from('patient_vaccines')
      .select('id, vaccine_name, next_due_date, clinic_id, patient:patients!inner ( id, name, tutor_id )')
      .eq('clinic_id', c.id)
      .gte('next_due_date', from).lte('next_due_date', to)
      .is('portal_recall_sent_at', null)
      .limit(PER_CLINIC_LIMIT)
    if (error) { skipped++; continue }

    considered += (vaccines ?? []).length
    for (const v of (vaccines ?? [])) {
      const pet = Array.isArray((v as any).patient) ? (v as any).patient[0] : (v as any).patient
      if (!pet?.tutor_id) { skipped++; continue }
      const due = new Date((v as any).next_due_date + 'T12:00:00').toLocaleDateString('pt-BR')
      const msg = `Olá! 🐾 A vacina *${(v as any).vaccine_name}* de *${pet.name}* está próxima do vencimento (${due}). Agende pelo portal:`
      const r = await sendTutorPortalWhatsApp(pet.tutor_id, msg)
      if (r.ok) {
        await admin.from('patient_vaccines').update({ portal_recall_sent_at: new Date().toISOString() }).eq('id', (v as any).id)
        sent++; sentHere++
      } else skipped++
    }

    await admin.from('clinic_vaccine_recall_runs')
      .update({ sent: sentHere }).eq('clinic_id', c.id).eq('run_date', today)
  }

  return NextResponse.json({ sent, skipped, considered, clinics: ranFor.length, mode })
}
