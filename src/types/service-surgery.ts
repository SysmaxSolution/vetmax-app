// Configuração cirúrgica de um SERVIÇO do catálogo (migration 0518).
//
// Módulo puro: a action que lê/grava é `'use server'`.

export interface ServiceSurgeryConfig {
  /** Checagens pré-operatórias exigidas por este serviço, na ordem da ficha. */
  preop_checklist: string[]
  /** Kit cirúrgico consumido por padrão (service_kits.id). */
  default_kit_id: string | null
}

export interface SurgicalServiceOption extends ServiceSurgeryConfig {
  id: string
  name: string
  default_kit_name: string | null
}

/** Uma checagem por linha; linhas vazias e repetidas não contam. */
export function linhasParaChecklist(texto: string): string[] {
  const vistas = new Set<string>()
  const out: string[] = []
  for (const linha of texto.split('\n')) {
    const t = linha.replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!t) continue
    const chave = t.toLowerCase()
    if (vistas.has(chave)) continue
    vistas.add(chave); out.push(t)
  }
  return out
}
