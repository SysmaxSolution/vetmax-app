'use server'

/**
 * IC-23: Conversao server-side de DOCX para HTML via mammoth.
 *
 * Mammoth preserva a estrutura semantica do documento (paragrafos,
 * estilos, imagens embutidas como data URLs) sem dependencia de
 * libreoffice/puppeteer pesados. O HTML resultante eh renderizado no
 * client via jsPDF.html() para virar PDF, que entra no pipeline normal
 * (canvas-eraser + sniper + placeholder detection IC-22).
 */

import { createClient } from '@/lib/supabase/server'

export interface DocxConvertResult {
  html: string                // HTML pronto para render
  raw_text: string             // texto plano (debug/log)
  placeholders_detected: string[]  // placeholders nominais encontrados
  has_images: boolean
  messages: string[]           // warnings do mammoth (estilos nao reconhecidos)
}

/**
 * Recebe um DOCX (FormData com 'file') e devolve o HTML + texto extraido.
 *
 * Mammoth eh um pacote NODE — roda no server. O HTML retornado eh
 * SELF-CONTAINED (imagens viram data URLs base64).
 */
export async function convertDocxToHtml(
  formData: FormData,
): Promise<DocxConvertResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Nao autenticado' }

  const file = formData.get('file') as File | null
  if (!file) return { error: 'Arquivo nao fornecido' }
  if (!file.name.toLowerCase().endsWith('.docx')) {
    return { error: 'Arquivo deve ser .docx' }
  }
  if (file.size > 25 * 1024 * 1024) {
    return { error: 'Arquivo excede 25MB' }
  }

  try {
    const arrayBuf = await file.arrayBuffer()
    const buf = Buffer.from(arrayBuf)
    const mammoth = require('mammoth')

    // Em paralelo: extrai HTML completo + texto cru
    const [htmlResult, rawResult] = await Promise.all([
      mammoth.convertToHtml(
        { buffer: buf },
        {
          // Preserva imagens como data URLs (sem precisar de storage externo)
          convertImage: mammoth.images.imgElement((image: any) =>
            image.read('base64').then((data: string) => ({
              src: `data:${image.contentType};base64,${data}`,
            }))
          ),
          // Manter estilos basicos
          styleMap: [
            "p[style-name='Title'] => h1.title:fresh",
            "p[style-name='Heading 1'] => h2:fresh",
            "p[style-name='Heading 2'] => h3:fresh",
            "b => strong",
            "i => em",
          ],
        }
      ),
      mammoth.extractRawText({ buffer: buf }),
    ])

    const html = htmlResult.value as string
    const rawText = (rawResult.value as string) || ''

    // Detecta placeholders nominais comuns
    const placeholderPatterns = [
      /Custom_[a-zA-Z_çãéíóúáàâ]+\d*/gi,
      /Code_[a-zA-Z_]+/gi,
      /Patient_[a-zA-Z_]+/gi,
      /\b(?:Medicamento|medicamento)\d+(?:_[a-z]+)?/g,
      /\b(?:Cidade|sigla|Dia|mes|ano)_[a-z_]+/gi,
      /\b(?:especie|raca|patient)\b/gi,
    ]
    const placeholdersSet = new Set<string>()
    for (const re of placeholderPatterns) {
      for (const m of rawText.matchAll(re)) placeholdersSet.add(m[0])
    }

    return {
      html,
      raw_text: rawText,
      placeholders_detected: Array.from(placeholdersSet).sort(),
      has_images: /<img\b/i.test(html),
      messages: (htmlResult.messages ?? []).map((m: any) => m.message),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[convertDocxToHtml] erro:', msg)
    return { error: 'Falha ao converter DOCX: ' + msg }
  }
}
