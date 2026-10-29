// Regras de leitura da baixa de estoque de uma aplicação (medicamento ou insumo
// usado no animal). Módulo PURO de propósito: nada de 'use server' aqui, porque
// tipo re-exportado de arquivo com 'use server' derruba as server actions em
// produção. As actions importam daqui.
//
// Clínica Animais · Fase 1 · item 1.7.

/** Estado da baixa, igual ao CHECK de `applied_medications.stock_status` (0505). */
export type StatusBaixaEstoque =
  | 'baixado'          // saiu do estoque normalmente
  | 'insuficiente'     // saiu, mas o saldo ficou negativo — vai para conferência
  | 'nao_reconhecido'  // texto livre sem item cadastrado — vai para conferência
  | 'sem_baixa'        // registro clínico sem efeito de estoque (ex.: medicação do tutor)
  | 'devolvido'        // a baixa foi revertida

/** O que a RPC `rpc_apply_stock_consumption` devolve, na parte que interessa aqui. */
export interface ResultadoConsumo {
  matched:                 boolean
  quantity_after:          number | null
  below_minimum:           boolean
  requires_reconciliation: boolean
}

export interface ResumoBaixa {
  status:       StatusBaixaEstoque
  /** Texto pronto para a tela de quem aplicou — nunca silencioso. */
  mensagem:     string
  /** Como pintar: ok = verde, atencao = âmbar, alerta = vermelho. */
  tom:          'ok' | 'atencao' | 'alerta'
  saldo_depois: number | null
}

/** Formata quantidade sem zeros inúteis: 8.000 → "8", 0.500 → "0,5". */
export function formatarQuantidade(valor: number | null | undefined, unidade?: string | null): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '—'
  const texto = Number(valor)
    .toFixed(3)
    .replace(/\.?0+$/, '')
    .replace('.', ',')
  return unidade ? `${texto} ${unidade}` : texto
}

/**
 * Traduz o resultado da baixa para o que a tela mostra.
 *
 * A regra de negócio do projeto é "segurança do paciente > controle de estoque":
 * a baixa nunca impede o registro clínico. Mas não impedir não é esconder — todo
 * caso fora do normal volta com mensagem própria, e os dois casos de divergência
 * (item não cadastrado e saldo negativo) ficam na fila de conferência do gerente.
 */
export function resumirBaixa(params: {
  resultado:   ResultadoConsumo | null
  nome:        string
  quantidade:  number
  unidade?:    string | null
  /** Mensagem de erro, quando a própria chamada da baixa falhou. */
  erro?:       string | null
}): ResumoBaixa {
  const { resultado, nome, quantidade, unidade, erro } = params
  const qtd = formatarQuantidade(quantidade, unidade)

  if (erro) {
    return {
      status:       'sem_baixa',
      mensagem:     `Registrado no prontuário, mas o estoque não foi baixado: ${erro}`,
      tom:          'alerta',
      saldo_depois: null,
    }
  }

  if (!resultado) {
    return {
      status:       'sem_baixa',
      mensagem:     'Registrado no prontuário, sem efeito no estoque.',
      tom:          'atencao',
      saldo_depois: null,
    }
  }

  if (!resultado.matched) {
    return {
      status:       'nao_reconhecido',
      mensagem:     `"${nome}" não está cadastrado no estoque. O registro clínico foi salvo e a saída ficou para conferência.`,
      tom:          'alerta',
      saldo_depois: null,
    }
  }

  const saldo = resultado.quantity_after
  const saldoTexto = formatarQuantidade(saldo, unidade)

  if (resultado.requires_reconciliation) {
    return {
      status:       'insuficiente',
      mensagem:     `Baixa de ${qtd} aplicada, mas o saldo de "${nome}" ficou em ${saldoTexto}. Confira o estoque.`,
      tom:          'alerta',
      saldo_depois: saldo,
    }
  }

  if (resultado.below_minimum) {
    return {
      status:       'baixado',
      mensagem:     `Baixa de ${qtd}. Restam ${saldoTexto} de "${nome}" — abaixo do mínimo.`,
      tom:          'atencao',
      saldo_depois: saldo,
    }
  }

  return {
    status:       'baixado',
    mensagem:     `Baixa de ${qtd}. Restam ${saldoTexto}.`,
    tom:          'ok',
    saldo_depois: saldo,
  }
}

/**
 * A aplicação deve virar linha na conta da OS?
 *
 * Só quando a clínica ligou a cobrança automática (padrão desligado, para não
 * mudar a conta das clínicas que já rodam hoje) E o item saiu do estoque de
 * verdade. Texto livre não tem preço para cobrar, e serviço já é cobrado pelo
 * painel de serviços — cobrar de novo duplicaria a conta.
 */
export function deveCobrarAplicacao(params: {
  cobrancaAutomatica: boolean
  stockItemId:        string | null | undefined
  itemEhServico:      boolean
  status:             StatusBaixaEstoque
}): boolean {
  if (!params.cobrancaAutomatica) return false
  if (!params.stockItemId) return false
  if (params.itemEhServico) return false
  return params.status === 'baixado' || params.status === 'insuficiente'
}

/** Rótulo curto do status, para badge na linha da medicação. */
export const ROTULO_STATUS_BAIXA: Record<StatusBaixaEstoque, string> = {
  baixado:         'Baixado do estoque',
  insuficiente:    'Baixado — saldo negativo',
  nao_reconhecido: 'Fora do estoque',
  sem_baixa:       'Sem baixa',
  devolvido:       'Devolvido ao estoque',
}
