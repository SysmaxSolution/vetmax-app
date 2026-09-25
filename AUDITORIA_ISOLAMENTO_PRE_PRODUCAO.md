# Auditoria de Isolamento e Ativação — Pré-Produção

**Objeto auditado:** worktree `C:\sysvetmax-dev`, branch `feature/treinamento`, commit **`a8284205`**
("feat(dev): consolidar sprint Animais no ambiente de testes — portal do tutor, laboratório, boletos, imagens, relatórios")
**Escopo:** tudo que entrou entre as migrations `0437` e `0464` (406 arquivos, +19.705/-865 linhas).
**Data:** 2026-09-24 · **Natureza:** somente leitura, nenhuma alteração feita no worktree.

> Nota de método: outro agente escrevia no mesmo worktree em paralelo. Arquivos não rastreados
> relativos a "rejeição de exame" foram ignorados. Todas as evidências abaixo são do commit `a8284205`.

---

## 1. Veredito executivo

**A promoção para produção NÃO está pronta como está.** O que foi construído é sólido do ponto de
vista de banco de dados e de isolamento de dados (nenhum trigger global, nenhum backfill, tokens de
alta entropia, filtros de tenant corretos), mas **falha no requisito central do Diretor**: boa parte
das rotinas novas **não tem mecanismo de ativação**. Elas aparecem e/ou atuam por padrão para
clínicas que não configuraram nada, porque foram penduradas em módulos antigos já ativos
(`reception`, `exams`, `financial`, `reports`, `purchases`).

Três classes de problema, em ordem de gravidade:

1. **Vazamento de UI sem flag** — 8 superfícies novas visíveis por padrão (Portal, Imagem/DICOM,
   Boletos, 8 relatórios novos, painel de laboratório dentro do exame).
2. **Mudança de comportamento em fluxo compartilhado** — o recebimento de compra passou a lançar
   contas a pagar **por padrão** (checkbox pré-marcado), e relatórios financeiros existentes
   mudaram de janela/semântica de cálculo.
3. **Regressão em cliente existente** — quem hoje usa Conciliação Petlove **perde o acesso** no
   deploy, porque a tela passou a exigir uma flag nova (`usa_convenios`) que ninguém tem setada.

O lado bom: **as 29 migrations são todas aditivas, idempotentes e seguras.** Nenhum `CREATE TRIGGER`,
nenhum backfill, nenhum `RENAME`/`DROP COLUMN`, nenhum `NOT NULL` sem `DEFAULT`. O risco de produção
**não está no banco**, está na camada de aplicação.

---

## 2. Tabela-matriz das rotinas

| # | Rotina | Mecanismo de ativação | Default p/ clínica nova | Vazamento de UI? | Toca código compartilhado? | Risco |
|---|---|---|---|---|---|---|
| 1 | **Academia de Treinamento** | `flow_config.usa_treinamento` (menu **e** rota) | Invisível/inerte | Não | Não | **BAIXO** ✅ |
| 2 | **Centro Cirúrgico** (referência) | `flow_config.centro_cirurgico` (menu + rota) | Invisível/inerte | Não | Não | **BAIXO** ✅ |
| 3 | **Conciliação de convênios genérica** | `flow_config.usa_convenios` + módulo `petlove_reconciliation` | Invisível | Não | **Sim** — remove acesso de quem já usa Petlove | **ALTO** ⚠️ (regressão) |
| 4 | **Chat do Portal / Portal (Tutores)** | **NENHUM** — `moduleKey:'reception'` no menu; rota sem gate | **Visível e acessível** | **Sim** | Não | **ALTO** |
| 5 | **Módulo de Imagem + visualizador DICOM** | Reaproveita `moduleKey:'exams'`; rota com gate frágil | **Visível** p/ quem tem Exames | **Sim** | Não | **ALTO** |
| 6 | **Laboratório (exam_results, HL7, analitos)** | `ExamResultsPanel` renderizado incondicionalmente no exame | **Visível** p/ quem tem Exames | **Sim** | Sim (fila de exames) | **ALTO** |
| 7 | **Relatórios novos** (BI, Smart/IA, Controlados, Aging, Fluxo de Caixa, Faturamento p/ Dimensão, DRE por CNPJ, Mov. de Boletos) | `ALWAYS_ON` — **burla** o `reports_enabled` existente | **Todos visíveis** | **Sim** | Sim (reescrita de DRE/fluxo) | **ALTO** |
| 8 | **Boletos Sicoob (cobrança)** | **NENHUM** — aba fixa no Financeiro | **Visível** (inerte sem conta) | **Sim** | Não | **MÉDIO** |
| 9 | **Compras → Contas a Pagar** | Checkbox no modal, **pré-marcado `true`** | **Liga por padrão** | Não | **Sim** — cria `financial_entries` | **ALTO** |
| 10 | **Recall de vacina por cron** | `flow_config.portal_enabled` (indireto, dentro do envio) | Não envia | Não | Sim (cron diário 09:00) | **ALTO** (auth fail-open + opt-in implícito) |
| 11 | **Portal do Tutor (login/acesso)** | `portal_enabled` **não é checada no login** | Entra se tiver link/código | n/a | Não | **MÉDIO** |
| 12 | **Portal do Parceiro (vet solicitante)** | **NENHUMA flag** — só a existência do código | Inerte até gerar código | Não | Não | **MÉDIO** |
| 13 | **NFS-e por empresa / split fiscal** | `clinic_fiscal_config.nfse_auto_checkout` (DEFAULT `false`) + agrupamento por `company_id` | Comportamento atual preservado (1 nota) | Não | Sim (checkout) | **BAIXO** ✅ |
| 14 | **Controlados (campos de estoque)** | Campos aditivos; relatório em `ALWAYS_ON` | `is_human_use=false` p/ todo item existente | Via item 7 | Não | **MÉDIO** |
| 15 | **Agendamento online / portal booking** | `portal_enabled` + `booking_mode_portal` | `portalEnabled=false` | Não | Não | **BAIXO** ✅ |
| 16 | **Pré-consulta do portal** | Dentro de `/portal` (gated pelo acesso do tutor) | Inerte | Não | Não | **BAIXO** ✅ |
| 17 | **Numeração automática de OS (0455)** | `flow_config.animais_foundation` | Não emite | Não | Sim (check-in) | **BAIXO** ✅ |
| 18 | **Webhook Sicoob** | `SICOOB_WEBHOOK_SECRET` (fail-closed) | Inerte | Não | Sim (baixa de título) | **MÉDIO** (busca cross-tenant) |

---

## 3. Achados priorizados

### P0 — Impedem a ida para produção

---

#### P0-1 · Regressão: quem usa Conciliação Petlove hoje PERDE o acesso no deploy

**Arquivos:**
- `src/app/dashboard/financial/insurance-reconciliation/page.tsx:28-31`
- `src/components/management/ManagementNav.tsx:50`
- `src/components/financial/FinancialWorkspace.tsx:531-532`
- `src/lib/actions/clinic-settings.ts:221` (`getFlowFlag` → `flow[flag] === true`)

**Hoje acontece:** a tela de conciliação passou a exigir **duas** condições:
```
if (!modules.includes('petlove_reconciliation') || !usaConvenios) redirect('/dashboard/financial')
```
`usa_convenios` é uma chave **nova** no JSONB `flow_config`. Em produção, **nenhuma clínica tem essa
chave**, e o default é estrito (`=== true` → `false`). Resultado: Almavet e Animais, que hoje usam
conciliação Petlove, abrem o Financeiro e a opção sumiu; a aba **Convênios** em Gestão também some
(`ManagementNav.tsx:50`).

**Correção sugerida:** backfill **antes** do deploy, ligando a flag para quem já usa —
`UPDATE clinics SET flow_config = flow_config || '{"usa_convenios":true}'::jsonb
WHERE 'petlove_reconciliation' = ANY(active_modules);`
Alternativa (mais defensiva): tornar o default da flag "herdado" — `usa_convenios ?? modules.includes('petlove_reconciliation')`.

---

#### P0-2 · Compras: recebimento de mercadoria passou a lançar contas a pagar por padrão

**Arquivos:**
- `src/components/purchases/ConfirmReceiptModal.tsx:40` — `const [launchPayable, setLaunchPayable] = useState(true)`
- `src/components/purchases/ConfirmReceiptModal.tsx:81-83` — chama `launchPayablesFromPurchase`
- `src/components/purchases/PurchaseOrderCard.tsx` (diff) — o botão "Confirmar", que antes era
  `confirmPurchaseReceipt` em um clique, agora abre o modal
- `src/lib/actions/purchases.ts:482+` — `launchPayablesFromPurchase`

**Hoje acontece:** quem usa Compras hoje clica "Confirmar" e apenas dá entrada no estoque. Depois do
deploy, o mesmo clique abre um modal com **"lançar contas a pagar" já marcado**, e confirmar gera
N títulos `payable` em `financial_entries`. É uma mudança opt-out, não opt-in, em fluxo compartilhado —
polui o Contas a Pagar de todo cliente de Compras que não pediu isso. A ação em si é idempotente por
ordem e valida permissão (`admin/owner/manager`), mas o **default** é o problema.

**Correção sugerida:** `useState(false)`, ou condicionar o default a uma flag
(`flow_config.purchases_auto_payable`, default `false`). Manter a funcionalidade, inverter o default.

---

#### P0-3 · Cron de recall de vacina: autenticação *fail-open* e opt-in implícito

**Arquivos:**
- `src/app/api/cron/vaccine-recall/route.ts:13-17`
- `vercel.json` — `{"path": "/api/cron/vaccine-recall", "schedule": "0 9 * * *"}` (diário, 09:00)
- `src/lib/actions/tutor-portal.ts:339` (gate real do envio)
- `src/components/management/PortalBookingSettings.tsx:64-72` (texto do toggle)

**Hoje acontece — duas falhas distintas:**

**(a) Fail-open.** Este é o **único cron do repositório** com esta forma:
```js
const secrets = [process.env.CRON_SECRET, process.env.KEEPALIVE_SECRET].filter(Boolean)
if (secrets.length && !secrets.some(s => auth === `Bearer ${s}`)) return 401
```
Se nenhuma das duas variáveis estiver setada no ambiente, `secrets.length === 0` e **a rota executa
sem autenticação nenhuma** — qualquer um na internet dispara uma leva de WhatsApp. Todos os outros
crons (`hospitalization-dailies:10-13`, `voice-retention-purge:10-13`, `subscription-dunning`,
`classify-errors`) usam o padrão fail-closed `if (!secret || auth !== Bearer secret) return 401`.

**(b) Opt-in implícito.** O envio real é gateado por `flow_config.portal_enabled` dentro de
`sendTutorPortalWhatsApp` (`tutor-portal.ts:339`) — ou seja, clínica sem portal não recebe nada. **Mas**
o toggle que o admin vê diz apenas *"Usar o Portal do Tutor — libera a Área do Tutor (histórico,
exames, vacinas e agendamento)"*. Nada informa que ativá-lo **também liga uma campanha diária
automática de WhatsApp para os tutores**. Uma clínica que ligue o portal só para mostrar exames passa
a disparar mensagens em nome dela, sem ter pedido. Risco LGPD e risco de ban da instância Evolution.

**(c) Menor, mas real:** o `limit(500)` (`route.ts:28`) é **global**, não por clínica. Uma clínica com
backlog grande de vacinas consome a cota inteira e as demais ficam sem recall naquele dia.

**Correção sugerida:** (a) adotar fail-closed idêntico aos outros crons; (b) criar flag dedicada
`flow_config.vaccine_recall_enabled` (default `false`), separada de `portal_enabled`, com texto
explícito na UI; (c) paginar/limitar por clínica.

---

#### P0-4 · Relatórios novos burlam o mecanismo de configuração existente

**Arquivos:**
- `src/components/reports/ReportsWorkspace.tsx:222` — a linha do problema:
```js
const ALWAYS_ON = ['dashboard','smart','commissions','controlled','aging','cashflow','revenue','stock_position','clients','dre_company','boleto_movement']
```
- `src/components/reports/ReportsWorkspace.tsx:223-226` — filtro que honra `ALWAYS_ON` acima de `enabled`
- `src/lib/actions/reports-g13.ts:696-714` — `ReportsEnabled` / `REPORTS_DEFAULTS` só têm as **7 chaves antigas**
- `src/components/reports/ReportsSettings.tsx:11` — o painel de configuração só lista essas 7

**Hoje acontece:** já existe um mecanismo por clínica para ligar/desligar relatório
(`clinic_settings.reports_enabled`). Os **8 relatórios novos** — Painel (BI), Relatório Inteligente
(IA), Livro de Controlados, Aging, Fluxo de Caixa, Faturamento por Dimensão, DRE por CNPJ,
Movimentação de Boletos — foram colocados numa allowlist que **ignora** esse mecanismo. Toda clínica
com o módulo `reports` passa a ver os 8, e **o admin não consegue desligá-los** porque as chaves nem
existem em `ReportsEnabled`. Note que "Curva ABC" ficou fora do `ALWAYS_ON` e é corretamente
configurável — a inconsistência é evidente dentro do próprio arquivo.

**Correção sugerida:** estender `ReportsEnabled` com as 8 chaves novas, default `false`, adicioná-las
a `ReportsSettings.LABELS`, e remover o `ALWAYS_ON` (ou reduzi-lo a `commissions`, que é pré-existente).

---

### P1 — Condicionam a ida (vazamento de UI sem gate)

---

#### P1-1 · "Portal (Tutores)" no menu e rota sem gate nenhum

**Arquivos:**
- `src/lib/nav-links.ts:68` — `{ label: 'Portal (Tutores)', href: '/dashboard/portal-mensagens', ..., moduleKey: 'reception' }`
- `src/app/dashboard/portal-mensagens/page.tsx:9-13` — único check é `if (!user) redirect('/login')`
- `src/config/path-modules.ts:5-25` — o segmento `portal-mensagens` **não está mapeado**, então
  `moduleKeyFromPath` devolve `null` e `src/app/dashboard/template.tsx:43` libera sem checar plano

**Hoje acontece:** `reception` é módulo básico, ativo em praticamente toda clínica. Toda clínica de
produção passa a ver um item "Portal (Tutores)" no menu no dia do deploy, e a rota é acessível por
URL direta por qualquer usuário autenticado, sem plano e sem `portal_enabled`. O conteúdo em si é
tenant-safe (`portal-chat.ts:89,110` filtram por `clinic_id`), então **não há vazamento de dados** —
é vazamento de superfície.

**Correção sugerida:** trocar `moduleKey:'reception'` por um gate `ctx.portalEnabled` em
`getVisibleNavLinks` (como já é feito para `usaTreinamento` na linha 104), e repetir o gate
server-side na página, no padrão de `treinamento/page.tsx:20-25`.

---

#### P1-2 · Módulo de Imagem / DICOM pendurado em `exams`, com gate de rota frágil

**Arquivos:**
- `src/lib/nav-links.ts:54` — `{ label: 'Imagem', href: '/dashboard/imaging', ..., moduleKey: 'exams' }`
- `src/app/dashboard/imaging/page.tsx:26-28` — `if (mods && !mods.includes('exams')) redirect('/dashboard')`
- `src/config/path-modules.ts` — segmento `imaging` **não mapeado** → sem enforcement de plano

**Hoje acontece:** toda clínica com Exames ganha "Imagem" no menu. Pior: como `imaging` não está em
`PATH_SEGMENT_TO_MODULE`, o `template.tsx` não aplica o gatekeeper de plano — **uma clínica Free
acessa o módulo de Imagem inteiro por URL direta**, apesar de `exams` ser feature promovida/paga
(`nav-links.ts:31`). E o gate da própria página tem bypass: quando `active_modules` é `NULL`,
`mods && ...` é falso e não redireciona.

**Correção sugerida:** flag própria (`flow_config.usa_imagem`, default `false`) no menu e na página;
mapear `imaging: 'exams'` em `path-modules.ts` para restaurar o enforcement de plano; trocar
`if (mods && !mods.includes(...))` por `if (!mods?.includes(...))`.

---

#### P1-3 · Painel de resultados de laboratório renderizado incondicionalmente no exame

**Arquivo:** `src/components/exams/ExamDetail.tsx:611`
```jsx
<ExamResultsPanel consultationId={consultation.id} canRelease={...} />
```

**Hoje acontece:** toda clínica com o módulo `exams` passa a ver, dentro do detalhe de exame, a UI de
lançamento de analitos, importação HL7, etiqueta de tubo e liberação pelo MV. Incoerência clara: a
**configuração** do agente de laboratório está corretamente gateada por `animais_foundation`
(`src/components/management/Settings/SettingsWorkspace.tsx:84,198-221`), mas o **consumo** dela não.

**Correção sugerida:** envolver com o mesmo gate (`useAnimaisFoundation()`) ou uma flag `usa_laboratorio`.

---

#### P1-4 · Aba "Boletos" (e "CNPJs") fixa no Financeiro

**Arquivos:**
- `src/components/financial/FinancialWorkspace.tsx:517-528` — `mainTabs` sem condicional
- `src/components/financial/FinancialWorkspace.tsx:889` — `{isBoletos && <BoletosTab />}`

**Hoje acontece:** toda clínica com módulo `financial` ganha as abas **Boletos** (Sicoob) e **CNPJs**
(multi-empresa). Funcionalmente inertes sem conta bancária com `boleto_enabled` (`BoletosTab.tsx:38-40`
filtra por `x.enabled`, e `bank_accounts.boleto_enabled` tem DEFAULT `FALSE` na migration 0462), mas
visíveis. Contraste no mesmo arquivo: o link "Conciliação de Convênios" (linhas 530-548) **é**
corretamente gateado por `useModule` + `useUsaConvenios`.

**Correção sugerida:** filtrar `mainTabs` — `boletos` só quando existir conta com `boleto_enabled`;
`cnpjs` só quando `animaisFoundation` (ou existir mais de uma `company`).

---

#### P1-5 · Clínica sem módulos configurados vê o menu inteiro

**Arquivos:** `src/lib/nav-links.ts:108-115` combinado com `src/app/dashboard/layout.tsx:240`
(`activeModules: activeModules.length > 0 ? activeModules : null`)

**Hoje acontece:** quando `activeModules` chega `null`, a condição `if (link.moduleKey && ctx.activeModules)`
é falsa e a função cai no `return true` da linha 115 — **todos** os itens com `moduleKey` aparecem,
incluindo os novos. Comportamento pré-existente, mas o lote novo aumenta o estrago.

**Correção sugerida:** tratar `null` como "conjunto vazio" em vez de "sem filtro" para módulos novos.

---

### P2 — Devem ser corrigidos, não bloqueiam

---

#### P2-1 · `portal_enabled` não protege o login do Portal do Tutor

`src/lib/actions/tutor-portal.ts:312,339` são os **únicos** pontos que checam a flag — e ambos só
decidem se o WhatsApp é **enviado**. `loginTutorWithCode` (`tutor-portal.ts:362`),
`createTutorSessionFromToken` (`:404`), `getTutorContext` (`src/lib/portal/session.ts:18`) e
`inviteTutorToPortal` (`:83`) **não** consultam `flow_config`. Um tutor com link/código válido entra
mesmo numa clínica que nunca ativou o portal. Os dados que ele vê são os dele
(`src/lib/portal/access.ts:33-40` `canAccessPatient` cruza `tutor_id` **e** `clinic_id`), então não é
vazamento cross-tenant — é uma rotina "ativa" sem ativação.
**Correção:** checar `portal_enabled` em `getTutorContext` e recusar o login.

#### P2-2 · Portal do Parceiro não tem flag de ativação alguma

Não existe equivalente a `portal_enabled` para `/parceiro`. O único controle é a existência de um
código gerado pelo staff. Inerte na prática (ninguém entra sem código), mas fora do padrão exigido.
Adicionalmente, o segredo do código do parceiro tem **~30 bits** (`src/lib/portal/partner-code.ts:7-17`,
6 chars de alfabeto 33) contra ~40 bits do tutor (`src/lib/portal/access-code.ts:12-16`, 8 chars).
Ambos mitigados por lockout de 5 tentativas / 15 min e comparação `timingSafeEqual` (`access-code.ts:37`).
**Correção:** flag `flow_config.partner_portal_enabled`; subir o segredo do parceiro para 8+ chars.

#### P2-3 · Webhook Sicoob resolve boleto sem filtro de clínica

`src/app/api/webhooks/sicoob-cobranca/route.ts:31`
```js
await admin.from('clinic_boletos').select('id, clinic_id').eq('nosso_numero', nossoNumero)
  .order('created_at', {ascending:false}).limit(1).maybeSingle()
```
O `nosso_numero` é gerado por **conta bancária** (`0462`, função `next_nosso_numero(p_bank_account_id)`,
`bank_accounts.next_nosso_numero` começa em 1 para cada conta). Logo, duas clínicas terão o mesmo
`nosso_numero` com quase certeza. O lookup global pega o **mais recente** e pode dar baixa no título
da clínica errada. A autenticação em si é fail-closed (linha 13) — correta —, mas o segredo é único
global (não por clínica) e vai na query string (aparece em logs de acesso).
**Correção:** resolver o boleto por `(bank_account_id ou clinic_id) + nosso_numero`, usando um
identificador de conta presente no payload ou uma URL de webhook por conta.

#### P2-4 · Semântica de relatórios financeiros mudou para todos

`src/lib/actions/reports-g13.ts` (diff) e `src/lib/actions/cashier-reports.ts` (diff):
- Fluxo de caixa deixou de janelar por `created_at` e passou a janelar **pagos por `payment_date`,
  pendentes por `due_date`**.
- `payment_method='credit_balance'` (uso de crédito) e `is_intercompany` passaram a ser **excluídos**
  de recebido/pago (também em `src/lib/actions/financial.ts:2201` `getCrossCompanyOverview`).
- `r.type === 'inflow'/'outflow'` virou `'receivable'/'payable'`.

São correções de auditoria (evitam contar o mesmo dinheiro duas vezes) e provavelmente **certas**, mas
mudam números históricos que o cliente já viu, sem flag e sem aviso. Não é bug — é mudança que precisa
ser **comunicada**, e vale conferir um mês fechado antes/depois.

#### P2-5 · `is_human_use = false` aplicado retroativamente a todo o estoque

`supabase/migrations/0441_controlled_substances_fields.sql:5-9` adiciona
`is_human_use boolean NOT NULL DEFAULT false`. Tecnicamente seguro, mas classifica **todo** item já
cadastrado como uso veterinário sem revisão. Como o Livro de Controlados (Portaria 344/1998) separa
razão por uso humano × veterinário, um item humano pré-existente sai errado no livro impresso para a
Vigilância. **Correção:** revisão manual do catálogo de controlados antes de usar o livro.

#### P2-6 · `/public/vaccines/[patient_id]` usa o UUID do pet como token, sem revogação

`src/lib/actions/public-data.ts:64-164`. UUID v4 (122 bits) não é enumerável e o CPF do tutor é
mascarado, mas **não há `expires_at` nem `revoked_at`** — diferente de `imaging_share_links`, que tem
ambos. Link vazado fica válido para sempre. Pré-existente ao lote, registrado para completude.

#### P2-7 · Token do agente de laboratório armazenado em claro

`src/lib/actions/lab-agents.ts:81` gera `'lab_' + randomBytes(24).hex` (192 bits, forte) e
`src/lib/lab/agent-auth.ts:13-17` compara com `.eq('token', token)` — texto puro no banco, sem hash,
sem comparação constant-time em código. Inconsistente com os códigos de tutor/parceiro, que guardam
apenas hash scrypt. Risco prático baixo (entropia alta), mas quem lê a tabela recebe credencial viva.
**Isolamento está correto:** `clinic_id` vem sempre do agente resolvido pelo token, nunca do payload
(`api/lab/results/route.ts:28,34`, `api/lab/worklist/route.ts:14`) — um agente **não** consegue postar
resultado em outra clínica.

---

## 4. Colisão de prefixo de migration — `0464` duplicado

Existem **dois** arquivos com o mesmo prefixo:

| Arquivo | Linhas | Conteúdo |
|---|---|---|
| `0464_insurance_providers_generalize.sql` | 14 | `ALTER TABLE insurance_providers` + `receipt_mode`, `config` |
| `0464_training_academy.sql` | 118 | 6 tabelas novas + RLS + 6 policies da Academia |

**Avaliação.** Não é a primeira vez no repositório — já existem `0380_asaas_billing.sql` /
`0380_chat_channels_rls_prep.sql` e `0393_cashier_orphan_backfill_log.sql` /
`0393_wpp_media_participants.sql`, e a produção sobreviveu a ambos. Isso indica que **na prática este
repositório não aplica migrations via `supabase db push`**, e sim por scripts `scripts/apply-XXXX.mjs`
ad hoc (há dezenas deles no diretório), o que torna a colisão inofensiva — cada arquivo é executado
por nome completo.

**Porém, o risco é real se alguém usar `supabase db push`:** o CLI deriva a `version` do prefixo
numérico do nome. Duas entradas com `version = '0464'` colidem na chave primária de
`supabase_migrations.schema_migrations` — o resultado é ou um erro de push, ou (pior) **a segunda
migration marcada como já aplicada e silenciosamente pulada**. Se a pulada for
`0464_training_academy.sql`, a Academia vai para produção com o código presente e as **6 tabelas
ausentes** — a tela quebra em runtime, não no deploy.

**Não consegui determinar** qual dos dois caminhos será usado nesta promoção — isso precisa ser
confirmado pelo Diretor antes do deploy.

**Correção sugerida (baixo custo, elimina a dúvida):** renomear `0464_training_academy.sql` →
`0465_training_academy.sql` **antes** do deploy. Ambas são idempotentes (`IF NOT EXISTS` /
`DROP POLICY IF EXISTS`), então renomear não tem efeito colateral. Se preferir não renomear, aplique
os dois arquivos explicitamente por script e **verifique** a existência de `training_videos` no banco
de produção depois.

---

## 5. O que o banco NÃO tem (confirmação positiva)

Auditadas as 29 migrations `0437`–`0464`:

- **Nenhum `CREATE TRIGGER`** em todo o intervalo. As duas únicas rotinas de banco criadas são RPCs
  chamadas explicitamente pela aplicação: `next_document_number_auto` (0455) e `next_nosso_numero`
  (0462). Nenhuma dispara sozinha em INSERT/UPDATE.
- **Nenhum backfill de dados** (`UPDATE`/`INSERT` em massa). A única exceção é o `INSERT ... ON
  CONFLICT DO NOTHING` do bucket de storage em `0446:18`.
- **Nenhum `RENAME`, `DROP COLUMN` ou mudança de enum.** Em particular, `0464_insurance_providers_generalize.sql`
  é **100% aditiva**: Petlove não é renomeada nem migrada, apenas herda `receipt_mode='convenio_repasse'`
  pelo DEFAULT — semanticamente correto para o caso Petlove.
- **Todo `NOT NULL` novo tem `DEFAULT` seguro** (`0440:19` `duplicatas`, `0441:5-9` `is_human_use`,
  `0442:6` `is_intercompany`, `0448:12` `source`, `0449:9` `publish_to_portal`, `0458:43` `cobranca`,
  `0462:11-14` boleto, `0439:51` `nfse_auto_checkout=false`).
- **Todas as 29 são idempotentes** (`IF NOT EXISTS` / `DROP POLICY IF EXISTS` / `ON CONFLICT DO NOTHING`).
- **Toda tabela nova tem `clinic_id`**, exceto três casos propositais e documentados no próprio
  arquivo: `tutor_users` (identidade cross-clínica, 0447), `training_videos` e
  `training_quiz_questions` (acervo global da Sysmax, 0464).
- **RLS habilitada em todas as tabelas novas.** Várias ficam **sem policy** de propósito (acesso só
  via `service_role`): `tutor_users`, `tutor_user_links`, `tutor_login_tokens`, `tutor_sessions`
  (0447), `partner_clinic_sessions` (0453), `portal_preconsultations` (0456), `clinic_boletos` (0458),
  `exam_analytes`, `lab_analyte_mappings` (0459), `portal_messages` (0460), `clinic_boleto_events` (0463).
  O padrão está documentado nos cabeçalhos. **Ressalva:** "RLS ligada sem policy" significa
  *default-deny total* — seguro, mas o isolamento passa a depender **exclusivamente** do código de
  aplicação. A auditoria das server actions confirmou que os filtros de tenant estão corretos em
  todos os caminhos lidos (`canAccessPatient` em `src/lib/portal/access.ts:33-40` cruza
  `tutor_id` + `clinic_id`; `portal-chat.ts:89,110` filtra por `clinic_id`;
  `partner-portal.ts:265-276` fecha IDOR). A única exceção encontrada é o webhook Sicoob (P2-3).
  `partner_clinic_sessions` (0453) é a única sem o comentário justificando a ausência de policy.

---

## 6. Checklist — o que precisa virar flag antes do deploy

Flags a criar em `clinics.flow_config`, **todas com default `false`** (o helper `getFlowFlag`
já garante isso em `src/lib/actions/clinic-settings.ts:221` via `=== true`):

- [ ] `portal_enabled` — **passar a gatear também** o menu (`nav-links.ts:68`), a rota
      `/dashboard/portal-mensagens` e o **login** do tutor (`session.ts:18`). Hoje só gateia o envio de WhatsApp.
- [ ] `usa_imagem` — módulo de Imagem/DICOM (`nav-links.ts:54` + `imaging/page.tsx`), hoje herdando `exams`.
- [ ] `usa_laboratorio` — `ExamResultsPanel` (`ExamDetail.tsx:611`), alinhando com o gate que já existe
      na configuração do agente.
- [ ] `usa_boleto` — aba Boletos no Financeiro (`FinancialWorkspace.tsx:525`); ou derivar de
      `bank_accounts.boleto_enabled`.
- [ ] `vaccine_recall_enabled` — **separada** de `portal_enabled`, com texto explícito na UI
      ("dispara WhatsApp automático diário aos tutores").
- [ ] `partner_portal_enabled` — Portal do Parceiro.
- [ ] `purchases_auto_payable` — controlar o default do checkbox em `ConfirmReceiptModal.tsx:40`
      (ou simplesmente inverter para `false`).
- [ ] `reports_enabled` — **estender** as 8 chaves novas em `ReportsEnabled`
      (`reports-g13.ts:696`), adicioná-las a `ReportsSettings.LABELS` e **remover o `ALWAYS_ON`**
      (`ReportsWorkspace.tsx:222`).

Ações de dados / infraestrutura antes do deploy:

- [ ] **Backfill `usa_convenios = true`** para clínicas com `petlove_reconciliation` em `active_modules`
      (senão Almavet e Animais perdem a conciliação — P0-1).
- [ ] **Renomear `0464_training_academy.sql` → `0465_...`** (ou confirmar o método de aplicação e
      verificar a existência de `training_videos` em prod depois).
- [ ] **Confirmar `CRON_SECRET` setado em produção** — obrigatório enquanto `vaccine-recall` for
      fail-open; corrigir para fail-closed de qualquer modo.
- [ ] **Mapear `imaging` e `portal-mensagens` em `src/config/path-modules.ts`** para restaurar o
      enforcement de plano (hoje ambos escapam do gatekeeper via `template.tsx:43`).
- [ ] **Revisar `is_human_use`** nos itens de estoque controlado antes de usar o Livro de Controlados.
- [ ] **Avisar Almavet/Animais** da mudança de janela e da exclusão de `credit_balance`/intercompany
      nos relatórios financeiros (P2-4).

---

## 7. Limites desta auditoria (o que não foi determinado)

- **Método de aplicação de migrations em produção** — não consegui determinar se será
  `supabase db push` ou scripts `apply-*.mjs`. Isso define a gravidade real da colisão `0464`.
- **Gate de split fiscal no backend de billing** — `src/components/billing/BillingWorkspace.tsx:144`
  expõe o filtro "NFS-e" sem flag identificada. O fluxo de emissão em si preserva o comportamento
  atual para clínica single-CNPJ (`billing-documents.ts:1116` agrupa por `company_id`; sem empresas,
  `company_id` é `null` → um único grupo → uma nota), então classifiquei como BAIXO — mas não
  varri o `BillingWorkspace` inteiro.
- **`PurchasesWorkspace`** foi auditado apenas no caminho de confirmação de recebimento
  (`PurchaseOrderCard` → `ConfirmReceiptModal`); não varri as demais abas.
- **`src/app/api/webhooks/asaas/route.ts`** não foi auditado (fora do escopo 0437–0464).
- Não executei nada contra o banco de produção nem de testes; toda a análise é estática sobre o
  commit `a8284205`.
