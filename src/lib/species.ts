// Tradução central de espécies (enum do banco em inglês → rótulo PT-BR).
// Vários componentes mantêm mapas locais; para novos usos, importe daqui.
export const SPECIES_LABELS: Record<string, string> = {
  dog: 'Canino', cat: 'Felino', bird: 'Ave', rabbit: 'Coelho',
  rodent: 'Roedor', reptile: 'Réptil', fish: 'Peixe', exotic: 'Exótico',
}

export function speciesLabel(species?: string | null): string {
  if (!species) return '—'
  return SPECIES_LABELS[species] ?? species
}
