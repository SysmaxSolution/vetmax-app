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
  str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  try { return JSON.parse(str) } catch {}

  const arrayMatch = str.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    str = arrayMatch[0]
    try { return JSON.parse(str) } catch {}
  }

  str = str
    .replace(/(?<=:\s*"[^"]*)\n/g, '\\n')
    .replace(/[\x00-\x1f]/g, (ch) => {
      if (ch === '\n') return '\\n'
      if (ch === '\r') return '\\r'
      if (ch === '\t') return '\\t'
      return ''
    })
    .replace(/,\s*]/g, ']')
    .replace(/,\s*}/g, '}')
    .replace(/'/g, '"')

  try { return JSON.parse(str) } catch {}

  let balanced = str
  const quoteCount = (balanced.match(/(?<!\\)"/g) || []).length
  if (quoteCount % 2 !== 0) balanced += '"'
  const ob = (balanced.match(/\{/g) || []).length - (balanced.match(/\}/g) || []).length
  for (let i = 0; i < ob; i++) balanced += '}'
  balanced = balanced.replace(/,\s*$/, '')
  const ab = (balanced.match(/\[/g) || []).length - (balanced.match(/\]/g) || []).length
  for (let i = 0; i < ab; i++) balanced += ']'
  try { return JSON.parse(balanced) } catch {}

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

// ── DOCX extraction ─────────────────────────────────────────────────────────

async function extractDocxContent(buffer: ArrayBuffer): Promise<{ text: string; html: string }> {
  const mammoth = require('mammoth')
  const nodeBuffer = Buffer.from(buffer)
  const [textResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ buffer: nodeBuffer }),
    mammoth.convertToHtml({ buffer: nodeBuffer }),
  ])
  return { text: textResult.value || '', html: htmlResult.value || '' }
}

// ── PDF text extraction ─────────────────────────────────────────────────────

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const tempPath = join(tmpdir(), `pdf_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`)
  writeFileSync(tempPath, Buffer.from(buffer))
  try {
    return await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('PDF parse timeout')), 30_000)
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
  } finally {
    try { unlinkSync(tempPath) } catch {}
  }
}

// ── Media type helper ───────────────────────────────────────────────────────

function getMediaType(fileName: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

// ── Claude Vision prompt: extract fields WITH coordinates ───────────────────

const VISION_FIELDS_PROMPT = `Voce e um especialista em analise de documentos veterinarios.

TAREFA: Analise esta imagem de documento e extraia TODOS os campos editaveis/preenchíveis COM suas coordenadas visuais.

INSTRUCOES:
1. Identifique CADA label de campo (ex: "Paciente:", "Peso:", "Diagnostico:")
2. Para CADA campo, retorne:
   - field_name: snake_case unico
   - label: texto do label exatamente como aparece
   - type: text | number | date | select | boolean | textarea
   - description: descricao curta
   - required: true/false
   - x_percent: posicao X do VALOR do campo em % da largura (0-100), onde o usuario preencheria
   - y_percent: posicao Y do VALOR do campo em % da altura (0-100)
   - width_percent: largura da area de preenchimento em % (geralmente 15-40)
   - height_percent: altura da area em % (geralmente 2-4 para campos simples, 5-15 para textarea)
3. As coordenadas devem indicar onde o VALOR sera preenchido, nao onde o label esta
4. Inclua TODOS os campos: dados do paciente, tutor, vet, medicoes, resultados, observacoes
5. NAO inclua: logos, assinaturas digitais, rodapes fixos, numeros de pagina

FORMATO: APENAS um array JSON. Sem markdown. Sem explicacoes.
[{"field_name":"x","label":"X","type":"text","description":"desc","required":true,"x_percent":30,"y_percent":15,"width_percent":25,"height_percent":3}]`

// ── Text-only field extraction (fallback) ───────────────────────────────────

const TEXT_FIELDS_PROMPT = `Voce e um especialista em analise de documentos veterinarios.

TAREFA: Extraia TODOS os campos editaveis/preenchíveis do documento.

Para CADA campo retorne:
- field_name: snake_case
- label: exatamente como aparece
- type: text | number | date | select | boolean | textarea
- description: resumo curto
- required: true/false

FORMATO: APENAS um array JSON. Sem markdown.
[{"field_name":"x","label":"X","type":"text","description":"desc","required":true}]`

/**
 * POST /api/process-template-with-file
 *
 * Aceita dois modos:
 * 1. FormData com file (upload direto) — extrai texto e usa IA
 * 2. FormData com file + page_images[] (frontend converteu PDF→imagens) — usa Vision com coordenadas
 *
 * Response: { fields, template_html?, page_images? }
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
    // Page images from frontend PDF→canvas conversion (data:image/jpeg;base64,...)
    const pageImagesRaw = formData.getAll('page_images') as string[]

    if (!file) return NextResponse.json({ error: 'Arquivo nao fornecido' }, { status: 400 })
    if (!templateName || !templateType) return NextResponse.json({ error: 'Nome e tipo sao obrigatorios' }, { status: 400 })
    if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'Chave de API nao configurada' }, { status: 500 })

    console.log(`[process-template] Arquivo: ${file.name} (${file.size} bytes), page_images: ${pageImagesRaw.length}`)

    const buffer = await file.arrayBuffer()
    const isDocx = file.name.endsWith('.docx')
    const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf')
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name)

    // ── MODE A: We have page images (PDF was converted to images in frontend) ──
    if (pageImagesRaw.length > 0) {
      console.log(`[process-template] Modo Vision: ${pageImagesRaw.length} pagina(s)`)

      // Send first page (or all pages concatenated info) to Claude Vision
      const firstPageData = pageImagesRaw[0]
      const base64 = firstPageData.includes(',')
        ? firstPageData.split(',')[1]
        : firstPageData

      const mediaType = firstPageData.includes('image/png') ? 'image/png' as const : 'image/jpeg' as const

      // Extract fields with coordinates using Vision
      const visionResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: `${VISION_FIELDS_PROMPT}\n\nNome: ${templateName}\nTipo: ${templateType}` },
          ],
        }],
      })

      const visionRaw = visionResponse.content[0]
      if (visionRaw.type !== 'text') {
        return NextResponse.json({ error: 'Resposta inesperada da IA' }, { status: 500 })
      }

      let fields: any[]
      try {
        fields = repairAndParseJson(visionRaw.text)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[process-template] Vision JSON parse falhou:', msg)
        return NextResponse.json({ error: `Erro ao processar resposta da IA: ${msg}` }, { status: 500 })
      }

      // Validate & sanitize
      const validTypes = ['text', 'number', 'date', 'select', 'boolean', 'textarea']
      fields = fields.filter(f => f.field_name && f.label)
      for (const f of fields) {
        if (!validTypes.includes(f.type)) f.type = 'text'
        if (!f.description) f.description = f.label
        if (typeof f.required !== 'boolean') f.required = f.required === 'true' || f.required === true
        // Ensure coordinate fields exist with defaults
        if (typeof f.x_percent !== 'number') f.x_percent = 30
        if (typeof f.y_percent !== 'number') f.y_percent = 10
        if (typeof f.width_percent !== 'number') f.width_percent = 25
        if (typeof f.height_percent !== 'number') f.height_percent = 3
      }

      // If multiple pages, process page 2+ for additional fields
      if (pageImagesRaw.length > 1) {
        for (let p = 1; p < pageImagesRaw.length; p++) {
          try {
            const pageBase64 = pageImagesRaw[p].includes(',')
              ? pageImagesRaw[p].split(',')[1]
              : pageImagesRaw[p]
            const pageMediaType = pageImagesRaw[p].includes('image/png') ? 'image/png' as const : 'image/jpeg' as const

            const pageResponse = await anthropic.messages.create({
              model: 'claude-sonnet-4-6',
              max_tokens: 8192,
              messages: [{
                role: 'user',
                content: [
                  { type: 'image', source: { type: 'base64', media_type: pageMediaType, data: pageBase64 } },
                  { type: 'text', text: `${VISION_FIELDS_PROMPT}\n\nEsta e a pagina ${p + 1} do documento "${templateName}". Campos ja identificados na pagina anterior: ${fields.map(f => f.field_name).join(', ')}. Extraia APENAS os campos NOVOS desta pagina.` },
                ],
              }],
            })

            const pageRaw = pageResponse.content[0]
            if (pageRaw.type === 'text') {
              try {
                const pageFields = repairAndParseJson(pageRaw.text)
                for (const f of pageFields) {
                  if (!validTypes.includes(f.type)) f.type = 'text'
                  if (!f.description) f.description = f.label
                  if (typeof f.required !== 'boolean') f.required = f.required === 'true'
                  f.page = p // Mark which page this field belongs to
                  if (typeof f.x_percent !== 'number') f.x_percent = 30
                  if (typeof f.y_percent !== 'number') f.y_percent = 10
                  if (typeof f.width_percent !== 'number') f.width_percent = 25
                  if (typeof f.height_percent !== 'number') f.height_percent = 3
                }
                fields.push(...pageFields.filter(f => f.field_name && f.label))
              } catch {}
            }
          } catch (pageErr) {
            console.warn(`[process-template] Erro ao processar pagina ${p + 1}:`, pageErr)
          }
        }
      }

      console.log(`[process-template] Vision: ${fields.length} campos com coordenadas`)

      return NextResponse.json({
        fields,
        page_images: pageImagesRaw,
        template_html: null,
      })
    }

    // ── MODE B: Direct file upload (no page images) — image files ──────────
    if (isImage) {
      const base64 = Buffer.from(buffer).toString('base64')
      const mediaType = getMediaType(file.name)
      const dataUrl = `data:${mediaType};base64,${base64}`

      const visionResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: `${VISION_FIELDS_PROMPT}\n\nNome: ${templateName}\nTipo: ${templateType}` },
          ],
        }],
      })

      const visionRaw = visionResponse.content[0]
      if (visionRaw.type !== 'text') return NextResponse.json({ error: 'Resposta inesperada' }, { status: 500 })

      let fields: any[]
      try { fields = repairAndParseJson(visionRaw.text) } catch (e) {
        return NextResponse.json({ error: `Erro parse: ${e}` }, { status: 500 })
      }

      const validTypes = ['text', 'number', 'date', 'select', 'boolean', 'textarea']
      fields = fields.filter(f => f.field_name && f.label)
      for (const f of fields) {
        if (!validTypes.includes(f.type)) f.type = 'text'
        if (!f.description) f.description = f.label
        if (typeof f.required !== 'boolean') f.required = f.required === 'true'
        if (typeof f.x_percent !== 'number') f.x_percent = 30
        if (typeof f.y_percent !== 'number') f.y_percent = 10
        if (typeof f.width_percent !== 'number') f.width_percent = 25
        if (typeof f.height_percent !== 'number') f.height_percent = 3
      }

      return NextResponse.json({
        fields,
        page_images: [dataUrl],
        template_html: null,
      })
    }

    // ── MODE C: DOCX — extract text + HTML ─────────────────────────────────
    if (isDocx) {
      const docxContent = await extractDocxContent(buffer)
      if (docxContent.text.length < 20) {
        return NextResponse.json({ error: 'DOCX vazio.' }, { status: 400 })
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: `${TEXT_FIELDS_PROMPT}\n\nNome: ${templateName}\nTipo: ${templateType}\n\nDOCUMENTO:\n${docxContent.text}`,
        }],
      })

      const raw = response.content[0]
      if (raw.type !== 'text') return NextResponse.json({ error: 'Resposta inesperada' }, { status: 500 })

      let fields: any[]
      try { fields = repairAndParseJson(raw.text) } catch (e) {
        return NextResponse.json({ error: `Erro parse: ${e}` }, { status: 500 })
      }

      const validTypes = ['text', 'number', 'date', 'select', 'boolean', 'textarea']
      fields = fields.filter(f => f.field_name && f.label)
      for (const f of fields) {
        if (!validTypes.includes(f.type)) f.type = 'text'
        if (!f.description) f.description = f.label
        if (typeof f.required !== 'boolean') f.required = f.required === 'true'
      }

      return NextResponse.json({
        fields,
        template_html: docxContent.html || null,
        page_images: null,
      })
    }

    // ── MODE D: PDF without page images (fallback text extraction) ─────────
    if (isPdf) {
      const extractedText = await extractPdfText(buffer)
      if (extractedText.length < 50) {
        return NextResponse.json({ error: 'PDF vazio ou sem texto. Use a versao com pre-visualizacao.' }, { status: 400 })
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: `${TEXT_FIELDS_PROMPT}\n\nNome: ${templateName}\nTipo: ${templateType}\n\nDOCUMENTO:\n${extractedText}`,
        }],
      })

      const raw = response.content[0]
      if (raw.type !== 'text') return NextResponse.json({ error: 'Resposta inesperada' }, { status: 500 })

      let fields: any[]
      try { fields = repairAndParseJson(raw.text) } catch (e) {
        return NextResponse.json({ error: `Erro parse: ${e}` }, { status: 500 })
      }

      const validTypes = ['text', 'number', 'date', 'select', 'boolean', 'textarea']
      fields = fields.filter(f => f.field_name && f.label)
      for (const f of fields) {
        if (!validTypes.includes(f.type)) f.type = 'text'
        if (!f.description) f.description = f.label
        if (typeof f.required !== 'boolean') f.required = f.required === 'true'
      }

      return NextResponse.json({ fields, template_html: null, page_images: null })
    }

    return NextResponse.json({ error: 'Tipo de arquivo nao suportado.' }, { status: 400 })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[process-template] Erro geral:', msg)
    return NextResponse.json({ error: `Erro ao processar documento: ${msg}` }, { status: 500 })
  }
}
