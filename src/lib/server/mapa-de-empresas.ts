// Carrega, para uma clínica, o que o filtro por empresa faturante precisa:
// empresa padrão, conta bancária → empresa, nomes e ids ativos.
// Usado pelas actions do financeiro e dos relatórios (src/lib/financial/empresas-filtro.ts).

import type { SupabaseClient } from '@supabase/supabase-js'
import { clausulaOrDeEmpresas, normalizarSelecao, type MapaDeEmpresas } from '@/lib/financial/empresas-filtro'

export interface MapaDeEmpresasDaClinica extends MapaDeEmpresas {
  /** ids das empresas ativas (ordem do código) */
  ativas: string[]
  nomes: Map<string, string>
}

export async function carregarMapaDeEmpresas(admin: SupabaseClient, clinicId: string): Promise<MapaDeEmpresasDaClinica> {
  const [{ data: comps }, { data: accts }] = await Promise.all([
    admin.from('companies').select('id, name, is_default, is_active').eq('clinic_id', clinicId).order('code', { ascending: true }),
    admin.from('bank_accounts').select('id, company_id').eq('clinic_id', clinicId),
  ])
  const empresas = (comps ?? []) as Array<{ id: string; name: string; is_default: boolean; is_active: boolean }>
  const contas   = (accts ?? []) as Array<{ id: string; company_id: string | null }>
  return {
    padraoId:     empresas.find(c => c.is_default)?.id ?? null,
    contaEmpresa: new Map(contas.map(c => [c.id, c.company_id ?? null])),
    ativas:       empresas.filter(c => c.is_active).map(c => c.id),
    nomes:        new Map(empresas.map(c => [c.id, c.name])),
  }
}

/**
 * Cláusula `.or()` pronta para a seleção pedida pela tela, ou null quando não
 * há o que filtrar (sem seleção, seleção = todas, ou clínica sem empresas).
 */
export async function clausulaDeEmpresas(
  admin: SupabaseClient, clinicId: string, companyIds: string[] | undefined | null,
): Promise<string | null> {
  if (!companyIds?.length) return null
  const mapa = await carregarMapaDeEmpresas(admin, clinicId)
  const sel = normalizarSelecao(companyIds, mapa.ativas)
  return clausulaOrDeEmpresas(sel, mapa)
}
