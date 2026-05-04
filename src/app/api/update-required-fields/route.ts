import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.clinic_id) return NextResponse.json({ error: 'Clínica não encontrada.' }, { status: 400 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Apenas administradores.' }, { status: 403 })

  const body = await request.json()
  const { checkin_required_fields, triage_required_fields } = body

  const admin = createAdminClient()

  // Upsert into clinic_settings table
  const { error } = await admin
    .from('clinic_settings')
    .upsert({
      clinic_id: profile.clinic_id,
      checkin_required_fields: checkin_required_fields ?? ['address', 'emergency_contact'],
      triage_required_fields: triage_required_fields ?? ['weight', 'temperature', 'chief_complaint'],
    }, { onConflict: 'clinic_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
