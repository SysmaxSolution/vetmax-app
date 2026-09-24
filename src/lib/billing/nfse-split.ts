// Agrupamento puro dos serviços da OS por empresa faturante (NFS-e desmembrada
// por CNPJ — item 1.A). company_id null = nível clínica (fallback). SEM I/O.

export function groupServicesByCompany<T extends { company_id?: string | null }>(
  services: T[],
): Map<string | null, T[]> {
  const groups = new Map<string | null, T[]>()
  for (const s of services) {
    const key = (s.company_id as string | null) ?? null
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(s)
  }
  return groups
}
