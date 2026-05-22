/**
 * Núcleo (server-only, sem 'use server') do extrator de prescrições da
 * anamnese. Separado da server action (`@/lib/actions/anamnese-extraction`)
 * para que múltiplos contextos (server action, route handler, resolver
 * server-side) possam chamar a função sem o overhead de serialização
 * de actions e sem o bundle especial que o Next 15 gera para módulos
 * marcados `'use server'`.
 *
 * Este arquivo NÃO deve ser importado por client components — usa o
 * Anthropic SDK e a chave privada.
 */

// NÃO importar em client components — usa Anthropic SDK + chave privada.
// Convenção respeitada pelo diretório `src/lib/ai/`.
import Anthropic from '@anthropic-ai/sdk'
import type { ParsedPrescription } from '@/lib/canva/parse-medicamentos'
import { parseMedicamentosText } from '@/lib/canva/parse-medicamentos'

export interface ExtractedAnamneseEntities {
  prescriptions: ParsedPrescription[]
  /** Confiança subjetiva da IA — útil para sinalizar revisão no UI. */
  confidence:     'high' | 'medium' | 'low'
  /** Indica se o pipeline usou IA ou caiu no parser determinístico
   *  (sem ANTHROPIC_API_KEY ou texto curto). */
  source:         'ai' | 'parser' | 'empty'
}

const SYSTEM_PROMPT = `Você é um extrator clínico veterinário. Sua única tarefa é ler relatos clínicos em PT-BR (anamnese, notas do MV ou transcrição de áudio) e extrair as PRESCRIÇÕES MEDICAMENTOSAS mencionadas, devolvendo um JSON estruturado que segue a forma canônica usada pelo motor de laudos da clínica.

REGRAS INQUEBRÁVEIS:
1. Extraia APENAS medicações que o MV explicitamente prescreveu ("receitarei", "vou prescrever", "indicar", "manter", "iniciar tratamento com", etc.). NÃO extraia medicações apenas mencionadas como histórico/uso prévio.
2. NUNCA INVENTE dose, frequência ou duração que não estejam no texto. Se ausente, use null.
3. Se a frequência vier em formato livre ("de 8 em 8 horas") converta para o padrão clínico "a cada 8h".
4. Se a duração vier em texto ("por uma semana") converta para número de dias ("7").
5. Use os enums abaixo para route_of_administration:
   - oral (default — VO, via oral, comprimido, gotas, xarope)
   - topical (uso tópico, pomada, creme)
   - intravenous (IV, EV, endovenoso)
   - intramuscular (IM)
   - subcutaneous (SC)
6. prescription_type:
   - controlled — quando MV diz "controlado", "tarja preta", "receituário azul", ou for Tramadol/Diazepam/morfina/codeína/fentanil/cetamina.
   - manipulated — quando MV diz "manipulado", "farmácia de manipulação".
   - common — padrão.
7. is_controlled = true sempre que prescription_type = 'controlled'.

FORMATO DE SAÍDA — APENAS JSON, sem markdown, sem prosa:
{
  "prescriptions": [
    {
      "medication": "Dipirona 20mg/mL",
      "dose": "0,5 mL",
      "frequency": "a cada 8h",
      "duration_days": "5",
      "route_of_administration": "oral",
      "prescription_type": "common",
      "is_controlled": false,
      "orientation": "Administrar após alimentação"
    }
  ],
  "confidence": "high"
}

confidence:
  - "high"   = todas as prescrições têm medicação + dose + frequência + duração explícitas
  - "medium" = pelo menos uma prescrição tem campo nulo importante
  - "low"    = texto ambíguo, prescrições inferidas com baixa certeza

Se NÃO houver nenhuma prescrição, retorne {"prescriptions": [], "confidence": "high"}.`

const PRESCRIPTION_INTENT_RE =
  /\b(receit(o|ar(ei)?|a)|prescr(everei|ever|i[cç][aã]o|ito)|indic(o|ar(ei)?|a)|administrar|aplicar|tratamento com|manter (com )?|iniciar (com )?|usar)\b/i

function looksLikePrescription(text: string): boolean {
  if (!text || text.length < 8) return false
  return PRESCRIPTION_INTENT_RE.test(text)
}

function safeTruncate(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const lastDot = cut.lastIndexOf('.')
  return lastDot > max - 200 ? cut.slice(0, lastDot + 1) : cut
}

function optString(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined
  const s = String(v).trim()
  return s ? s : undefined
}

function normalizePrescription(raw: unknown): ParsedPrescription | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  const medication = String(r.medication ?? r.name ?? r.drug ?? '').trim()
  if (!medication) return null

  const route = (() => {
    const v = String(r.route_of_administration ?? r.route ?? 'oral').toLowerCase()
    if (['oral', 'topical', 'intravenous', 'intramuscular', 'subcutaneous'].includes(v)) return v
    if (/oral|vo/.test(v)) return 'oral'
    if (/topical|topic|topi/.test(v)) return 'topical'
    if (/iv|endoven|intraven/.test(v)) return 'intravenous'
    if (/im|intramus/.test(v)) return 'intramuscular'
    if (/sc|subcut/.test(v)) return 'subcutaneous'
    return 'oral'
  })()

  const type = (() => {
    const v = String(r.prescription_type ?? 'common').toLowerCase()
    if (['common', 'controlled', 'manipulated'].includes(v)) {
      return v as ParsedPrescription['prescription_type']
    }
    if (/controlad|control/.test(v))   return 'controlled'
    if (/manipulad|manipulat/.test(v)) return 'manipulated'
    return 'common'
  })()

  const isControlled = Boolean(r.is_controlled) || type === 'controlled'

  return {
    medication,
    dose:                    optString(r.dose),
    frequency:               optString(r.frequency),
    duration_days:           optString(r.duration_days ?? r.duration),
    route_of_administration: route,
    prescription_type:       type,
    is_controlled:           isControlled,
    orientation:             optString(r.orientation ?? r.notes ?? r.observation),
  }
}

/**
 * Função core — sem autenticação, sem 'use server'. Importável de
 * qualquer ponto server-side (route handlers, server pages, server
 * actions, resolvers). Caller é responsável por autenticar/autorizar.
 */
export async function extractEntitiesFromAnamneseCore(
  text: string | null | undefined,
): Promise<ExtractedAnamneseEntities> {
  const raw = (text ?? '').trim()
  if (raw.length === 0) {
    return { prescriptions: [], confidence: 'high', source: 'empty' }
  }

  // Parser determinístico primeiro — quando o vet colou linha-a-linha
  // bem formatada, evita chamada custosa à IA.
  const parsed = parseMedicamentosText(raw)
  if (parsed.length > 0) {
    return { prescriptions: parsed, confidence: 'high', source: 'parser' }
  }

  if (!process.env.ANTHROPIC_API_KEY || !looksLikePrescription(raw)) {
    return { prescriptions: [], confidence: 'high', source: 'empty' }
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Texto clínico para extração:\n"""\n${safeTruncate(raw, 6000)}\n"""\n\nDevolva apenas o JSON.`,
      }],
    })

    const txt = response.content[0].type === 'text' ? response.content[0].text : ''
    const match = txt.match(/\{[\s\S]*\}/)
    if (!match) return { prescriptions: [], confidence: 'low', source: 'ai' }

    const json = JSON.parse(match[0]) as {
      prescriptions?: unknown[]
      confidence?:    string
    }
    const list = Array.isArray(json.prescriptions) ? json.prescriptions : []
    const prescriptions: ParsedPrescription[] = list
      .map(normalizePrescription)
      .filter((p): p is ParsedPrescription => p !== null)

    const confidence: ExtractedAnamneseEntities['confidence'] =
      json.confidence === 'high' || json.confidence === 'medium' || json.confidence === 'low'
        ? json.confidence
        : 'medium'

    return { prescriptions, confidence, source: 'ai' }
  } catch (e) {
    console.error('[extractEntitiesFromAnamneseCore] failed:', e)
    return { prescriptions: [], confidence: 'low', source: 'ai' }
  }
}
