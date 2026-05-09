import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionGetQrCode } from '@/lib/evolution-api-client'

// GET /api/whatsapp/qrcode
// Retorna o QR Code (base64 PNG) da instância Evolution API da clínica autenticada.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('clinic_id')
    .eq('id', user.id)
    .single()
  if (!profile?.clinic_id) return NextResponse.json({ error: 'Clínica não encontrada.' }, { status: 400 })

  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!apiUrl || !apiKey) {
    return NextResponse.json({ error: 'Evolution API não configurada no servidor.' }, { status: 500 })
  }

  const admin = createAdminClient()
  const { data: settings } = await admin
    .from('clinic_whatsapp_settings')
    .select('evolution_instance_name')
    .eq('clinic_id', profile.clinic_id)
    .maybeSingle()

  const instanceName = settings?.evolution_instance_name
  if (!instanceName) {
    return NextResponse.json({ error: 'Instância não criada. Clique em Conectar primeiro.' }, { status: 404 })
  }

  const result = await evolutionGetQrCode({ apiUrl, instanceId: instanceName, apiKey })
  if (!result) {
    return NextResponse.json({ error: 'QR Code não disponível. O WhatsApp pode já estar conectado.' }, { status: 404 })
  }

  return NextResponse.json({ base64: result.base64, instanceName })
}
