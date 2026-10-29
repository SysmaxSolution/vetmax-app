'use client'

// Seleção de empresas faturantes escolhida no hub de Relatórios, lida pelos
// relatórios financeiros (cada um repassa `company_ids` à sua action).
// [] = todas as empresas.

import { createContext, useContext } from 'react'

export const EmpresasFiltroContext = createContext<string[]>([])

export function useEmpresasFiltro(): string[] {
  return useContext(EmpresasFiltroContext)
}
