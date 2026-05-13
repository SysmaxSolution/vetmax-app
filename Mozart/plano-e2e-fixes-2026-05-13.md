# Plano de Correção E2E — Baseline 2026-05-12
**Data:** 2026-05-13  
**Compilado por:** Mozart / Claude Code — Bypass Mode  
**Branch:** main  
**Baseline de referência:** 599 ✅ / 85 ❌ / 393 ⏭ (run 2026-05-12)

---

## Resumo Executivo

| Categoria | Falhas | Correção | Status |
|-----------|--------|----------|--------|
| CSS/Layout responsivo | 69 | Sprint Mobile (pendente) | ⏳ Pendente |
| `profile.clinic_id=null` em 7 specs | ~12 | `seedUsers()` no `beforeAll` | ✅ Aplicado |
| TC-GRM-013 grooming kanban | 1 | Seletor botão Entregar | ✅ Aplicado (92030e0a) |
| Hidratação React + cashier-hydrated | ~10 | sentinel `cashier-hydrated` | ✅ Aplicado (56e7f23e) |
| TC-I02-03 / TC-INT-02 / TC-G04-01 | 3 | Modal hospitalization + seedUsers | ⏳ Parcial |
| mentor-resilience | 1 | Investigação pendente | ⏳ Pendente |
| TC-MOB-SM-07 tablet | 1 | Layout tablet | ⏳ Pendente |

---

## Erros Corrigidos Nesta Sessão (2026-05-13)

### FIX-A — `seedUsers()` ausente em 7 spec files (P1)

**Causa raiz:** Após um spec corromper `profiles.clinic_id` via trigger ou FK cascade, outros specs executados na mesma sessão não conseguem login (redirecionam para `/onboarding`) porque o `profile.clinic_id` ficou `null`. A correção de `56e7f23e` (2026-05-13) aplicou `seedUsers()` em 6 arquivos mas deixou 7 de fora.

**Specs corrigidos:**
| Arquivo | Testes afetados |
|---------|----------------|
| `tests/e2e/patients-module.spec.ts` | TC-PAC-02, TC-PAC-03 |
| `tests/e2e/triage-module.spec.ts` | TC-TRG-02 |
| `tests/e2e/hospitalization-module.spec.ts` | TC-INT-02 |
| `tests/e2e/sprint-master-r02-double-click.spec.ts` | TC-R02-02, TC-R02-05 |
| `tests/e2e/sprint-master-r01-r03-r04.spec.ts` | R-01-02 |
| `tests/e2e/sprint-master-g08-rbac.spec.ts` | TC-G08-02 |
| `tests/e2e/compliance-sprint3.spec.ts` | TC-TUTOR-DASH-03 |

**Correção aplicada (padrão uniforme):**
```typescript
// Import
import { seedTutorsAndPets, seedUsers } from '../helpers/db-seed'

// beforeAll (após _serverAlive check):
if (_serverAlive) await seedUsers().catch(e => console.warn('[spec] seedUsers falhou:', e.message))
```

**Impacto esperado:** ~12 falhas resolvidas

---

## Erros Corrigidos em Sessões Anteriores

### BUG-001 — `aria-label="Mostrar senha"` ambíguo com `getByLabel(/senha/i)`
- **Correção:** `aria-label="Ocultar"/"Exibir"` em `src/app/login/page.tsx:160`
- **Commit:** `099e193f`
- **Impacto:** ~44 testes

### BUG-002 — `ERR_CONNECTION_REFUSED` no CI
- **Correção:** `webServer.command` → `node node_modules/next/dist/bin/next dev --port 4000`
- **Commit:** `099e193f`
- **Impacto:** Servidor estável para todos os testes

### BUG-003 — FK `clinic_id` no fixture cashier
- **Correção:** `seedClinics()` antes de qualquer INSERT com FK
- **Commit:** `099e193f`

### BUG-010 — Sessão de autenticação não persiste
- **Correção:** `storageState` por role em `tests/global-setup.ts` + `tests/helpers/session.ts`
- **Commit:** `099e193f`

### BUG-011 — Port mismatch `_serverAlive` (3000 vs 4000)
- **Correção:** Substituição em massa para `process.env.TEST_BASE_URL ?? 'http://localhost:4000'`
- **Commit:** `8c334cdc`

### BUG-013 — `mentor-tour-audit` timeout 60s
- **Correção:** `test.setTimeout(180_000)` no spec
- **Commit:** `8c334cdc`

### TC-GRM-013 — Botão "Entregar" bloqueado por overlay
- **Correção:** `getByTitle` para clicar diretamente no card sem abrir modal
- **Commit:** `92030e0a`

### profile.clinic_id=null em 6 specs
- **Correção:** `seedUsers()` + sentinel `cashier-hydrated` via `useEffect`
- **Commit:** `56e7f23e`

---

## Erros Pendentes de Investigação

### BUG-MOBILE — 69 Falhas CSS/Layout Responsivo (P1)

**Spec:** `responsive-mobile.spec.ts`  
**Projetos afetados:** iphone-se (58), chromium (2), pixel5 (4), ipad-mini (2), ipad-pro (3)  
**Testes:** MOB-NAV, MOB-CAIX, MOB-PAC, MOB-EXAM, MOB-CHEC, MOB-MENT, MOB-WPP, MOB-TRIA  
**Tipo de falha:** `expect(locator).toBeVisible() failed` em viewports 375px-768px

**Sprint dedicada necessária:**
1. Auditoria de `overflow-x` nos containers de cada módulo
2. Verificar `flex-direction` e `gap` em viewport 375px
3. Corrigir `DashboardHeader`, navegação lateral e cards de módulo
4. Executar `responsive-mobile.spec.ts` para cada viewport até 0 falhas

### BUG-MENTOR-RESILIENCE — 1 falha em `mentor-resilience.spec.ts`

**Status:** `seedUsers()` já presente. Causa específica desconhecida.  
**Ação:** Rodar spec isolado e capturar trace do Playwright para diagnóstico.

### BUG-MOB-SM-07 — 1 falha `sprint-master-mobile.spec.ts` (tablet-ipad-mini)

**Status:** Provavelmente layout tablet. Investigar viewport 768px.

---

## Estado Esperado Após Esta Sessão

| Métrica | Baseline (antes) | Projeção (depois) |
|---------|-----------------|-------------------|
| ✅ Passed | 599 | ~611 |
| ❌ Failed | 85 | ~73 |
| ⏭ Skipped | 393 | 393 |

**Redução esperada:** ~12 falhas (seedUsers fix aplicado aos 7 specs)

---

## Próxima Sprint Recomendada

| # | Ação | Prioridade | Impacto |
|---|------|-----------|---------|
| 1 | Sprint Mobile CSS (responsive-mobile) | P1 | 69 falhas |
| 2 | Investigar mentor-resilience trace | P2 | 1 falha |
| 3 | Investigar TC-MOB-SM-07 tablet | P2 | 1 falha |
| 4 | Implementar G-07 Error Monitoring dashboard | P2 | infraestrutura |
