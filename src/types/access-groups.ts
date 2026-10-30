// Tipos dos grupos de acesso.
//
// Ficam fora de `src/lib/actions/access-groups.ts` porque aquele arquivo é
// 'use server': tipo exportado de módulo 'use server' faz a action responder
// 500 em runtime, sem erro de compilação (regra do projeto).

import type { AccessAction } from '@/config/access-catalog'

/** Um direito detalhado do molde: "cashier.reports" + "view" + liberado? */
export interface AccessGroupRight {
  module:  string
  action:  AccessAction
  allowed: boolean
}

export interface AccessGroup {
  id:          string
  name:        string
  description: string | null
  /** Módulos visíveis do grupo (chaves de ACCESS_CATALOG). */
  modules:     string[]
  rights:      AccessGroupRight[]
  created_at:  string
  /** Quantas pessoas estão neste grupo hoje. */
  pessoas:     number
}

export interface AccessGroupInput {
  /** Ausente = criar; presente = atualizar. */
  id?:          string
  name:         string
  description?: string | null
  modules:      string[]
  rights:       AccessGroupRight[]
}

/** Resultado de aplicar um grupo a alguém, para a tela dizer o que mudou. */
export interface AplicacaoDeGrupo {
  modulos:  number
  direitos: number
  /** Nome do grupo aplicado, ou null quando a pessoa saiu do grupo. */
  grupo:    string | null
}
