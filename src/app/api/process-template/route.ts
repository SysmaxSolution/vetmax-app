import { Anthropic } from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import type { ExtractedField } from '@/types'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * POST /api/process-template
 * Processa um novo template de documento para extrair campos automaticamente
 *
 * Body: { name: string, type: string }
 * Response: { fields: ExtractedField[] } ou { error: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const body = await request.json()
    const { name, type } = body

    if (!name || !type) {
      return NextResponse.json(
        { error: 'Nome e tipo são obrigatórios.' },
        { status: 400 }
      )
    }

    // Validar tipos aceitos
    const validTypes = ['laudo', 'receita', 'encaminhamento', 'termo', 'exame', 'outro']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Tipo inválido: ${type}` },
        { status: 400 }
      )
    }

    // Verificar se ANTHROPIC_API_KEY está configurada
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY não configurada')
      return NextResponse.json(
        { error: 'Erro de configuração: chave de API não configurada. Contate o administrador.' },
        { status: 500 }
      )
    }

    // Prompt para Claude - MUITO específico para gerar JSON válido
    const prompt = `Gere um array JSON com campos de um documento veterinário.
Nome: ${name}
Tipo: ${type}

Responda APENAS com JSON válido, nada mais. Sem markdown. Sem explicações.

Schema: [{"field_name":"CAMPO_EM_SNAKE_CASE","label":"Label em PT-BR","type":"text|number|date|select|boolean|textarea","description":"Descrição curta","required":true|false}]

Exemplos de campos para ${type}:
${getExamplesForType(type)}

Gere 4-6 campos realistas. APENAS JSON VÁLIDO.`

    console.log('Processando template:', { name, type })
    console.log('Prompt enviado para Claude:', prompt.substring(0, 300))

    // Chamar Claude Haiku (rápido e barato para este use case)
    let message
    try {
      message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      })
      console.log('Resposta do Claude recebida:', message.id)
    } catch (claudeError) {
      console.error('Erro ao chamar Claude API:', claudeError)
      const errorMsg = claudeError instanceof Error ? claudeError.message : String(claudeError)
      return NextResponse.json(
        { error: `Erro ao chamar IA: ${errorMsg}` },
        { status: 503 }
      )
    }

    // Extrair conteúdo da resposta
    const content = message.content[0]
    if (content.type !== 'text') {
      return NextResponse.json(
        { error: 'Resposta inesperada da IA' },
        { status: 500 }
      )
    }

    // Fazer parsing do JSON retornado
    let fields: ExtractedField[]
    try {
      let jsonStr = content.text.trim()
      console.log('Resposta bruta da IA (primeiros 300 chars):', jsonStr.substring(0, 300))

      // Robust JSON extraction & repair
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

      try {
        fields = JSON.parse(jsonStr)
      } catch {
        // Extract array portion
        const arrayMatch = jsonStr.match(/\[[\s\S]*\]/)
        if (arrayMatch) jsonStr = arrayMatch[0]

        // Aggressive cleanup
        jsonStr = jsonStr
          .replace(/(?<=:\s*"[^"]*)\n/g, '\\n')
          .replace(/[\x00-\x1f]/g, (ch) => ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch === '\t' ? '\\t' : '')
          .replace(/,\s*]/g, ']')
          .replace(/,\s*}/g, '}')

        try {
          fields = JSON.parse(jsonStr)
        } catch {
          // Fix truncated JSON
          const quoteCount = (jsonStr.match(/(?<!\\)"/g) || []).length
          if (quoteCount % 2 !== 0) jsonStr += '"'
          const ob = (jsonStr.match(/\{/g) || []).length - (jsonStr.match(/\}/g) || []).length
          for (let i = 0; i < ob; i++) jsonStr += '}'
          jsonStr = jsonStr.replace(/,\s*$/, '')
          const ab = (jsonStr.match(/\[/g) || []).length - (jsonStr.match(/\]/g) || []).length
          for (let i = 0; i < ab; i++) jsonStr += ']'
          fields = JSON.parse(jsonStr)
        }
      }

      console.log(`✅ Campos extraídos com sucesso: ${fields.length} campos`)

      // Validar que campos tem o mínimo de estrutura
      if (fields.length === 0) {
        throw new Error('Nenhum campo foi retornado pela IA')
      }
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : String(parseError)
      console.error('❌ Erro ao fazer parsing de resposta da IA:', {
        errorMsg,
        responseLength: content.text.length,
        responsePreview: content.text.substring(0, 500),
      })
      return NextResponse.json(
        { error: `Erro ao processar resposta da IA: ${errorMsg}. A resposta pode estar em formato inválido.` },
        { status: 500 }
      )
    }

    // Validar estrutura dos campos
    if (!Array.isArray(fields)) {
      return NextResponse.json(
        { error: 'Resposta da IA não é um array válido' },
        { status: 500 }
      )
    }

    // Validar cada campo
    const validFieldTypes = ['text', 'number', 'date', 'select', 'boolean', 'textarea']
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i]

      // Validar campo obrigatório
      if (!field.field_name) {
        return NextResponse.json(
          { error: `Campo ${i + 1}: field_name está vazio ou ausente` },
          { status: 500 }
        )
      }
      if (!field.label) {
        return NextResponse.json(
          { error: `Campo ${i + 1} (${field.field_name}): label está vazio ou ausente` },
          { status: 500 }
        )
      }
      if (!field.type) {
        return NextResponse.json(
          { error: `Campo ${i + 1} (${field.field_name}): type está vazio ou ausente` },
          { status: 500 }
        )
      }
      if (!field.description) {
        return NextResponse.json(
          { error: `Campo ${i + 1} (${field.field_name}): description está vazio ou ausente` },
          { status: 500 }
        )
      }

      // Validar tipo de campo
      if (!validFieldTypes.includes(field.type)) {
        return NextResponse.json(
          { error: `Campo ${i + 1} (${field.field_name}): tipo inválido "${field.type}". Tipos válidos: ${validFieldTypes.join(', ')}` },
          { status: 500 }
        )
      }

      // Garantir que required é boolean
      if (typeof field.required !== 'boolean') {
        field.required = field.required === 'true' || field.required === true
      }
    }

    console.log('✅ Template processado com sucesso')
    return NextResponse.json({ fields })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('Erro em /api/process-template:', { errorMsg, stack: error instanceof Error ? error.stack : 'N/A' })
    return NextResponse.json(
      { error: `Erro interno ao processar template: ${errorMsg}` },
      { status: 500 }
    )
  }
}

/**
 * Retornar exemplos de campos para cada tipo de documento
 */
function getExamplesForType(type: string): string {
  const examples: Record<string, string> = {
    laudo:
      'achados_ultrassom, conclusao, recomendacoes, data_exame, veterinario_responsavel',
    receita:
      'medicamento, dosagem, frequencia, duracao_dias, indicacoes, contraindicacoes',
    encaminhamento:
      'motivo_encaminhamento, especialidade, historico_clinico, veterinario_referenciador',
    termo:
      'tipo_termo, data_termo, responsavel_legal, cpf_responsavel, assinatura_digital',
    exame:
      'tipo_exame, protocolo_exame, material_coleta, data_solicitacao, urgencia',
    outro:
      'campo_principal, campo_secundario, observacoes, data_documento',
  }

  return examples[type] || examples.outro
}

/**
 * Retornar contexto específico para cada tipo de documento
 * Ajuda a Claude a gerar campos mais precisos
 */
function getContextForType(type: string): string {
  const contexts: Record<string, string> = {
    laudo:
      'Documento que registra achados de um exame (ultrassom, raio-x, laboratorial). Inclua: achados, conclusão, recomendações.',
    receita:
      'Prescrição medicamentosa. Inclua: medicamento, dosagem, frequência, duração, instruções especiais.',
    encaminhamento:
      'Referência para outro veterinário especialista. Inclua: motivo, especialidade, histórico relevante, MV responsável.',
    termo:
      'Documento legal (consentimento, cessão de direitos, etc). Inclua: tipo, responsável, data, assinatura.',
    exame:
      'Solicitação de exame. Inclua: tipo de exame, protocolo, material a coletar, recomendações.',
    outro: 'Documento customizado pela clínica. Gere campos básicos e práticos.',
  }

  return contexts[type] || contexts.outro
}
