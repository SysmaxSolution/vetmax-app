import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { VETMAX_KNOWLEDGE_BASE } from '@/lib/mentor/knowledge-base'
import { getRouteContext, serializeRouteContext } from '@/lib/mentor/context-map'

/**
 * POST /api/mentor-chat
 * Recebe uma pergunta em linguagem natural do usuário e retorna
 * uma resposta do Mentor baseada na VETMAX_KNOWLEDGE_BASE.
 *
 * Body: { question: string, pathname?: string }
 * Response: { answer: string, tourId?: string | null, highlights?: MentorHighlight[] }
 */

const client = new Anthropic()

// Tour IDs disponíveis no sistema (mantido em sync com MentorContext.TOURS)
const AVAILABLE_TOURS: Record<string, string> = {
  'recepcao':     'Recepção (check-in e fila)',
  'sala-espera':  'Sala de Espera',
  'triagem':      'Triagem (sinais vitais)',
  'consulta':     'Consultório (prontuário SOAP)',
  'exames':       'Exames (laudo e resultado)',
  'internacao':   'Internação (lista e alta hospitalar)',
  'grooming':     'Banho e Tosa',
  'alta':         'Alta (quadro kanban)',
  'cadastro-pet': 'Cadastro de Pet (nome, alergias, doenças crônicas, microchip)',
}

// ─── System Prompt Didático (G16-2) ──────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `Você é o Mentor do SysVetMax — um assistente amigável e paciente para clínicas veterinárias.

Imagine que você está explicando o sistema para alguém que está usando computador pela primeira vez. Seja acolhedor, claro e nunca use jargão técnico sem explicar.

REGRAS DE COMUNICAÇÃO (siga sempre):
1. Responda SEMPRE em português brasileiro, com linguagem simples e acolhedora.
2. Antes de responder, confirme mentalmente se entendeu o que o usuário quer. Se a pergunta for ambígua, peça uma confirmação breve ("Você quer dizer... é isso?").
3. Quando houver uma sequência de ações, use passos numerados (1. 2. 3.) — nunca bullet points sem número.
4. Máximo 4 frases por resposta — seja objetivo. Se precisar de mais, divida em partes.
5. Use a terminologia correta: "Pet" (não "paciente"), "Tutor" (não "dono"), "MV" (para Médico Veterinário).
6. Nunca invente funcionalidades. Se não souber, diga: "Não encontrei essa informação. Chame o suporte técnico."
7. Quando mencionar um botão, escreva exatamente como aparece na tela (ex: botão "Check-in", aba "Recebimentos").

TOURS GUIADOS (use quando relevante):
Quando a resposta envolver um passo a passo prático, inclua ao final da resposta (linha separada):
TOUR_ID:<id_do_tour>
Tours disponíveis:
${Object.entries(AVAILABLE_TOURS).map(([id, label]) => `- ${id}: ${label}`).join('\n')}
Só inclua TOUR_ID se o tour existir E for útil para o que o usuário perguntou.

HIGHLIGHTS VISUAIS (G16-3):
Quando precisar apontar para um elemento específico da tela atual, inclua linhas HIGHLIGHT: ao final da resposta (uma por elemento), com este formato exato:
HIGHLIGHT:{"selector":"<data-mentor-step-value>","type":"pulse","message":"<texto curto>"}
Use apenas seletores que existam na lista de elementos guiáveis da rota atual (fornecida abaixo quando disponível).
Tipos disponíveis: "pulse" (padrão, pulsação suave), "border" (borda colorida), "arrow" (seta).
Inclua highlights apenas quando apontar para um botão ou campo específico que o usuário precisa clicar agora.

BASE DE CONHECIMENTO DO SysVetMax:
---
{KNOWLEDGE_BASE}
---`

// ─── Highlight type (espelhado no cliente) ────────────────────────────────────

interface MentorHighlight {
  selector: string
  message?: string
  type: 'pulse' | 'border' | 'arrow'
}

// ─── Parsing da resposta ──────────────────────────────────────────────────────

function parseResponse(raw: string): {
  answer: string
  tourId: string | null
  highlights: MentorHighlight[]
} {
  const lines = raw.split('\n')
  const answerLines: string[] = []
  let tourId: string | null = null
  const highlights: MentorHighlight[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    // Extrai TOUR_ID
    const tourMatch = trimmed.match(/^TOUR_ID:([a-z-]+)$/)
    if (tourMatch) {
      tourId = tourMatch[1]
      continue
    }

    // Extrai HIGHLIGHT:{...}
    if (trimmed.startsWith('HIGHLIGHT:')) {
      try {
        const jsonStr = trimmed.slice('HIGHLIGHT:'.length).trim()
        const parsed = JSON.parse(jsonStr) as MentorHighlight
        if (parsed.selector && parsed.type) {
          highlights.push(parsed)
        }
      } catch {
        // linha malformada — ignora
      }
      continue
    }

    answerLines.push(line)
  }

  const answer = answerLines.join('\n').trim()
  return { answer, tourId, highlights }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await req.json()
    const { question, pathname } = body as { question: string; pathname?: string }

    if (!question?.trim()) {
      return NextResponse.json({ error: 'Pergunta vazia.' }, { status: 400 })
    }

    // G16-1: injeta contexto da rota atual no prompt
    let routeContextBlock = ''
    if (pathname) {
      const ctx = getRouteContext(pathname)
      if (ctx) {
        routeContextBlock = `\n\nCONTEXTO DA TELA ATUAL (use para highlights e respostas contextuais):\n${serializeRouteContext(ctx)}\n`
      }
    }

    const systemPrompt = BASE_SYSTEM_PROMPT
      .replace('{KNOWLEDGE_BASE}', VETMAX_KNOWLEDGE_BASE)
      + routeContextBlock

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: question.trim(),
        },
      ],
    })

    const raw = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('')

    const { answer, tourId, highlights } = parseResponse(raw)

    return NextResponse.json({ answer, tourId, highlights })
  } catch (err) {
    console.error('[mentor-chat] error:', err)
    const { logServerError } = await import('@/lib/error-logger')
    await logServerError({ path: '/api/mentor-chat', error: err, source: 'api', module: 'mentor' })
    return NextResponse.json(
      { answer: 'Ocorreu um erro ao consultar o Mentor. Tente novamente ou use os tours guiados.' },
    )
  }
}
