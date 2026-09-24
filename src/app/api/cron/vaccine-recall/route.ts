import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTutorPortalWhatsApp } from '@/lib/actions/tutor-portal'
import { parseRecallConfig, shouldRunNow, recallWindow } from '@/lib/vaccines/recall-schedule'

// GET /api/cron/vaccine-recall
// Recall proativo de vacina: avisa o Tutor (WhatsApp + link do portal) quando a
// próxima dose está próxima. Registrado em vercel.json DE HORA EM HORA — a
// seleção de quem roda agora é feita aqui, comparando a hora local configurada
// por cada clínica com a hora corrente.
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
    if (!shouldRunNow(cfg, now)) continue
    ranFor.push(c.id)

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
        sent++
      } else skipped++
    }
  }

  return NextResponse.json({ sent, skipped, considered, clinics: ranFor.length })
}
