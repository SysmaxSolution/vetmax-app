// Tipos de `src/lib/actions/financial.ts`.
//
// Ficam aqui porque aquele arquivo é `'use server'` — tipo exportado de módulo
// 'use server' faz a server action responder 500 em runtime sem erro de
// compilação (regra do projeto).

export type EntryType   = 'receivable' | 'payable'

export type EntryStatus = 'pending' | 'paid' | 'cancelled'

export type EntrySource = 'manual' | 'cashier' | 'petlove' | 'petlove_indicacao' | 'petlove_open' | 'commission'

export interface FinancialEntry {
  id:                   string
  clinic_id:            string
  type:                 EntryType
  description:          string
  amount:               number
  discount:             number
  interest:             number
  due_date:             string
  issue_date:           string | null
  payment_date:         string | null
  status:               EntryStatus
  payment_method:       string | null
  tutor_id:             string | null
  patient_id:           string | null
  beneficiary:          string | null   // fornecedor/favorecido (contas a pagar)
  /**
   * Fornecedor do titulo a pagar. A coluna sempre existiu e o select ja traz
   * (ENTRY_SELECT usa '*'), mas o tipo nao expunha — e por isso a tela nao
   * tinha como informar o dono do titulo.
   */
  supplier_id:          string | null
  category:             string | null
  notes:                string | null
  created_by:           string | null
  created_at:           string
  updated_at:           string
  // campos novos
  document_number:      string | null
  professional_id:      string | null
  chart_of_accounts_id: string | null
  settlement_bank_id:   string | null
  /** Empresa faturante gravada no título (OS/serviço). Null = herda da conta de liquidação ou da empresa padrão. */
  company_id?:          string | null
  // joins
  tutor_name:           string | null
  /** CPF do tutor (contas a receber) — para a busca por documento. */
  tutor_document:       string | null
  /** CNPJ/CPF do fornecedor vinculado (contas a pagar) — para a busca por documento. */
  supplier_document:    string | null
  patient_name:         string | null
  professional_name:    string | null
  chart_account_label:  string | null
  settlement_bank_name: string | null
  // meta
  source:               EntrySource
  cashier_entry_id:     string | null
  cashier_outflow_id:   string | null
  // vínculo com invoice mestre (duplicatas) + flag de ajuste contábil
  invoice_id:           string | null
  is_clinic_discount:   boolean
  // vínculo com a consulta de origem (OS) — identificação em A Pagar/Receber
  consultation_id:      string | null
  os_number:            string | null
  is_intercompany:      boolean
}

export interface FinancialSummary {
  toReceiveMonth:      number
  overdue:             number
  paidMonth:           number
  toReceiveMonthCount: number
  overdueCount:        number
  paidMonthCount:      number
}

export interface ListEntriesFilters {
  type:       EntryType
  status?:    EntryStatus | 'all'
  search?:    string
  due_from?:  string
  due_to?:    string
  paid_from?: string
  paid_to?:   string
  /** Empresas faturantes (multi-CNPJ); vazio/ausente = todas. Ver src/lib/financial/empresas-filtro.ts. */
  company_ids?: string[]
}

export interface CreateEntryData {
  type:                 EntryType
  description:          string
  amount:               number
  due_date:             string
  issue_date?:          string | null
  discount?:            number
  payment_method?:      string
  tutor_id?:            string
  patient_id?:          string
  category?:            string
  notes?:               string
  professional_id?:     string
  chart_of_accounts_id?: string
  // Contas a pagar de compra (1.8) — fornecedor, documento, parcela e espécie.
  beneficiary?:         string | null
  supplier_id?:         string | null
  purchase_order_id?:   string | null
  document_number?:     string | null
  especie?:             string | null
  installment_number?:  number | null
  total_installments?:  number | null
}

export interface BaixarTituloData {
  payment_date:        string
  payment_method:      string
  settlement_bank_id?: string
  interest?:           number
  discount?:           number
  /**
   * Quanto efetivamente entra no caixa AGORA. Quando omitido (ou >= netAmount),
   * baixa integral. Quando menor, baixa parcial: o entry pai é reduzido para
   * (netAmount - amount_received) e fica pending; um entry filho paid é criado
   * com amount_received.
   */
  amount_received?:    number
  /**
   * O que fazer com o que passou do valor do título.
   *
   * Antes daqui o código CORTAVA em silêncio:
   *   const amountReceived = Math.max(0, Math.min(data.amount_received, netAmount))
   * e o comentário chamava isso de "segurança". Tutor pagava R$ 200 num título
   * de R$ 150 e os R$ 50 desapareciam — sem troco, sem crédito, sem rastro.
   *
   *   'troco'   → devolvido na hora; o caixa fica com o valor do título.
   *   'credito' → fica como adiantamento do tutor (tutor_credits, 'advance').
   */
  excedente?:          'troco' | 'credito'
}

export interface BankAccount {
  id:              string
  clinic_id:       string
  name:            string
  /** Empresa faturante dona da conta — define a credencial e o certificado. */
  company_id:      string | null
  company_name:    string | null
  bank_name:       string | null
  bank_code:       string | null
  ispb:            string | null
  agency:          string | null
  account:         string | null
  pix_key:         string | null
  is_default:      boolean
  balance:         number
  initial_balance: number
  created_at:      string
}

export interface CreateBankAccountData {
  name:            string
  /**
   * Empresa faturante dona da conta.
   *
   * A coluna existia desde a 0421, mas nenhuma tela preenchia — e é ela que
   * diz QUAL certificado e-CNPJ vai ao banco. Sem isso, uma clínica com três
   * CNPJs no mesmo Sicoob apresentava sempre o mesmo certificado.
   */
  company_id?:     string | null
  bank_name?:      string
  bank_code?:      string
  ispb?:           string
  agency?:         string
  account?:        string
  pix_key?:        string
  is_default?:     boolean
  initial_balance?: number
}

export interface ChartOfAccount {
  id:        string
  clinic_id: string
  code:      string
  name:      string
  type:      'receita' | 'despesa' | 'ativo' | 'passivo'
  parent_id: string | null
  is_system: boolean
  is_active: boolean
  created_at: string
}

export interface CreateChartOfAccountData {
  code:      string
  name:      string
  type:      'receita' | 'despesa' | 'ativo' | 'passivo'
  parent_id?: string
}

export interface CreditCard {
  id:               string
  clinic_id:        string
  name:             string
  administrator:    string | null
  brand:            'visa' | 'master' | 'elo' | 'amex' | 'hipercard' | 'other'
  type:             'credit' | 'debit' | 'both'
  installments_max: number
  fee_percent:      number
  days_to_receive:  number
  requires_nsu:     boolean
  is_active:        boolean
  created_at:       string
  /** Juros próprios da clínica para parcelamento — opcionais, exclusivos entre si. */
  interest_percent: number | null
  interest_amount:  number | null
}

export interface CreateCreditCardData {
  name:             string
  administrator?:   string
  brand:            CreditCard['brand']
  type:             CreditCard['type']
  installments_max: number
  fee_percent:      number
  days_to_receive:  number
  requires_nsu?:    boolean
  interest_percent?: number | null
  interest_amount?:  number | null
}

export interface Employee {
  id:            string
  clinic_id:     string
  user_id:       string | null
  name:          string
  role:          string
  email:         string | null
  phone:         string | null
  cpf:           string | null
  address:       Record<string, string> | null
  hire_date:     string | null
  salary:        number | null
  pix_key:       string | null
  vacation_days: number
  is_active:     boolean
  created_at:    string
  updated_at:    string
}

export interface CreateEmployeeData {
  name:           string
  role:           string
  email?:         string
  phone?:         string
  cpf?:           string
  address?:       Record<string, string>
  hire_date?:     string
  salary?:        number
  pix_key?:       string
  vacation_days?: number
  user_id?:       string
}

export interface EntryContext {
  entry_id:           string
  source:             EntrySource
  is_clinic_discount: boolean
  invoice_id:         string | null
  /** Outras baixas (paid) da mesma invoice — quanto o tutor já desembolsou. */
  paid_in_cashier: Array<{
    id:             string
    amount:         number
    payment_date:   string
    payment_method: string | null
  }>
  /** Desconto contábil oferecido ao plano (se aplicável). */
  clinic_discount?: { amount: number; description: string }
  /** Estado da invoice mestre. */
  invoice?: {
    id:           string
    subtotal:     number
    total_amount: number
    paid_amount:  number
    discount:     number
    status:       string
  }
  /** Mensagem pronta para exibir como aviso na UI. */
  message?:           string
  /** Tipo de confirmação sugerido ao baixar este entry. */
  confirm_kind?:      'petlove_repass' | 'standard'
}

export interface BankStatement {
  id:                  string
  clinic_id:           string
  bank_account_id:     string
  external_id:         string | null
  date:                string
  amount:              number
  description:         string
  type:                'credit' | 'debit'
  reconciled_entry_id: string | null
  import_batch_id:     string
  imported_at:         string
}

export interface ReconciliationBatch {
  id:              string
  clinic_id:       string
  bank_account_id: string
  source:          string
  imported_at:     string
  total_records:   number
  matched_count:   number
  status:          'pending' | 'completed'
  /**
   * Linhas que o banco devolveu mas que JA estavam importadas, e por isso nao
   * entraram de novo. A tela usa para dizer "nada novo no periodo" em vez de
   * fingir que importou.
   */
  skipped?:        number
}

export interface ExtratoFilters {
  bank_account_id: string
  start_date:      string
  end_date:        string
}

export interface ExtratoResult {
  statements:    BankStatement[]
  saldo_inicial: number
  total_entradas: number
  total_saidas:   number
  saldo_final:    number
}

export interface MatchedPair {
  statement: BankStatement
  entry:     FinancialEntry
}

export interface AutoMatchResult {
  matched:              MatchedPair[]
  unmatched_imported:   BankStatement[]
  unmatched_entries:    FinancialEntry[]
}

export interface ImportStatementsData {
  bank_account_id: string
  source:          string
  statements:      Array<{
    external_id?:  string
    date:          string
    amount:        number
    description:   string
    type:          'credit' | 'debit'
    /** Identificador unico da transacao, quando o banco fornece. */
    tx_id?:        string
    /** `descInfComplementar`: quem esta do outro lado da transacao. */
    contraparte?:  string
  }>
}

export interface ReconcCandidate {
  id:              string
  type:            EntryType
  description:     string
  amount:          number
  due_date:        string
  payment_date:    string | null
  status:          EntryStatus
  category:        string | null
  document_number: string | null
  tutor_name:      string | null
  patient_name:    string | null
}

export interface StatementWithLinks {
  id:          string
  date:        string
  amount:      number
  description: string
  type:        'credit' | 'debit'
  reconciled:  boolean
  linked:      ReconcCandidate[]
  /**
   * Quem esta do outro lado, do `descInfComplementar` do banco. Antes o
   * operador so via "PIX RECEBIDO - OUTRA IF", que nao diz de quem e.
   * Nos creditos vem o nome de quem pagou; nos cartoes, a adquirente.
   */
  contraparte: string | null
}

export interface AutoLinkResult {
  linked:               number
  unmatched_statements: number
  unmatched_candidates: number
}

// ─── EXTRATO (movimentações efetivas) ─────────────────────────────────────────
// Lista os títulos BAIXADOS (pagos) no contas a receber/pagar — as movimentações
// efetivas de caixa/banco — com o status de conciliação de cada um (conciliado se
// vinculado a uma linha do extrato já conciliada; senão vinculado ou pendente).
export interface ExtratoMovement {
  id:              string
  date:            string
  description:     string
  amount:          number
  type:            EntryType
  category:        string | null
  document_number: string | null
  tutor_name:      string | null
  patient_name:    string | null
  bank_name:       string | null
  status:          'reconciled' | 'linked' | 'pending'
}

export interface EffectiveExtratoResult {
  movements:      ExtratoMovement[]
  total_entradas: number
  total_saidas:   number
  saldo:          number
}

// ─── 1.4 · Visão cruzada por CNPJ (empresa faturante) ─────────────────────────
// Consolida, por empresa, o recebido/pago no período (atribuído pela conta
// bancária da empresa via settlement_bank_id) + o saldo de crédito por empresa
// (tutor_credits.company_id, incl. transferências inter-CNPJ).
export interface CompanyOverview {
  company_id:         string | null
  company_name:       string
  recebido:           number
  pago:               number
  saldo:              number
  credito_inserido:   number
  credito_utilizado:  number
  credito_disponivel: number
}
