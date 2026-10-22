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
