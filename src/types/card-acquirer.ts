// Tipos da integração de cartão (EvoluServices / FinPet).
//
// Módulo PURO: as actions têm 'use server' e não podem exportar tipo — tipo
// exportado de server action responde 500 em produção sem erro de compilação.

/** Configuração da adquirente de uma empresa faturante, sem os segredos. */
export interface ConfigAdquirente {
  company_id:       string
  company_name:     string
  company_cnpj:     string | null
  acquirer:         'evoluservices' | 'sipag' | 'outro'
  enabled:          boolean
  environment:      'sandbox' | 'production'
  merchant_id:      string | null
  api_username:     string | null
  /** Só diz SE existe — o valor nunca sai do servidor. */
  tem_api_key:      boolean
  /** Idem. */
  tem_webhook_secret: boolean
  default_terminal_id: string | null
  /** Manda o split do profissional responsável pela OS junto com a cobrança. */
  split_enabled:    boolean
  /** chargeFees da operadora: a taxa incide também na parte do beneficiário. */
  split_charge_fees: boolean
  /** URL completa que deve ser cadastrada no portal deles. */
  webhook_url:      string | null
  token_expires_at: string | null
}

export interface TerminalDisponivel {
  terminalId:     string
  terminalStatus: string
  /** Rótulo em português do status. */
  rotulo:         string
  /** Se dá para cobrar neste terminal agora. */
  pode_cobrar:    boolean
  /** O que o status significa, para a recepção entender em vez de só ser barrada. */
  explicacao:     string
  computerName:   string | null
  macAddress:     string | null
}

export interface BeneficiarioDisponivel {
  code:     string
  name:     string
  document: string
  /** Profissional do sistema já amarrado a este código, se houver. */
  professional_id:   string | null
  professional_name: string | null
}

/** O que a tela do caixa precisa saber antes de oferecer cartão. */
export interface OpcoesDeCobranca {
  /** Empresa faturante da OS/venda. */
  company_id:   string
  company_name: string
  /** Se a empresa tem FinPet ligada e configurada. */
  disponivel:   boolean
  /** Por que não está disponível, quando for o caso. */
  motivo:       string | null
  terminais:    TerminalDisponivel[]
  /** Bandeiras que a maquininha aceita, separadas por tipo. */
  bandeiras: Array<{ codigo: string; rotulo: string; tipo: 'credito' | 'debito' }>
  /** O Link aceita só crédito — débito existe apenas na maquininha. */
  link_disponivel: boolean
}

export interface CobrancaCriada {
  card_transaction_id: string
  /** Preenchido quando é cobrança por link. */
  pay_url?: string | null
  /** Preenchido quando é na maquininha. */
  transaction_id?: string | null
  /** Se a cobrança saiu com o split do profissional. */
  com_split?: boolean
  /** Mensagem para a tela: o que acontece agora. */
  mensagem: string
  /** Avisos que não impedem a cobrança mas precisam aparecer. */
  avisos: string[]
}

/** Linha do extrato de cartão, já com o split separado. */
export interface LinhaExtratoCartao {
  id:            string
  kind:          'remote' | 'link'
  reference:     string
  status:        string
  /** Rótulo em português. */
  rotulo_status: string
  amount:        number
  installments:  number | null
  payment_brand: string | null
  created_at:    string
  os_number:     string | null
  tutor_nome:    string | null
  company_name:  string | null
  nsu:           string | null
  invoice_id:    string | null
  /** Situação lida do status cru (src/lib/financial/cobranca-maquininha.ts). */
  situacao:      'aguardando' | 'aprovada' | 'recusada' | 'cancelada' | 'desconhecida'
  /** Rótulo do título: baixado, em aberto, estornado… */
  titulo:        string
  settled_at:    string | null
  reversed_at:   string | null
  cancel_requested_at: string | null
  pode_baixar:   boolean
  pode_cancelar: boolean
  pode_estornar: boolean
  /** Quanto fica com a clínica. */
  total_clinica: number
  /** Quanto vai direto ao profissional pelo split. */
  total_split:   number
  /** Parcelas, do estabelecimento e do split. */
  parcelas: Array<{
    kind:   'merchant' | 'split'
    numero: number
    valor:  number
    status: string
    data:   string | null
    beneficiario: string | null
  }>
}

/**
 * Andamento de uma cobrança na maquininha, do ponto de vista do caixa.
 *
 * Não consulta a operadora: a Transação Remota não tem endpoint de consulta —
 * quem traz o desfecho é o callback. Isto é a leitura do que já chegou.
 */
export interface AndamentoCobranca {
  status:        string | null
  /** Interpretação pronta para a tela, já em português. */
  rotulo:        string
  concluida:     boolean
  nsu:           string | null
  autorizacao:   string | null
  bandeira:      string | null
  parcelas:      number | null
  /** Quantas vezes a operadora já nos chamou — 0 significa que ainda não veio. */
  callbacks:     number
  /** Fatura amarrada à cobrança e se o título já foi baixado com ela. */
  invoice_id:    string | null
  baixado:       boolean
}

/** Profissional da clínica e seu vínculo com o beneficiário de split na operadora. */
export interface ProfissionalParaSplit {
  id:        string
  full_name: string
  role:      string
  acquirer_recipient_code:     string | null
  acquirer_recipient_document: string | null
}
