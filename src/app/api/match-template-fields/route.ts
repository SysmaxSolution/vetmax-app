/**
 * Operacao OCR Sniper & Masking — Semantic Matcher.
 *
 * Esta rota substitui o uso da Vision API para coordenadas.
 *
 * - Recebe: lista de label_text + doc_type (laudo/receita/...)
 * - Devolve: mapeamento label → field_name + type + description
 *
 * SEM coordenadas. As coords vem deterministicamente do pdfjs.getTextContent
 * (modulo ocr-sniper.ts).
 *
 * Custo: 1 chamada Claude por documento (vs N chamadas anteriormente).
 */

import { Anthropic } from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { FieldType } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface MatchRequest {
  labels: string[]                                     // textos crus dos rótulos
  doc_type: 'laudo' | 'receita' | 'encaminhamento' | 'termo' | 'exame' | 'outro'
  doc_name?: string                                    // contexto adicional
}

export interface FieldMatch {
  label_original: string       // exatamente como veio na requisição (para juntar com bbox)
  field_name: string           // snake_case (ex: tutor_nome)
  type: FieldType              // text/number/date/select/boolean/textarea
  description: string          // descrição curta (~10 palavras)
  required: boolean
  is_system_field?: boolean    // se é campo "global" tipo CRMV, nome MV (cabeçalho/rodapé)
}

interface MatchResponse {
  matches: FieldMatch[]
  stats: { input_labels: number; matched: number }
}

// ── Prompt focado APENAS em mapeamento semântico ─────────────────────────

const MATCH_PROMPT = `Voce e um especialista em modelos de documentos veterinarios brasileiros.

TAREFA: Receba uma lista de ROTULOS extraidos de um documento (laudo/receita/etc) e
devolva o mapeamento semantico para variaveis do sistema VetMax.

REGRAS:
1. Para cada rotulo, devolva um objeto com:
   - label_original: copia EXATA do rotulo recebido (preserve case e ":" se houver)
   - field_name: snake_case, em PT-BR (ex: "paciente_nome", "tutor_nome", "crmv")
   - type: text | number | date | select | boolean | textarea
   - description: 5-10 palavras descrevendo o campo
   - required: true se for clinicamente essencial (paciente, tutor, data)
   - is_system_field: true APENAS para campos de cabecalho/rodape que se repetem
     em todas as paginas (CRMV, nome do veterinario, cargo, clinica)

2. Convenções de nomenclatura:
   - Paciente/Pet/Animal → "paciente_nome"
   - Tutor/Proprietario/Dono → "tutor_nome"
   - Veterinario/Medico/MV → "veterinario_nome"
   - CRMV/Registro → "crmv"
   - Data/Dia → "data" (type: date)
   - Peso (kg) → "peso" (type: number)
   - Idade → "idade"
   - Frequencia cardiaca/FC → "frequencia_cardiaca" (type: number)
   - Frequencia respiratoria/FR → "frequencia_respiratoria" (type: number)
   - Temperatura → "temperatura" (type: number)
   - Observacoes/Obs/Conclusao → "observacoes" (type: textarea)
   - Diagnostico → "diagnostico" (type: textarea)

3. Se um rotulo nao tiver mapeamento claro (ex: "i.", "ii.", numeracao, palavras
   isoladas sem sentido de campo), ignore — NAO inclua na resposta.

4. NAO INVENTE campos. Mapeie apenas os rotulos recebidos.

FORMATO: APENAS um array JSON. Sem markdown. Sem explicacoes.
[{"label_original":"X","field_name":"x","type":"text","description":"desc","required":false,"is_system_field":false}]`

// ── Helpers ─────────────────────────────────────────────────────────────

function repairAndParseJson(raw: string): FieldMatch[] {
  let str = raw.trim()
  str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  try { return JSON.parse(str) } catch {}
  const arrayMatch = str.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    str = arrayMatch[0]
    try { return JSON.parse(str) } catch {}
  }
  str = str.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}').replace(/'/g, '"')
  try { return JSON.parse(str) } catch {}
  throw new Error('Resposta da IA invalida (JSON nao parseavel)')
}

function sanitizeMatch(m: any): FieldMatch | null {
  if (!m || typeof m.label_original !== 'string' || !m.label_original.trim()) return null
  if (typeof m.field_name !== 'string' || !m.field_name.trim()) return null
  // snake_case enforcement
  const fieldName = m.field_name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  if (!fieldName) return null
  const validTypes: FieldType[] = ['text', 'number', 'date', 'select', 'boolean', 'textarea']
  const type: FieldType = validTypes.includes(m.type) ? m.type : 'text'
  return {
    label_original: m.label_original,
    field_name: fieldName,
    type,
    description: typeof m.description === 'string' ? m.description : m.label_original,
    required: m.required === true,
    is_system_field: m.is_system_field === true,
  }
}

// ── POST handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse<MatchResponse | { error: string }>> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY nao configurada' }, { status: 500 })
    }

    const body = (await req.json()) as MatchRequest
    if (!Array.isArray(body.labels) || body.labels.length === 0) {
      return NextResponse.json({ error: 'labels obrigatorio (array nao vazio)' }, { status: 400 })
    }
    if (body.labels.length > 200) {
      return NextResponse.json({ error: 'Excesso de labels (max 200)' }, { status: 400 })
    }

    // Dedup labels preservando ordem (caso o sniper traga repetidos da página N)
    const uniqueLabels = Array.from(new Set(body.labels.map(l => l.trim()).filter(Boolean)))

    const userPrompt =
      `Tipo de documento: ${body.doc_type}\n` +
      (body.doc_name ? `Nome: ${body.doc_name}\n` : '') +
      `\nROTULOS:\n${uniqueLabels.map((l, i) => `${i + 1}. ${l}`).join('\n')}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `${MATCH_PROMPT}\n\n${userPrompt}`,
      }],
    })

    const raw = response.content[0]
    if (raw.type !== 'text') {
      return NextResponse.json({ error: 'Resposta inesperada da IA' }, { status: 500 })
    }

    let parsed: FieldMatch[]
    try {
      parsed = repairAndParseJson(raw.text)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[match-template-fields] parse error:', msg, 'raw:', raw.text.slice(0, 500))
      return NextResponse.json({ error: 'Erro ao processar resposta da IA: ' + msg }, { status: 500 })
    }

    const matches: FieldMatch[] = []
    for (const m of parsed) {
      const s = sanitizeMatch(m)
      if (s) matches.push(s)
    }

    // Dedup matches por field_name (preserva o primeiro)
    const seen = new Set<string>()
    const deduped: FieldMatch[] = []
    for (const m of matches) {
      if (seen.has(m.field_name)) continue
      seen.add(m.field_name)
      deduped.push(m)
    }

    return NextResponse.json({
      matches: deduped,
      stats: { input_labels: uniqueLabels.length, matched: deduped.length },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[match-template-fields] erro:', msg)
    return NextResponse.json({ error: 'Erro interno: ' + msg }, { status: 500 })
  }
}
