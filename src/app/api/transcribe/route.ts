import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/transcribe
 * Processa a transcrição com análise veterinária usando Claude AI
 *
 * Body:
 *   - transcript: string (texto bruto transcrito do áudio)
 *
 * Response:
 *   - transcript: string (texto processado e interpretado pela IA)
 *
 * Nota: A transcrição de áudio para texto ocorre no client-side usando Web Speech API
 * Este endpoint processa o resultado com Claude para análise veterinária
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await request.json()
    const { transcript: rawTranscript } = body

    if (!rawTranscript || typeof rawTranscript !== 'string') {
      return NextResponse.json(
        { error: 'Transcrição bruta é obrigatória' },
        { status: 400 }
      )
    }

    // Inicializar cliente Anthropic
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    // Usar Claude para enriquecer e estruturar a transcrição veterinária
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: `You are a veterinary clinical assistant. A nurse has recorded and transcribed the following observation about an animal during triage:

"${rawTranscript}"

Your task:
1. Clean and organize this text for the clinical record
2. Ensure it's technically accurate veterinary language
3. Add relevant clinical context if implied
4. Keep it concise and professional
5. Write in Portuguese (Brazilian Portuguese - PT-BR)
6. Return ONLY the processed text, ready for the veterinary record

Do not add any explanations or metadata, just the processed clinical note.`,
        },
      ],
    })

    // Extrair texto processado da resposta
    const processedTranscript =
      message.content[0].type === 'text' ? message.content[0].text : ''

    if (!processedTranscript) {
      // Se Claude não conseguir processar, usar o texto bruto
      return NextResponse.json({
        transcript: rawTranscript.trim(),
        status: 'raw',
      })
    }

    return NextResponse.json({
      transcript: processedTranscript.trim(),
      status: 'success',
    })
  } catch (error) {
    console.error('Erro ao processar transcrição:', error)

    const errorMessage =
      error instanceof Error ? error.message : 'Erro desconhecido'

    return NextResponse.json(
      { error: `Erro ao processar transcrição: ${errorMessage}` },
      { status: 500 }
    )
  }
}
