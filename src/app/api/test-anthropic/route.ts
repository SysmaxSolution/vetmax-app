import { Anthropic } from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

/**
 * GET /api/test-anthropic
 * Testa se a API do Anthropic está configurada corretamente
 *
 * APENAS PARA DIAGNÓSTICO - Use no navegador ou com curl
 * Exemplos:
 *   curl http://localhost:4000/api/test-anthropic
 *   http://localhost:4000/api/test-anthropic
 */
export async function GET() {
  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY,
    apiKeyPreview: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.substring(0, 8) + '...' : 'NÃO CONFIGURADA',
  }

  try {
    // Verificar se a chave está configurada
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          status: 'ERROR',
          message: 'ANTHROPIC_API_KEY não está configurada nas variáveis de ambiente',
          ...diagnostics,
        },
        { status: 500 }
      )
    }

    // Tentar fazer uma chamada simples
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: 'Responda com um JSON simples: {"test": "ok"}',
        },
      ],
    })

    diagnostics.anthropicTest = {
      status: 'SUCCESS',
      modelUsed: message.model,
      responseLength: message.content[0].type === 'text' ? message.content[0].text.length : 0,
      responseText: message.content[0].type === 'text' ? message.content[0].text : 'N/A',
    }

    return NextResponse.json(
      {
        status: 'OK',
        message: 'API do Anthropic está funcionando corretamente',
        ...diagnostics,
      },
      { status: 200 }
    )
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    const errorName = error instanceof Error ? error.constructor.name : 'UnknownError'

    diagnostics.error = {
      name: errorName,
      message: errorMsg,
      fullError: String(error),
    }

    console.error('Erro ao testar Anthropic:', diagnostics.error)

    return NextResponse.json(
      {
        status: 'ERROR',
        message: 'Erro ao testar API do Anthropic',
        ...diagnostics,
      },
      { status: 500 }
    )
  }
}
