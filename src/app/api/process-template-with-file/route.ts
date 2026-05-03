import { Anthropic } from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import type { ExtractedField } from '@/types'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createClient } from '@/lib/supabase/server'

const PDFParser = require('pdf2json')

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

/**
 * POST /api/process-template-with-file
 * Processa um documento REAL (arquivo enviado) para extrair campos
 *
 * Body: FormData com arquivo
 * Response: { fields: ExtractedField[] } ou { error: string }
 *
 * Este endpoint:
 * 1. Recebe arquivo PDF/DOCX/Imagem
 * 2. Extrai texto do arquivo
 * 3. Analisa com Claude para mapear TODOS os campos
 * 4. Retorna campos estruturados
 */
export async function POST(request: NextRequest) {
  let tempFilePath: string | null = null

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    // 1. Parsear FormData
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const templateName = formData.get('name') as string | null
    const templateType = formData.get('type') as string | null

    if (!file) {
      return NextResponse.json(
        { error: 'Arquivo não fornecido' },
        { status: 400 }
      )
    }

    if (!templateName || !templateType) {
      return NextResponse.json(
        { error: 'Nome e tipo são obrigatórios' },
        { status: 400 }
      )
    }

    // Nota: tempFilePath é null aqui, então não precisa cleanup

    console.log(`📄 Processando arquivo: ${file.name} (${file.size} bytes)`)

    // 2. Extrair texto do PDF
    let extractedText = ''

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      try {
        const buffer = await file.arrayBuffer()
        console.log(`📄 Extraindo texto de PDF (${buffer.byteLength} bytes)...`)

        // Salvar arquivo temporário para pdf2json processar
        tempFilePath = join(tmpdir(), `pdf_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`)
        writeFileSync(tempFilePath, Buffer.from(buffer))

        // Usar pdf2json para extrair texto
        const extractedPromise = new Promise<string>((resolve, reject) => {
          const pdfParser = new PDFParser(null, 1)

          pdfParser.on('pdfParser_dataError', (data: any) => {
            reject(new Error(`PDF Parse Error: ${data.parserError || 'Unknown error'}`))
          })

          pdfParser.on('pdfParser_dataReady', () => {
            try {
              const text = pdfParser.getRawTextContent()
              resolve(text)
            } catch (error) {
              reject(error)
            }
          })

          pdfParser.loadPDF(tempFilePath!)
        })

        extractedText = await extractedPromise
        console.log(`✅ PDF extraído: ${extractedText.length} caracteres`)

        if (extractedText.length < 100) {
          console.warn('⚠️ PDF extraído tem muito pouco texto')
          // Cleanup arquivo temporário
          if (tempFilePath) {
            try {
              unlinkSync(tempFilePath)
            } catch (e) {
              console.warn('⚠️ Erro ao deletar arquivo temporário:', e)
            }
          }
          return NextResponse.json(
            { error: 'PDF parece estar vazio ou contém apenas imagens. Por favor, use um PDF com texto editável.' },
            { status: 400 }
          )
        }
      } catch (pdfError) {
        const errorMsg = pdfError instanceof Error ? pdfError.message : String(pdfError)
        console.error('❌ Erro ao extrair PDF:', errorMsg)
        // Cleanup arquivo temporário
        if (tempFilePath) {
          try {
            unlinkSync(tempFilePath)
          } catch (e) {
            console.warn('⚠️ Erro ao deletar arquivo temporário:', e)
          }
        }
        return NextResponse.json(
          { error: `Erro ao ler PDF: ${errorMsg}. Certifique-se de que o PDF contém texto editável.` },
          { status: 400 }
        )
      }
    } else {
      // Para arquivos não-PDF, usar apenas o nome
      console.warn(`⚠️ Arquivo tipo ${file.type} não é PDF. Usando estratégia de nome/tipo apenas.`)
      extractedText = `Documento: ${templateName}\nTipo: ${templateType}`
    }

    if (!extractedText.trim()) {
      // Cleanup arquivo temporário
      if (tempFilePath) {
        try {
          unlinkSync(tempFilePath)
        } catch (e) {
          console.warn('⚠️ Erro ao deletar arquivo temporário:', e)
        }
      }
      return NextResponse.json(
        { error: 'Arquivo vazio ou sem conteúdo de texto' },
        { status: 400 }
      )
    }

    // 3. Verificar se ANTHROPIC_API_KEY está configurada
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY não configurada')
      // Cleanup arquivo temporário
      if (tempFilePath) {
        try {
          unlinkSync(tempFilePath)
        } catch (e) {
          console.warn('⚠️ Erro ao deletar arquivo temporário:', e)
        }
      }
      return NextResponse.json(
        { error: 'Erro de configuração: chave de API não configurada' },
        { status: 500 }
      )
    }

    // 4. Montar prompt AGRESSIVO para extrair TODOS os campos
    const prompt = `Você é um especialista em análise de documentos veterinários brasileiros.

DOCUMENTO FORNECIDO:
${extractedText}

TAREFA:
Analise o documento acima e extraia TODOS os campos estruturados.
Objetivo: capturar 99% dos campos (exceto logos/imagens/assinaturas).

INSTRUÇÕES OBRIGATÓRIAS:
1. Leia CADA linha do documento
2. Identifique labels/nomes de campos (ex: "Paciente:", "Peso:", "Frequência cardíaca:")
3. Para CADA campo encontrado, crie um objeto JSON com:
   - field_name: SNAKE_CASE (ex: "paciente_nome", "peso_kg", "frequencia_cardiaca_bpm")
   - label: Exatamente como aparece no documento em PT-BR
   - type: text (padrão) | number | date | select (para listas) | boolean
   - description: Resumo do campo (ex: "Nome do paciente", "Peso em kg", "Frequência cardíaca em bpm")
   - required: true se está preenchido, false se vazio/opcional

4. Incluir TUDO que é campo/informação:
   - Dados do paciente (nome, idade, sexo, espécie, raça)
   - Dados do proprietário/tutor
   - Dados do veterinário
   - Cada medição/valor numérico
   - Cada análise/resultado
   - Cada achado clínico
   - Cada observação/nota

5. NÃO incluir: logos, assinaturas, rodapés, números de página, datas de impressão

FORMATO DE RESPOSTA:
APENAS um array JSON válido, sem markdown, sem explicações adicionais.

[
  {"field_name":"paciente_nome","label":"Paciente","type":"text","description":"Nome do paciente animal","required":true},
  {"field_name":"peso_kg","label":"Peso","type":"number","description":"Peso em quilogramas","required":true},
  ... continue para CADA campo ...
]

IMPORTANTE: Seja AGRESSIVO. Se o documento tem 50 campos, gere 50 campos. Não omita nada.`

    console.log('🤖 Chamando Claude para análise de documento...')

    // 5. Chamar Claude com modelo melhorado (Opus para documentos complexos)
    let message
    try {
      message = await anthropic.messages.create({
        model: 'claude-opus-4-6', // Usar Opus para documentos reais complexos
        max_tokens: 4000, // Mais tokens para documentos longos
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      })
      console.log(`✅ Resposta do Claude recebida (${message.content[0].type === 'text' ? message.content[0].text.length : 0} chars)`)
    } catch (claudeError) {
      console.error('Erro ao chamar Claude API:', claudeError)
      const errorMsg = claudeError instanceof Error ? claudeError.message : String(claudeError)
      // Cleanup arquivo temporário
      if (tempFilePath) {
        try {
          unlinkSync(tempFilePath)
        } catch (e) {
          console.warn('⚠️ Erro ao deletar arquivo temporário:', e)
        }
      }
      return NextResponse.json(
        { error: `Erro ao chamar IA: ${errorMsg}` },
        { status: 503 }
      )
    }

    // 6. Extrair e fazer parsing do JSON
    const content = message.content[0]
    if (content.type !== 'text') {
      // Cleanup arquivo temporário
      if (tempFilePath) {
        try {
          unlinkSync(tempFilePath)
        } catch (e) {
          console.warn('⚠️ Erro ao deletar arquivo temporário:', e)
        }
      }
      return NextResponse.json(
        { error: 'Resposta inesperada da IA' },
        { status: 500 }
      )
    }

    let fields: ExtractedField[]
    try {
      let jsonStr = content.text.trim()
      console.log(`📝 Respondido pela IA (primeiros 500 chars): ${jsonStr.substring(0, 500)}`)

      // Remover markdown code blocks
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7)
      if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3)
      if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3)

      jsonStr = jsonStr.trim()

      // Tentar parsing direto
      try {
        fields = JSON.parse(jsonStr)
      } catch (initialParseError) {
        console.warn('⚠️ Erro inicial de parsing, tentando limpar...')
        // Tentar normalizações
        jsonStr = jsonStr
          .replace(/[\n\r]/g, ' ') // Remover quebras de linha
          .replace(/,\s*]/g, ']') // Remover vírgula antes de ]
          .replace(/,\s*}/g, '}') // Remover vírgula antes de }

        fields = JSON.parse(jsonStr)
      }

      console.log(`✅ ${fields.length} campos extraídos com sucesso!`)

      if (fields.length === 0) {
        throw new Error('Nenhum campo foi identificado no documento')
      }

      // 7. Validar campos
      const validFieldTypes = ['text', 'number', 'date', 'select', 'boolean', 'textarea']
      for (let i = 0; i < fields.length; i++) {
        const field = fields[i]

        if (!field.field_name || !field.label || !field.type || !field.description) {
          console.warn(`⚠️ Campo ${i + 1} incompleto, pulando...`)
          fields.splice(i, 1)
          i--
          continue
        }

        if (!validFieldTypes.includes(field.type)) {
          field.type = 'text' // Fallback para text
        }

        if (typeof field.required !== 'boolean') {
          field.required = field.required === 'true' || field.required === true
        }
      }

      console.log(`✅ Após validação: ${fields.length} campos`)
      // Cleanup arquivo temporário
      if (tempFilePath) {
        try {
          unlinkSync(tempFilePath)
        } catch (e) {
          console.warn('⚠️ Erro ao deletar arquivo temporário:', e)
        }
      }
      return NextResponse.json({ fields })
    } catch (parseError) {
      const errorMsg = parseError instanceof Error ? parseError.message : String(parseError)
      console.error('❌ Erro ao fazer parsing:', { errorMsg, responseLength: content.text.length })
      // Cleanup arquivo temporário
      if (tempFilePath) {
        try {
          unlinkSync(tempFilePath)
        } catch (e) {
          console.warn('⚠️ Erro ao deletar arquivo temporário:', e)
        }
      }
      return NextResponse.json(
        { error: `Erro ao processar resposta: ${errorMsg}` },
        { status: 500 }
      )
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('❌ Erro geral:', { errorMsg })
    // Cleanup arquivo temporário
    if (tempFilePath) {
      try {
        unlinkSync(tempFilePath)
      } catch (e) {
        console.warn('⚠️ Erro ao deletar arquivo temporário:', e)
      }
    }
    return NextResponse.json(
      { error: `Erro ao processar documento: ${errorMsg}` },
      { status: 500 }
    )
  }
}
