import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * POST /api/mentor-chat
 * Recebe uma pergunta em linguagem natural do usuário e retorna
 * uma resposta do Mentor baseada na VetMax_KNOWLEDGE_BASE.md.
 *
 * Body: { question: string }
 * Response: { answer: string }
 */

const client = new Anthropic()

// Load knowledge base once at module initialization
let knowledgeBase: string | null = null

function getKnowledgeBase(): string {
  if (knowledgeBase) return knowledgeBase
  try {
    const kbPath = join(process.cwd(), 'VetMax_KNOWLEDGE_BASE.md')
    knowledgeBase = readFileSync(kbPath, 'utf-8')
    return knowledgeBase
  } catch {
    return ''
  }
}

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

const SYSTEM_PROMPT = `Você é o Mentor do SysVetMax, um assistente de ajuda inteligente para uma clínica veterinária.

Você tem acesso à base de conhecimento completa do sistema SysVetMax abaixo. Use APENAS as informações contidas nessa base para responder perguntas.

REGRAS OBRIGATÓRIAS:
1. Responda SEMPRE em português brasileiro.
2. Seja direto, claro e conciso — máximo 3-4 frases por resposta.
3. Quando houver um passo a passo, use bullet points numerados.
4. Nunca invente funcionalidades que não estão documentadas na base de conhecimento.
5. Se a pergunta não puder ser respondida com a base de conhecimento, diga: "Não encontrei essa informação no sistema. Entre em contato com o suporte."
6. Use a terminologia correta: "Pet" (não "paciente"), "Tutor" (não "dono"), "MV" (para Médico Veterinário).
7. Quando relevante, mencione o módulo/tela onde a ação deve ser realizada.
8. TOUR GUIADO: Quando a resposta envolver um passo a passo prático existente no sistema, retorne OBRIGATORIAMENTE ao final da resposta, numa linha separada, o marcador: TOUR_ID:<id_do_tour> — onde <id_do_tour> é um dos seguintes: recepcao, sala-espera, triagem, consulta, exames, internacao, grooming, alta, cadastro-pet. Só inclua TOUR_ID se o passo a passo puder ser demonstrado interativamente.

TOURS DISPONÍVEIS:
${Object.entries(AVAILABLE_TOURS).map(([id, label]) => `- ${id}: ${label}`).join('\n')}

BASE DE CONHECIMENTO DO SysVetMax:
---
{KNOWLEDGE_BASE}
---`

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await req.json()
    const { question } = body

    if (!question?.trim()) {
      return NextResponse.json({ error: 'Pergunta vazia.' }, { status: 400 })
    }

    const kb = getKnowledgeBase()
    if (!kb) {
      return NextResponse.json(
        { answer: 'Base de conhecimento não disponível. Tente os tours guiados ou entre em contato com o suporte.' },
      )
    }

    const systemPrompt = SYSTEM_PROMPT.replace('{KNOWLEDGE_BASE}', kb)

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
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

    // Extrair TOUR_ID embutido na resposta (ex: "TOUR_ID:cadastro-pet")
    const tourMatch = raw.match(/TOUR_ID:([a-z-]+)/)
    const tourId    = tourMatch ? tourMatch[1] : null
    // Remover a linha de marcador da resposta exibida ao usuário
    const answer    = raw.replace(/\n?TOUR_ID:[a-z-]+\n?/g, '').trim()

    return NextResponse.json({ answer, tourId })
  } catch (err) {
    console.error('[mentor-chat] error:', err)
    return NextResponse.json(
      { answer: 'Ocorreu um erro ao consultar o Mentor. Tente novamente ou use os tours guiados.' },
    )
  }
}
