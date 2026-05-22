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
{
  "dose":      "X mg/kg (Y mg total)",
  "route":     "Oral" | "IV" | "IM" | "SC" | "Tópica" | "Outra",
  "frequency": "Z vezes ao dia",
  "duration":  "N dias",
  "aviso":     "opcional — contraindicação ou observação clínica"
}

Regras:
- Use as faixas posológicas veterinárias padrão (referências PLUMB ou MSD Veterinary Manual).
- Se houver mais de uma indicação para o medicamento, use a mais comum para cães/gatos.
- Cada campo deve conter APENAS o seu próprio dado — não repita a dose dentro de route/frequency/duration.
- Se não houver dose veterinária conhecida, retorne {"dose": null, "route": null, "frequency": null, "duration": null, "aviso": "Dose veterinária não encontrada para este princípio ativo."}.
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

    // Fallback: se a IA mandou tudo no campo dose como string longa, parseia.
    // Padrão esperado quando legado: "X mg/kg (Y mg) — via Z, W vezes ao dia por N dias"
    let dose      = parsed.dose      ?? null
    let route     = parsed.route     ?? null
    let frequency = parsed.frequency ?? null
    let duration  = parsed.duration  ?? null

    if (dose && typeof dose === 'string' && !route && !frequency && !duration) {
      const text = dose
      // Tenta extrair os 4 componentes da string única
      const routeMatch    = text.match(/—\s*(?:via\s+)?(oral|intravenosa|iv|intramuscular|im|subcutânea|sc|tópica|topical)/i)
      const freqMatch     = text.match(/(\d+(?:[-–]\d+)?\s*vezes?\s+(?:ao|por)\s+dia|\d+\s*x\s*\/\s*dia|a\s+cada\s+\d+\s*h(?:oras)?|sid|bid|tid|qid)/i)
      const durationMatch = text.match(/(?:por\s+)?(\d+(?:[-–]\d+)?\s*(?:dias?|semanas?|meses?))/i)

      if (routeMatch)    route     = routeMatch[1]
      if (freqMatch)     frequency = freqMatch[1]
      if (durationMatch) duration  = durationMatch[1]

      // Limpa o campo dose deixando só a parte de "X mg/kg (Y mg)"
      const cleanDose = text.split(/\s*[—–-]\s*/)[0]?.trim()
      if (cleanDose) dose = cleanDose
    }

    return NextResponse.json({
      dose,
      route,
      frequency,
      duration,
      aviso: parsed.aviso ?? null,
    })
  } catch (err) {
    console.error('[prescription-calculator]', err)
    const { logServerError } = await import('@/lib/error-logger')
    await logServerError({ path: '/api/prescription-calculator', error: err, source: 'api', module: 'vet' })
    return NextResponse.json({ error: 'Erro ao calcular dose.' }, { status: 500 })
  }
}
