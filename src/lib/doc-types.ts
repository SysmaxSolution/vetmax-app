// Módulo PURO (sem 'use server'): constantes e tipos de numeração de documentos.
// Não pode ficar no arquivo de server action — uma 'use server' só exporta
// funções async; exportar um valor (DOC_TYPES) de lá quebra as actions da rota.

// Tipos de documento oferecidos na configuração (rótulos amigáveis na UI).
export const DOC_TYPES: { key: string; label: string }[] = [
  { key: 'os',        label: 'Ordem de Serviço (nº de atendimento)' },
  { key: 'rps',       label: 'RPS (NFS-e)' },
  { key: 'nfse',      label: 'Número da NFS-e' },
  { key: 'orcamento', label: 'Orçamento' },
  { key: 'recibo',    label: 'Recibo' },
]

export interface DocumentSequence {
  id: string
  clinic_id: string
  company_id: string | null
  doc_type: string
  prefix: string
  next_number: number
  padding: number
  is_active: boolean
  company_name: string | null  // resolvido para exibição (null = Geral do grupo)
}

export interface CompanyLite {
  id: string
  code: string
  name: string
}
