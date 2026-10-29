// Tipos de `src/lib/actions/companies.ts`.
//
// Ficam aqui porque aquele arquivo é `'use server'` — tipo exportado de módulo
// 'use server' faz a server action responder 500 em runtime sem erro de
// compilação (regra do projeto).

export interface Company {
  id: string
  clinic_id: string
  code: string
  name: string
  legal_name: string | null
  cnpj: string | null
  municipal_registration: string | null
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CompanyInput {
  id?: string
  code: string
  name: string
  legal_name?: string | null
  cnpj?: string | null
  municipal_registration?: string | null
  is_default?: boolean
  is_active?: boolean
}

/**
 * Como as empresas do grupo operam (clinics.flow_config.empresas_modo):
 *  'conjunto' — matriz e filiais dentro de UMA clínica: as empresas são CNPJs
 *               internos (contas bancárias e documentos fiscais por empresa) e
 *               as outras clínicas do grupo não aparecem.
 *  'separado' — cada CNPJ é uma clínica própria; a empresa com CNPJ de outra
 *               clínica liga as duas num grupo (acesso cruzado de usuários).
 */
export type EmpresasModo = 'conjunto' | 'separado'
