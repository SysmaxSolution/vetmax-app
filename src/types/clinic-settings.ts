// Tipos de configuracao da clinica.
//
// Modulo PURO. Sairam de `src/lib/actions/clinic-settings.ts`, que tem
// 'use server': tipo exportado de server action responde 500 em producao sem
// nenhum erro de compilacao, e a guarda `guard-use-server-types.mjs` bloqueia o
// padrao. O arquivo de actions importa daqui.

export type FlowConfig = {
  vet_merged_modules:    Array<'triage' | 'exams'>
  use_accounting_chart?: boolean
  mentor_idle_enabled?:  boolean
  mentor_idle_seconds?:  number
  verify_cpf_cnpj?:      boolean
  verify_cep?:           boolean
  /** Liga a versão avançada do módulo de Internação (alertas ativos, sinais
   *  vitais, mapa de execução, fluidoterapia, conta). Off = fluxo atual. */
  internacao_completa?:  boolean
  /** Liga o módulo Centro Cirúrgico (/dashboard/surgery) no menu lateral. */
  centro_cirurgico?:     boolean
  /**
   * Épico B (04/06): unifica o PDV ao Caixa — o módulo PDV some do menu,
   * /dashboard/sales redireciona para o Caixa e a venda avulsa passa a ser
   * lançada no topo de Caixa > Recebimentos. Decisão Q4 do PO.
   */
  pdv_unified_with_cashier?: boolean
  /**
   * Monetização SaaS Fase 1 (rollout restrito): exibe a UI de Planos —
   * aba Assinatura em Gestão + link "Meu Plano" no header. Setada via SQL
   * apenas nas clínicas piloto (Vet Teste); SysMax sempre vê. A liberação
   * geral é um UPDATE em massa, sem deploy. O enforcement do gatekeeper NÃO
   * depende desta flag (só a UI de venda).
   */
  subscription_plans_ui?: boolean
  // ── Sub-features por tier (re-packaging 0408) ───────────────────────────────
  // Derivadas do plano (premium/enterprise) por padrão; estas flags são
  // OVERRIDES explícitos usados em clínicas specialized (à la carte).
  /** Caixa Completo (vs PDV simples do Starter): sangria/suprimento, múltiplas
   *  formas, recebíveis de cartão, conferência cega. Premium+. */
  cashier_complete?:        boolean
  /** Estoque Completo (vs básico do Starter): kits/pacotes, alertas de item
   *  crítico/ponto de reposição, lote/validade. Premium+. */
  stock_complete?:          boolean
  /** Agenda Automatizada na Recepção (vs recepção simples do Free): agendamento
   *  automatizado e confirmações. Premium+. */
  reception_auto_schedule?: boolean
  /** Sprint Animais — liga a fundação (multi-CNPJ, clínicas parceiras, tabelas
   *  de preço, OS/urgência/origem no check-in). Por clínica. */
  animais_foundation?:      boolean
  /** Exige selecionar o profissional responsável no check-in. Off (padrão) =
   *  atendimento pode ir aos departamentos sem responsável pré-definido. */
  require_attending_vet?:   boolean
  /** Habilita o lançamento de ADIANTAMENTO no Caixa (crédito do tutor p/ uso futuro). */
  uses_advance?:            boolean
  // ── Portal do Tutor + Agendamento online (Fase 3) ───────────────────────────
  /** A clínica usa o Portal do Tutor? (acesso do tutor ao histórico + agendamento) */
  portal_enabled?:          boolean
  /** A clínica usa o Portal do Parceiro? (/parceiro — o veterinário SOLICITANTE
   *  acessa as imagens e os laudos dos pets que encaminhou). Rotina separada do
   *  Portal do Tutor: o público é outro e a clínica de imagem pode querer só um
   *  dos dois. Padrão DESLIGADO. */
  partner_portal_enabled?:  boolean
  /** Como o tutor agenda PELO PORTAL: 'off' (não agenda) | 'reception' (recepção
   *  confirma — fluxo M9) | 'direct' (cai direto na agenda). Padrão: 'reception'. */
  booking_mode_portal?:     'off' | 'reception' | 'direct'
  /** Como o tutor agenda PELO WHATSAPP-bot: mesmos valores. Padrão: 'reception'
   *  (preserva o comportamento atual do M9). */
  booking_mode_whatsapp?:   'off' | 'reception' | 'direct'
  /** A clínica trabalha com convênios (Petlove/Vetplan/AVA/outros)? Gate global:
   *  quando false, nenhuma tela mostra convênio, repasse ou conciliação. */
  usa_convenios?:           boolean
  /** A clínica ativou a Academia de Treinamento? Gate do menu + rota /dashboard/treinamento.
   *  Os vídeos são um acervo GLOBAL compartilhado por todas as clínicas ativadas;
   *  progresso, quizzes e controle de colaboradores são particulares de cada clínica. */
  usa_treinamento?:         boolean
  /** Fluxo de Rejeição de Exame (laboratório de referência). Quando LIGADA:
   *  o laboratório marca cada exame como realizado ou não realizado + motivo;
   *  o não realizado avisa automaticamente quem encaminhou (clínica parceira /
   *  MV solicitante) e o tutor, fica fora da cobrança e espera a decisão do
   *  cliente (recoletar ou não). O título financeiro do exame só é gerado
   *  quando o exame é realizado/liberado. DESLIGADA (padrão) = fluxo atual,
   *  bit-a-bit, para todos os outros clientes. */
  usa_fluxo_rejeicao_exame?: boolean

  // ── Tarefa 0 (pré-produção): flag PRÓPRIA por rotina nova ───────────────────
  // Padrão de TODAS: DESLIGADA. Ligar é ato explícito de configuração
  // (Gestão > Configurações). Com a flag off: some do menu, a rota redireciona
  // e as server actions da rotina recusam.
  /** Módulo de Imagem + visualizador DICOM (/dashboard/imaging). */
  usa_imagem?:              boolean
  /** Laboratório: painel de resultados/analitos/HL7 dentro do exame. */
  usa_laboratorio?:         boolean
  /** Boletos de cobrança (aba Boletos no Financeiro, emissão/reimpressão). */
  usa_boleto?:              boolean
  /** Recall de vacina por WhatsApp. ⚠️ Ligar ENVIA MENSAGEM AOS TUTORES.
   *  Separada de portal_enabled de propósito (LGPD + risco de ban da instância). */
  vaccine_recall_enabled?:  boolean
  /** Hora local (0-23) em que o recall de vacina roda. Padrão: 9. */
  vaccine_recall_hour?:     number
  /** Antecedência, em dias, do aviso de vacina. Padrão: 7. */
  vaccine_recall_days?:     number
  /** Fuso IANA usado para interpretar vaccine_recall_hour. Padrão: America/Sao_Paulo. */
  vaccine_recall_tz?:       string
  /** Quando o laboratório parceiro NÃO realiza o exame, o custo dele deixa de ser
   *  devido? TRUE = cancela/não gera o contas a pagar do lab na rejeição.
   *  FALSE (padrão) = mantém o payable — comportamento atual, bit-a-bit. */
  cancela_custo_lab_na_recusa?: boolean
  /** A medicação/insumo aplicado na consulta entra na conta da OS sozinho?
   *  Padrão DESLIGADO: clínica que embute a medicação no preço da consulta
   *  cobraria duas vezes. Não afeta a BAIXA de estoque, que é sempre feita. */
  cobra_insumo_aplicado?: boolean
  /** Rejeitar exame JÁ FATURADO estorna a fatura automaticamente?
   *  FALSE (padrão) = recusa a rejeição e orienta estorno manual no Financeiro. */
  estorna_exame_faturado_na_recusa?: boolean
  /** Exigências do pré-anestésico que IMPEDEM a cirurgia de ir para a sala
   *  (Fase 4 · item 4.2). Lista vazia ou ausente = nada trava, só avisa, que é
   *  o padrão: uma clínica em operação não pode descobrir numa terça-feira que o
   *  sistema passou a barrar a cirurgia que ela sempre conseguiu fazer.
   *  Valores: 'jejum' | 'exames_preop' | 'consentimento' | 'asa'. */
  gate_pre_anestesico?: Array<'jejum' | 'exames_preop' | 'consentimento' | 'asa'>
}

export type BusinessHourEntry = { open: string; close: string } | null

export type BusinessHours = {
  monday:    BusinessHourEntry
  tuesday:   BusinessHourEntry
  wednesday: BusinessHourEntry
  thursday:  BusinessHourEntry
  friday:    BusinessHourEntry
  saturday:  BusinessHourEntry
  sunday:    BusinessHourEntry
}

export type AiTranscriptionMode = 'transcribe_only' | 'ai_assisted'

export type ClinicConfig = {
  logo_url:              string | null
  active_modules:        string[]
  continuous_flow:       boolean
  flow_config:           FlowConfig
  business_hours:        BusinessHours | null
  working_days:          number[]
  holiday_work:          boolean
  ai_transcription_mode: AiTranscriptionMode
}

export type VoiceTriggers = {
  startTriggers: string[]
  stopTriggers:  string[]
}

export interface ClinicSettingsConfig {
  allow_immediate_booking: boolean
  checkin_required_fields: string[]
  triage_required_fields: string[]
}

export interface RegistrationSettings {
  verify_cpf_cnpj: boolean
  verify_cep:      boolean
}

export type LayoutVersion = 'classic' | 'modern'
