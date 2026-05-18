/**
 * POC: rota interna para validar o motor docx-engine.
 *
 * Uso:
 *   GET /api/dev/docx-poc
 *     -> usa o template `Modelo Receituario.docx` em C:\Users\djham\Downloads
 *        e mock embutido com dados da AlmaVet. Retorna o DOCX preenchido
 *        para download.
 *
 *   POST /api/dev/docx-poc
 *     body multipart:
 *       file:   .docx do template
 *       data:   JSON string com chaves canônicas (patient_name, ...)
 *     -> retorna DOCX preenchido para download.
 *
 *   GET /api/dev/docx-poc?scan=1&template=<path>
 *     -> apenas faz scan e devolve JSON com tags detectadas (debug).
 *
 * Esta rota e DEV-ONLY. Em producao deve ser desabilitada via env.
 */

import { NextRequest } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { renderDocxTemplate } from '@/lib/docx/engine'
import { scanDocxTags } from '@/lib/docx/scan-tags'
import { tryConvertDocxToPdf, isGotenbergConfigured } from '@/lib/docx/gotenberg'

const DEFAULT_TEMPLATE = 'C:\\Users\\djham\\Downloads\\Modelo Receituario.docx'

const DEFAULT_MOCK: Record<string, unknown> = {
  professional_name: 'Dra. Lais Helena Camargo',
  professional_role: 'Médica Veterinária',
  professional_crmv: 'CRMV-SP 38.792',

  patient_name: 'Toby',
  tutor_name: 'João da Silva',
  patient_species: 'Canino',
  patient_breed: 'Golden Retriever',
  patient_age: '4 anos',
  patient_weight: '32,5 kg',
  patient_is_male: 'M',
  patient_sex_label: 'Macho',

  clinic_city: 'Ribeirão Preto',
  clinic_uf: 'SP',
  today_dia: '16',
  today_mes: 'MAIO',
  today_ano: '2026',

  medicamento_via_uso: 'USO ORAL',

  medicamento_1_nome: 'Amoxicilina + Clavulanato 250mg',
  medicamento_1_posologia: '1 comprimido a cada 12h, por 10 dias',
  medicamento_1_indicacoes: 'Administrar com alimento. Concluir o tratamento mesmo com melhora dos sintomas.',

  medicamento_2_nome: 'Meloxicam 2mg',
  medicamento_2_posologia: '1 comprimido ao dia, por 5 dias',
  medicamento_2_indicacoes: 'Administrar após a refeição. Suspender em caso de vômito ou apatia.',

  medicamento_3_nome: '',
  medicamento_3_posologia: '',
  medicamento_3_indicacoes: '',

  medicamento_4_nome: '',
  medicamento_4_posologia: '',
  medicamento_4_indicacoes: '',

  medicamento_5_nome: '',
  medicamento_5_posologia: '',
  medicamento_5_indicacoes: '',
}

export async function GET(req: NextRequest): Promise<Response> {
  if (process.env.NODE_ENV === 'production' && !process.env.DOCX_POC_ENABLED) {
    return new Response('disabled in production', { status: 403 })
  }

  const url = new URL(req.url)
  const templatePath = url.searchParams.get('template') || DEFAULT_TEMPLATE
  const scanOnly = url.searchParams.get('scan') === '1'
  // ?format=pdf forca tentativa Gotenberg (com fallback DOCX). Default 'auto':
  // tenta PDF se GOTENBERG_URL configurado, senao entrega DOCX.
  const formatParam = (url.searchParams.get('format') || 'auto').toLowerCase()

  let buf: Buffer
  try {
    buf = await fs.readFile(templatePath)
  } catch (err) {
    return Response.json(
      { error: 'Template nao encontrado', path: templatePath, detail: String(err) },
      { status: 404 },
    )
  }

  if (scanOnly) {
    const result = scanDocxTags(buf)
    return Response.json({
      template: templatePath,
      tags: result.tags,
      unknownLiterals: result.unknownLiterals,
      totalRunsWithText: result.totalRunsWithText,
    })
  }

  try {
    const result = renderDocxTemplate(buf, DEFAULT_MOCK)
    const baseName = 'preview-' + path.basename(templatePath).replace(/\.docx$/i, '')

    const wantsPdf =
      formatParam === 'pdf' || (formatParam === 'auto' && isGotenbergConfigured())

    if (wantsPdf) {
      const conv = await tryConvertDocxToPdf(result.buffer, {
        filename: baseName + '.docx',
      })
      if (conv.ok) {
        return new Response(new Uint8Array(conv.pdf), {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${baseName}.pdf"`,
            'X-Tags-Used': String(result.tagsUsed.length),
            'X-Tags-Missing': String(result.tagsMissing.length),
            'X-Output-Format': 'pdf',
          },
        })
      }
      console.warn('[docx-poc] Gotenberg falhou (' + conv.reason + '): ' + conv.detail + '. Fallback DOCX.')
      return new Response(new Uint8Array(result.buffer), {
        status: 200,
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${baseName}.docx"`,
          'X-Tags-Used': String(result.tagsUsed.length),
          'X-Tags-Missing': String(result.tagsMissing.length),
          'X-Output-Format': 'docx',
          'X-Fallback-Reason': conv.reason,
        },
      })
    }

    return new Response(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${baseName}.docx"`,
        'X-Tags-Used': String(result.tagsUsed.length),
        'X-Tags-Missing': String(result.tagsMissing.length),
        'X-Output-Format': 'docx',
      },
    })
  } catch (err) {
    return Response.json(
      { error: 'Falha na renderizacao', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  if (process.env.NODE_ENV === 'production' && !process.env.DOCX_POC_ENABLED) {
    return new Response('disabled in production', { status: 403 })
  }

  const form = await req.formData()
  const file = form.get('file') as File | null
  const dataRaw = form.get('data') as string | null
  if (!file) {
    return Response.json({ error: 'file ausente' }, { status: 400 })
  }
  let data: Record<string, unknown> = DEFAULT_MOCK
  if (dataRaw) {
    try {
      data = JSON.parse(dataRaw)
    } catch {
      return Response.json({ error: 'data nao e JSON valido' }, { status: 400 })
    }
  }

  const arr = new Uint8Array(await file.arrayBuffer())
  const buf = Buffer.from(arr)
  try {
    const result = renderDocxTemplate(buf, data)
    const filename = 'preview-' + file.name.replace(/\.docx$/i, '') + '.docx'
    return new Response(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Tags-Used': String(result.tagsUsed.length),
        'X-Tags-Missing': String(result.tagsMissing.length),
      },
    })
  } catch (err) {
    return Response.json(
      { error: 'Falha na renderizacao', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
