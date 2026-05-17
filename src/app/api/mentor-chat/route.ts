import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VETMAX_KNOWLEDGE_BASE } from '@/lib/mentor/knowledge-base'
import { getRouteContext, serializeRouteContext } from '@/lib/mentor/context-map'

/**
 * POST /api/mentor-chat
 * Body: { question: string, pathname?: string }
 * Response: { answer: string, tourId?: string | null, highlights?: MentorHighlight[] }
 */

const client = new Anthropic()

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

// ─── System Prompt ────────────────────────────────────────────────────────────

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

MÓDULOS INEXISTENTES — CAPTURA DE IDEIAS (CRÍTICO):
Se o usuário perguntar sobre como usar um módulo ou funcionalidade que NÃO EXISTE no sistema atual — como Hotel para Pets, Creche para cães, Emissão de Nota Fiscal (NFS-e / NF-e), Petshop integrado, Rastreamento GPS, App para Tutor, Agendamento Online externo, ou qualquer outro recurso não listado na base de conhecimento — você DEVE obrigatoriamente chamar a ferramenta log_feature_request para registrar a ideia ANTES de responder. Após chamar a ferramenta, responda: "Ainda não temos esse módulo, mas identifiquei que é uma excelente ideia e já enviei direto para a nossa equipe de desenvolvimento! 🚀"

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

// ─── Tool: log_feature_request ────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'log_feature_request',
    description: 'Registra uma solicitação de funcionalidade não existente no SysVetMax. Chame esta função quando o usuário perguntar sobre um módulo ou recurso que NÃO existe no sistema atual.',
    input_schema: {
      type: 'object' as const,
      properties: {
        feature_name: {
          type: 'string',
          description: 'Nome curto e padronizado da funcionalidade (ex: "Hotel para Pets", "Creche", "Nota Fiscal NFS-e", "App para Tutor")',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Prioridade: high=pedido recorrente ou impacto alto, medium=pedido pontual, low=nice-to-have',
        },
        summary: {
          type: 'string',
          description: 'Resumo em 1-2 frases da necessidade do cliente e contexto do pedido',
        },
      },
      required: ['feature_name', 'priority', 'summary'],
    },
  },
]

// ─── Highlight type ───────────────────────────────────────────────────────────

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

    const tourMatch = trimmed.match(/^TOUR_ID:([a-z-]+)$/)
    if (tourMatch) { tourId = tourMatch[1]; continue }

    if (trimmed.startsWith('HIGHLIGHT:')) {
      try {
        const parsed = JSON.parse(trimmed.slice('HIGHLIGHT:'.length).trim()) as MentorHighlight
        if (parsed.selector && parsed.type) highlights.push(parsed)
      } catch { /* linha malformada */ }
      continue
    }

    answerLines.push(line)
  }

  return { answer: answerLines.join('\n').trim(), tourId, highlights }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await req.json()
    const { question, pathname } = body as { question: string; pathname?: string }
    if (!question?.trim()) return NextResponse.json({ error: 'Pergunta vazia.' }, { status: 400 })

    // Busca clinic_id para vincular feature_requests
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('clinic_id')
      .eq('id', user.id)
      .single()
    const clinicId = profile?.clinic_id ?? null

    // Injeta contexto da rota no prompt
    let routeContextBlock = ''
    if (pathname) {
      const ctx = getRouteContext(pathname)
      if (ctx) routeContextBlock = `\n\nCONTEXTO DA TELA ATUAL (use para highlights e respostas contextuais):\n${serializeRouteContext(ctx)}\n`
    }

    const systemPrompt = BASE_SYSTEM_PROMPT
      .replace('{KNOWLEDGE_BASE}', VETMAX_KNOWLEDGE_BASE)
      + routeContextBlock

    const userMessages: Anthropic.MessageParam[] = [
      { role: 'user', content: question.trim() },
    ]

    // ── Primeira chamada ──────────────────────────────────────────────────────
    const firstResponse = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system:     systemPrompt,
      tools:      TOOLS,
      messages:   userMessages,
    })

    // ── Sem tool use — resposta direta ────────────────────────────────────────
    if (firstResponse.stop_reason !== 'tool_use') {
      const raw = firstResponse.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('')
      const { answer, tourId, highlights } = parseResponse(raw)
      return NextResponse.json({ answer, tourId, highlights })
    }

    // ── Tool use: executa log_feature_request ─────────────────────────────────
    const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []

    for (const block of firstResponse.content) {
      if (block.type !== 'tool_use') continue
      if (block.name !== 'log_feature_request') continue

      const input = block.input as { feature_name: string; priority: string; summary: string }

      if (clinicId) {
        await admin.from('feature_requests').insert({
          tenant_id:    clinicId,
          feature_name: input.feature_name,
          user_message: question.trim(),
          priority:     input.priority as 'low' | 'medium' | 'high',
          status:       'pending',
        })
      }

      toolResults.push({
        type:        'tool_result',
        tool_use_id: block.id,
        content:     'Solicitação registrada com sucesso para análise pela equipe de produto.',
      })
    }

    // ── Segunda chamada: gera resposta após tool result ───────────────────────
    const secondResponse = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system:     systemPrompt,
      tools:      TOOLS,
      messages: [
        ...userMessages,
        { role: 'assistant' as const, content: firstResponse.content as Anthropic.MessageParam['content'] },
        { role: 'user'      as const, content: toolResults as Anthropic.MessageParam['content'] },
      ],
    })

    const raw = secondResponse.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    const { answer, tourId, highlights } = parseResponse(raw)
    return NextResponse.json({ answer, tourId, highlights })

  } catch (err) {
    console.error('[mentor-chat] error:', err)

    const errMsg = err instanceof Error ? err.message : String(err)
    if (errMsg.toLowerCase().includes('credit') || errMsg.toLowerCase().includes('balance')) {
      return NextResponse.json({
        answer: 'O Mentor está temporariamente indisponível. Entre em contato com o suporte técnico.',
      })
    }

    const { logServerError } = await import('@/lib/error-logger')
    await logServerError({ path: '/api/mentor-chat', error: err, source: 'api', module: 'mentor' })
    return NextResponse.json({
      answer: 'Ocorreu um erro ao consultar o Mentor. Tente novamente ou use os tours guiados.',
    })
  }
}
