import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const client = new Anthropic()

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { medication, peso_kg } = await req.json()

    if (!medication || typeof medication !== 'string') {
      return NextResponse.json({ error: 'medication é obrigatório.' }, { status: 400 })
    }
    if (!peso_kg || typeof peso_kg !== 'number' || peso_kg <= 0) {
      return NextResponse.json({ error: 'peso_kg inválido.' }, { status: 400 })
    }

    const prompt = `Você é um farmacologista veterinário. Calcule a dose para o medicamento abaixo.

Medicamento: ${medication}
Peso do animal: ${peso_kg} kg

Responda SOMENTE com um JSON no formato:
{"dose": "X mg/kg (Y mg total) — Z via, W vezes ao dia por N dias", "aviso": "opcional — contraindicação ou observação clínica"}

Regras:
- Use as faixas posológicas veterinárias padrão (referências PLUMB ou MSD Veterinary Manual).
- Se houver mais de uma indicação para o medicamento, use a mais comum para cães/gatos.
- Se não houver dose veterinária conhecida, retorne {"dose": null, "aviso": "Dose veterinária não encontrada para este princípio ativo."}.
- Retorne SOMENTE JSON válido, sem markdown.`

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const match = rawText.match(/\{[\s\S]*\}/)
    if (!match) return NextResponse.json({ error: 'IA não retornou JSON válido.' }, { status: 500 })

    const parsed = JSON.parse(match[0])
    return NextResponse.json({
      dose:   parsed.dose   ?? null,
      aviso:  parsed.aviso  ?? null,
    })
  } catch (err) {
    console.error('[prescription-calculator]', err)
    const { logServerError } = await import('@/lib/error-logger')
    await logServerError({ path: '/api/prescription-calculator', error: err, source: 'api', module: 'vet' })
    return NextResponse.json({ error: 'Erro ao calcular dose.' }, { status: 500 })
  }
}
