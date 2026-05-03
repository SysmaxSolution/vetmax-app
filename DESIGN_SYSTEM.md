# 🎨 VetMax — Design System (Padrão HealthMax)

**Data:** 2026-04-05  
**Versão:** 1.0  
**Status:** ✅ IMPLEMENTADO

---

## 📋 Resumo Executivo

O VetMax foi **completamente redesenhado** para seguir o padrão profissional do HealthMax. A tela de Configurações foi destruída e reconstruída de forma elegante, limpa e centrada no usuário final (não em detalhes técnicos).

**Removido:**
- ❌ UUIDs expostos
- ❌ Clinic IDs em mono font
- ❌ Instruções curl e comandos técnicos
- ❌ Boxes coloridos mostrando info crua
- ❌ Texto confuso e bagunçado

**Adicionado:**
- ✅ Abas profissionais (Meu Perfil / Clínica)
- ✅ Cards limpos com labels descritivos
- ✅ Editor visual para checklist de recepção
- ✅ Interface intuitiva apenas com dados necessários
- ✅ Design corporativo consistente

---

## 🎯 Mudanças Implementadas

### 1. Página de Configurações (/dashboard/settings)

**ANTES:**
```
[Box azul com UUID]
[Box cinza com Email]
[Box cinza com Nome]
[Box amarelo com Role em JSON]
[Box cinza com Clinic ID]
[Info técnica: "Como usar essa informação..."]
[Botões crus para mudar role]
```

**DEPOIS:**
```
┌─────────────────────────────────────────────┐
│ Configurações                               │
│ Gerencie sua conta e dados da clínica       │
├─────────────────────────────────────────────┤
│ [Meu Perfil] [Clínica]   ← Abas elegantes │
├─────────────────────────────────────────────┤
│                                             │
│ Meu Perfil                                  │
│ ───────────────────────────────────────────┤
│                                             │
│ Nome Completo    │    E-mail               │
│ João Silva       │    joao@clinic.com      │
│ [Read-only]      │    [Read-only]          │
│                                             │
│ Acesso e Permissões                        │
│ [🟢 Administrador] — Acesso total ao sistema│
│                                             │
│ ℹ️ Para alterar seus dados, contate...     │
│                                             │
└─────────────────────────────────────────────┘
```

### 2. Header/Navegação (DashboardHeader)

**Padrão Corporativo:**
- VetMax — Clínica Veterinária Exemplo (topo esquerdo)
- Olá, João Silva (topo direito)
- Menu horizontal: Recepção | Triagem | Exames | Farmácia | ⚙️ Configurações | 🚪 Sair

**Ícones profissionais:**
- 🏠 Recepção (Home icon)
- 👥 Triagem (Users icon)
- 🩺 Consultório (Stethoscope icon)
- 🧪 Exames (TestTubes icon)
- 💊 Farmácia (Pill icon)
- ⚙️ Configurações (Settings icon)
- 🚪 Sair (LogOut icon)

**Cores:**
- Texto ativo: `text-blue-600`
- Border ativo: `border-blue-600`
- Hover: `text-gray-900`
- Fundo: `bg-white`
- Borda inferior: `border-gray-200`

### 3. Cards e Layout

**Padrão Consistente:**
```css
/* Card Master */
.bg-white
.rounded-lg           /* border-radius: 0.5rem (8px) */
.shadow-sm            /* box-shadow: 0 1px 2px rgba(...) */
.border border-gray-200

/* Conteúdo */
.p-8                  /* padding: 2rem (32px) */
.space-y-6            /* gap entre elementos */

/* Divisores */
.border-t border-gray-200
.pt-8                 /* top padding após divisor */

/* Labels */
.text-sm font-medium text-gray-700
.mb-2

/* Dados Read-only */
.px-4 py-3
.bg-gray-50
.rounded-lg
.border border-gray-200
.text-gray-900 font-medium
```

### 4. Abas (Tabs)

**Design:**
```css
.flex gap-1 mb-6          /* espaçamento entre abas */
.bg-white rounded-lg      /* fundo branco */
.shadow-sm border         /* subtle shadow */
.p-1                      /* padding interno */

/* Aba ativa */
.bg-blue-600 text-white rounded-md
.py-2 px-4               /* botão dentro da aba */

/* Aba inativa */
.text-gray-600 hover:text-gray-900
.transition-all           /* smooth transition */
```

### 5. Botões

**Variações:**

**Primary (Salvar):**
```
.px-6 py-2
.bg-blue-600 text-white
.rounded-lg
.hover:bg-blue-700
.font-medium
.transition-colors
```

**Secondary (Cancelar):**
```
.px-6 py-2
.border border-gray-300
.text-gray-700
.rounded-lg
.hover:bg-gray-50
.font-medium
```

**Danger (Remover):**
```
.text-red-500 hover:text-red-700
.font-medium text-sm
```

### 6. Formulários

**Input Style:**
```
.w-full
.px-4 py-2
.border border-gray-300
.rounded-lg
.focus:ring-2 focus:ring-blue-500
.focus:border-transparent
.outline-none
```

**Labels:**
```
.block
.text-sm font-medium text-gray-700
.mb-2
```

---

## 🗂️ Estrutura de Abas

### Usuário Padrão (Recepcionista, Auxiliar, etc.)

**Aba: Meu Perfil**
- Nome Completo (read-only)
- E-mail (read-only)
- Seção: Acesso e Permissões
  - Badge com role (ex: "Auxiliar Veterinário")
  - Descrição da permissão
- Info box: "Para alterar seus dados, contate o administrador"

### Admin Only

**Aba Adicional: Clínica**
- Dados da Clínica (edição inline):
  - Nome da Clínica
  - CNPJ
  - Endereço
  - Telefone
- Botão "✎ Editar" no topo

**Subseção: Checklist de Recepção**
- Interface visual:
  - Input para adicionar item
  - Botão "+ Adicionar"
  - Lista com itens (☑ Item | ✕ Remover)
- Modo read-only quando não editando
- Modo edit quando admin clica "Editar"

---

## 🎨 Paleta de Cores

| Uso | Cor | Tailwind |
|-----|-----|----------|
| Ativo/Destaque | Azul | `blue-600` |
| Texto Primário | Cinza 900 | `gray-900` |
| Texto Secundário | Cinza 600 | `gray-600` |
| Fundo (cards, inputs) | Cinza 50 | `gray-50` |
| Borda | Cinza 200 | `gray-200` |
| Sucesso | Verde | `green-500` |
| Erro | Vermelho | `red-500` |
| Warning | Amarelo | `amber-100` |

---

## 📐 Tipografia

| Elemento | Font | Size | Weight |
|----------|------|------|--------|
| Page Title | Inter | 1.875rem (30px) | 700 bold |
| Section Header | Inter | 1.25rem (20px) | 700 bold |
| Card Title | Inter | 1.125rem (18px) | 700 bold |
| Body Text | Inter | 1rem (16px) | 400 normal |
| Label | Inter | 0.875rem (14px) | 500 medium |
| Small Text | Inter | 0.75rem (12px) | 400 normal |

---

## 🔳 Espaçamento (Tailwind)

| Nivel | Padding | Margin |
|-------|---------|--------|
| Seções | `p-8` (32px) | `mb-8` |
| Cards | `p-6` (24px) | `mb-6` |
| Elementos | `p-4` (16px) | `mb-4` |
| Compacto | `p-2` (8px) | `mb-2` |

---

## 👤 Componentes Afetados

### ✅ Destruído/Reconstruído
- `/dashboard/settings/page.tsx` — Completamente novo
- `src/components/settings/SettingsClient.tsx` — Novo (substituiu o anterior)

### ✅ Melhorado
- `src/components/layout/DashboardHeader.tsx`:
  - Ícones reais (não emojis)
  - Layout profissional
  - Responsividade aprimorada

### ✅ Já em Padrão (Nenhuma mudança)
- `src/components/triage/NurseWorkspace.tsx`:
  - Cards brancos com borders cinza
  - Shadows suaves
  - Typography profissional
- `src/components/reception/ReceptionWorkspace.tsx`:
  - Layout consistente
  - Padrão de borders/shadows já aplicado

---

## 🆕 Novos Endpoints

**POST /api/update-clinic**
- Atualiza dados da clínica (admin only)
- Campos: name, cnpj, address, phone, reception_checklist
- Retorna: { success, message }

---

## 📱 Responsividade

**Breakpoints utilizados:**
- Mobile: `< 640px` (default)
- Tablet: `md:` (≥ 768px)
- Desktop: `lg:` (≥ 1024px)

**Comportamento:**
- Abas: "Perfil" em mobile, "Meu Perfil" em desktop
- Inputs: Grid 1 coluna (mobile) → 2 colunas (desktop)
- Navegação: Labels ocultos em mobile, visíveis em desktop

---

## ✨ Destaques Visuais

### Página Settings Agora:
1. **Limpa:** Sem UUIDs, Clinic IDs ou instruções técnicas
2. **Organizada:** Abas claras separando Perfil e Clínica
3. **Intuitiva:** Labels descritivos, não jargão técnico
4. **Editável:** Admin pode editar dados inline
5. **Profissional:** Visual corporativo elegante

### Header Agora:
1. **Moderno:** Ícones reais, não emojis
2. **Profissional:** Layout clean e minimalista
3. **Funcional:** Acesso rápido a todas as seções
4. **Responsivo:** Adapta-se a mobile/tablet/desktop

---

## 🔄 Fluxo do Usuário

```
LOGIN
  ↓
DASHBOARD (Reception/Triage/etc)
  ↓ [Clica ⚙️ Configurações]
SETTINGS PAGE
  ↓
┌─ [Meu Perfil]        ← Vê nome, email, role
│  └─ Info box: "Para alterar contate admin"
│
└─ [Clínica] (admin)   ← Vê dados da clínica
   ├─ Botão "✎ Editar"
   ├─ Edita: Nome, CNPJ, Endereço, Telefone
   ├─ Gerencia: Checklist de Recepção
   └─ Botão [Salvar] [Cancelar]
```

---

## 🎯 Próximas Melhorias (Futuros Sprints)

- [ ] Edição de profile (nome, email, senha) via modal
- [ ] Upload de logo da clínica
- [ ] Temas light/dark mode
- [ ] Auditoria de ações (logs)
- [ ] Backup de dados
- [ ] Integrações externas (pagamento, etc)

---

## 📊 Build Status

✅ **npm run build** — Sucesso  
✅ **16 rotas disponíveis**  
✅ **0 erros TypeScript**  
✅ **Pronto para produção**

---

## 🎊 Resumo

O VetMax agora possui um **Design System profissional e consistente**, idêntico ao padrão HealthMax. A tela de Configurações foi completamente reconstruída para ser elegante, intuitiva e focada no usuário final.

**Nada de técnico foi exposto. Tudo é visual, limpo e profissional. O CEO vai adorar! 🚀**
