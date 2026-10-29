// Tipos do fechamento de convênio (Fase 1 · item 1.9).
//
// Módulo PURO — as actions têm 'use server' e não podem exportar tipo.

import type { CicloRepasse } from '@/lib/insurance/ciclo'
import type { ModoCopay } from '@/lib/insurance/copay'

/** Uma OS do período, com o que o tutor pagou e o que o convênio deve. */
export interface LinhaFechamento {
  consultation_id: string
  os_number:       string | null
  data:            string
  pet_nome:        string | null
  tutor_nome:      string | null
  /** Quantos itens conveniados a OS tem. */
  itens:           number
  /** Soma dos totais de convênio dos itens. */
  total:           number
  /** Soma do que o tutor pagou (coparticipação / valor intermediário). */
  copay:           number
  /** Soma do que o convênio deve repassar. */
  repass:          number
  /** TRUE quando alguma linha ficou sem split definido — repasse incerto. */
  split_pendente:  boolean
}

export interface FechamentoConvenio {
  provider_id:   string
  provider_name: string
  receipt_mode:  string
  ciclo:         CicloRepasse
  copay_mode:    ModoCopay
  /** Descrição em uma linha da regra vigente, para o cabeçalho do relatório. */
  regra:         string
  periodo: {
    inicio: string
    fim:    string
    rotulo: string
  }
  linhas: LinhaFechamento[]
  totais: {
    os:              number
    itens:           number
    total:           number
    copay:           number
    repass:          number
    /** Quantas OS têm item sem split definido. */
    com_pendencia:   number
  }
  /** Remessas (demonstrativos) já importadas que cruzam este período. */
  remessas: Array<{
    id:              string
    numero:          string
    period_start:    string
    period_end:      string
    status:          string
    total_informado: number
  }>
  /** Diferença entre o que apuramos e o que o convênio informou nas remessas do período. */
  divergencia: number | null
}
