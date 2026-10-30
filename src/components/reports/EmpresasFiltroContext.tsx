'use client'

// Seleção de empresas faturantes dos relatórios financeiros: o hub guarda a
// seleção e cada relatório (a) lê os ids para mandar em `company_ids` e (b)
// desenha o campo de filtro na SUA barra de filtros, junto de "De", "Até" e
// dos demais — e não num canto do cabeçalho. [] = todas as empresas.

import { createContext, useContext } from 'react'
import FiltroDeEmpresas, { type EmpresaOpcao } from '@/components/financial/FiltroDeEmpresas'

export interface EmpresasFiltroValor {
  /** ids selecionados; [] = todas */
  value:    string[]
  empresas: EmpresaOpcao[]
  onChange: (ids: string[]) => void
}

export const EmpresasFiltroContext = createContext<EmpresasFiltroValor>({
  value: [], empresas: [], onChange: () => { /* sem provider: relatório fora do hub */ },
})

/** Ids para mandar à action do relatório. */
export function useEmpresasFiltro(): string[] {
  return useContext(EmpresasFiltroContext).value
}

/** Campo "Empresa" para a barra de filtros do relatório. Some com menos de 2 empresas. */
export function FiltroEmpresasRelatorio({ className }: { className?: string }) {
  const ctx = useContext(EmpresasFiltroContext)
  if (ctx.empresas.length < 2) return null
  return (
    <FiltroDeEmpresas
      empresas={ctx.empresas}
      value={ctx.value}
      onChange={ctx.onChange}
      label="Empresa"
      className={className ?? 'min-w-[180px]'}
    />
  )
}
