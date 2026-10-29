// Filtro por empresa faturante (multi-CNPJ) — regra de atribuição de um título
// a uma empresa e a cláusula PostgREST equivalente. Módulo puro (testável).
//
// Atribuição (a mesma do Extrato do Cliente e do DRE por CNPJ):
//   1. financial_entries.company_id, quando gravado (a OS/serviço aponta a empresa);
//   2. senão, a empresa da conta de liquidação (bank_accounts.company_id);
//   3. senão, a empresa PADRÃO da clínica — título antigo, sem marcação, é da matriz.
// Assim "Todas" = tudo, e a soma por empresa fecha com o total da clínica.

export interface MapaDeEmpresas {
  /** id da empresa padrão (companies.is_default) ou null quando não há */
  padraoId: string | null
  /** bank_account_id → company_id (null = conta sem empresa) */
  contaEmpresa: Map<string, string | null>
}

export interface TituloAtribuivel {
  company_id?: string | null
  settlement_bank_id?: string | null
}

export function empresaDoTitulo(t: TituloAtribuivel, mapa: MapaDeEmpresas): string | null {
  if (t.company_id) return t.company_id
  if (t.settlement_bank_id) {
    const daConta = mapa.contaEmpresa.get(t.settlement_bank_id)
    if (daConta) return daConta
  }
  return mapa.padraoId
}

/** Seleção vazia = sem filtro (todas). */
export function tituloNasEmpresas(t: TituloAtribuivel, ids: string[], mapa: MapaDeEmpresas): boolean {
  if (!ids.length) return true
  const e = empresaDoTitulo(t, mapa)
  return e != null && ids.includes(e)
}

/** Remove ids desconhecidos; vazio ou "todas as conhecidas" vira [] (sem filtro). */
export function normalizarSelecao(ids: string[] | undefined | null, conhecidas: string[]): string[] {
  const set = new Set(conhecidas)
  const sel = [...new Set((ids ?? []).filter(id => set.has(id)))]
  return sel.length === 0 || sel.length === conhecidas.length ? [] : sel
}

/**
 * Cláusula `.or(...)` do PostgREST que reproduz empresaDoTitulo() no banco.
 * Precisa ser no banco porque listEntries corta em 500 linhas: filtrar em
 * memória depois do corte perderia títulos.
 *
 *   company_id.in.(ids)
 *   ,and(company_id.is.null,settlement_bank_id.in.(contas dessas empresas))
 *   ,and(company_id.is.null,settlement_bank_id.is.null)                ← só com a padrão na seleção
 *   ,and(company_id.is.null,settlement_bank_id.in.(contas sem empresa))  ← idem
 *
 * Devolve null quando não há filtro a aplicar.
 */
export function clausulaOrDeEmpresas(ids: string[], mapa: MapaDeEmpresas): string | null {
  if (!ids.length) return null
  const partes: string[] = [`company_id.in.(${ids.join(',')})`]
  const contasDas = [...mapa.contaEmpresa.entries()].filter(([, e]) => e && ids.includes(e)).map(([c]) => c)
  if (contasDas.length) partes.push(`and(company_id.is.null,settlement_bank_id.in.(${contasDas.join(',')}))`)
  if (mapa.padraoId && ids.includes(mapa.padraoId)) {
    partes.push('and(company_id.is.null,settlement_bank_id.is.null)')
    const semEmpresa = [...mapa.contaEmpresa.entries()].filter(([, e]) => !e).map(([c]) => c)
    if (semEmpresa.length) partes.push(`and(company_id.is.null,settlement_bank_id.in.(${semEmpresa.join(',')}))`)
  }
  return partes.join(',')
}

/** Contas bancárias que pertencem às empresas selecionadas (conta sem empresa segue a padrão). */
export function contasDasEmpresas<T extends { id: string; company_id?: string | null }>(
  contas: T[], ids: string[], padraoId: string | null,
): T[] {
  if (!ids.length) return contas
  return contas.filter(c => ids.includes(c.company_id ?? padraoId ?? ''))
}

/** Rótulo curto do filtro para a tela. */
export function rotuloDaSelecao(ids: string[], empresas: { id: string; name: string }[]): string {
  if (!ids.length) return 'Todas as empresas'
  if (ids.length === 1) return empresas.find(e => e.id === ids[0])?.name ?? '1 empresa'
  return `${ids.length} de ${empresas.length} empresas`
}
