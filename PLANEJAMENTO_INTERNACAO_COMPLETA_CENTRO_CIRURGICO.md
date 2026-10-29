# Sprint — Internação Completa (Módulo 1) + Centro Cirúrgico (Módulo 2)

## Context
O VetMax tem hoje um módulo de Internação básico (Kanban, evolução por voz/IA, aprazamento com baixa de estoque, alta com PDF/WhatsApp). Após validação com um hospital veterinário real, o PO decidiu separar Internação e Cirurgia em dois módulos distintos (misturar na mesma tela fere a usabilidade). Cada um é controlado por uma feature flag independente em `clinics.flow_config` (padrão já usado para `use_accounting_chart`, sem migration):

- `internacao_completa` → transforma o módulo de Internação atual na versão avançada (upgrade in-place; flag off = comportamento atual intacto).
- `centro_cirurgico` → habilita um novo item no menu lateral (`/dashboard/surgery`), módulo 100% focado no bloco cirúrgico.

Princípios: automatizar e simplificar; não poluir a tela; nada do planejamento anterior é descartado, apenas redistribuído entre os dois módulos. `clinical_vitals` é projetada compartilhada (internação ou cirurgia) e pronta para IoT futuro.

## Achados-chave da base (reuso)
- **Flag store**: `clinics.flow_config` JSONB; ler/gravar via `getClinicConfig`/`updateClinicConfig` (`src/lib/actions/clinic-settings.ts`). Client: `ClinicConfigProvider` (`src/components/providers/ClinicConfigProvider.tsx`, mesmo de `useAiTranscriptionMode`).
- **Toggle UI**: categoria "Acesso" em `Settings/SettingsWorkspace.tsx` (já agrupa `ModulesTab`/`ClinicSettingsTab`).
- **Menu lateral**: `src/components/layout/DashboardHeader.tsx`. Gate de rota: `requireModuleAccess(moduleName)` (`src/lib/server/require-module.ts`) — checa `user_module_access` + `clinics.active_modules`. Catálogo de permissões: `config/access-catalog.ts`; paywall/rotas: `config/access-matrix.ts`.
- **Aprazamento**: `useMedicationScheduler.ts` (tick 15s, deriva overdue/imminent), `MedicationAlertBadge`, `MedicationApplicationModal.tsx`, `hospitalization-prescriptions.ts` (`applyHospitalizationDose`), `hospitalization_dose_administrations`.
- **Timeline**: `hospitalization_records` (já recebe logs automáticos, ex.: anexo de documento em `hospitalizations.ts::saveHospitalizationDocument`).
- **Baixa de estoque atômica**: RPC `rpc_apply_stock_consumption` via `consumeStockForApplication` (`src/lib/actions/stock-consumption.ts`).
- **Voz/IA**: `useClinicalVoiceAssistant`, `useFocusedVoiceCapture`, `extractHospitalizationVoice` (`actions/pharmacy.ts`), `ai_extraction.ts`.
- **Faturamento**: `billing.ts::generateInvoice` (`consultation_services` → `invoice_items` → `financial_entries`). Salas: `rooms` (type já inclui `surgery`/`hospitalization`).
- **Pet** já tem: `allergies`, `chronic_diseases`, `reproductive_status`, `medical_history`.

## Arquitetura de Flags (Gestão → Configurações → Acesso)
Dois toggles independentes em `flow_config`, default false: `internacao_completa` e `centro_cirurgico`.
Helpers: `isInternacaoCompleta()` / `isCentroCirurgico()` (server, em `clinic-settings.ts`) + `useInternacaoCompleta()` / `useCentroCirurgico()` (client, via `ClinicConfigProvider`).
`centro_cirurgico` on ⇒ aparece o item "Centro Cirúrgico" no menu lateral (`DashboardHeader`) e a rota `/dashboard/surgery` passa a responder.

## Módulo 1 — Internação Completa (upgrade in-place de `/dashboard/hospitalization`)
Só ativa com `internacao_completa = true`. Flag off ⇒ tela idêntica à atual.

- **Alertas Ativos (Enfermagem)** — novo hook `useMedicationAlarm` plugado no `useMedicationScheduler`: quando o tick de 15s detecta dose devida (overdue/imminent), dispara bip via Web Audio API + Notification API do navegador (com pedido de permissão e fallback visual). Anti-spam: dispara 1x por (prescription, janela de dose). O enfermeiro não perde a hora mesmo fora da aba.
- **Timeline de Plantão à prova de erros** — ao confirmar dose no `MedicationApplicationModal` (`applyHospitalizationDose`), além de gravar em `hospitalization_dose_administrations`, injeta um log imutável em `hospitalization_records` (Remédio, Dose, Hora, nome do usuário logado), no mesmo padrão do log de anexo. Esse log não é editável/excluível pela UI.
- **Mapa de Execução Visual** — nova visão na tela de Internação: grade horária (linhas = prescrições/tarefas, colunas = horas do dia, células = aplicado/pendente/atrasado, marcáveis) + folha imprimível. Reaproveita prescrições + `hospitalization_dose_administrations` + nova `hospitalization_tasks` (exam/procedure/feeding).
- **Abas extras no card** (`HospitalizationDetailModal`): Sinais Vitais (entrada rápida + voz + mini-gráfico de tendência, grava em `clinical_vitals`), Fluidoterapia (calculadora peso→manutenção+déficit+perdas → ml/h e gotas/min, grava `hospitalization_fluids`; balanço hídrico entradas/saídas), Conta da Internação (itens acumulados + diária via cron).
- **Ficha enriquecida + leitos**: ALTER em `hospitalizations` (box_id, estimated_discharge, weight_at_admission, attending_vet_id, personal_belongings, diet_notes, fasting); badges no card; vínculo `rooms` ↔ internação + mapa de ocupação.

## Módulo 2 — Centro Cirúrgico (novo, `/dashboard/surgery`, menu lateral)
Só ativa com `centro_cirurgico = true`. Ambiente isolado.

- **Kanban Cirúrgico dedicado** (fluxo contínuo, não é agenda): Preparo → Sala Cirúrgica → RPA (Recuperação). Mesma mecânica de drag&drop do Kanban de internação.
- **SurgeryFichaModal Single-Page** (sem abas — acordeão vertical contínuo): o cirurgião rola e expande seções: Checklist Pré-Op (jejum, exames pré, risco ASA, consentimento) → Ficha Anestésica (entrada rápida de sinais vitais → `clinical_vitals` com `surgery_id`; fármacos) → Relatório Cirúrgico.
- **Voice-to-Text Cirúrgico (hands-free)**: no acordeão do Relatório, botão de gravação permite ditar a técnica enquanto se desparamenta; IA transcreve e estrutura (reuso de `useClinicalVoiceAssistant` + `extractHospitalizationVoice`/`ai_extraction`).
- **Kits Cirúrgicos (faturamento + estoque automáticos)**: cirurgião escolhe um Kit de Serviço (ex.: "Kit Castração"); 1 clique faz o unroll dos insumos (acesso, equipo, fios, ampolas), baixa do estoque via RPC atômica `rpc_apply_stock_consumption` e lança na conta do paciente. Kits reaproveitam/estendem o conceito de Pacotes já previsto no catálogo (`registry.packages`); se insuficiente, nova `service_kits` + `service_kit_items`.
- **Transição Pós-Op**: botão "Encaminhar para Internação" ao fim do fluxo → cria `hospitalizations` vinculada (reuso `createHospitalization`) e joga o pet no Kanban da Internação (status `observation`/`icu`).

## Banco de dados (migrations aditivas, IF NOT EXISTS, clinic_id em tudo; após 0195)
- `clinical_vitals` (compartilhada): id, clinic_id, hospitalization_id NULL, surgery_id NULL (mutuamente exclusivos), recorded_at, recorded_by, temperature, heart_rate, resp_rate, weight, blood_pressure, glucose, spo2, mucosa, tpc_seconds, hydration_pct, pain_score, notes, source ('manual'|'voice'|'iot'), device_id NULL (preparação IoT).
- ALTER `hospitalizations`: box_id, estimated_discharge, weight_at_admission, attending_vet_id, personal_belongings, diet_notes, fasting, isolation_required (bool, Regra 2).
- `stock_batches` (Regra 1 FIFO): id, clinic_id, stock_item_id, batch_number, expiry_date, quantity, received_at, supplier. Backfill = 1 lote por stock_item existente.
- `hospitalization_fluid_balance` (Regra 3): id, clinic_id, hospitalization_id, direction ('in'|'out'), kind ('fluid'|'urine'|'emesis'|'bleeding'|'other'), volume_ml, recorded_at, recorded_by.
- `hospitalization_tasks`, `hospitalization_fluids` (+ balanço), `prescription_templates` (protocolos), `hospitalization_charges` + ALTER `rooms` ADD `daily_rate` (conta/diária).
- `surgeries`: clinic_id, patient_id, consultation_id, room_id, surgeon_id, anesthetist_id, procedure_name, status ('preparo'|'sala'|'rpa'|'done'|'canceled'), asa_risk, checklist JSONB (fasting_confirmed, preop_exams_ok, consent_signed, consent_doc_id), surgical_report, started_at, ended_at, postop_hospitalization_id, notes.
- `service_kits`/`service_kit_items` (ou extensão de Pacotes) p/ Kits Cirúrgicos.
- CFMV: alta/prescrição mantêm `is_reviewed_by_vet`; controlados → "Receituário Azul"; consentimento gerado pelo engine Canva existente.

## Regras de Negócio Avançadas (mandatórias — hospital de grande porte)
- **Regra 1 — Baixa FIFO estrita (estoque por lotes)**. Hoje NÃO há tabela de lotes: `stock_items` guarda `batch_number`/`expiry_date` inline (1 lote/item) e `rpc_apply_stock_consumption` (migration 0186) decrementa um único registro. Ação: criar `stock_batches` + backfill (1 lote por item) e reescrever a RPC (nova migration, CREATE OR REPLACE) para consumir FIFO em cascata — ordena lotes por expiry_date ASC NULLS LAST, received_at ASC, FOR UPDATE, debita em cascata (ex.: 3 ampolas → 2 do lote A que se encerra + 1 do lote B), encerra lotes zerados e espelha o somatório em `stock_items.quantity`. Mantém atomicidade (transação + lock) e a filosofia "nunca trava" (faltou → último lote vai negativo + `requires_reconciliation`). Restock/NF-e (`purchases`) passam a popular `stock_batches`. Mozart aplica na RPC.
- **Regra 2 — Alerta visual de isolamento (risco biológico)**. `hospitalizations.isolation_required` (bool). No Kanban e no Mapa de Execução, card com contorno/aviso forte (vermelho/âmbar) + ícone de biossegurança ⇒ enfermagem identifica exigência de EPI antes de manipular. Toggle na Ficha.
- **Regra 3 — Balanço hídrico completo (entrada/saída)**. Na Fluidoterapia (Fase 1b), além da calculadora de entrada, botão "Registrar Saída" (Urina/Êmese/Sangramento) com volume em ML, gravando em `hospitalization_fluid_balance`. A aba calcula e exibe o Saldo Hídrico = Entradas − Saídas para o MV avaliar hiper-hidratação.
- **Regra 4 — Alta Médica × Alta Administrativa (só sob `internacao_completa`)**. MV aperta "Dar Alta" → status `ready_for_discharge` = Alta Médica: cessa a diária (cron) e os alertas de medicação/aprazamento. O paciente só sai do Kanban (`discharged`) na Alta Administrativa/Financeira, após a conta liquidada (`hospitalization_charges` quitadas) — novo botão "Alta Administrativa" habilitado apenas com conta paga, chamando `confirmDischarge`. Flag off ⇒ fluxo atual intacto (`ready_for_discharge` → "Dar Alta" → `discharged` direto).

## Roteamento isolado
- Módulo 1: permanece em `/dashboard/hospitalization`; o flag `internacao_completa` só controla a UI extra (acesso ao módulo inalterado).
- Módulo 2: nova rota `/dashboard/surgery/page.tsx` com `requireModuleAccess('surgery')`; novo item de menu em `DashboardHeader` exibido quando `centro_cirurgico` on; registrar módulo `surgery` em `access-catalog.ts`, `ModulesTab` (labels) e `access-matrix.ts` (paywall copy).

## Ordem de execução (autorizada) + arquivos
**Fase 0 — Flags & Isolamento de roteamento** (base, zero mudança de comportamento): `clinic-settings.ts` (2 flags + helpers), `SettingsWorkspace.tsx` (2 toggles na aba Acesso), `ClinicConfigProvider.tsx` (2 hooks). Scaffold `/dashboard/surgery` + item de menu condicional + `access-catalog`/`access-matrix` para `surgery`. Migrations: `clinical_vitals` + ALTER `hospitalizations`.

**Fase 1 — Internação Completa: foco imediato (CHECKPOINT do PO)**: Alertas Ativos (`useMedicationAlarm` + Web Audio + Notification API) e Timeline à prova de erros (log imutável em `applyHospitalizationDose`/`MedicationApplicationModal`) e Mapa de Execução Visual (`ExecutionMapView.tsx` + folha imprimível, `hospitalization-tasks.ts`). ⇒ Avisar o usuário assim que alertas sonoros/push + Mapa de Execução estiverem visíveis para o enfermeiro.

**Fase 1b — Abas clínicas + Regras 1/3/4**: Sinais Vitais (`VitalsTab.tsx` + `vitals.ts`); Fluidoterapia (`FluidTherapyCalculator.tsx` + `hospitalization-fluids.ts`) com balanço hídrico entrada/saída (Regra 3); FIFO `stock_batches` + RPC reescrita (Regra 1); Conta (`InternacaoContaTab.tsx` + `hospitalization-charges.ts` + cron de diária reusando `api/cron/daily-schedule-alert`) com Alta Médica × Administrativa (Regra 4); Ficha enriquecida + leitos + flag de isolamento (Regra 2) já no Kanban/Mapa desde a Fase 1.

**Fase 2 — Protocolos**: `prescription_templates` + `ProtocolPicker.tsx` (aplicar 1-clique).

**Fase 3 — Centro Cirúrgico (Módulo 2)**: `surgery/page.tsx`, `SurgeryKanban.tsx`, `SurgeryFichaModal.tsx` (acordeão), `AnesthesiaSection`/`SurgicalReportSection` (voz), `SurgeryKitPicker.tsx`, actions `surgeries.ts` + kits; transição pós-op via `createHospitalization`.

## Verificação
- Flags: ambos off ⇒ Internação e menu idênticos a hoje; `internacao_completa` on ⇒ UI extra; `centro_cirurgico` on ⇒ item de menu + `/dashboard/surgery` acessível.
- Alertas: simular prescrição com dose vencida → bip + notificação do navegador (com permissão); sem permissão → fallback visual.
- Timeline imutável: confirmar dose → registro aparece na Linha do Tempo com remédio/dose/hora/usuário e sem botão de editar/excluir.
- Mapa de Execução: grade mostra horários e estados; imprimir folha.
- Cirurgia: mover card Preparo→Sala→RPA; abrir ficha acordeão; ditar relatório por voz; aplicar Kit (estoque baixa via RPC + lançamento na conta); "Encaminhar para Internação" cria card no Kanban de internação.
- Testes: Playwright (`tests/e2e/sprint-master-i0*-*.spec.ts`, `testInfo.skip()`, seed find-or-update) + pytest. Migrations aplicadas no Supabase remoto após criação. `clinic_id` em toda query. Push no remote `vetmax` (`vetmax-app`); branch conforme diretriz de Routines.

## Riscos
- Sprint grande (2 módulos, ~7 migrations). Entrega faseada com checkpoint após a Fase 1.
- Notification API exige HTTPS + permissão do usuário (Vercel ok); incluir fallback.
- Reuso de Pacotes para Kits a confirmar na Fase 3 (senão `service_kits` dedicada).
