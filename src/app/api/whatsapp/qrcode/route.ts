import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/whatsapp/qrcode
// v2.x: QR code é salvo no banco pelo webhook QRCODE_UPDATED e lido daqui.
// Também tenta disparar nova conexão se não houver QR salvo.
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

  const admin = createAdminClient()
  const { data: settings } = await admin
    .from('clinic_whatsapp_settings')
    .select('evolution_instance_name, qr_code')
    .eq('clinic_id', profile.clinic_id)
    .maybeSingle()

  const instanceName = settings?.evolution_instance_name
  if (!instanceName) {
    return NextResponse.json({ error: 'Instância não criada. Clique em Conectar primeiro.' }, { status: 404 })
  }

  // Retorna QR salvo pelo webhook QRCODE_UPDATED
  if (settings?.qr_code) {
    return NextResponse.json({ base64: settings.qr_code, instanceName })
  }

  // Sem QR salvo — tenta obter direto da Evolution API e captura base64 da resposta
  const apiUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  if (apiUrl && apiKey) {
    try {
      const evoRes = await fetch(`${apiUrl}/instance/connect/${instanceName}`, {
        headers: { apikey: apiKey },
      })
      if (!evoRes.ok) {
        return NextResponse.json(
          { error: `Serviço WhatsApp indisponível (HTTP ${evoRes.status}). Verifique se o container Evolution e o tunnel Cloudflare estão ativos.` },
          { status: 503 },
        )
      }
      const data   = await evoRes.json()
      const base64 = data?.base64 ?? data?.qrcode?.base64 ?? null
      if (base64) return NextResponse.json({ base64, instanceName })
    } catch {
      return NextResponse.json(
        { error: 'Erro ao conectar ao serviço WhatsApp. Verifique o tunnel Cloudflare (cloudflared tunnel run vetmax-wpp).' },
        { status: 503 },
      )
    }
  }

  return NextResponse.json(
    { error: 'QR Code ainda não disponível. Aguarde alguns segundos e tente novamente.' },
    { status: 404 },
  )
}
