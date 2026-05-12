import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const client = new Anthropic()

const SPECIES_LABELS: Record<string, string> = {
  dog: 'Cão', cat: 'Gato', bird: 'Ave', rabbit: 'Coelho',
  rodent: 'Roedor', reptile: 'Réptil', fish: 'Peixe', exotic: 'Exótico',
}

const MUCOUS_LABELS: Record<string, string> = {
  pink: 'Rosa (Normal)', pale: 'Pálida', icteric: 'Ictérica', cyanotic: 'Cianótica',
}

const CRT_LABELS: Record<string, string> = {
  '2s': '< 2s (Normal)', '3s': '2–3s', '4s': '> 3s (Alterado)',
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await req.json()
    const {
      species, breed, weight, temperature, mucous_color, crt,
      heart_rate, respiratory_rate, chief_complaint,
      vet_notes, allergies, chronic_diseases, past_surgeries,
    } = body

    const prompt = `Você é um assistente de apoio diagnóstico veterinário. Analise os dados clínicos abaixo e sugira até 3 diagnósticos diferenciais com raciocínio objetivo em português brasileiro.

DADOS DO ANIMAL:
- Espécie: ${SPECIES_LABELS[species] || species}
- Raça: ${breed || 'Não informada'}
- Peso: ${weight ? `${weight} kg` : 'Não aferido'}
- Temperatura Retal: ${temperature ? `${temperature}°C` : 'Não aferida'}
- Frequência Cardíaca: ${heart_rate ? `${heart_rate} bpm` : 'Não aferida'}
- Frequência Respiratória: ${respiratory_rate ? `${respiratory_rate} mov/min` : 'Não aferida'}
- Cor das Mucosas: ${MUCOUS_LABELS[mucous_color] || 'Não avaliada'}
- TRC: ${CRT_LABELS[crt] || 'Não avaliado'}
- Alergias: ${allergies || 'Nenhuma registrada'}
- Doenças crônicas: ${chronic_diseases || 'Nenhuma registrada'}
- Cirurgias anteriores: ${past_surgeries || 'Nenhuma registrada'}

QUEIXA PRINCIPAL:
${chief_complaint || 'Não informada'}
${vet_notes ? `\nNOTAS CLÍNICAS DO MV:\n${vet_notes}` : ''}

Responda APENAS em JSON válido (sem markdown), no formato:
{
  "differential_diagnoses": [
    { "diagnosis": "Nome do diagnóstico", "probability": "alta", "reasoning": "Raciocínio clínico objetivo e conciso" }
  ],
  "next_steps": ["Conduta ou exame sugerido 1", "Conduta ou exame sugerido 2"],
  "disclaimer": "Auxílio diagnóstico gerado por IA. Diagnóstico e tratamento são de responsabilidade exclusiva do Médico Veterinário."
}`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonText = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let parsed
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      return NextResponse.json({ error: 'Resposta da IA inválida. Tente novamente.' }, { status: 500 })
    }

    return NextResponse.json(parsed)
  } catch (err) {
    console.error('[suggest-diagnosis]', err)
    const { logServerError } = await import('@/lib/error-logger')
    await logServerError({ path: '/api/suggest-diagnosis', error: err, source: 'api', module: 'vet' })
    return NextResponse.json({ error: 'Erro interno ao gerar diagnóstico.' }, { status: 500 })
  }
}
