// Tags de comportamento do pet.
//
// As PADRÃO vivem em `BehaviorTagsBadges.tsx`; as da CLÍNICA ficam em
// `clinics.behavior_tags` (migration 0517) e são somadas às padrão na tela.
// Módulo puro porque a action que as lê é `'use server'`.

export const BEHAVIOR_TAG_COLORS = ['red', 'orange', 'blue', 'green', 'purple', 'gray'] as const
export type BehaviorTagColor = typeof BEHAVIOR_TAG_COLORS[number]

export interface ClinicBehaviorTag {
  label: string
  color: BehaviorTagColor
}

/** Normaliza o rótulo digitado: sem espaços sobrando, primeira letra maiúscula. */
export function normalizarRotuloDeTag(texto: string): string {
  const t = texto.replace(/\s+/g, ' ').trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}
