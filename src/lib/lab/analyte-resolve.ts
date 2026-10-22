// Resolução PURA do analito do aparelho → analito do catálogo, via de-para.
// Casa primeiro por código (OBX-3), depois por nome (normalizado). Testável.

export interface AnalyteMapping {
  analyte_id: string
  device_code: string | null
  device_name: string | null
  lab_agent_id: string | null
}

/** Normaliza código/nome p/ comparação tolerante (maiúsculas, sem espaços/acentos/símbolos). */
export function normKey(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * Resolve o analyte_id do catálogo para um resultado do aparelho.
 * Preferência: mapeamento do próprio aparelho > mapeamento geral da clínica;
 * dentro disso, casamento por código > por nome. Retorna null se não mapeado.
 */
export function resolveAnalyte(
  deviceCode: string | null | undefined,
  deviceName: string | null | undefined,
  mappings: AnalyteMapping[],
  labAgentId?: string | null,
): string | null {
  const code = normKey(deviceCode)
  const name = normKey(deviceName)
  if (!code && !name) return null

  const scored = mappings.map(m => {
    const agentMatch = m.lab_agent_id && labAgentId && m.lab_agent_id === labAgentId ? 2 : (m.lab_agent_id ? -1 : 0)
    if (agentMatch < 0) return null // mapeamento de outro aparelho — ignora
    const byCode = code && normKey(m.device_code) === code ? 4 : 0
    const byName = name && normKey(m.device_name) === name ? 2 : 0
    if (!byCode && !byName) return null
    return { id: m.analyte_id, score: agentMatch + byCode + byName }
  }).filter(Boolean) as { id: string; score: number }[]

  if (!scored.length) return null
  scored.sort((a, b) => b.score - a.score)
  return scored[0].id
}
