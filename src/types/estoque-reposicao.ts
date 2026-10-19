// Tipos das rotinas de reposição e validade do estoque (Fase 4 · item 4.4) e do
// mapa das cirurgias do dia (item 4.3).
//
// Módulo PURO — as actions têm 'use server' e não podem exportar tipo.

import type { SugestaoDeCompra, AlertaDeValidade } from '@/lib/stock/reposicao'

export interface ListaDeCompras {
  /** Janela de consumo observada, em dias. */
  dias_observados: number
  itens: SugestaoDeCompra[]
  totais: {
    itens:      number
    criticos:   number
    atencao:    number
  }
}

export interface PainelDeValidade {
  /** Antecedência do alerta, em dias. */
  janela_dias: number
  hoje:        string
  alertas:     AlertaDeValidade[]
  totais: {
    vencidos:       number
    vencendo:       number
    /** Quantidade total parada em lote vencido — o prejuízo já realizado. */
    quantidade_vencida: number
  }
}

export interface LocalDeEstoque {
  id:          string
  name:        string
  description: string | null
  is_active:   boolean
  /** Quantos itens estão endereçados neste local. */
  itens:       number
}

// ─── 4.3 mapa das cirurgias do dia ──────────────────────────────────────────

export interface LinhaDoMapa {
  id:              string
  /** Hora prevista 'HH:MM', ou null quando a cirurgia não foi agendada. */
  hora:            string | null
  duracao_min:     number | null
  procedure_name:  string
  status:          'preparo' | 'sala' | 'rpa' | 'done' | 'canceled'
  pet_nome:        string | null
  tutor_nome:      string | null
  especie:         string | null
  sala:            string | null
  cirurgiao:       string | null
  anestesista:     string | null
  asa_risk:        string | null
  /** Pendências do checklist pré-anestésico que travam a ida para a sala. */
  bloqueios:       string[]
  /** Pendências que apenas avisam. */
  avisos:          string[]
  /** A cirurgia foi liberada à força, sem cumprir alguma exigência. */
  liberada_a_forca: boolean
  /** Kits aplicados que ninguém conferiu ainda — material possivelmente a devolver. */
  kits_pendentes:  number
}

export interface MapaDoDia {
  data:   string
  linhas: LinhaDoMapa[]
  totais: {
    total:      number
    em_sala:    number
    concluidas: number
    /** Cirurgias com alguma trava do pré-anestésico em aberto. */
    bloqueadas: number
  }
}

// ─── 4.4 endereçamento em lote ──────────────────────────────────────────────

export interface ItemEnderecavel {
  id:                string
  name:              string
  unit:              string | null
  quantity:          number
  category:          string
  location_id:       string | null
  location_name:     string | null
  shelf_code:        string | null
  lead_time_days:    number | null
  coverage_days:     number | null
  purchase_multiple: number | null
  purchase_minimum:  number | null
  returnable:        boolean
  is_controlled:     boolean
}
