// Cobrança na maquininha (FinPet/EvoluServices) — regras puras sobre o estado
// de uma transação: o que o caixa/extrato pode fazer com ela. Sem I/O.

import { BANDEIRAS, lerSituacao } from '@/lib/integrations/evoluservices-erros'

export type SituacaoCobranca = 'aguardando' | 'aprovada' | 'recusada' | 'cancelada' | 'desconhecida'

export interface EstadoCobranca {
  status:              string | null
  nsu:                 string | null
  invoice_id:          string | null
  settled_split_id:    string | null
  reversed_at:         string | null
  cancel_requested_at: string | null
}

/** Situação da transação remota a partir do status cru da operadora. */
export function situacaoDaCobranca(status: string | null | undefined): SituacaoCobranca {
  const s = String(status ?? '').toUpperCase()
  if (!s || s === 'PENDING' || s === 'CREATED') return 'aguardando'
  // Status NOSSO: estorno pedido no sistema, aguardando o portal da operadora.
  if (s === 'CANCEL_REQUESTED') return 'cancelada'
  const leitura = lerSituacao(null, s)
  if (leitura.situacao === 'aguardando' || leitura.situacao === 'desconhecida') {
    // Pré-aprovada/incompleta na maquininha: ainda não há desfecho.
    if (s === 'PRE_APPROVED' || s === 'INCOMPLETE') return 'aguardando'
    return leitura.situacao
  }
  return leitura.situacao
}

/** Crédito × débito a partir do código da bandeira (VISA_CREDITO, MASTER_DEBITO…). */
export function metodoDaBandeira(bandeira: string | null | undefined): 'credit' | 'debit' {
  const b = bandeira ? BANDEIRAS[bandeira] : undefined
  if (b) return b.tipo === 'debito' ? 'debit' : 'credit'
  return /DEBITO|DEBIT/i.test(String(bandeira ?? '')) ? 'debit' : 'credit'
}

/** NSU como chave de casamento: só dígitos/letras, maiúsculo, sem zeros à esquerda. */
export function normalizarNsu(v: string | null | undefined): string {
  const s = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return s.replace(/^0+(?=.)/, '')
}

/** Aprovada, amarrada a uma fatura e ainda sem split que a tenha baixado. */
export function podeBaixarTitulo(c: EstadoCobranca): boolean {
  return situacaoDaCobranca(c.status) === 'aprovada'
    && !!c.invoice_id && !c.settled_split_id && !c.reversed_at && !c.cancel_requested_at
}

/** Ainda não processada pela máquina: dá para remover pela API (DELETE /remote/{id}). */
export function podeCancelarAntesDaCaptura(c: EstadoCobranca): boolean {
  return situacaoDaCobranca(c.status) === 'aguardando' && !c.nsu && !c.reversed_at
}

/** Aprovada e sem estorno registrado: o pedido fica no sistema, a operadora cancela no portal. */
export function podeEstornar(c: EstadoCobranca): boolean {
  return situacaoDaCobranca(c.status) === 'aprovada' && !c.reversed_at && !c.cancel_requested_at
}

/** Rótulo do título para a tela do extrato. */
export function rotuloDoTitulo(c: EstadoCobranca): string {
  if (!c.invoice_id) return 'Sem título vinculado'
  if (c.reversed_at) return 'Baixa estornada'
  if (c.settled_split_id) return 'Título baixado'
  return situacaoDaCobranca(c.status) === 'aprovada' ? 'Aprovada · título em aberto' : 'Título em aberto'
}
