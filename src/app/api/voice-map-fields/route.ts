import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/voice-map-fields
 * Recebe uma transcrição de voz + campos extraídos de um template
 * e retorna um JSON mapeando field_name → valor extraído da voz
 *
 * Body:
 *   - transcript: string (texto transcrito da voz)
 *   - fields: Array<{ field_name: string, label: string, type: string, description: string }>
 *
 * Response:
 *   - mapped_fields: Record<string, string | number | boolean>
 *   - confidence: 'high' | 'medium' | 'low'
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await request.json()
    const { transcript, fields } = body

    if (!transcript || typeof transcript !== 'string') {
      return NextResponse.json(
        { error: 'Transcrição é obrigatória' },
        { status: 400 }
      )
    }

    if (!Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json(
        { error: 'Array de campos do template é obrigatório' },
        { status: 400 }
      )
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    // Montar descrição dos campos para o prompt
    const fieldsDescription = (fields as { field_name: string; type: string; label: string; description: string }[])
      .map(f => `- "${f.field_name}" (${f.type}): ${f.label} — ${f.description}`)
      .join('\n')

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: `Você é um assistente veterinário especializado em extrair dados clínicos de transcrições de voz.

O auxiliar veterinário gravou a seguinte observação durante a triagem de um animal:

"${transcript}"

Os campos do template clínico que precisam ser preenchidos são:

${fieldsDescription}

SUA TAREFA:
1. Analise a transcrição e extraia os valores que correspondem a cada campo
2. Para campos "number", retorne apenas o valor numérico
3. Para campos "boolean", retorne true ou false
4. Para campos "text" ou "textarea", retorne o texto relevante
5. Para campos "date", retorne no formato YYYY-MM-DD
6. Para campos "select", retorne o valor mais provável
7. Se um campo NÃO foi mencionado na transcrição, NÃO o inclua no resultado

Retorne APENAS um JSON válido no formato:
{
  "mapped_fields": {
    "field_name_1": "valor extraído",
    "field_name_2": 42
  },
  "confidence": "high" | "medium" | "low"
}

Não inclua explicações, apenas o JSON.`,
        },
      ],
    })

    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : ''

    // Parse da resposta JSON
    const cleanJson = responseText
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()

    const parsed = JSON.parse(cleanJson)

    return NextResponse.json({
      mapped_fields: parsed.mapped_fields || {},
      confidence: parsed.confidence || 'medium',
    })
  } catch (error) {
    console.error('Erro ao mapear campos por voz:', error)

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'IA retornou formato inválido. Tente novamente.' },
        { status: 422 }
      )
    }

    const errorMessage =
      error instanceof Error ? error.message : 'Erro desconhecido'

    return NextResponse.json(
      { error: `Erro ao mapear campos: ${errorMessage}` },
      { status: 500 }
    )
  }
}
