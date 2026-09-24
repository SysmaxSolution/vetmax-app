// Módulo PURO (sem 'use server'): ordenação de filas por urgência (Sprint Animais).
// Emergência "fura a fila": vermelho (0) > amarelo (1) > verde/nulo (2).
// Sem urgência (clínicas sem a flag) todos empatam em 2 → ordena por horário de
// chegada, igual ao comportamento anterior. Reutilizado em recepção, vet e agenda.

export function urgencyRank(u: string | null | undefined): number {
  return u === 'red' ? 0 : u === 'yellow' ? 1 : 2
}

export function byUrgencyThenTime<T extends { urgency?: string | null; created_at: string }>(a: T, b: T): number {
  const d = urgencyRank(a.urgency) - urgencyRank(b.urgency)
  return d !== 0 ? d : a.created_at.localeCompare(b.created_at)
}
