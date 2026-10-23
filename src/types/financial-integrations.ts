// Tipos das integrações financeiras da clínica (banco e PIX).
//
// Vivem aqui porque `src/lib/actions/financial-integrations.ts` é `'use server'`:
// exportar tipo de um módulo de server actions derruba as actions em produção
// com 500, sem erro de compilação. Ver [[feedback_use_server_type_reexports]].

export interface BankIntegration {
  bank_code:   string   // '756' Sicoob, '341' Itaú…
  provider:    string   // 'sicoob'
  environment: 'sandbox' | 'production'
  client_id:   string
  agencia:     string
  conta:       string
  /**
   * Conta bancária cadastrada a que esta credencial pertence.
   *
   * É ela que diz de QUAL empresa faturante é a credencial — e, por tabela,
   * qual certificado e-CNPJ vai ao banco. Antes a ligação era adivinhada por
   * agência+conta; com três CNPJs no mesmo banco, um dígito diferente jogava
   * a cobrança na credencial errada. Opcional por compatibilidade com o que
   * já estava configurado.
   */
  bank_account_id?: string | null
}

export interface PixIntegration {
  enabled:       boolean
  provider:      string   // 'sicoob'
  environment:   'sandbox' | 'production'
  client_id:     string
  client_secret: string
  token:         string
  pix_key:       string   // chave PIX estática (recebimento estático)
}

export interface FinancialIntegrations {
  bank_enabled: boolean
  banks:        BankIntegration[]
  pix_enabled:  boolean
  pix:          PixIntegration
}
