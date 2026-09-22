import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTutorPortalWhatsApp } from '@/lib/actions/tutor-portal'

// GET /api/cron/vaccine-recall
// Recall proativo de vacina: avisa o tutor (WhatsApp + link do portal) quando a
// próxima dose está a ≤7 dias. Só clínicas com portal ligado; não duplica
// (portal_recall_sent_at). Registrar em vercel.json (ex.: diário 06:00).

const LOOKAHEAD_DAYS = 7

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = request.headers.get('authorization')
  const secrets = [process.env.CRON_SECRET, process.env.KEEPALIVE_SECRET].filter(Boolean)
  if (secrets.length && !secrets.some(s => auth === `Bearer ${s}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)
  const limit = new Date(Date.now() + LOOKAHEAD_DAYS * 864e5).toISOString().slice(0, 10)

  const { data: vaccines, error } = await admin
    .from('patient_vaccines')
    .select('id, vaccine_name, next_due_date, clinic_id, patient:patients!inner ( id, name, tutor_id )')
    .gte('next_due_date', today).lte('next_due_date', limit)
    .is('portal_recall_sent_at', null)
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let sent = 0, skipped = 0
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

  return NextResponse.json({ sent, skipped, considered: (vaccines ?? []).length })
}
