'use server'

import type { GroomingStatus } from './grooming'

export type GroomingIntent = {
  action:             'MOVE_AND_SAVE' | 'SAVE_ONLY'
  new_status:         'RECEIVED' | 'IN_BATH' | 'IN_GROOMING' | 'READY_FOR_PICKUP' | 'DELIVERED' | null
  extracted_services: string[]
  extracted_products: string[]
  observation_text:   string
}

export async function parseGroomingIntent(
  transcript:    string,
  currentStatus: GroomingStatus,
): Promise<GroomingIntent | { error: string }> {
  if (!transcript.trim()) return { error: 'Transcrição vazia.' }

  const prompt = `Você é um assistente de petshop veterinário. Analise o relato oral do tosador/banhista, determine a intenção e extraia dados estruturados.

Transcrição: "${transcript}"
Status atual do card no Kanban: "${currentStatus}"

RETORNE APENAS este JSON (sem markdown, sem texto extra):
{
  "action": "MOVE_AND_SAVE" | "SAVE_ONLY",
  "new_status": "RECEIVED" | "IN_BATH" | "IN_GROOMING" | "READY_FOR_PICKUP" | "DELIVERED" | null,
  "extracted_services": [],
  "extracted_products": [],
  "observation_text": ""
}

Regras de mapeamento de status:
- Pronto para buscar, terminou o serviço, dono pode vir → "READY_FOR_PICKUP", action "MOVE_AND_SAVE"
- Início do banho, animal entrou no banho → "IN_BATH", action "MOVE_AND_SAVE"
- Início da tosa, animal entrou para tosar → "IN_GROOMING", action "MOVE_AND_SAVE"
- Entregue, dono levou o animal → "DELIVERED", action "MOVE_AND_SAVE"
- Apenas relato de evolução sem mudança de etapa → "SAVE_ONLY", new_status null

Regras para "extracted_services":
- Liste apenas serviços explicitamente mencionados no relato.
- Use os nomes canônicos desta lista quando possível: Banho Simples, Banho Completo, Tosa Higiênica, Tosa Completa, Tosa na Tesoura, Tosa Bebê, Hidratação, Escovação, Limpeza de Ouvidos, Corte de Unhas, Secagem Completa, Perfume, Bandana / Laço.
- Se não houver serviço mencionado, retorne array vazio [].

Regras para "extracted_products":
- Liste produtos, shampoos, condicionadores, medicamentos tópicos ou itens mencionados.
- Se não houver produto mencionado, retorne array vazio [].

Regras para "observation_text":
- Remova palavras de ativação ("assistente", "vet max", "finalizar", "pode salvar", "gravar evolução").
- Mantenha o relato clínico completo, em linguagem técnica e fluida.`

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic()

    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages:   [{ role: 'user', content: prompt }],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const match = rawText.match(/\{[\s\S]*\}/)
    if (!match) return { error: 'IA não retornou JSON válido.' }
    const parsed = JSON.parse(match[0])
    // Fallback seguro: garante que arrays nunca venham undefined
    return {
      ...parsed,
      extracted_services: Array.isArray(parsed.extracted_services) ? parsed.extracted_services : [],
      extracted_products: Array.isArray(parsed.extracted_products) ? parsed.extracted_products : [],
      observation_text:   typeof parsed.observation_text === 'string'  ? parsed.observation_text  : '',
    }
  } catch (err) {
    console.error('Erro no intent parsing:', err)
    return { error: 'Erro ao processar intenção.' }
  }
}
