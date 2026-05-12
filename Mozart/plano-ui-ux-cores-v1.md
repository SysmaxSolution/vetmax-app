# Plano UI/UX — Sistema de Cores por Módulo + Personalização de Fundo
**Status:** Aguardando Aprovação  
**Data:** 2026-05-12  
**Projeto:** VetMax App (`C:\SysMax\vetmax-app\`)  
**Autor:** Mozart / Claude Code  

---

## 1. Diagnóstico Atual

### O que existe hoje
- Header superior `bg-white border-b border-slate-200` — completamente neutro
- Tab ativa: `bg-slate-900 text-white` — preto genérico, sem identidade de módulo
- Backgrounds: `bg-slate-50` ou `bg-white` em todos os módulos — nenhuma diferenciação visual
- Paleta dominante: tons de slate/cinza em todo o sistema
- **Resultado**: o usuário não sabe visualmente "onde está" sem ler o texto

### Problema de UX identificado
Quando um usuário muda do módulo **Triagem** (urgência) para **Internação** (hospital) e depois para **Caixa** (financeiro), a interface parece idêntica em todos os três. Isso cria **carga cognitiva desnecessária** e aumenta risco de erro operacional (ex: lançar cobrança no módulo errado).

---

## 2. Objetivo do Plano

1. **Identidade visual por módulo** — cada módulo tem sua cor-âncora única, aplicada na navegação e background sutil da área de trabalho
2. **Personalização do usuário** — cada usuário pode escolher cor de fundo ou imagem de fundo (salvo no perfil Supabase)
3. **Zero breaking changes** — tudo compatível com Tailwind v4, sem reescrever componentes existentes

---

## 3. Paleta de Cores por Módulo

Cores escolhidas com base em semântica universal de UI clínico:

| Módulo | Rota | Cor Âncora | Hex | Justificativa |
|--------|------|------------|-----|---------------|
| **Recepção** | `/reception` | Azul | `#2563EB` | Entrada/Acolhimento |
| **Pacientes** | `/patients` | Ciano | `#0891B2` | Registros/Dados |
| **Triagem** | `/triage` | Âmbar | `#D97706` | Urgência/Alerta |
| **Consultório** | `/vet` | Índigo | `#4F46E5` | Clínico/Profissional |
| **Exames** | `/exams` | Violeta | `#7C3AED` | Ciência/Precisão |
| **Internação** | `/hospitalization` | Rosa-Escuro | `#DB2777` | Hospital/Cuidado Intensivo |
| **Banho e Tosa** | `/grooming` | Rosa-Claro | `#EC4899` | Estética/Cuidado |
| **Estoque** | `/pharmacy` | Laranja | `#EA580C` | Inventário/Estoque |
| **Vendas** | `/sales` | Esmeralda | `#059669` | Comércio/Dinheiro |
| **Caixa** | `/cashier` | Verde | `#16A34A` | Financeiro |
| **Cadastros** | `/registry` | Ardósia | `#475569` | Dados/Arquivamento |
| **Gestão** | `/management` | Cinza-Azulado | `#334155` | Administração |
| **WhatsApp** | `/whatsapp` | Verde WhatsApp | `#25D366` | Comunicação |

### Preview visual (escala de intensidade por contexto)
```
Fundo da área de trabalho:  10% de saturação (ex: bg-blue-50)
Header tab ativa:           100% cor âncora (ex: bg-blue-600 text-white)
Header tab hover:           20% (ex: hover:bg-blue-100 hover:text-blue-700)
Borda lateral do módulo:    Linha 3px esquerda na cor âncora
```

---

## 4. Arquitetura Técnica

### 4.1 CSS Variables (globals.css — Tailwind v4)

Adicionar ao `src/app/globals.css` usando `@theme` do Tailwind v4:

```css
@theme {
  --color-module-reception:      #2563EB;
  --color-module-patients:       #0891B2;
  --color-module-triage:         #D97706;
  --color-module-vet:            #4F46E5;
  --color-module-exams:          #7C3AED;
  --color-module-hospitalization:#DB2777;
  --color-module-grooming:       #EC4899;
  --color-module-pharmacy:       #EA580C;
  --color-module-sales:          #059669;
  --color-module-cashier:        #16A34A;
  --color-module-registry:       #475569;
  --color-module-management:     #334155;
  --color-module-whatsapp:       #25D366;
}

/* User customization overrides */
:root {
  --user-bg-color: transparent;
  --user-bg-image: none;
}

.dashboard-workspace {
  background-color: var(--user-bg-color);
  background-image: var(--user-bg-image);
  background-size: cover;
  background-position: center;
  background-attachment: fixed;
}
```

### 4.2 Mapa de Módulos (novo arquivo)

**Arquivo:** `src/lib/module-theme.ts`

```typescript
export const MODULE_THEME = {
  reception:       { color: '#2563EB', bg: 'bg-blue-50',    active: 'bg-blue-600',   hover: 'hover:bg-blue-100 hover:text-blue-700',   border: 'border-l-blue-600' },
  patients:        { color: '#0891B2', bg: 'bg-cyan-50',     active: 'bg-cyan-600',   hover: 'hover:bg-cyan-100 hover:text-cyan-700',    border: 'border-l-cyan-600' },
  triage:          { color: '#D97706', bg: 'bg-amber-50',    active: 'bg-amber-500',  hover: 'hover:bg-amber-100 hover:text-amber-700',  border: 'border-l-amber-500' },
  vet:             { color: '#4F46E5', bg: 'bg-indigo-50',   active: 'bg-indigo-600', hover: 'hover:bg-indigo-100 hover:text-indigo-700', border: 'border-l-indigo-600' },
  exams:           { color: '#7C3AED', bg: 'bg-violet-50',   active: 'bg-violet-600', hover: 'hover:bg-violet-100 hover:text-violet-700', border: 'border-l-violet-600' },
  hospitalization: { color: '#DB2777', bg: 'bg-pink-50',     active: 'bg-pink-600',   hover: 'hover:bg-pink-100 hover:text-pink-700',    border: 'border-l-pink-600' },
  grooming:        { color: '#EC4899', bg: 'bg-rose-50',     active: 'bg-rose-500',   hover: 'hover:bg-rose-100 hover:text-rose-700',    border: 'border-l-rose-500' },
  pharmacy:        { color: '#EA580C', bg: 'bg-orange-50',   active: 'bg-orange-600', hover: 'hover:bg-orange-100 hover:text-orange-700', border: 'border-l-orange-600' },
  sales:           { color: '#059669', bg: 'bg-emerald-50',  active: 'bg-emerald-600',hover: 'hover:bg-emerald-100 hover:text-emerald-700',border: 'border-l-emerald-600' },
  cashier:         { color: '#16A34A', bg: 'bg-green-50',    active: 'bg-green-600',  hover: 'hover:bg-green-100 hover:text-green-700',  border: 'border-l-green-600' },
  registry:        { color: '#475569', bg: 'bg-slate-100',   active: 'bg-slate-600',  hover: 'hover:bg-slate-200 hover:text-slate-700',  border: 'border-l-slate-600' },
  management:      { color: '#334155', bg: 'bg-slate-200',   active: 'bg-slate-700',  hover: 'hover:bg-slate-200 hover:text-slate-800',  border: 'border-l-slate-700' },
  whatsapp:        { color: '#25D366', bg: 'bg-green-50',    active: 'bg-green-500',  hover: 'hover:bg-green-100 hover:text-green-700',  border: 'border-l-green-500' },
} as const

export type ModuleKey = keyof typeof MODULE_THEME

export function getModuleFromPath(pathname: string): ModuleKey | null {
  const map: Record<string, ModuleKey> = {
    '/dashboard/reception':       'reception',
    '/dashboard/patients':        'patients',
    '/dashboard/triage':          'triage',
    '/dashboard/vet':             'vet',
    '/dashboard/exams':           'exams',
    '/dashboard/hospitalization': 'hospitalization',
    '/dashboard/grooming':        'grooming',
    '/dashboard/pharmacy':        'pharmacy',
    '/dashboard/sales':           'sales',
    '/dashboard/cashier':         'cashier',
    '/dashboard/registry':        'registry',
    '/dashboard/management':      'management',
    '/dashboard/whatsapp':        'whatsapp',
  }
  for (const [prefix, key] of Object.entries(map)) {
    if (pathname.startsWith(prefix)) return key
  }
  return null
}
```

### 4.3 Theme Context (novo arquivo)

**Arquivo:** `src/components/providers/ThemeProvider.tsx`

- Lê preferência do usuário via server action `getUserThemePreferences()`
- Injeta CSS custom property `--user-bg-color` e `--user-bg-image` no `<body>`
- Expõe `useTheme()` hook para o painel de configuração

### 4.4 Alterações no DashboardHeader

**Arquivo:** `src/components/layout/DashboardHeader.tsx`

Mudança cirúrgica — apenas a classe de tab ativa:

```diff
- isActive(tab.href)
-   ? 'bg-slate-900 text-white shadow-sm'
-   : 'text-slate-600 hover:text-slate-900'

+ isActive(tab.href)
+   ? `${getTabActiveClass(tab.href)} text-white shadow-sm`
+   : `text-slate-600 ${getTabHoverClass(tab.href)}`
```

A função `getTabActiveClass` consulta `MODULE_THEME` para retornar a classe CSS correta.

### 4.5 Background do Workspace por Módulo

**Arquivo:** `src/app/dashboard/layout.tsx`

Adiciona classe de background baseada na rota ativa:

```tsx
// Detecta módulo atual → aplica bg-[modulo]-50 no container principal
const moduleKey = getModuleFromPath(pathname)
const theme = moduleKey ? MODULE_THEME[moduleKey] : null
```

O background é sutil (10% intensidade, ex: `bg-blue-50`) para não interferir com legibilidade.

---

## 5. Personalização por Usuário

### 5.1 O que o usuário pode customizar

| Opção | Tipo | Onde salva |
|-------|------|-----------|
| Cor de fundo do workspace | Color picker (16 opções pré-definidas) | `user_preferences.bg_color` |
| Imagem de fundo | Upload ou URL | `user_preferences.bg_image_url` |
| Opacidade do fundo | Slider 10%–40% | `user_preferences.bg_opacity` |
| Intensidade das cores de módulo | Toggle (normal/forte/desligado) | `user_preferences.module_color_intensity` |

### 5.2 UI de Configuração

Localização: **Módulo Gestão → aba "Aparência"** (não no perfil individual — todos os usuários da clínica verão as mesmas opções disponíveis, mas cada um salva sua própria preferência)

```
┌─────────────────────────────────────────────┐
│ APARÊNCIA DO SISTEMA                        │
├─────────────────────────────────────────────┤
│ Cor de Fundo                                │
│  ○ Branco (padrão)  ● Cinza Suave           │
│  ○ Azul Médico      ○ Verde Floresta        │
│  ○ Roxo Clínico     ○ Customizado: [####]   │
│                                             │
│ Imagem de Fundo (opcional)                  │
│  [Selecionar arquivo] [Remover]             │
│  □ Aplicar overlay escurecido               │
│                                             │
│ Cores dos Módulos                           │
│  ● Normal  ○ Intenso  ○ Desligado           │
│                                             │
│ [Salvar Preferências]                       │
└─────────────────────────────────────────────┘
```

### 5.3 Migration Supabase necessária

```sql
-- Migration: add_user_theme_preferences
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS bg_color            TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bg_image_url        TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bg_opacity          INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS module_color_intensity TEXT  DEFAULT 'normal';
```

---

## 6. Fases de Implementação

### Fase 1 — Foundation (Estimativa: 2h) ✅ CONCLUÍDA 2026-05-12
- [x] Criar `src/lib/module-theme.ts` com paleta completa
- [x] Atualizar `src/app/globals.css` com variável `--vetmax-user-bg` (prep Fase 4)
- [x] Criar `src/components/providers/ThemeProvider.tsx`

### Fase 2 — Navegação Colorida (Estimativa: 1.5h) ✅ CONCLUÍDA 2026-05-12
- [x] Alterar `DashboardHeader.tsx` para tabs coloridas por módulo via `getTabTheme()`
- [x] Alterar `layout.tsx` para envolver workspace com `ThemeProvider` (background por módulo)
- [ ] Adicionar indicador visual de módulo ativo (linha inferior colorida) — próxima iteração

### Fase 3 — Indicador de Módulo Ativo (Estimativa: 1h) ✅ CONCLUÍDA 2026-05-12
- [x] Barra 3px colorida na base do `DashboardHeader` (cor âncora do módulo ativo)
- [x] Usa `getModuleFromPath(pathname)` + `MODULE_THEME[key].active`
- [x] Transição suave `transition-colors duration-300`

### Fase 4 — Painel de Personalização (Estimativa: 3h) ✅ CONCLUÍDA 2026-05-12
- [x] `AppearanceTab.tsx` — aba Aparência em `/dashboard/management?tab=aparencia`
- [x] Toggle group Sutil / Intenso / Desligado para intensidade das cores de módulo
- [x] 9 opções de cor de fundo (Dinâmico + 8 cores pré-definidas) com preview ao vivo
- [x] Botão "Restaurar padrão" + "Salvar" com feedback Toast
- [x] Live preview via `setPreferences()` do ThemeContext (sem recarregar página)

### Fase 5 — Persistência (Estimativa: 1.5h) ✅ CONCLUÍDA 2026-05-12
- [x] `supabase/migrations/0108_ui_preferences.sql` — coluna JSONB `ui_preferences` na tabela `profiles`
- [x] Migration aplicada no banco remoto (`✓ 0108_ui_preferences.sql`)
- [x] Server action `saveUiPreferences()` em `src/lib/actions/ui-preferences.ts`
- [x] `ThemeProvider` lê `initialPreferences` do servidor via `layout.tsx`
- [x] `layout.tsx` busca `ui_preferences` no SELECT do profile

**Total estimado: ~9 horas de desenvolvimento**

---

## 7. Impacto nos Testes E2E

- Testes que verificam `bg-slate-900` no tab ativo precisarão ser atualizados para a nova classe de cor
- Adicionar fixture de preferências de tema no seed
- Nenhum teste de fluxo de negócio é afetado

**Arquivos de teste afetados estimados:**
- `tests/e2e/auth-module.spec.ts` (verifica header)
- `tests/e2e/reception-module.spec.ts` (verifica navegação)
- Outros módulos com seletores de navegação

---

## 8. Riscos e Mitigações

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Contraste insuficiente (acessibilidade) | Média | Testar WCAG AA para todas as combinações fundo+texto |
| Tailwind v4 não gera classes dinâmicas | Baixa | Usar safelist ou classes inline via style prop |
| Upload de imagem afeta performance | Baixa | Comprimir no cliente antes do upload, max 2MB |
| Tailwind purge remove classes dinâmicas | Alta | Centralizar todas as classes no `module-theme.ts` como strings completas |

---

## 9. Decisão Solicitada

Antes de iniciar, confirmar:

1. **Intensidade das cores** — sutil (10–15% no fundo, cor plena só na tab ativa) ou mais intenso?
2. **Personalização por usuário ou por clínica?** — Cada usuário salva sua preferência individualmente, ou o admin define uma tema para toda a clínica?
3. **Escopo de imagem de fundo** — Apenas cor sólida na primeira versão (mais simples), ou já incluir imagem de fundo na Fase 1?
4. **Aprovação da paleta** — As cores propostas na Tabela 3 estão adequadas? Algum módulo precisa de cor diferente?

---

*Documento gerado pelo Mozart em 2026-05-12. Aguardando aprovação do responsável para iniciar execução.*
