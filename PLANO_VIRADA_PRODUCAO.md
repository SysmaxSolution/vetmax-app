# PLANO DE VIRADA PARA PRODUÇÃO — SYSVETMAX

**Runbook do Diretor.** Versão 1.0 · redigido em **2026-09-24**.
**Produção:** Supabase `yivjuhurcadxtllmkkqd` (PostgreSQL **17.6.1.104**, região us-east-1, **85 MB**) · Vercel projeto **`vetmax`** → `https://sysvetmax.sysmaxsolutions.com`.
**Origem do código:** worktree `C:\sysvetmax-dev`, branch **`feature/treinamento`**, ponta **`ea8a8662`**.
**Destino:** `main` → remote **`vetmax`** (`vetmax-app.git`) → deploy Vercel de produção.

> Todo o estado de produção citado aqui foi **medido por consulta de leitura** em 24/09/2026 (Management API
> `POST /v1/projects/yivjuhurcadxtllmkkqd/database/query` + pooler). Onde eu **não** consegui medir, está dito
> explicitamente com o comando de verificação. Nenhuma alteração foi feita em produção na redação deste plano.

---

## 0. Sumário executivo — o que mudou em relação ao que se acreditava

Cinco fatos medidos hoje mudam o plano em relação à auditoria de isolamento e às memórias:

1. **A produção está VAZIA de operação.** 6 pets, 5 tutores, **4 consultas** (todas na *Animais Diagnóstico por
   Imagem*), **0 `financial_entries`**, **0 `invoices`**, **0 `central_cashier`**, **0 `consultation_services`**,
   **0 `bank_accounts`**, 8 itens de estoque, 4 usuários (`auth.users`). Banco inteiro = 85 MB.
   → O risco de *dados* nesta virada é **próximo de zero**. O risco real é de *disponibilidade* e *configuração*.

2. **As migrations 0411 e 0412 JÁ ESTÃO em produção** (a memória dizia o contrário).
   `consultation_addenda` existe, a função `enforce_consultation_immutability` existe, o trigger
   `trg_consultation_immutability` está ativo em `consultations`, e `patient_vaccines.administration_route` existe.
   A conclusão antiga vinha de `voice_transcripts` não existir em prod — mas **`voice_transcripts` não é criada por
   nenhuma migration do repositório** (`grep` em `supabase/migrations` não encontra a tabela). Era alarme falso.

3. **Os 4 bloqueadores P0 da auditoria já foram corrigidos** na própria `feature/treinamento`, em commits
   posteriores ao commit auditado (`a8284205`):
   `36cd1c7a` (renumeração de prefixos → `0464_training_academy` virou **`0472_training_academy`**, colisão morta),
   `5997b77c` (flags próprias: `usa_imagem`, `usa_laboratorio`, `usa_boleto`, gate de Portal),
   `935fdb95` + `ea8a8662` (recall de vacina fail-closed + flag própria `vaccine_recall_enabled` + modo por env),
   `123d80b0` (remoção do `ALWAYS_ON` dos relatórios), `714bcd37` (webhook Sicoob deixa de dar baixa cross-tenant).
   O backfill `usa_convenios` (P0-1) é **desnecessário**: nenhuma das 4 clínicas de produção tem
   `petlove_reconciliation` em `active_modules`.

4. **BUG NOVO, encontrado hoje, que precisa ser corrigido ANTES ou LOGO APÓS a virada:**
   `saveReportsEnabled`/`getReportsEnabled` (`src/lib/actions/reports-g13.ts:759,802`) leem e gravam a coluna
   **`clinic_settings.reports_enabled`, que NÃO EXISTE** — nem em produção, nem no dev, e **nenhuma migration a cria**
   (`grep -r reports_enabled supabase/` → 0 arquivos). Consequência: o botão Salvar da tela de configuração de
   relatórios **erra**, e a leitura cai no `REPORTS_DEFAULTS` (tudo `true`). Ou seja, o fix `123d80b0` que removeu o
   `ALWAYS_ON` **não funciona na prática** — os 19 relatórios continuam sempre ligados e o admin continua sem poder
   desligá-los. **Ver item 9.4 para a correção (migration `0475`).**

5. **PITR está DESLIGADO em produção** (`pitr_enabled: false`). Só existem backups físicos **diários**
   (o mais recente: `2026-09-24T06:40:10Z`, id `1769708701`). Não há como "voltar 10 minutos". O backup lógico do
   item 3 é **obrigatório**, não opcional.

---

## 1. Inventário exato das migrations (0409 → 0474)

**Método:** listagem de `C:\sysvetmax-dev\supabase\migrations` + consulta de leitura à produção verificando a
existência do objeto-chave de cada arquivo (`information_schema.tables/columns`, `pg_proc`, `pg_indexes`,
`pg_constraint`, `cron.job`, `storage.buckets`).

**Observações de escopo:**
- **`0432` não existe** — o número foi pulado no repositório. Não é lacuna, é numeração.
- **`0465`, `0466`, `0467`** (`clinic_fonts`, `patient_documents_canvas_snapshot`, `clinic_document_identity`)
  **não estão nesta branch** — vivem em `feature/layout-engine-v2` e **ficam no dev** (ver item 9.7).
- **`0470` e `0471`** são os antigos `0380_chat_channels_rls_prep.sql` e `0393_wpp_media_participants.sql`,
  **renomeados** pelo commit `36cd1c7a` para matar colisões de prefixo. Conteúdo **byte-idêntico** (conferido).
  Já estão aplicados em produção sob os números antigos → serão **no-ops idempotentes**.

Legenda: **APLICADA** = objeto-chave presente em prod · **AUSENTE** = objeto-chave não existe em prod ·
**N/A** = arquivo não vai nesta virada.

| # | Arquivo | Objeto-chave que prova a aplicação | Status em PROD |
|---|---|---|---|
| 0409 | `0409_marketing_attribution.sql` | tabela `marketing_attribution` | **APLICADA** |
| 0410 | `0410_voice_correction_dictionary.sql` | tabelas `voice_correction_terms`, `voice_correction_events` | **APLICADA** |
| 0411 | `0411_prontuario_immutability_addenda.sql` | tabela `consultation_addenda` + função `enforce_consultation_immutability` + trigger `trg_consultation_immutability` | **APLICADA** |
| 0412 | `0412_vaccine_administration_route.sql` | coluna `patient_vaccines.administration_route` | **APLICADA** |
| 0413 | `0413_wpp_bot_night_return_cron.sql` | job pg_cron `wpp-bot-night-return` (`*/15 * * * *`) | **APLICADA** |
| 0414 | `0414_default_templates_trigger.sql` | tabela `default_document_templates` (9 linhas) + função `seed_default_templates_for_clinic` | **APLICADA** |
| 0415 | `0415_invitations_admin_role.sql` | `invitations_role_check` contém `'admin'` | **APLICADA** |
| 0416 | `0416_patient_weights_and_migration_fields.sql` | tabelas `patient_weights`, `migration_id_map` + `tutors.rg` + `patients.size` | **APLICADA** |
| 0417 | `0417_vaccine_schedule_status.sql` | coluna `patient_vaccines.schedule_status` | **APLICADA** |
| 0418 | `0418_single_active_flow_guard.sql` | função `fn_guard_consultation_flow` + índice `uniq_consultation_active_per_patient` | **APLICADA** |
| 0419 | `0419_awaiting_review_status.sql` | `consultations_status_check` contém `'awaiting_review'` | **APLICADA** |
| 0420 | `0420_absorb_services_into_open_invoice.sql` | função `rpc_absorb_services_into_open_invoice` (corpo **sem** `exam_billing_hold_at`) | **APLICADA** |
| 0421 | `0421_animais_multi_company_and_numbering.sql` | tabelas `companies`, `document_number_sequences` + função `next_document_number` | **AUSENTE** |
| 0422 | `0422_animais_pricing_tables.sql` | tabelas `price_tables`, `price_table_items`, `pricing_settings` | **AUSENTE** |
| 0423 | `0423_animais_partner_clinics_and_os.sql` | tabela `partner_clinics` + `consultations.os_number` + `consultation_services.company_id` | **AUSENTE** |
| 0424 | `0424_animais_full_price_composition.sql` | `stock_items.purchase_price` + `pricing_settings.composition_mode` | **AUSENTE** |
| 0425 | `0425_price_table_items_margin.sql` | `price_table_items.margin_percent` | **AUSENTE** |
| 0426 | `0426_tutor_credits_and_bank_company.sql` | tabela `tutor_credits` + `bank_accounts.company_id` | **AUSENTE** |
| 0427 | `0427_fix_cashier_consultation_double_entry.sql` | corpo de `fn_sync_cashier_entry_to_financial` contém `NOT EXISTS (SELECT 1 FROM financial_entries WHERE cashier_entry_id = NEW.id)` | **APLICADA** (fora de ordem, por script ad hoc) |
| 0428 | `0428_financial_entries_allow_credit_negative.sql` | `financial_entries_amount_check` = `amount <> 0` — **hoje em prod é `amount > 0`** | **AUSENTE** |
| 0429 | `0429_card_installments_split_optional.sql` | `card_installments.split_id` nullable — **já é `YES` em prod** | **INDETERMINADA** (evidência fraca: pode ser estado original; reaplicar é no-op) |
| 0430 | `0430_pagfor_fields.sql` | `financial_entries.barcode`, `.scheduled_payment_date` | **AUSENTE** |
| 0431 | `0431_bank_statement_links.sql` | tabela `bank_statement_entry_links` + `bank_statements.reconciled_at` | **AUSENTE** |
| — | *(0432 não existe)* | — | **N/A** |
| 0433 | `0433_clinic_bank_integrations.sql` | tabela `clinic_bank_integrations` | **AUSENTE** |
| 0434 | `0434_clinic_join_code.sql` | coluna `clinics.join_code` + índice `uidx_clinics_join_code` | **APLICADA** |
| 0435 | `0435_partner_clinic_exam_costs.sql` | tabela `partner_clinic_exam_costs` | **AUSENTE** |
| 0436 | `0436_partner_clinic_commissions.sql` | tabela `partner_clinic_commissions` (⚠️ faz `DROP TABLE IF EXISTS partner_clinic_exam_costs`) | **AUSENTE** |
| 0437 | `0437_exam_to_partner_lab.sql` | `consultations.lab_partner_clinic_id` | **AUSENTE** |
| 0438 | `0438_financial_entry_consultation_link.sql` | `financial_entries.consultation_id` | **AUSENTE** |
| 0439 | `0439_company_fiscal_config_and_nfse_split.sql` | tabela `company_fiscal_config` + `billing_documents.company_id` + `clinic_fiscal_config.nfse_auto_checkout` | **AUSENTE** |
| 0440 | `0440_purchase_payables_link.sql` | `financial_entries.purchase_order_id` + `purchase_orders.duplicatas` | **AUSENTE** |
| 0441 | `0441_controlled_substances_fields.sql` | `stock_items.substance`, `.is_human_use`, `.control_class` | **AUSENTE** |
| 0442 | `0442_reconciliation_fixes.sql` | `financial_entries.is_intercompany` | **AUSENTE** |
| 0443 | `0443_financial_entry_company.sql` | `financial_entries.company_id` | **AUSENTE** |
| 0444 | `0444_exam_results.sql` | tabela `exam_results` | **AUSENTE** |
| 0445 | `0445_lab_agents.sql` | tabela `lab_agents` | **AUSENTE** |
| 0446 | `0446_imaging_studies_referring_vet.sql` | tabelas `imaging_studies`, `imaging_files`, `imaging_share_links` + bucket `imaging-files` | **AUSENTE** (bucket também) |
| 0447 | `0447_tutor_portal_identity.sql` | tabelas `tutor_users`, `tutor_user_links`, `tutor_login_tokens`, `tutor_sessions` | **AUSENTE** |
| 0448 | `0448_appointment_requests_portal_source.sql` | `appointment_requests.source` (+ `conversation_id` nullable — hoje é `NOT NULL` em prod) | **AUSENTE** |
| 0449 | `0449_catalog_portal_and_duration.sql` | `clinic_catalog.publish_to_portal` | **AUSENTE** |
| 0450 | `0450_imaging_study_catalog_link.sql` | `imaging_studies.catalog_item_id` | **AUSENTE** |
| 0451 | `0451_vaccine_portal_recall.sql` | `patient_vaccines.portal_recall_sent_at` | **AUSENTE** |
| 0452 | `0452_tutor_access_code.sql` | `tutor_users.access_code_hash` | **AUSENTE** |
| 0453 | `0453_partner_portal.sql` | tabelas `partner_clinic_professionals`, `partner_clinic_sessions` + `partner_clinics.code_public` | **AUSENTE** |
| 0454 | `0454_code_reveal_and_referral_professional.sql` | `tutor_users.access_code_enc` + `consultations.referring_professional_id` | **AUSENTE** |
| 0455 | `0455_next_document_number_auto.sql` | função `next_document_number_auto` | **AUSENTE** |
| 0456 | `0456_portal_preconsultations.sql` | tabela `portal_preconsultations` | **AUSENTE** |
| 0457 | `0457_document_signature_verification.sql` | `patient_documents.verify_code` + índice `uq_patient_documents_verify_code` | **AUSENTE** |
| 0458 | `0458_clinic_boletos.sql` | tabela `clinic_boletos` + `clinic_bank_integrations.cobranca` | **AUSENTE** |
| 0459 | `0459_lab_analyte_mapping.sql` | tabelas `exam_analytes`, `lab_analyte_mappings` + `exam_results.analyte_id` | **AUSENTE** |
| 0460 | `0460_portal_messages.sql` | tabela `portal_messages` | **AUSENTE** |
| 0461 | `0461_lab_agent_remote_reconfigure.sql` | `lab_agents.pending_env` | **AUSENTE** |
| 0462 | `0462_boleto_carteira_and_fields.sql` | `bank_accounts.boleto_config`, `.next_nosso_numero` + função `next_nosso_numero` | **AUSENTE** |
| 0463 | `0463_clinic_boleto_events.sql` | tabela `clinic_boleto_events` | **AUSENTE** |
| 0464 | `0464_insurance_providers_generalize.sql` | `insurance_providers.receipt_mode` | **AUSENTE** |
| — | `0465_clinic_fonts.sql` | *(branch `feature/layout-engine-v2`)* | **N/A — fica no dev** |
| — | `0466_patient_documents_canvas_snapshot.sql` | *(branch `feature/layout-engine-v2`)* | **N/A — fica no dev** |
| — | `0467_clinic_document_identity.sql` | *(branch `feature/layout-engine-v2`)* | **N/A — fica no dev** |
| 0468 | `0468_exam_rejection_flow.sql` | tabela `exam_rejection_reasons` + `consultation_services.exam_billing_hold_at`, `.exam_state` | **AUSENTE** |
| 0469 | `0469_absorb_respects_exam_hold.sql` | corpo de `rpc_absorb_services_into_open_invoice` contém `exam_billing_hold_at` | **AUSENTE** (prod tem a versão 0420) |
| 0470 | `0470_chat_channels_rls_prep.sql` | `chats.is_public` — *(rename de `0380`)* | **APLICADA** (no-op) |
| 0471 | `0471_wpp_media_participants.sql` | tabela `whatsapp_conversation_participants` — *(rename de `0393`)* | **APLICADA** (no-op) |
| 0472 | `0472_training_academy.sql` | tabelas `training_videos`, `training_progress`, `training_quiz_questions`, `training_module_access` | **AUSENTE** |
| 0473 | `0473_boleto_webhook_token.sql` | `bank_accounts.boleto_webhook_token` | **AUSENTE** |
| 0474 | `0474_vaccine_recall_runs.sql` | tabela `clinic_vaccine_recall_runs` | **AUSENTE** |

### 1.1 Resumo do gap

- **49 arquivos** existem na `feature/treinamento` e **não** na `main` (`git diff` de diretório).
- Destes, **4 já estão aplicados** em produção (`0427`, `0470`, `0471` e, com evidência fraca, `0429`).
- **45 migrations executam DDL real** nesta virada.
- **Nenhuma** das 49 contém `CREATE TRIGGER`, `CONCURRENTLY`, `CREATE EXTENSION`, `VACUUM`, `RENAME`,
  `DROP COLUMN`, `TRUNCATE` ou `DELETE FROM` (varredura feita). **Todas são transacionáveis.**
- **Única instrução destrutiva no lote:** `0436:5` `DROP TABLE IF EXISTS partner_clinic_exam_costs;`
  (derruba a tabela criada por `0435` e recria o modelo). Em produção a tabela **não existe** → inofensivo,
  **mas exige que a ordem 0435 → 0436 seja respeitada**.
- Escritas de dados no lote: `0421` e `0455` (`UPDATE/INSERT` em `document_number_sequences`, tabela nova),
  `0431` (`INSERT` de backfill em `bank_statement_entry_links` — prod tem **0** `bank_statements`, no-op),
  `0462` (`UPDATE bank_accounts` — prod tem **0** contas, no-op), `0446` (`INSERT storage.buckets`).
  **Nenhuma toca dado vivo de cliente.**

---

## 2. Método de aplicação controlada (sem `supabase db push`)

### 2.1 Por que `db push` está descartado

`supabase_migrations.schema_migrations` em produção **para em `0408` com 300 registros**; no dev para em
`0420` com 312. Dezenas de migrations foram aplicadas por scripts ad hoc sem registro. Um `db push` tentaria
reaplicar tudo de `0409` para frente misturando o que já existe com o que não existe, e o CLI deriva a `version`
do prefixo — qualquer colisão vira "marcada como aplicada e silenciosamente pulada". **Não use `db push`,
nem `migration repair`, nesta virada.**

Além disso, o `supabase` CLI **não está instalado** nesta máquina (`npx supabase --version` tenta baixar
`supabase@2.117.0`), e `pg_dump`/`psql`/`docker` **também não existem no PATH**. O caminho é Node + `pg`.

### 2.2 Onde o script fica

`C:\SysMax\scripts\prod-apply-migrations.mjs` — commitado junto com a virada (é auditável e reutilizável
nas próximas promoções). O manifesto de verificação fica ao lado, em
`C:\SysMax\scripts\prod-migration-manifest.json`.

### 2.3 Credenciais (por ambiente, nunca hard-coded)

- Lê `C:\SysMax\.env.local` com `dotenv` (mesmo padrão de `_prod-export.mjs`).
- Usa **`DATABASE_URL`**, **forçando a porta 5432** (session pooler). O `.env.local` traz `:6543`
  (transaction pooler), que não garante `BEGIN…COMMIT` multi-statement por sessão.
  Host: `aws-1-us-east-1.pooler.supabase.com` · user `postgres.yivjuhurcadxtllmkkqd` · `ssl: { rejectUnauthorized: false }`.
  **Ambas as portas foram testadas hoje e respondem `server_version = 17.6`.**
- **Guarda anti-acidente:** o script só roda se `new URL(DATABASE_URL).username` terminar em
  `yivjuhurcadxtllmkkqd` **e** o operador passar `--confirm=yivjuhurcadxtllmkkqd` na linha de comando.
  Sem isso, aborta. (Evita apontar para o dev `claqxwckiihknclhmzvf` por engano.)
- Nunca imprime segredo: só host, porta e usuário.

### 2.4 Manifesto

Array ordenado, um item por arquivo, exatamente na ordem numérica da tabela do item 1:

```
{ "file": "0468_exam_rejection_flow.sql",
  "version": "0468",
  "name": "exam_rejection_flow",
  "probe": { "kind": "column", "table": "consultation_services", "column": "exam_billing_hold_at" } }
```

`kind` ∈ `table` | `column` | `function` | `index` | `constraint_contains` | `function_body_contains` | `bucket`.
As sondas são **exatamente** as da coluna "objeto-chave" da tabela do item 1 — foi assim que o inventário foi
levantado, então o script confere o mesmo que eu conferi.

### 2.5 Fluxo por migration

1. **Sonda ANTES.** Se o objeto já existe → registra `SKIP (já aplicada)`, garante a linha em
   `supabase_migrations.schema_migrations` e passa para a próxima **sem executar SQL**.
2. Se não existe → `BEGIN`.
3. Lê o arquivo de `C:\SysMax\supabase\migrations\<file>` (após o merge; ver item 4) e executa como
   **um único `client.query(sql)`** — o driver `pg` aceita múltiplos statements em modo simples, que é o
   necessário para os blocos `DO $$ … $$`.
4. **Sonda DEPOIS**, dentro da mesma transação. Se o objeto **não** apareceu → `ROLLBACK` e **aborta o script
   inteiro** com código de saída 1 (a migration mentiu ou o `IF NOT EXISTS` mascarou um erro).
5. `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ($1,$2) ON CONFLICT DO NOTHING`
   — **na mesma transação**, para não recriar o gap ([[project_migrations_gap_resolved]]).
6. `COMMIT`. Log da linha.
7. Qualquer exceção → `ROLLBACK`, log do erro com o nome do arquivo, **para no primeiro erro** (sem `continue`).

### 2.6 Modos e log

- `--dry-run` é o **padrão**: roda só as sondas ANTES e imprime o plano (`APLICAR` / `SKIP`), sem abrir transação.
- `--apply` executa.
- `--only=0468,0469` aplica um subconjunto (para retomada após falha).
- Log em `C:\SysMax\.tmp\virada\apply-<YYYYMMDD-HHmm>.log` (texto) **e** `.json` (uma linha por migration com
  `file, antes, depois, ms, status`). `.tmp/` já está fora do git.

### 2.7 Reconciliação do `schema_migrations` (passo 0 do script)

Antes da primeira migration, o script registra como aplicadas — **sem executar SQL** — as versões cujo objeto-chave
já existe e que faltam na tabela: `0409`–`0420`, `0427`, `0429`, `0434` e, sob os números novos, `0470`/`0471`.
Isso leva o `schema_migrations` de `0408/300` para o estado real e faz com que a próxima promoção (a de layouts)
comece de um histórico verdadeiro. **Esse registro é somente na tabela de controle, não executa DDL.**

---

## 3. Backup antes de qualquer DDL

### 3.1 O que existe hoje (medido)

```
GET https://api.supabase.com/v1/projects/yivjuhurcadxtllmkkqd/database/backups
→ { "region":"us-east-1", "walg_enabled":true, "pitr_enabled":false,
    "backups":[ {"id":1769708701,"is_physical_backup":true,"status":"COMPLETED",
                 "inserted_at":"2026-09-24T06:40:10.198Z"}, … ] }
```

**PITR está DESLIGADO.** O ponto de restauração mais recente é o backup físico diário (~06:40 UTC). Restaurar dele
significa perder tudo que entrou no dia. Com a produção praticamente vazia isso é aceitável como rede de segurança,
mas **não substitui** um backup lógico imediatamente antes do DDL.

### 3.2 Passo obrigatório — backup lógico JSONL (5 a 10 min, sem dependências)

Reaproveitar o script que já existe e é comprovado: `C:\SysMax\_prod-export.mjs` (ele enumera as tabelas pelo
OpenAPI do PostgREST e grava um `.jsonl` por tabela). Copiar para
`C:\SysMax\scripts\prod-backup-jsonl.mjs` com **duas** alterações:

- remover o filtro `.in('clinic_id', dropIds)` → exportar **todas as linhas de todas as tabelas**;
- destino `C:\SysMax\backup-virada-<YYYYMMDD-HHmm>\`.

Executar:

```powershell
node C:\SysMax\scripts\prod-backup-jsonl.mjs
```

**Validação do backup (obrigatória antes de seguir):**

```powershell
Get-ChildItem C:\SysMax\backup-virada-* -Recurse -File |
  Measure-Object -Property Length -Sum                      # tamanho total > 0
Get-Content C:\SysMax\backup-virada-*\clinics.jsonl | Measure-Object -Line   # deve dar 4
Get-Content C:\SysMax\backup-virada-*\patients.jsonl | Measure-Object -Line  # deve dar 6
Get-Content C:\SysMax\backup-virada-*\tutors.jsonl | Measure-Object -Line    # deve dar 5
```

Se `clinics.jsonl` não tiver exatamente **4 linhas**, o backup não vale — **não prossiga**.

### 3.3 Opcional, mais forte: `pg_dump` (exige instalar o cliente)

`pg_dump` **não existe** nesta máquina. Se o Diretor quiser um dump binário restaurável:

```powershell
winget install -e --id PostgreSQL.PostgreSQL.17
# depois, com a senha do DATABASE_URL:
& "C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" `
  "postgresql://postgres.yivjuhurcadxtllmkkqd:<SENHA>@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require" `
  --schema=public --no-owner --no-acl -Fc `
  -f C:\SysMax\backup-virada-prod.dump
```

A versão do `pg_dump` **precisa ser 17** (servidor 17.6.1.104); um `pg_dump` 15/16 recusa a conexão.
Validar com `pg_restore -l C:\SysMax\backup-virada-prod.dump | Measure-Object -Line` (> 0 linhas).

### 3.4 Snapshot textual do schema (barato e útil no diff pós-virada)

Guardar, antes e depois, o resultado das mesmas consultas que geraram o inventário:

```powershell
node C:\SysMax\scripts\prod-apply-migrations.mjs --dry-run --confirm=yivjuhurcadxtllmkkqd `
  > C:\SysMax\.tmp\virada\estado-antes.txt
```

### 3.5 Não usar branching do Supabase

O *branching* do Supabase exige integração Git no projeto e cria um banco efêmero — não é backup e não ajuda aqui.
**Ignorar essa opção nesta virada.**

---

## 4. Deploy do código

### 4.1 Estado medido das branches

| Item | Valor |
|---|---|
| `main` | `1b3d255d` — *fix(seguranca): fechar adesão indevida a clínica — código de acesso…* |
| `vetmax/main` | `1b3d255d` (**idêntico** a `main` — 0 commits de diferença) |
| `feature/treinamento` | `ea8a8662` — *fix(vacinas): modo do cron explicito por env* |
| merge-base | `7ee57744` |
| divergência | `main` **1** commit à frente · `feature/treinamento` **100** commits à frente |

### 4.2 Conflito provável — **exatamente um**

`git merge-tree --write-tree --name-only main feature/treinamento` acusa:

```
CONFLICT (content): Merge conflict in src/app/register/page.tsx
Auto-merging src/components/management/ManagementWorkspace.tsx   ← resolve sozinho
```

Origem: o commit `1b3d255d` (só na `main`) reescreveu `src/app/register/page.tsx` trocando a busca pública de
clínicas pelo **código de acesso** (`join_code`). A `feature/treinamento` mexeu no mesmo arquivo por outro motivo.

**Resolução:** manter **a versão da `main`** para a lógica de adesão (`join_code` + `auth.ts`), reaplicando por
cima qualquer ajuste visual que a `treinamento` tenha feito. Isso é segurança — não pode regredir.
A migration `0434_clinic_join_code.sql` existe nas duas branches e **já está aplicada em produção**, então não há
conflito de banco.

Os outros 4 arquivos de `1b3d255d` (`ClinicJoinCodeCard.tsx`, `ManagementWorkspace.tsx`, `auth.ts`,
`0434_*.sql`) fazem merge automático — mas **confira `src/lib/actions/auth.ts` à mão** depois do merge: é onde
mora a validação do código de acesso.

### 4.3 Ordem: migrations **ANTES** do código. Por quê

1. **Todo o lote é aditivo.** Nenhum `DROP COLUMN`, nenhum `RENAME`, nenhum `NOT NULL` sem `DEFAULT`, nenhum
   trigger novo. O código **antigo**, que está rodando agora em produção, continua funcionando sobre o schema novo —
   ele simplesmente ignora as colunas e tabelas que não conhece.
2. **A única função redefinida** é `rpc_absorb_services_into_open_invoice` (0469). A assinatura é idêntica
   (`p_clinic_id UUID, p_consultation_id UUID` → `TABLE(out_invoice_id UUID, out_tutor_due NUMERIC)`), e o
   predicado novo é `(v_use_rejection_flow = FALSE OR cs.exam_billing_hold_at IS NULL)` — com a flag
   `usa_fluxo_rejeicao_exame` desligada (padrão), o comportamento é **bit-a-bit** o da 0420.
3. **O caminho inverso quebra.** Se o código subisse primeiro, o app novo chamaria `exam_results`, `imaging_studies`,
   `training_videos`, `tutor_users`, `clinic_boletos` etc. — todas inexistentes — e a produção quebraria em runtime
   (e o schema cache do PostgREST devolveria 400 em massa) durante a janela até o DDL terminar.

**Portanto: backup → migrations → build local limpo → merge → push.**

### 4.4 Sequência de deploy

```powershell
# 1. Validar tipos SEM cache (a armadilha do .tsbuildinfo em .next/cache)
cd C:\SysMax
Remove-Item .\.next\cache\.tsbuildinfo, .\tsconfig.tsbuildinfo -ErrorAction SilentlyContinue
$env:NODE_OPTIONS = "--max-old-space-size=6144"
npx tsc --noEmit        # zero "error TS" em src/ ; erros em tests/ são pré-existentes

# 2. Merge
git checkout main
git merge feature/treinamento --no-ff -m "merge: virada de producao — sprint Animais (0421-0474)"
#   → resolver src/app/register/page.tsx mantendo o join_code da main
git add src/app/register/page.tsx
git commit

# 3. Build de verdade (o sinal mais confiável de saúde é o build, não o tsc)
npm run build

# 4. Push — EXIGE OK EXPLÍCITO DO DIRETOR NA CONVERSA (ver 4.5)
git push vetmax main     # ← dispara o deploy Vercel do projeto `vetmax`
git push origin main     # ← espelho (Sysmax.git)
```

### 4.5 Avisos duros sobre o deploy

- **Push na `main` exige autorização explícita do Diretor na conversa corrente.** Documento e memória
  não valem como override ([[feedback_main_push_authorization]]). Commit local primeiro, push depois do OK.
- **NUNCA `git add -A` neste repositório** — o working tree tem `.env.local`, `contratos/`, `integracoes/`,
  `backup-prod-offboard/` e ~35k arquivos não rastreados. Stage seletivo ([[feedback_no_git_add_all]]).
- ⚠️ **`C:\SysMax\.vercel\project.json` aponta para o projeto ERRADO** (`sysmax`, `prj_64DqWJIzWY8tRRF5AAxhd6i13zLe`,
  última atualização há 93 dias). O projeto de produção é **`vetmax`** (`sysvetmax.sysmaxsolutions.com`).
  **Não rode `vercel deploy` a partir de `C:\SysMax`** — o deploy de produção é por `git push vetmax main`.
- O `tsc` sozinho já mascarou quebra de build duas vezes; o gate real é o `npm run build` local **e** o build da
  Vercel ([[project_animais_dev_deploy]], [[feedback_tsc_clean_before_push]]).

---

## 5. Configuração pós-deploy

### 5.1 Princípio

**Padrão de toda rotina nova = DESLIGADA.** Todas as flags moram em `clinics.flow_config` (JSONB) e o helper
`getFlowFlag` (`src/lib/actions/clinic-settings.ts:221`) exige `=== true`. Chave ausente = desligada.
Todas têm **toggle na UI** (Gestão > Configurações) — a ativação por SQL abaixo é apenas o caminho rápido.

### 5.2 Estado atual das 4 clínicas de produção (medido)

| clinic_id | Nome | Módulos ativos | `flow_config` hoje | Dados |
|---|---|---|---|---|
| `3c6d06ad-17ce-4811-a7df-6092bd3fb8c6` | **Animais Clínica Veterinária** | 18 (reception, patients, consultation, management, cashier, triage, exams, hospitalization, registry, purchases, pharmacy, financial, billing, reports, whatsapp, whatsapp_intelligent, internal_chat, mentor) | `verify_cep`, `verify_cpf_cnpj`, `centro_cirurgico`, `internacao_completa`, `pdv_unified_with_cashier` | 1 pet, 1 tutor, 0 consultas, 3 usuários |
| `2b7a90c3-fb5a-40d3-bc1a-e3f78e0756f4` | **Animais Diagnóstico por Imagem** | 4 (reception, patients, consultation, management) | vazio | 4 pets, 3 tutores, **4 consultas**, 0 usuários |
| `7be4d7bb-0f70-453c-bf4f-fe37bf24a9fb` | **Animais Pet** | 4 (reception, patients, consultation, management) | vazio | 0 pets, 0 tutores, 0 usuários |
| `032976c0-9171-4496-8601-db0b531670c8` | **CLÍNICA CAT & DOG** | 4 (reception, patients, consultation, management) | vazio | 1 pet, 1 tutor, 1 usuário — criada 21/09/2026 |

⚠️ `ad1c3fca-…` é a clínica **Sys Demo do ambiente de dev**. **Nunca** usar esse ID em produção.

### 5.3 Flags a ligar — por clinic_id

**(a) Animais Clínica Veterinária — `3c6d06ad-17ce-4811-a7df-6092bd3fb8c6`** (é a operação: clínica + laboratório
de referência + financeiro):

```sql
UPDATE clinics SET flow_config = flow_config || jsonb_build_object(
  'animais_foundation',        true,   -- multi-CNPJ, OS, tabelas de preço, parceiras (0421-0425)
  'usa_laboratorio',           true,   -- painel de analitos/HL7 no exame (0444/0459)
  'usa_fluxo_rejeicao_exame',  true,   -- exame não realizado não gera título (0468/0469)
  'usa_convenios',             true,   -- Vetplan / AVA / Petlove
  'usa_treinamento',           true,   -- Academia (0472) — só depois dos vídeos no bucket (item 6)
  'usa_boleto',                false,  -- só quando houver conta Sicoob com cert A1
  'usa_imagem',                false,  -- a imagem é do CNPJ 2b7a90c3
  'portal_enabled',            false,  -- ligar só após validar o portal em produção
  'vaccine_recall_enabled',    false   -- ⚠️ ligar DISPARA WhatsApp aos tutores
) WHERE id = '3c6d06ad-17ce-4811-a7df-6092bd3fb8c6';
```

**(b) Animais Diagnóstico por Imagem — `2b7a90c3-fb5a-40d3-bc1a-e3f78e0756f4`** (é o CNPJ de imagem; o valor
dele é a entrega de DICOM ao vet solicitante):

```sql
UPDATE clinics SET flow_config = flow_config || jsonb_build_object(
  'animais_foundation', true,
  'usa_imagem',         true,   -- /dashboard/imaging + visualizador DICOM (0446/0450)
  'portal_enabled',     false   -- ligar quando o portal do tutor/parceiro for validado
) WHERE id = '2b7a90c3-fb5a-40d3-bc1a-e3f78e0756f4';
```
⚠️ **`usa_imagem` depende do módulo `exams`**, que esta clínica **não tem** em `active_modules`.
Antes de ligar a flag, decidir com o Diretor se `exams` entra nos módulos deste CNPJ — senão o menu "Imagem"
não aparece. **Isso eu não sei resolver sozinho: é decisão comercial/de plano.**

**(c) Animais Pet — `7be4d7bb-0f70-453c-bf4f-fe37bf24a9fb`** (pet shop/banho e tosa, sem operação ainda):

```sql
UPDATE clinics SET flow_config = flow_config || jsonb_build_object(
  'animais_foundation', true      -- só para o CNPJ aparecer no rateio multi-empresa
) WHERE id = '7be4d7bb-0f70-453c-bf4f-fe37bf24a9fb';
```

**(d) CLÍNICA CAT & DOG — `032976c0-9171-4496-8601-db0b531670c8`: NADA.**
Nenhuma flag. Nenhum módulo novo. Ela deve ver exatamente o que vê hoje. **Conferir depois do deploy** (item 7.6).

**Verificação obrigatória depois dos UPDATEs:**

```sql
SELECT id, name, flow_config FROM clinics ORDER BY created_at;
-- a linha da Cat & Dog deve continuar {"vet_merged_modules": []}
```

### 5.4 Variáveis de ambiente no projeto Vercel `vetmax` (Production)

⚠️ **Não consegui ler o env de produção**: o `.vercel/project.json` de `C:\SysMax` está linkado ao projeto errado
(`sysmax`) e o CLI resolve por ele (`vercel env ls production` responde *"No Environment Variables found for
sysmaxs-projects/sysmax"*). **Verifique assim, antes de qualquer coisa:**

```powershell
# no dashboard: vercel.com/sysmaxs-projects/vetmax/settings/environment-variables
# ou, em um diretório temporário:
npx vercel link --project vetmax --scope sysmaxs-projects
npx vercel env ls production
```

| Variável | Para quê | Se faltar |
|---|---|---|
| `CRON_SECRET` | **Obrigatória.** Os 5 crons de `vercel.json` são fail-closed (`if (!secret \|\| auth !== Bearer secret) return 401`). | O recall de vacina, a purga de voz e as diárias de internação **nunca rodam** (401). Sem risco de disparo indevido — a rota fecha. |
| `VACCINE_RECALL_CRON_HOURLY` = `1` | Diz à rota que o cron é de hora em hora (`cronModeFromEnv`, `src/lib/vaccines/recall-schedule.ts:82`). | Modo `daily`: o disparo do dia atende todas as clínicas de uma vez e o horário escolhido vira aproximado. |
| `RESEND_API_KEY` | E-mail do laudo ao vet solicitante (0446) e envio de boleto. | Portal de imagem não notifica o vet — o P0 real do Vinícius. |
| `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` | WhatsApp (bot, recall, link do portal). | Sem WhatsApp. |
| `ANTHROPIC_API_KEY` | Voz/IA do consultório, relatório inteligente. | Recursos de IA falham. |
| `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` | Base dos links públicos (`/portal/entrar`, `/public/laudo/[token]`, `/public/boleto/[token]`). | Links quebrados ou apontando para o domínio errado. |
| `PORTAL_CODE_SECRET` | Chave AES-256-GCM dos códigos reexibíveis (0454). Se ausente, deriva do `SUPABASE_SERVICE_ROLE_KEY`. | Funciona, mas rotacionar a service role invalidaria os códigos. **Defina explicitamente.** |
| `SICOOB_CLIENT_ID`, `SICOOB_ENV`, `SICOOB_WEBHOOK_SECRET` | Boletos/PAGFOR. | Só necessário quando `usa_boleto` for ligado — **fica para depois**. |
| `KEEPALIVE_SECRET` | Alternativa aceita pelos crons. | — |

**Focus NFe:** o token **não** é variável de ambiente — fica em `company_fiscal_config` / `clinic_fiscal_config`
(migration 0439), cadastrado pela tela Empresas > Fiscal. Não há nada a configurar no Vercel.
A emissão real continua desligada por `nfse_auto_checkout` (DEFAULT `false`).

### 5.5 Ajuste do `vercel.json`

O arquivo hoje (na `feature/treinamento`) tem:

```json
{ "path": "/api/cron/vaccine-recall", "schedule": "0 9 * * *" }
```

O `0 9 * * *` é a concessão ao plano **Hobby** do projeto de dev, que recusa cron sub-diário. **Em produção
(plano Pro) mude para horário**, e a rota decide quem roda comparando a hora local de cada clínica:

```json
{ "path": "/api/cron/vaccine-recall", "schedule": "0 * * * *" }
```

E defina `VACCINE_RECALL_CRON_HOURLY=1` no env de produção. A tabela `clinic_vaccine_recall_runs` (0474) garante
**uma execução por clínica por dia local** mesmo com o cron de hora em hora.
Os outros 4 crons (`classify-errors 0 2`, `hospitalization-dailies 5 0`, `subscription-dunning 30 3`,
`voice-retention-purge 45 3`) **ficam como estão**.

**Nota:** essa alteração no `vercel.json` precisa ser um commit **na `main`** (o dev continua com o diário).
Faça-a como commit separado logo após o merge, para não conflitar na próxima promoção.

---

## 6. Conteúdo e seeds em produção

### 6.1 Buckets de Storage

Buckets existentes em produção (medido):
`chat-attachments`, `clinic-attachments`, `clinic-branding`, `clinic-logos`, `clinical-documents`,
`document-templates`, `grooming-documents`, `patient-documents`, `patient-documents-bg`,
`user-signatures`, `whatsapp-media`.

| Bucket | Quem cria | Ação |
|---|---|---|
| `imaging-files` (privado, 300 MB) | **a própria migration 0446** (`INSERT INTO storage.buckets … ON CONFLICT DO NOTHING`) | nada a fazer — só **conferir** depois |
| `training-videos` (privado) | **ninguém** — a 0472 **não** cria bucket | **criar à mão** |

**Criar `training-videos` em produção:**

```js
// node, com SUPABASE_SERVICE_ROLE_KEY de C:\SysMax\.env.local
await db.storage.createBucket('training-videos', { public: false })
```
⚠️ Armadilha conhecida ([[project_training_academy]]): passar `fileSizeLimit`/`allowedMimeTypes` no
`createBucket` **quebra**. Criar **sem opções** e ajustar depois no dashboard, se necessário.

### 6.2 Vídeos da Academia (67 aulas, ~198 MB)

Os arquivos-fonte estão em `C:\SysMax\Marketing\screencast\out\` (não estão só no dev — o bucket do dev é que
está populado). Dois scripts one-off já existem no worktree de dev:

- `C:\sysvetmax-dev\_upload-training.mjs` — sobe os 67 `.mp4` e semeia `training_videos` (catálogo global).
- `C:\sysvetmax-dev\_seed-training-quiz.mjs` — semeia 67 perguntas em `training_quiz_questions`.

⚠️ **Os dois têm `C:/sysvetmax-dev/.env.local` HARD-CODED na linha 5** — rodar como estão **subiria para o DEV
de novo**. Antes de usar: copiar para `C:\SysMax\scripts\upload-training-prod.mjs` e
`seed-training-quiz-prod.mjs`, trocando o caminho do env para `C:/SysMax/.env.local` e o
`createRequire` para `C:/SysMax/package.json`. Conferir no log de saída que a URL do Supabase impressa é a
`yivjuhurcadxtllmkkqd`.

**Validação:** `select count(*) from training_videos` → **67** e `select count(*) from training_quiz_questions` → **67**.
Storage: 67 objetos em `training-videos`.
**A flag `usa_treinamento` só deve ser ligada depois disso** — senão a tela abre com "Conteúdo em preparação".

**Cota de storage:** a produção tem 85 MB de banco; +198 MB de vídeo é o maior consumo novo. Conferir o plano de
storage do projeto antes de subir (a org do **dev** já esteve restrita por cota).

### 6.3 Seeds de catálogo

| Seed | Origem | Necessário? |
|---|---|---|
| **Motivos de rejeição de exame** | `seedDefaultRejectionReasons()` em `src/lib/actions/exam-rejection.ts:184` — botão na própria UI do Laboratório | **Sim**, para a Animais Clínica. Rodar **pela tela**, depois de ligar `usa_fluxo_rejeicao_exame`. A lista definitiva ainda depende da Aline ([[project_animais_lab_referencia_cobranca]], item 2 em aberto) — semear o padrão e ajustar. |
| **Layouts padrão Canva** | `scripts/seed-default-canva-templates.mjs` | **Não.** Produção já tem 9 `default_document_templates` e 36 `document_templates`, e a migration 0414 (trigger de seed por clínica) já está aplicada. Conferir, não semear. |
| **Convênios (Vetplan/AVA)** | `scripts/seed-animais-convenios.mjs` | **Opcional.** `insurance_providers` está com **0 linhas** em produção. Rodar só se a Animais for testar convênio na virada; caso contrário, cadastrar pela tela. |
| **Empresas faturantes (3 CNPJs)** | — | **Sim, manual.** A tabela `companies` nasce vazia com a 0421. Cadastrar os 3 CNPJs em Gestão > Configurações > Empresas, e a numeração inicial de OS em Gestão > Configurações > Numeração (perguntar ao Vinícius se continua a numeração atual deles ou começa do zero — pergunta ainda em aberto no `SPRINT_ANIMAIS_STATUS.md`). |
| **Agente de laboratório (token)** | UI: Gestão > Configurações > Laboratório | **Sim.** O token é **por ambiente**. Gerar o código **no sistema de PRODUÇÃO** e colar no agente instalado no laboratório (migration 0461 permite reconfigurar remotamente). |

---

## 7. Smoke tests pós-virada

Ordem de execução, logo depois do deploy ficar READY. Todos em produção
(`https://sysvetmax.sysmaxsolutions.com`), logado como admin da **Animais Clínica Veterinária**.

| # | O que fazer | Resultado esperado |
|---|---|---|
| 7.1 | Abrir `/dashboard` e navegar pelo menu | Carrega sem erro 500. Nenhum item novo aparece em clínica sem flag. |
| 7.2 | `SELECT count(*) FROM supabase_migrations.schema_migrations` | **≥ 349** (300 anteriores + as reconciliadas + as 45 novas). `max(version) = '0474'`. |
| 7.3 | Recepção → Check-in de um pet | Abre o modal, salva, gera **número de OS** (0421/0455). Nenhum erro de coluna. |
| 7.4 | Consultório → abrir e fechar um prontuário de teste | Salva. Ao dar alta assinada, o registro trava (trigger 0411, já existente). |
| 7.5 | Caixa → lançar e receber uma venda de teste | `financial_entries` recebe a linha; **nenhum título duplicado** (0427 já aplicada). |
| 7.6 | Entrar como usuário da **CLÍNICA CAT & DOG** | Menu **idêntico ao de antes**: sem Portal, sem Imagem, sem Boletos, sem Treinamento. **Este é o teste de não-regressão mais importante.** |
| 7.7 | Gestão > Configurações | As abas novas aparecem (Imagem, Laboratório, Boletos, Recall de Vacina, Academia, Rejeição de Exame) e os toggles salvam sem erro. |
| 7.8 | Gestão > Configurações > Relatórios, tentar desligar um relatório | ⚠️ **Vai falhar** enquanto a migration 0475 (item 9.4) não existir. Resultado esperado *hoje*: erro ao salvar. Depois da 0475: salva e o relatório some da sidebar. |
| 7.9 | `/dashboard/treinamento` (com `usa_treinamento` ligada) | Lista 18 seções / 67 aulas; um vídeo **toca** (CSP `media-src` já contempla o host do Supabase por env). |
| 7.10 | `/dashboard/imaging` na Animais Diagnóstico | Abre a tela de estudos (se `exams` estiver em `active_modules` — ver 5.3b). |
| 7.11 | Criar estudo de imagem com vet solicitante e subir um arquivo | E-mail sai pelo Resend com o link `/public/laudo/[token]` **antes** do laudo. |
| 7.12 | Abrir `/public/laudo/<token>` em aba anônima | Renderiza sem login; DICOM abre no visualizador inline. |
| 7.13 | `curl -i https://sysvetmax.sysmaxsolutions.com/api/cron/vaccine-recall` (sem header) | **401**. Se responder 200, o `CRON_SECRET` não está setado **e** a rota está em versão antiga — pare e investigue. |
| 7.14 | Vercel → Logs da produção, primeiros 10 min | Zero `PGRST` de coluna inexistente, zero `relation does not exist`. |
| 7.15 | `SELECT id, flow_config FROM clinics` | Só as 3 Animais têm flags; a Cat & Dog continua `{"vet_merged_modules": []}`. |

---

## 8. Rollback por etapa

### 8.1 Falha durante as migrations

O script para no primeiro erro, com a transação daquela migration revertida. O que já entrou **continua** —
e isso é seguro, porque tudo é aditivo e o código de produção ainda é o antigo (ordem do item 4.3).

- **Ação:** ler o log em `.tmp/virada/apply-*.log`, corrigir o SQL, retomar com
  `--only=<a que falhou>,<as seguintes>`. **Não** faça `git push` até o DDL terminar.
- **Reversíveis por natureza** (basta `DROP`): todas as `CREATE TABLE` novas — `companies`, `price_tables`,
  `price_table_items`, `pricing_settings`, `partner_clinics`, `tutor_credits`, `bank_statement_entry_links`,
  `clinic_bank_integrations`, `partner_clinic_exam_costs`, `partner_clinic_commissions`, `company_fiscal_config`,
  `exam_results`, `lab_agents`, `imaging_*`, `tutor_*`, `partner_clinic_*`, `portal_preconsultations`,
  `clinic_boletos`, `exam_analytes`, `lab_analyte_mappings`, `portal_messages`, `clinic_boleto_events`,
  `exam_rejection_reasons`, `training_*`, `clinic_vaccine_recall_runs`, `document_number_sequences`.
  Todas nascem **vazias** em produção.
- **Reversíveis com cuidado:** colunas adicionadas a tabelas existentes (`financial_entries.company_id`,
  `stock_items.is_human_use`, `consultations.os_number`, `patient_documents.verify_code`…). `DROP COLUMN`
  funciona, mas **não é necessário** — coluna a mais não atrapalha o código antigo. **Prefira deixar.**
- **NÃO reversíveis por `DROP`, precisam de `CREATE OR REPLACE` com o corpo antigo:**
  - **`0469`** sobrescreve `rpc_absorb_services_into_open_invoice`. Para voltar, reexecutar
    `supabase/migrations/0420_absorb_services_into_open_invoice.sql` (idêntica, sem o predicado novo).
  - **`0428`** troca o CHECK de `financial_entries.amount`. Para voltar:
    `ALTER TABLE financial_entries DROP CONSTRAINT financial_entries_amount_check;`
    `ALTER TABLE financial_entries ADD CONSTRAINT financial_entries_amount_check CHECK (amount > 0);`
    (só é possível se não houver título negativo gravado — hoje há **0** `financial_entries`).
  - **`0436`** faz `DROP TABLE partner_clinic_exam_costs`. Se rodar isolada **depois** de 0435 ter dados,
    perde-se a tabela. Em produção ela não existe → risco nulo **nesta** virada.
- **Rede de segurança final:** restaurar o backup físico de `2026-09-24T06:40Z` pelo dashboard
  (Database → Backups → Restore). Perde o dia inteiro. **Só em catástrofe.**

### 8.2 Falha no build/deploy do código

O merge fica **local**. Enquanto não houver `git push vetmax main`, a produção continua servindo `1b3d255d`.
Corrigir localmente e repetir o `npm run build`.

### 8.3 Falha depois do push (produção quebrada)

```powershell
cd C:\SysMax
git log --oneline -3 main          # identificar o commit de merge (M)
git revert -m 1 <SHA_do_merge>     # desfaz o merge inteiro, mantendo o histórico
git push vetmax main
git push origin main
```
Alternativa mais rápida (30 s): **Vercel → projeto `vetmax` → Deployments → o deploy anterior →
"Promote to Production"**. Faz rollback instantâneo sem mexer no git.

**O banco NÃO precisa voltar.** As migrations são aditivas; o código antigo roda sobre o schema novo.
Essa é a propriedade que torna esta virada segura.

### 8.4 Reverter só a configuração

```sql
-- desliga tudo que foi ligado, sem tocar em código nem em schema
UPDATE clinics SET flow_config = flow_config
  - 'animais_foundation' - 'usa_imagem' - 'usa_laboratorio' - 'usa_boleto'
  - 'usa_treinamento' - 'usa_fluxo_rejeicao_exame' - 'usa_convenios'
  - 'portal_enabled' - 'vaccine_recall_enabled'
WHERE id IN ('3c6d06ad-17ce-4811-a7df-6092bd3fb8c6',
             '2b7a90c3-fb5a-40d3-bc1a-e3f78e0756f4',
             '7be4d7bb-0f70-453c-bf4f-fe37bf24a9fb');
```
Efeito imediato (as flags são lidas a cada request). **Este é o rollback mais barato e deve ser a primeira
tentativa** diante de qualquer comportamento estranho numa rotina nova.

---

## 9. Riscos e pontos de atenção

### 9.1 As migrations 0411/0412 de conformidade CFMV/LGPD — **já estão em produção**

Correção de um erro de premissa. Medido hoje:
- `consultation_addenda` **existe**;
- a função `enforce_consultation_immutability` **existe**;
- o trigger **`trg_consultation_immutability` está ativo** em `public.consultations`
  (ao lado de `consultation_cfmv_retention_check`, `guard_consultation_flow`,
  `trg_consultations_create_chat`, `trg_consultations_updated_at`);
- `patient_vaccines.administration_route` **existe**.

**Não há nada a aplicar, e portanto nenhum impacto sobre dados existentes.** E, mesmo que houvesse:
`SELECT count(*) FROM consultations WHERE status='completed' AND is_reviewed_by_vet IS TRUE` → **0**.
Zero prontuários fechados em produção. A trava não morde nada.

**Sobre `voice_transcripts`:** a tabela não existe em produção **nem é criada por migration alguma**
(`grep -r voice_transcripts supabase/migrations/` → vazio). A purga de voz de 180 dias opera sobre
`voice_correction_events` (0410/0411), que **existe** em produção. O cron `voice-retention-purge` já está em
`vercel.json`. **Alarme falso; nada a fazer.**

### 9.2 Nenhum trigger novo, nenhum backfill sobre dado vivo

Varredura das 49 migrations do lote: **zero `CREATE TRIGGER`**, zero `CONCURRENTLY`, zero `CREATE EXTENSION`,
zero `RENAME`, zero `DROP COLUMN`, zero `TRUNCATE`/`DELETE FROM`.
As únicas escritas de dados são `0431` (backfill em `bank_statement_entry_links` — prod tem **0**
`bank_statements`), `0462` (`UPDATE bank_accounts` — prod tem **0** contas), `0421`/`0455`
(`document_number_sequences`, tabela nova) e `0446` (`INSERT storage.buckets`).
**Nenhuma toca linha de cliente.**

`0441` aplica `is_human_use boolean NOT NULL DEFAULT false` em **8** itens de estoque — classifica todos como
uso veterinário. Revisar esses 8 itens **antes** de imprimir o Livro de Controlados para a Vigilância.

### 9.3 A única instrução destrutiva do lote

`0436_partner_clinic_commissions.sql:5` → `DROP TABLE IF EXISTS partner_clinic_exam_costs;`
A tabela é criada pela `0435` e derrubada pela `0436` (troca de modelo). **A ordem 0435 → 0436 é obrigatória**;
o script do item 2 respeita a ordem numérica do manifesto. Em produção a tabela não existe → inofensivo agora.
Fica registrado para quem for reaplicar o lote em outro ambiente que já tenha `partner_clinic_exam_costs` com dados.

### 9.4 🔴 BUG BLOQUEANTE — `clinic_settings.reports_enabled` não existe

- `src/lib/actions/reports-g13.ts:759` faz `.from('clinic_settings').select('reports_enabled')`
- `src/lib/actions/reports-g13.ts:802` faz `.upsert({ clinic_id, reports_enabled: enabled })`
- A coluna **não existe** em produção **nem no dev**, e **nenhuma migration a cria**
  (`grep -r reports_enabled C:\sysvetmax-dev\supabase` → nenhum arquivo).

Consequência: o `select` falha em silêncio (o código cai no `REPORTS_DEFAULTS`, **tudo `true`**) e o `upsert`
**retorna erro** — a tela de configuração de relatórios não salva. Ou seja, o commit `123d80b0`, que removeu o
`ALWAYS_ON` justamente para tornar os 19 relatórios configuráveis, **não surte efeito**: continuam todos ligados
e o admin continua sem conseguir desligá-los.

**Correção — criar `0475_clinic_settings_reports_enabled.sql`** antes de dar a virada por concluída:

```sql
ALTER TABLE public.clinic_settings
  ADD COLUMN IF NOT EXISTS reports_enabled jsonb;
```

(Aditiva, idempotente, sem DEFAULT — `NULL` já é tratado pelo código como "usa os defaults".)
Aplicar pelo mesmo script do item 2 e **repetir o smoke test 7.8**.
⚠️ Lembrar de [[feedback_invoice_items_no_clinic_id]]: depois de alterar a tabela, o **schema cache do PostgREST**
precisa recarregar (`NOTIFY pgrst, 'reload schema';` ou aguardar ~1 min).

### 9.5 Reconciliação do `schema_migrations`

Estado medido: prod `max(version) = '0408'`, **300** registros. Dev `max = '0420'`, **312**.
Objetos existem muito além disso nos dois — o histórico está **mentindo** em ambos os ambientes.

O passo 0 do script (item 2.7) registra as versões faltantes cujo objeto-chave já existe, **sem executar DDL**,
e cada migration nova insere a sua linha **dentro da própria transação**. Ao fim da virada, produção deve ter
`max(version) = '0474'` e a contagem deve bater com o número de arquivos em `supabase/migrations`.

**Haverá uma lacuna proposital: `0465`, `0466`, `0467`.** Ver 9.7 — é inofensiva.

Regra permanente daqui em diante: **toda** migration aplicada por script grava sua linha em
`supabase_migrations.schema_migrations` na mesma transação ([[project_migrations_gap_resolved]]).

### 9.6 Achados da auditoria que a `feature/treinamento` já resolveu — e os que faltam

| Achado | Status |
|---|---|
| P0-1 · Petlove perde acesso por falta de `usa_convenios` | **Não se aplica em prod** — nenhuma clínica tem `petlove_reconciliation` em `active_modules`. Ligar `usa_convenios` na Animais Clínica é decisão de negócio, não backfill de emergência. |
| P0-2 · Compras lança contas a pagar por padrão | **Decisão do Diretor:** é o comportamento desejado, para todos, sem configuração ([[project_animais_dev_deploy]]). Não é achado. |
| P0-3 · Cron de recall fail-open + opt-in implícito | **Corrigido** (`935fdb95`, `ea8a8662`): auth fail-closed idêntica aos demais crons, flag própria `vaccine_recall_enabled`, limite **por clínica** (200), `clinic_vaccine_recall_runs` (0474) impedindo duplo disparo. |
| P0-4 · `ALWAYS_ON` burla `reports_enabled` | **Removido no código** (`123d80b0`), mas **inoperante** por falta da coluna → **ver 9.4**. |
| Colisão de prefixo `0464` | **Morta** (`36cd1c7a`): `0464_training_academy` → **`0472_training_academy`**; `0380`/`0393` → `0470`/`0471`. |
| P1-1/2/3/4 · Portal, Imagem, Laboratório, Boletos sem flag | **Corrigidos** (`5997b77c`): `usa_imagem`, `usa_laboratorio`, `usa_boleto` + gate de Portal, todos com toggle em Gestão > Configurações. |
| P2-3 · Webhook Sicoob dá baixa cross-tenant por `nosso_numero` | **Corrigido** (`714bcd37` + `0473_boleto_webhook_token`): token de webhook **por conta bancária**. |
| P2-6 · `/public/vaccines/[patient_id]` sem expiração/revogação | **Em aberto.** Pré-existente ao lote. Mitigado por ninguém ter carteira pública gerada em produção. Tratar depois. |
| P2-7 · Token do agente de laboratório em texto puro | **Em aberto.** 192 bits de entropia, isolamento por `clinic_id` correto. Aceitar nesta virada; tratar na próxima. |
| P1-5 · Clínica com `active_modules` NULL vê o menu inteiro | **Em aberto**, mas **as 4 clínicas de produção têm `active_modules` preenchido** — não dispara. |

### 9.7 A lacuna 0465–0467 é inofensiva — e como promover os layouts depois

`0465_clinic_fonts.sql`, `0466_patient_documents_canvas_snapshot.sql` e `0467_clinic_document_identity.sql`
pertencem à branch **`feature/layout-engine-v2`** (worktree `C:\sysvetmax-layouts`, ponta `fc6849d7`) e
**não vão nesta virada**. Depois dela, produção terá `…0464, 0468, 0469, 0470, …, 0474` — um buraco de três números.

**Por que isso não quebra nada:** nenhuma migration de 0468 a 0474 referencia objeto criado por 0465–0467
(as três mexem em `clinic_fonts`, no snapshot de canvas de `patient_documents` e na identidade documental da
clínica — assuntos exclusivos do motor de layouts). O método de aplicação é **por arquivo, com sonda de objeto**,
não por comparação de faixa numérica: um número faltando é irrelevante. E `db push` — o único mecanismo que se
importaria com a sequência — está descartado.

**Como promover os layouts depois (na ordem):**
1. `git checkout feature/layout-engine-v2` e **`git merge main`** — a branch está desatualizada em relação ao lote
   desta virada e **ainda carrega a colisão de prefixo `0464_training_academy.sql` + `0464_insurance_providers_generalize.sql`**
   (ela saiu de antes do `36cd1c7a`). O merge com a `main` resolve, mas **confira** se o
   `0464_training_academy.sql` sumiu e o `0472_training_academy.sql` ficou.
2. Rodar o mesmo `scripts/prod-apply-migrations.mjs` com um manifesto contendo apenas `0465`, `0466`, `0467`
   (sondas: tabela `clinic_fonts`; coluna `patient_documents.canvas_snapshot`; a identidade documental da 0467 —
   **confirmar o nome exato do objeto lendo o arquivo** antes de montar a sonda).
3. Merge → `git push vetmax main`.

### 9.8 Outros pontos

- **Storage:** +198 MB de vídeo num projeto que hoje tem 85 MB de banco. **Conferir a cota do plano** antes
  (a org do ambiente de dev já foi restringida por cota de storage).
- **`appointment_requests.conversation_id` é `NOT NULL` em produção** e a 0448 o torna nullable. Enquanto a 0448
  não rodar, nenhum agendamento vindo do portal pode ser gravado. Está no lote; só não pule.
- **Lab-agent:** o token é **por ambiente**. Gerar no sistema de **produção** e colar no agente (0461 permite
  reconfiguração remota). Não reaproveitar o token do dev.
- **Divergência dev↔prod continua depois da virada**, por decisão do Diretor: o dev segue à frente. Esta virada é
  um corte no tempo, não uma sincronização permanente.
- **Janela recomendada:** a Animais **ainda não opera de fato** em produção. Qualquer horário serve.
  Ainda assim, prefira **fora do horário comercial** — a Cat & Dog tem 1 usuário ativo.

---

## 10. Checklist executável

### Fase A — Preparação (pode ser feita com antecedência, não toca produção)

- [ ] A1. Confirmar com o Diretor: **OK explícito nesta conversa** para `git push vetmax main`.
- [ ] A2. Criar `C:\SysMax\scripts\prod-apply-migrations.mjs` + `prod-migration-manifest.json` (item 2).
- [ ] A3. Criar `C:\SysMax\scripts\prod-backup-jsonl.mjs` a partir de `_prod-export.mjs` (item 3.2).
- [ ] A4. Criar `supabase/migrations/0475_clinic_settings_reports_enabled.sql` (item 9.4).
- [ ] A5. Copiar e **corrigir o caminho do `.env`** de `_upload-training.mjs` e `_seed-training-quiz.mjs`
      para `C:\SysMax\scripts\*-prod.mjs` (item 6.2).
- [ ] A6. Verificar o env de produção do projeto Vercel **`vetmax`**: `CRON_SECRET`, `RESEND_API_KEY`,
      `EVOLUTION_*`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `PORTAL_CODE_SECRET` (item 5.4).
- [ ] A7. Adicionar `VACCINE_RECALL_CRON_HOURLY=1` no env de produção.
- [ ] A8. Conferir a cota de Storage do projeto `yivjuhurcadxtllmkkqd` (cabe +198 MB?).
- [ ] A9. Avisar o Vinícius/Aline da janela.

### Fase B — Backup (produção, somente leitura)

- [ ] B1. `node C:\SysMax\scripts\prod-backup-jsonl.mjs`
- [ ] B2. Validar: `clinics.jsonl` = **4 linhas**, `patients.jsonl` = **6**, `tutors.jsonl` = **5**.
- [ ] B3. Registrar o id do backup físico mais recente pela Management API
      (`GET /v1/projects/yivjuhurcadxtllmkkqd/database/backups`).
- [ ] B4. Salvar o estado-antes: `--dry-run > .tmp\virada\estado-antes.txt`.
- [ ] B5. *(opcional, mais forte)* `pg_dump` v17 (item 3.3).

### Fase C — Migrations (o DDL)

- [ ] C1. `git checkout main` e `git merge feature/treinamento --no-ff` **(merge primeiro, para que os
      arquivos `.sql` existam em `C:\SysMax\supabase\migrations`)** — resolver o conflito de
      `src/app/register/page.tsx` mantendo o `join_code` da `main`.
- [ ] C2. Conferir à mão `src/lib/actions/auth.ts` (validação do código de acesso intacta).
- [ ] C3. `node scripts\prod-apply-migrations.mjs --dry-run --confirm=yivjuhurcadxtllmkkqd`
      → o plano deve listar **45 `APLICAR`** e **4 `SKIP`** (0427, 0429, 0470, 0471).
- [ ] C4. `node scripts\prod-apply-migrations.mjs --apply --confirm=yivjuhurcadxtllmkkqd`
- [ ] C5. Conferir o log: zero erro, todas as sondas DEPOIS verdes.
- [ ] C6. `SELECT max(version), count(*) FROM supabase_migrations.schema_migrations` → `0474` / **≥ 349**.
- [ ] C7. Conferir o bucket `imaging-files` criado pela 0446.
- [ ] C8. `NOTIFY pgrst, 'reload schema';` (ou aguardar ~1 min) para o PostgREST enxergar tudo.

### Fase D — Código

- [ ] D1. Limpar caches e validar tipos:
      `Remove-Item .\.next\cache\.tsbuildinfo, .\tsconfig.tsbuildinfo -EA SilentlyContinue` +
      `$env:NODE_OPTIONS="--max-old-space-size=6144"` + `npx tsc --noEmit` → zero `error TS` em `src/`.
- [ ] D2. `npm run build` → sucesso.
- [ ] D3. Commit separado alterando `vercel.json`: recall de `0 9 * * *` → **`0 * * * *`**.
- [ ] D4. **Com o OK do A1:** `git push vetmax main` **e** `git push origin main`.
      ⚠️ **Nunca** `git add -A`. ⚠️ **Nunca** `vercel deploy` de `C:\SysMax` (projeto linkado errado).
- [ ] D5. Acompanhar o build na Vercel (projeto `vetmax`) até **READY**.

### Fase E — Conteúdo

- [ ] E1. Criar o bucket **privado** `training-videos` (`createBucket` **sem opções**).
- [ ] E2. `node C:\SysMax\scripts\upload-training-prod.mjs` — conferir no log que a URL é a
      **`yivjuhurcadxtllmkkqd`**.
- [ ] E3. `node C:\SysMax\scripts\seed-training-quiz-prod.mjs`
- [ ] E4. Validar: `training_videos` = **67**, `training_quiz_questions` = **67**.

### Fase F — Configuração

- [ ] F1. `UPDATE clinics … 3c6d06ad-…` (item 5.3a).
- [ ] F2. `UPDATE clinics … 2b7a90c3-…` (item 5.3b) — **decidir antes** se `exams` entra em `active_modules`.
- [ ] F3. `UPDATE clinics … 7be4d7bb-…` (item 5.3c).
- [ ] F4. **NÃO tocar em `032976c0-…` (Cat & Dog).**
- [ ] F5. `SELECT id, name, flow_config FROM clinics ORDER BY created_at` → conferir as 4 linhas.
- [ ] F6. Cadastrar as 3 **empresas faturantes** (CNPJs) em Gestão > Configurações > Empresas.
- [ ] F7. Configurar a **numeração de OS** (Gestão > Configurações > Numeração) — número inicial acertado
      com o Vinícius.
- [ ] F8. Semear os **motivos de rejeição de exame** pela tela do Laboratório.
- [ ] F9. Gerar o **token do lab-agent em produção** e reconfigurar o agente do laboratório.

### Fase G — Verificação

- [ ] G1. Rodar os 15 smoke tests do item 7, na ordem.
- [ ] G2. **7.6 é o mais importante:** Cat & Dog sem nenhuma superfície nova.
- [ ] G3. Logs da Vercel, 10 min: zero `relation does not exist`, zero `PGRST` de coluna.
- [ ] G4. `curl -i .../api/cron/vaccine-recall` sem header → **401**.
- [ ] G5. Registrar o resultado em `SPRINT_ANIMAIS_STATUS.md` e atualizar a memória
      `project_animais_dev_deploy.md` com o novo estado real da produção.

### Fase H — Pós-virada (dias seguintes)

- [ ] H1. Aplicar `0475` (se ainda não) e reconferir o smoke test 7.8.
- [ ] H2. Revisar `is_human_use` nos 8 itens de estoque controlado antes do primeiro Livro de Controlados.
- [ ] H3. Promover `feature/layout-engine-v2` (migrations 0465–0467) conforme 9.7.
- [ ] H4. Tratar os P2 em aberto: expiração/revogação do link público de vacina (P2-6) e hash do token do
      lab-agent (P2-7).
- [ ] H5. Ligar `portal_enabled` e, só depois de validado e com consentimento, `vaccine_recall_enabled`.

---

## Anexo — o que eu NÃO consegui determinar

1. **Variáveis de ambiente do projeto Vercel `vetmax` em produção.** O `.vercel/project.json` de `C:\SysMax`
   aponta para o projeto `sysmax` (stale, 93 dias) e o CLI resolve por ele.
   **Verificar:** dashboard `vercel.com/sysmaxs-projects/vetmax/settings/environment-variables`,
   ou `npx vercel link --project vetmax --scope sysmaxs-projects && npx vercel env ls production`
   **em um diretório descartável** (para não reescrever o `.vercel` do repo).
2. **Se a migration `0429` chegou a rodar em produção.** `card_installments.split_id` já é nullable, o que pode
   ser o estado original. Reaplicar é no-op; marquei como *INDETERMINADA*.
3. **Objeto-chave exato da `0467_clinic_document_identity.sql`** — não abri o arquivo (worktree
   `C:\sysvetmax-layouts` está fora de escopo). Ler antes de montar a sonda dela (item 9.7 passo 2).
4. **Se `exams` deve entrar em `active_modules` da Animais Diagnóstico por Imagem.** É decisão comercial/de plano,
   não técnica — mas sem ela a flag `usa_imagem` não faz o menu aparecer naquele CNPJ.
5. **Cota de Storage disponível** no projeto de produção. Verificar no dashboard antes de subir 198 MB de vídeo.
6. **Lista definitiva dos motivos de rejeição de exame** — ainda depende da Aline
   ([[project_animais_lab_referencia_cobranca]], pergunta 2 sem resposta desde 21/09).
