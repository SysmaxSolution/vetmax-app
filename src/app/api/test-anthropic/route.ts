import { NextResponse } from 'next/server'

import { limitarPorIp } from '@/lib/api/rate-limit'
// Endpoint de diagnóstico — disponível SOMENTE em ambiente de desenvolvimento.
// Em produção retorna 404 para não expor fragmento da ANTHROPIC_API_KEY.
export async function GET(req: Request) {
  const barrado = await limitarPorIp(req, { escopo: 'ia:teste', limite: 5 })
  if (barrado) return barrado

  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  const { Anthropic } = await import('@anthropic-ai/sdk')

  const apiKeyConfigured = !!process.env.ANTHROPIC_API_KEY
  if (!apiKeyConfigured) {
    return NextResponse.json(
      { status: 'ERROR', message: 'ANTHROPIC_API_KEY não configurada' },
      { status: 500 },
    )
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'Responda: {"test":"ok"}' }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ status: 'OK', response: text })
  } catch (error) {
    return NextResponse.json(
      { status: 'ERROR', message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
