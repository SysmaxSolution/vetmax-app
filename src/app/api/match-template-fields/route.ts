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
  field_name: string           // snake_case (ex: tutor_nome ou custom_fracao_ejecao)
  type: FieldType              // text/number/date/select/boolean/textarea
  description: string          // descrição curta (~10 palavras)
  required: boolean
  is_system_field?: boolean    // se é campo "global" tipo CRMV, nome MV (cabeçalho/rodapé)
  is_custom?: boolean          // PM-2: campo CUSTOMIZADO (parâmetro clínico específico,
                               // não tem mapeamento canônico no sistema)
}

interface MatchResponse {
  matches: FieldMatch[]
  stats: { input_labels: number; matched: number }
}

// ── Prompt focado APENAS em mapeamento semântico ─────────────────────────

const MATCH_PROMPT = `Voce e um especialista em modelos de documentos veterinarios brasileiros.

TAREFA: Receba uma lista de ROTULOS extraidos de um documento e devolva o
mapeamento semantico em DUAS CATEGORIAS — campos CANONICOS do sistema OU
campos CUSTOMIZADOS (parametros clinicos especificos).

═══════════════════════════════════════════════════════════════════════════
CATEGORIA 1 — CAMPOS CANONICOS (is_custom: false)
═══════════════════════════════════════════════════════════════════════════

APENAS estes rotulos mapeiam para variaveis canonicas do sistema:

  Cadastro do animal:
    - Paciente / Pet / Animal / Nome do animal → "paciente_nome"
    - Especie                                 → "especie"
    - Raca                                    → "raca"
    - Idade                                   → "idade"
    - Sexo                                    → "sexo" (select)
    - Peso (kg)                               → "peso" (number)
    - Pelagem / Cor                           → "pelagem"

  Cadastro do tutor:
    - Tutor / Proprietario / Dono / Responsavel → "tutor_nome"
    - CPF                                       → "tutor_cpf"
    - Telefone / Celular                        → "tutor_telefone"
    - Email                                     → "tutor_email"
    - Endereco                                  → "tutor_endereco"

  Profissional (is_system_field: true — repete em todas as paginas):
    - Veterinario / Medico / MV → "veterinario_nome"
    - CRMV / Registro           → "crmv"
    - Cargo / Especialidade     → "veterinario_cargo"
    - Clinica / Hospital        → "clinica_nome"

  Documento:
    - Data / Dia do exame → "data" (date)
    - Hora                → "hora"

  Sinais vitais e descricao clinica geral:
    - Frequencia cardiaca / FC      → "frequencia_cardiaca" (number)
    - Frequencia respiratoria / FR  → "frequencia_respiratoria" (number)
    - Temperatura                   → "temperatura" (number)
    - Pressao arterial / PA         → "pressao_arterial"
    - Anamnese / Queixa / Historico → "anamnese" (textarea)
    - Observacoes / Obs             → "observacoes" (textarea)
    - Diagnostico / Conclusao       → "diagnostico" (textarea)
    - Tratamento / Prescricao       → "tratamento" (textarea)

═══════════════════════════════════════════════════════════════════════════
CATEGORIA 2 — CAMPOS CUSTOMIZADOS (is_custom: true)  ←  REGRA CRITICA
═══════════════════════════════════════════════════════════════════════════

Se o rotulo for um PARAMETRO CLINICO HIPERESPECIFICO (medida de exame,
estrutura anatomica detalhada, parametro de eletrocardiograma/ecocardiograma,
qualquer coisa que nao tenha equivalente DIRETO na lista canonica acima):

  → field_name: "custom_<nome_normalizado>" (snake_case, sem acentos)
  → type: number quando claramente numerico, text caso contrario
  → is_custom: true

EXEMPLOS DE CAMPOS QUE DEVEM SER CUSTOMIZADOS (NAO mapear para canonicos):

  - "Mitral:"                      → custom_mitral
  - "Aortica:" / "Aorta:"          → custom_aorta
  - "Tricuspide:"                  → custom_tricuspide
  - "Pulmonar:"                    → custom_pulmonar
  - "Septo Diastole:"              → custom_septo_diastole
  - "Parede Diastole:"             → custom_parede_diastole
  - "Diametro Sistolico:"          → custom_diametro_sistolico (number)
  - "Diametro Diastolico:"         → custom_diametro_diastolico (number)
  - "Diametro normalizado VE:"     → custom_diametro_normalizado_ve (number)
  - "Fracao de Ejecao" / "FE"      → custom_fracao_ejecao (number)
  - "Fracao de Encurtamento" / FS  → custom_fracao_encurtamento (number)
  - "Atrio Esquerdo" / AE          → custom_atrio_esquerdo (number)
  - "Ventriculo Esquerdo" / VE     → custom_ventriculo_esquerdo
  - "Onda E" / "Onda A"            → custom_onda_e, custom_onda_a
  - "Pericardio:"                  → custom_pericardio
  - "Ritmo:"                       → custom_ritmo
  - "Condicao do paciente"         → custom_condicao_paciente

═══════════════════════════════════════════════════════════════════════════
REGRAS GERAIS
═══════════════════════════════════════════════════════════════════════════

1. Para cada rotulo, devolva um objeto com:
   - label_original: copia EXATA do rotulo recebido
   - field_name: snake_case (canonico OU custom_*)
   - type: text | number | date | select | boolean | textarea
   - description: 5-10 palavras descrevendo o campo
   - required: true APENAS se for clinicamente essencial (paciente, tutor, data)
   - is_system_field: true APENAS para campos do header/footer profissional
   - is_custom: true para parametros clinicos especificos (Categoria 2)

2. NUNCA force um rotulo clinico-especifico em um canonico.
   ERRADO: "Mitral:" → "raca" (alucinacao!)
   CERTO:  "Mitral:" → "custom_mitral" (is_custom: true)

3. Se o rotulo for puro lixo (numeracao "i.", "ii.", separadores), IGNORE.

FORMATO: APENAS um array JSON. Sem markdown. Sem explicacoes.
[{"label_original":"X","field_name":"x","type":"text","description":"desc","required":false,"is_system_field":false,"is_custom":false}]`

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
  // PM-2: marca custom automaticamente se field_name comeca com "custom_"
  // (defesa em profundidade caso a IA esqueca de setar is_custom: true)
  const isCustom = m.is_custom === true || fieldName.startsWith('custom_')
  return {
    label_original: m.label_original,
    field_name: fieldName,
    type,
    description: typeof m.description === 'string' ? m.description : m.label_original,
    required: m.required === true,
    is_system_field: m.is_system_field === true,
    is_custom: isCustom,
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
