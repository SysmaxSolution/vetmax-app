# Auditoria de Segurança VetMax — Defesa em Profundidade

**Data:** 2026-07-09 · **Escopo:** código-fonte completo (35 rotas de API, 125 server actions, 306 migrations, 166 arquivos com `createAdminClient`/service_role, webhooks, parsers de arquivo, config de plataforma). **Método:** 7 auditores paralelos (multi-tenancy/RLS, authN/authZ, webhooks, injeção/parsing, segredos/LGPD, integridade financeira, dependências/config), apenas leitura de código. Achados CRÍTICOS verificados manualmente contra o código real.

> **Nota de método:** nenhum ataque foi executado contra o banco de produção. Os achados são estáticos (leitura de código). A **bateria de testes** em `tests/security/` codifica cada classe de vulnerabilidade como guarda de regressão executável (`npm run test:security`), sem dependência de banco.

---

## Placar

| Severidade | Qtde | Natureza dominante |
|---|---|---|
| **CRÍTICO** | 4 | Credencial de prod exposta · isolamento entre clínicas · bypass de pagamento · aprovação forjada de aplicação de código |
| **ALTO** | 7 | Fail-open de webhook · vazamento de PII cross-tenant · sem rate limit · sem HSTS · IDOR · bypass de paywall |
| **MÉDIO** | 12 | Injeção de filtro PostgREST · desvio de caixa · XSS armazenado · CSP fraca · PII em rota pública |
| **BAIXO** | 11 | Hardening, self-XSS, DoS de recurso, higiene de trilha/tokens |

**Boa notícia:** o núcleo de autorização está correto (padrão `requireTenantCtx()`/`.eq('clinic_id', ...)` predominante), `npm audit` de produção = **0 high/critical**, libs de parsing (fast-xml-parser 5.x, pdfjs, exceljs) sem XXE/RCE conhecido, imutabilidade de prontuário (trigger 0411) é real no banco, e o webhook `vercel-logs` (HMAC + fail-closed) é o modelo correto. Os furos são **exceções pontuais** ao padrão seguro — o que os torna corrigíveis rapidamente.

---

## CRÍTICO

### C1 — Credencial de superusuário `postgres` de produção hardcoded e commitada
- **Arquivo:** `debug-appointments-clinic.js:3` (rastreado no git, **NÃO** no `.gitignore`).
- **Problema:** connection string literal `postgresql://postgres:<senha>@db.<ref>.supabase.co:5432/postgres`. É o papel `postgres` (superusuário) — **ignora todo o RLS**. O project-ref também vaza.
- **Exploração:** qualquer um com acesso ao repo (colaborador, fork, histórico git) conecta direto ao banco de produção e lê/escreve prontuários, CPFs, financeiro de **todas** as clínicas, sem auth de app nem RLS.
- **Correção:** (1) **rotacionar a senha do banco no Supabase HOJE** — considerar comprometida; (2) remover o literal (ler de `process.env`); (3) purgar do histórico git (BFG/`git filter-repo`); (4) `debug-*.js` no `.gitignore`.

### C2 — `launchPendingSale` confia no `clinic_id` enviado pelo cliente (cross-tenant)
- **Arquivo:** `src/lib/actions/sales.ts:319-402` (verificado).
- **Problema:** a server action lê `params.clinic_id` do request, valida **só** que existe `user` (não *qual* clínica), e usa esse `clinic_id` em todas as queries com admin client. O UPDATE de estoque (`:356-359`) nem amarra `clinic_id`. As irmãs `settlePendingSale`/`cancelPendingLaunch` derivam da sessão corretamente — só esta ficou de fora. (A RPC `rpc_create_sale` usada por `createSale` **é segura**: valida `v_clinic_id != p_clinic_id` na migration 0095:167.)
- **Exploração:** usuário autenticado da Clínica A chama `launchPendingSale({ clinic_id: <UUID da B>, items:[{ stock_item_id:<item da B>, quantity:999, ... }] })` → lê estoque da B, sabota inventário da B e injeta venda no caixa da B.
- **Correção:** remover `clinic_id` do `params`; derivar de `profiles` do `user` logado; adicionar `.eq('clinic_id', profileClinicId)` no UPDATE de `stock_items`.

### C3 — Plano pago (Premium/Enterprise) liberado sem pagamento
- **Arquivo:** `src/lib/subscription/gatekeeper.ts:63,70` + `src/lib/actions/subscription.ts:290` (verificado).
- **Problema:** o gate de runtime (`checkModuleAccess`) libera o bundle do plano com `subscriptionUsable = status === 'active' || 'trialing'` e **nunca lê `lifecycle_state` nem `clinics.active_modules`**. Mas `subscribeToPlan` grava `status:'active'` **imediatamente** (antes de qualquer pagamento; `lifecycle_state` fica `pending`). São dois sistemas paralelos e o que enforça (`status`) não é o que checa pagamento.
- **Exploração:** admin chama `subscribeToPlan({ plan:'enterprise' })`, gera a fatura PIX/cartão e **nunca paga** → todos os módulos Enterprise ficam ativos. Se cair em `past_due`, re-chamar `subscribeToPlan` reseta para `active`. Produto pago inteiro de graça.
- **Correção:** o gate deve exigir estado pago — derivar `subscriptionUsable` de `lifecycle_state === 'active'` (negar em `pending/past_due/suspended/expired/grace`), e/ou ler `clinics.active_modules` (campo que a ativação por pagamento popula). `subscribeToPlan` não deveria gravar `status:'active'` no fluxo pendente.

### C4 — Webhook do Diretor sem segredo → aprovação forjada dispara aplicação autônoma de código
- **Arquivo:** `src/app/api/webhooks/whatsapp/director/route.ts:10-47` + `src/lib/director-commands.ts` (verificado: sem checagem de `apikey`).
- **Problema:** diferente do webhook por clínica, este **não valida o header `apikey`**. A única "autorização" é comparar os últimos 11 dígitos de `remoteJid` (100% controlado pelo atacante no POST) com `P0_ALERT_PHONE`. Telefone não é segredo.
- **Exploração:** atacante que conheça/adivinhe o celular do Diretor faz POST forjado com `remoteJid=<telefone>` e texto `"SIM <shortId>"` → `handleDirectorCommand` aprova um `fix_plan` e chama `/api/cron/apply-approved-fixes` — **aplicação autônoma de mudanças de código / abertura de PR** sem revisão humana real. Requer um `fix_plan` pendente para ter efeito, mas o blast radius é o pipeline de código.
- **Correção:** exigir `apikey === EVOLUTION_API_KEY` (fail-closed) no topo do handler, como no webhook de clínica; idealmente um segredo dedicado da instância do Diretor. Telefone não pode ser o único fator.

---

## ALTO

### A1 — Webhook WhatsApp de clínica falha-aberto (fail-open) se `EVOLUTION_API_KEY` estiver vazia
`src/app/api/webhooks/whatsapp/[clinicId]/route.ts:96-100`. A checagem `if (expectedKey && incomingKey !== expectedKey)` é pulada quando a env está ausente (deploy novo, typo, rollback — **já houve incidente com este header**). Sem a env, qualquer POST forjado injeta mensagens/tutores, dispara a IA (custo Anthropic) e envia WhatsApp em nome da clínica. **Correção:** `if (!expectedKey || incomingKey !== expectedKey) return 401` + `crypto.timingSafeEqual` + validar env no boot. (Os crons já são fail-closed — usar como modelo.)

### A2 — Chave do WhatsApp é segredo global único → tenant spoofing entre clínicas
`[clinicId]/route.ts:96-119`. `clinicId` vem do path e só é checado como "existe". A única credencial (`EVOLUTION_API_KEY`) é a **mesma para todas as clínicas**; nada amarra o remetente ao `clinicId`. Quem tiver a chave global (outra clínica cliente, ex-funcionário, vazamento em log) injeta mensagens no `clinicId` de outra clínica. **Correção:** segredo por clínica (`webhook_secret` em `clinic_whatsapp_settings`) e validar que a `evolution_instance_name` do payload corresponde ao `clinicId`.

### A3 — `getWhatsappDirectorStats` vaza PII de tutores cross-tenant
`src/lib/actions/whatsapp-director.ts:24-78`. Server action sem `auth.getUser()`, admin client, `clinicId` do chamador. Retorna `tutor_phone`/`tutor_name` de qualquer clínica. **Correção:** derivar `clinicId` de `requireTenantCtx()`; remover o parâmetro.

### A4 — Ausência total de rate limiting
`grep rateLimit|upstash` = 0 ocorrências no projeto. Login/registro (brute force/credential stuffing), webhooks (queima de créditos Anthropic em loop), carteira pública (enumeração/DoS) — tudo sem teto. **Correção:** rate limit no `proxy.ts` para rotas sensíveis (Upstash Ratelimit ou WAF da Vercel), priorizando webhooks e `/login`.

### A5 — `Strict-Transport-Security` (HSTS) ausente
`next.config.ts:19-49`. Todos os outros headers OK (X-Frame-Options DENY, nosniff, CSP `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy), mas sem HSTS (a Vercel não injeta). Expõe a SSL-stripping/MITM, agravado pelo WebView do app mobile. **Correção:** `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.

### A6 — `createHospitalization` reativa internação de outra clínica (IDOR via `consultation_id`)
`src/lib/actions/hospitalizations.ts:157-184`. O branch de reativação de internação "discharged" não filtra `clinic_id` (só `consultation_id`/`id`). Usuário da A reabre leito e retoma diárias de uma internação da B. **Correção:** `.eq('clinic_id', clinicId)` no SELECT de `previous`/`active` e no UPDATE.

### A7 — Paywall de módulos bypassável pelo admin da clínica
`src/components/management/ModulesTab.tsx:73-75` (master key `NEXT_PUBLIC_MODULE_MASTER_KEY` com fallback literal no bundle) + `src/lib/actions/clinic-settings.ts:112-145` (`updateClinicConfig` só valida `role==='admin'`, não confere tier). Admin no Free grava `active_modules` arbitrário e habilita módulos pagos. Perda de receita. **Correção:** validar entitlement/tier no servidor antes de persistir `active_modules`; mover master key para var server-only sem fallback.

---

## MÉDIO

| # | Achado | Arquivo | Correção |
|---|---|---|---|
| M1 | `getActiveCorrectionsForClinic` sem auth + **injeção PostgREST `.or()`** via `clinicId` (a cláusula de clínica *é* o `.or()` → injeção cruza tenant) | `voice-corrections.ts:141-149` | Derivar `clinicId` da sessão; nunca interpolar input em filtro |
| M2 | `getLowStockCount` sem auth, `clinicId` do cliente (vazamento operacional) | `stock.ts:85-94` | Derivar `clinicId` da sessão |
| M3 | **Splits de caixa não reconciliados com o total** — `Σ split.amount` não é validado contra `sale.total_amount` (desvio: operador fecha venda de R$500 com split de R$0,01) | `sales.ts:219-235,442-491`; `0193` sem constraint | Validar `round(Σ splits)==round(total)` no servidor + trigger |
| M4 | `addServiceToConsultation` aceita `price_override` sem checar `consultation.pricing:edit` (a irmã `updateConsultationServicePrice` checa) | `services.ts:113-116,157-158` | Gatear `price_override` com `hasAccessRight` |
| M5 | `updateEntry`/`baixarTitulo` alteram `amount` de título já **pago**/de origem `cashier` sem guarda de status/role | `financial.ts:445-475,599-731` | Bloquear edição quando `status='paid'`/`source='cashier'`; exigir estorno |
| M6 | Webhook Asaas: token estático único, sem HMAC do payload, compare não constant-time (fail-closed e idempotente — OK) | `asaas/route.ts:37-42` | `timingSafeEqual`; validar pagamento via GET `/payments/{id}` antes de ativar |
| M7 | **XSS armazenado** no preview de template DOCX: `field.label` (gerado por IA de DOCX enviado) + HTML do mammoth sem sanitizar em `dangerouslySetInnerHTML` | `ImportTemplateModal.tsx:278,308` | DOMPurify no HTML + `escapeHtml(field.label)` |
| M8 | Injeção de filtro PostgREST `.or()`/`.ilike()` generalizada (contida por `.eq('clinic_id')` AND-ado, mas quebra filtro/500 e input de planilha em `import.ts:63`) | `omnisearch.ts`, `import.ts:63`, `catalog.ts`, etc. | Whitelistar tokens (`replace(/[,().*\\]/g,'')`); CPF/telefone `^\d+$` |
| M9 | CSP com `unsafe-inline` **e** `unsafe-eval` em `script-src` (neutraliza anti-XSS) | `next.config.ts:37` | Migrar para CSP com nonce; remover `unsafe-eval` |
| M10 | Carteira de vacinação pública: PII (nome tutor, microchip, CNPJ) sem expiração/revogação (UUID não-enumerável — por isso não é ALTO) | `public-data.ts:154`, `public/vaccines/[patient_id]/page.tsx` | Token de capability com `expires_at`/`revoked_at`; `Referrer-Policy: no-referrer`; reavaliar microchip |
| M11 | Capacitor: `allowNavigation` inclui `*.vercel.app` (qualquer app de terceiro na Vercel) + `limitsNavigationsToAppBoundDomains:false` no iOS | `capacitor.config.ts:35-41,91` | Restringir ao domínio canônico + `*.supabase.co`; ativar App-Bound Domains |
| M12 | `uploadUserSignature` escreve `electronic_signature_url` de `userId` sem `.eq('clinic_id')` (cross-tenant) | `user-management.ts:158` | Adicionar `.eq('clinic_id', profile.clinic_id)` |

---

## BAIXO

| # | Achado | Arquivo | Correção |
|---|---|---|---|
| B1 | `audit_logs` INSERT `WITH CHECK (true)` — envenenamento de trilha (SELECT está OK) | `0022_rls_consolidation.sql:242-244` | Restringir INSERT a `clinic_id = get_user_clinic_id()` |
| B2 | `updatePatientReproductiveStatus` update sem `clinic_id` (depende de RLS de `patients`) | `triage.ts:937-953` | Adicionar `.eq('clinic_id', clinicId)` |
| B3 | Inserts de internação/cirurgia (`recordFluid` etc.) carimbam `clinic_id` sem validar o pai (`hospitalization_id`) | `hospitalization-fluids.ts`, `voice-persist.ts:32` | Validar posse do pai antes do insert (padrão de `getSurgery`) |
| B4 | Proxy: gate de `/dashboard/management` lê cookie `vetmax-role` com fallback `?? 'admin'` (mitigado por re-check no DB da página/action) | `proxy.ts:119-129` | Ler `profiles.role` no proxy; remover fallback `'admin'` |
| B5 | Self-XSS no MentorChat (bolha sem escape; sem vetor cross-user) | `MentorChat.tsx:553` | `escapeHtml` antes do replace de `**` |
| B6 | Parser NF-e sem limite de tamanho pré-parse (DoS de memória; sem XXE) | `nfe-parser.ts:41` | Rejeitar XML > 5 MB antes de `parse()` |
| B7 | `fix-applier` argument injection via `branchName` no git (`execFile`, sem shell — imune a shell injection) | `fix-applier.ts:245-270` | Validar `^[A-Za-z0-9/_-]+$`; usar `--` |
| B8 | `poweredByHeader` não desativado (info disclosure) + `bodySizeLimit:'50mb'` global (DoS com uploads repetidos, some com rate limit) | `next.config.ts` | `poweredByHeader:false`; limite menor fora das rotas de laudo |
| B9 | Comparações de token de webhook com `!==` (timing side-channel teórico) | `asaas/route.ts:40`, `[clinicId]/route.ts:98` | `crypto.timingSafeEqual` |
| B10 | `js-yaml <3.15.0` moderate (DoS) transitivo via **jest (devDependency)** — sem caminho em produção | `npm audit` | `overrides` cobrir o ramo `@istanbuljs/load-nyc-config`, ou ignorar (devDep) |
| B11 | Master key com fallback literal `'vetmax-MASTER-2024'` no bundle client | `ModulesTab.tsx:73-75` | Remover fallback; var server-only |

---

## Plano de remediação priorizado

**P0 — hoje (blast radius máximo, correção rápida):**
1. **C1** — rotacionar senha do banco Supabase + remover/purgar `debug-appointments-clinic.js`.
2. **C4 / A1** — webhooks do Diretor e de clínica: fail-closed com `apikey` + `timingSafeEqual`.
3. **C2** — `launchPendingSale`: derivar `clinic_id` da sessão.
4. **C3** — gatekeeper: exigir `lifecycle_state === 'active'`.

**P1 — esta semana:**
5. **A3, M1, M2, M12, A6** — server actions/queries que aceitam `clinic_id` do cliente ou não filtram tenant: derivar da sessão.
6. **A2** — segredo de webhook por clínica.
7. **A4** — rate limiting em `/login` e webhooks. **A5** — HSTS.
8. **A7** — validar tier no servidor para `active_modules`.
9. **M3, M4, M5** — reconciliação de splits + gate de `price_override` + trava de edição de título pago.
10. **M7** — sanitizar preview de template DOCX.

**P2 — hardening (defesa em profundidade):**
- **M6, M8, M9, M10, M11** e todos os BAIXO. CSP com nonce, imutabilidade de snapshot de preço no banco (paridade com trigger 0411), token de capability na carteira pública, App-Bound Domains no iOS.

---

## Bateria de testes de regressão (`tests/security/`)

Guardas estáticas executáveis — codificam cada classe de vulnerabilidade acima e travam a reincidência em CI, **sem tocar no banco**:

| Spec | Trava |
|---|---|
| `tenant-isolation.guard.test.ts` | Baseline das server actions que aceitam `clinic_id`/`clinicId` (18 hoje). Falha se surgir nova, ou avisa para remover do baseline quando uma for corrigida. Marca C2/A3/M1/M2 como MUST-FIX. |
| `webhooks-failclosed.guard.test.ts` | Todo webhook que usa segredo deve ser fail-closed (`!expected`); proíbe o padrão fail-open `if (expected && ...)`. Exige `apikey` no webhook do Diretor. |
| `secrets-and-tracked-files.guard.test.ts` | Nenhum `postgresql://` com senha rastreado no git; nenhum `debug-*.js` versionado; nenhum `NEXT_PUBLIC_*` com nome de segredo (SERVICE_ROLE/ANTHROPIC/EVOLUTION/TOKEN/SECRET/PASSWORD). |
| `subscription-gate.guard.test.ts` | O gatekeeper deve referenciar `lifecycle_state` (não só `status`). Falha até C3 ser corrigido. |

**Rodar:** `npm run test:security` (config dedicada `jest.security.config.ts`, sem setup de banco).
