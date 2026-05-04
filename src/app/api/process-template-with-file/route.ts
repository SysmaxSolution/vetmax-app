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

// ── Robust JSON extraction & repair ────────────────────────────────────────

function repairAndParseJson(raw: string): any[] {
  let str = raw.trim()

  // Strip markdown code blocks
  str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  str = str.trim()

  // Try direct parse first
  try { return JSON.parse(str) } catch {}

  // Extract the array portion if surrounded by text
  const arrayMatch = str.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    str = arrayMatch[0]
    try { return JSON.parse(str) } catch {}
  }

  // Aggressive cleanup for common Claude issues
  str = str
    // Fix unescaped newlines inside JSON string values
    .replace(/(?<=:\s*"[^"]*)\n/g, '\\n')
    // Fix unescaped control characters
    .replace(/[\x00-\x1f]/g, (ch) => {
      if (ch === '\n') return '\\n'
      if (ch === '\r') return '\\r'
      if (ch === '\t') return '\\t'
      return ''
    })
    // Remove trailing commas
    .replace(/,\s*]/g, ']')
    .replace(/,\s*}/g, '}')
    // Fix single quotes used as JSON delimiters
    .replace(/'/g, '"')

  try { return JSON.parse(str) } catch {}

  // Last resort: try to fix truncated JSON by closing open brackets
  let balanced = str
  const openBrackets = (balanced.match(/\[/g) || []).length
  const closeBrackets = (balanced.match(/\]/g) || []).length
  const openBraces = (balanced.match(/\{/g) || []).length
  const closeBraces = (balanced.match(/\}/g) || []).length

  // If truncated mid-string, close the string
  const quoteCount = (balanced.match(/(?<!\\)"/g) || []).length
  if (quoteCount % 2 !== 0) {
    balanced += '"'
  }

  // Close any open braces/brackets
  for (let i = 0; i < openBraces - closeBraces; i++) balanced += '}'
  // Remove trailing comma before we close the array
  balanced = balanced.replace(/,\s*$/, '')
  for (let i = 0; i < openBrackets - closeBrackets; i++) balanced += ']'

  try { return JSON.parse(balanced) } catch {}

  // Final attempt: extract individual objects with regex
  const objects: any[] = []
  const objRegex = /\{[^{}]*\}/g
  let match
  while ((match = objRegex.exec(str)) !== null) {
    try {
      const obj = JSON.parse(match[0])
      if (obj.field_name && obj.label) objects.push(obj)
    } catch {}
  }

  if (objects.length > 0) return objects

  throw new Error('Impossivel extrair JSON valido da resposta da IA')
}

// ── DOCX text + HTML extraction ─────────────────────────────────────────────

async function extractDocxContent(buffer: ArrayBuffer): Promise<{ text: string; html: string }> {
  const mammoth = require('mammoth')
  const nodeBuffer = Buffer.from(buffer)

  const [textResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ buffer: nodeBuffer }),
    mammoth.convertToHtml({ buffer: nodeBuffer }),
  ])

  return {
    text: textResult.value || '',
    html: htmlResult.value || '',
  }
}

// ── PDF text extraction ─────────────────────────────────────────────────────

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const tempPath = join(tmpdir(), `pdf_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`)
  writeFileSync(tempPath, Buffer.from(buffer))

  try {
    const text = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('PDF parse timeout (30s)')), 30_000)
      const pdfParser = new PDFParser(null, 1)

      pdfParser.on('pdfParser_dataError', (data: any) => {
        clearTimeout(timeout)
        reject(new Error(`PDF Parse Error: ${data.parserError || 'Unknown'}`))
      })

      pdfParser.on('pdfParser_dataReady', () => {
        clearTimeout(timeout)
        try { resolve(pdfParser.getRawTextContent()) } catch (e) { reject(e) }
      })

      pdfParser.loadPDF(tempPath)
    })

    return text
  } finally {
    try { unlinkSync(tempPath) } catch {}
  }
}

// ── Image to base64 for Claude Vision ───────────────────────────────────────

function getMediaType(fileName: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

// ── Claude prompt for field extraction ──────────────────────────────────────

const FIELDS_PROMPT = `Voce e um especialista em analise de documentos veterinarios brasileiros.

TAREFA:
Analise o documento e extraia TODOS os campos editaveis/preenchíveis.
Objetivo: capturar 99% dos campos (exceto logos/imagens/assinaturas).

INSTRUCOES:
1. Leia CADA linha do documento
2. Identifique labels de campos (ex: "Paciente:", "Peso:", "Diagnostico:")
3. Para CADA campo, crie um objeto com:
   - field_name: snake_case (ex: "paciente_nome", "peso_kg")
   - label: Exatamente como aparece no documento
   - type: text | number | date | select | boolean | textarea
   - description: Resumo curto do campo
   - required: true se preenchido, false se vazio
4. Incluir: dados do paciente, tutor, veterinario, medicoes, resultados, observacoes
5. NAO incluir: logos, assinaturas, rodapes, numeros de pagina

FORMATO: APENAS um array JSON valido. Sem markdown. Sem explicacoes.
Exemplo: [{"field_name":"x","label":"X","type":"text","description":"desc","required":true}]`

// ── Claude prompt for HTML layout extraction ────────────────────────────────

const LAYOUT_PROMPT = `Voce e um especialista em replicacao visual de documentos.

TAREFA:
Analise o documento fornecido e gere um template HTML que reproduza FIELMENTE o layout visual original.

REGRAS:
1. Use HTML + CSS inline para replicar o layout exato do documento
2. Para cada campo editavel, use {{nome_do_campo}} como placeholder
3. Mantenha fontes, tamanhos, espacamentos, bordas, cabecalhos e rodapes
4. Use tabelas HTML quando o documento tiver layout tabular
5. Inclua cabecalho da clinica, areas de assinatura, linhas divisorias
6. Nao inclua logos como imagem, use placeholder {{logo_clinica}}
7. O HTML deve ser auto-contido (CSS inline, nao externo)
8. Use mm como unidade base e considere A4 (210mm x 297mm)

FORMATO: Retorne APENAS o HTML puro. Sem markdown. Sem explicacoes. Comece com <div> e termine com </div>.`

/**
 * POST /api/process-template-with-file
 * Processa um documento REAL (PDF/DOCX/Imagem) para extrair campos + layout HTML
 *
 * Body: FormData com arquivo + name + type
 * Response: { fields: ExtractedField[], template_html?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const templateName = formData.get('name') as string | null
    const templateType = formData.get('type') as string | null

    if (!file) return NextResponse.json({ error: 'Arquivo nao fornecido' }, { status: 400 })
    if (!templateName || !templateType) return NextResponse.json({ error: 'Nome e tipo sao obrigatorios' }, { status: 400 })

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Chave de API nao configurada' }, { status: 500 })
    }

    console.log(`[process-template] Arquivo: ${file.name} (${file.size} bytes, tipo: ${file.type})`)

    const buffer = await file.arrayBuffer()
    const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf')
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name)

    let extractedText = ''
    let originalHtml = ''

    // ── Extract content based on file type ───────────────────────────────

    if (isDocx) {
      console.log('[process-template] Extraindo conteudo DOCX via mammoth...')
      const docxContent = await extractDocxContent(buffer)
      extractedText = docxContent.text
      originalHtml = docxContent.html
      console.log(`[process-template] DOCX extraido: ${extractedText.length} chars texto, ${originalHtml.length} chars HTML`)

      if (extractedText.length < 20) {
        return NextResponse.json({ error: 'DOCX parece vazio ou sem texto.' }, { status: 400 })
      }
    } else if (isPdf) {
      console.log('[process-template] Extraindo texto de PDF...')
      extractedText = await extractPdfText(buffer)
      console.log(`[process-template] PDF extraido: ${extractedText.length} chars`)

      if (extractedText.length < 50) {
        return NextResponse.json(
          { error: 'PDF parece vazio ou contem apenas imagens. Use um PDF com texto editavel.' },
          { status: 400 }
        )
      }
    } else if (isImage) {
      console.log('[process-template] Imagem detectada — usando Claude Vision...')
      // Para imagens, enviaremos diretamente ao Claude Vision
      extractedText = '__IMAGE_MODE__'
    } else {
      return NextResponse.json(
        { error: `Tipo de arquivo nao suportado: ${file.type}. Use PDF, DOCX, PNG ou JPG.` },
        { status: 400 }
      )
    }

    // ── Call Claude for field extraction ─────────────────────────────────

    console.log('[process-template] Chamando Claude para extração de campos...')

    let fieldsMessage
    if (isImage) {
      // Use Claude Vision for images
      const base64 = Buffer.from(buffer).toString('base64')
      fieldsMessage = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: getMediaType(file.name), data: base64 },
            },
            {
              type: 'text',
              text: `${FIELDS_PROMPT}\n\nNome do template: ${templateName}\nTipo: ${templateType}`,
            },
          ],
        }],
      })
    } else {
      fieldsMessage = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: `${FIELDS_PROMPT}\n\nNome do template: ${templateName}\nTipo: ${templateType}\n\nDOCUMENTO:\n${extractedText}`,
        }],
      })
    }

    const fieldsRaw = fieldsMessage.content[0]
    if (fieldsRaw.type !== 'text') {
      return NextResponse.json({ error: 'Resposta inesperada da IA' }, { status: 500 })
    }

    console.log(`[process-template] Resposta campos (${fieldsRaw.text.length} chars)`)

    // ── Parse fields with robust JSON repair ────────────────────────────
    let fields: ExtractedField[]
    try {
      fields = repairAndParseJson(fieldsRaw.text)
    } catch (parseError) {
      const msg = parseError instanceof Error ? parseError.message : String(parseError)
      console.error('[process-template] JSON parse falhou:', msg)
      console.error('[process-template] Resposta bruta:', fieldsRaw.text.substring(0, 1000))
      return NextResponse.json({ error: `Erro ao processar resposta da IA: ${msg}` }, { status: 500 })
    }

    if (!Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json({ error: 'Nenhum campo identificado no documento' }, { status: 500 })
    }

    // ── Validate & sanitize fields ──────────────────────────────────────
    const validFieldTypes = ['text', 'number', 'date', 'select', 'boolean', 'textarea']
    fields = fields.filter(f => f.field_name && f.label && f.type)
    for (const field of fields) {
      if (!validFieldTypes.includes(field.type)) field.type = 'text'
      if (!field.description) field.description = field.label
      if (typeof field.required !== 'boolean') {
        field.required = field.required === 'true' || field.required === true
      }
    }

    console.log(`[process-template] ${fields.length} campos validados`)

    // ── Call Claude for HTML layout ─────────────────────────────────────

    let templateHtml = originalHtml || ''

    // Always generate layout HTML from Claude (even for DOCX, mammoth HTML is basic)
    console.log('[process-template] Gerando HTML de layout fiel ao documento...')
    try {
      let layoutMessage
      if (isImage) {
        const base64 = Buffer.from(buffer).toString('base64')
        layoutMessage = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: getMediaType(file.name), data: base64 },
              },
              {
                type: 'text',
                text: `${LAYOUT_PROMPT}\n\nCampos identificados (use estes nomes como placeholders {{nome}}):\n${fields.map(f => `- {{${f.field_name}}} = ${f.label}`).join('\n')}`,
              },
            ],
          }],
        })
      } else {
        layoutMessage = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 8192,
          messages: [{
            role: 'user',
            content: `${LAYOUT_PROMPT}\n\nDOCUMENTO ORIGINAL:\n${extractedText}\n\nCampos identificados (use estes nomes como placeholders {{nome}}):\n${fields.map(f => `- {{${f.field_name}}} = ${f.label}`).join('\n')}`,
          }],
        })
      }

      const layoutRaw = layoutMessage.content[0]
      if (layoutRaw.type === 'text') {
        let html = layoutRaw.text.trim()
        // Strip markdown code blocks if present
        html = html.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '')
        templateHtml = html.trim()
        console.log(`[process-template] Layout HTML gerado: ${templateHtml.length} chars`)
      }
    } catch (layoutError) {
      console.warn('[process-template] Erro ao gerar layout HTML (nao-critico):', layoutError)
      // Non-fatal — we still have the fields
    }

    return NextResponse.json({
      fields,
      template_html: templateHtml || null,
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[process-template] Erro geral:', errorMsg)
    return NextResponse.json({ error: `Erro ao processar documento: ${errorMsg}` }, { status: 500 })
  }
}
